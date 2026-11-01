import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pool } from "./pool.ts";
import { DAYPARTS, type Channel, type Config, type Tags, type Video } from "./types.ts";

// Jev (TypeSafe AI, https://typesafe.ai): hosted typed decision model. Text/JSON in, one typed answer per question out.
// It cannot see pixels or hear audio, so it decides from metadata (transcript/frame captions can be added to `state` later).

// Everything hand-edited lives in three JSON files, re-read on every request: edit, reload (or use /lab).
//   channels.json  the lineup (order = channel number, LAST = catch-all)
//   prompts.json   the instructions of the Jev questions
//   profile.json   who is watching + scheduler weights
// ponytail: files only; a UI editor can just write the same files (that is /lab)
const read = async (f: string) => JSON.parse(await readFile(f, "utf8"));

export async function loadConfig(): Promise<Config> {
  const [channels, prompts, profile] = await Promise.all([read("channels.json"), read("prompts.json"), read("profile.json")]);
  if (!channels.length) throw new Error("channels.json is empty");
  return { channels, prompts, profile };
}

export const questions = ({ channels, prompts: p }: Config) => ({
  channel: {
    type: "choice",
    instructions: p.channel,
    criteria: Object.fromEntries(channels.map((c) => [c.name, c.about])),
  },
  daypart: {
    type: "choice",
    instructions: p.daypart.instruction,
    criteria: Object.fromEntries(DAYPARTS.map((d) => [d, p.daypart[d]])),
  },
  timely: { type: "noul", instructions: p.timely },
  fit: { type: "score", instructions: p.fit.instruction, criteria: p.fit.levels },
});

const YT_CATEGORY: Record<string, string> = {
  1: "Film & Animation", 2: "Autos", 10: "Music", 15: "Pets", 17: "Sports", 19: "Travel", 20: "Gaming",
  22: "People & Blogs", 23: "Comedy", 24: "Entertainment", 25: "News & Politics", 26: "Howto & Style",
  27: "Education", 28: "Science & Technology",
};

export const state = (v: Video, viewer: string) => ({
  viewer, // the profile: `fit` is judged against it
  title: v.title,
  channel: v.author,
  youtubeCategory: YT_CATEGORY[v.categoryId] ?? v.categoryId,
  tags: v.tags.slice(0, 15),
  description: v.description.slice(0, 800),
  durationMinutes: Math.round(v.duration / 60),
  views: v.views,
  publishedAt: v.publishedAt,
});

// score answers: `score` is a probability-weighted level, `legend` maps level -> description.
// Normalise to 0..1 whatever the level numbering (0-based or 1-based) is.
const unit = (a: { score: number; legend?: Record<string, unknown>; probabilities?: Record<string, number> }) => {
  const levels = Object.keys(a.legend ?? a.probabilities ?? {}).map(Number).filter((n) => !Number.isNaN(n));
  const [lo, hi] = [Math.min(...levels), Math.max(...levels)];
  return hi > lo ? Math.min(1, Math.max(0, (a.score - lo) / (hi - lo))) : 0.5;
};

export function parse(res: any, channels: Channel[]): Tags {
  const a = res.answers;
  const p = a.daypart.probabilities ?? {};
  const names = channels.map((c) => c.name);
  return {
    channel: names.includes(a.channel.choice) ? a.channel.choice : names[names.length - 1], // unknown -> catch-all
    daypart: Object.fromEntries(DAYPARTS.map((d) => [d, Number(p[d] ?? 0)])) as Tags["daypart"],
    timely: Number(a.timely.noul),
    fit: a.fit ? unit(a.fit) : 0.5,
  };
}

export async function tag(v: Video, cfg: Config): Promise<Tags> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY missing (see .env.example)");
  for (let attempt = 0; ; attempt++) {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state: state(v, cfg.profile.about), questions: questions(cfg) }),
    });
    if ((r.status === 429 || r.status === 529) && attempt < 4) {
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt)); // rate limit / overload: back off
      continue;
    }
    if (!r.ok) throw new Error(`Jev ${r.status}: ${await r.text()}`);
    return parse(await r.json(), cfg.channels);
  }
}

// Tags are cached in .data/tags.json: one Jev call per new video. The cache is stamped with a hash of everything
// Jev reads (channels, prompts, profile.about), so editing any of them re-tags by itself (a few cents).
// Scheduler weights and profile.creators are NOT in the hash: they only affect ordering, no re-tag needed.
const CACHE = ".data/tags.json";

export async function tagVideos(videos: Video[], cfg: Config): Promise<Record<string, Tags>> {
  // `group` is guide-only, so it is not in the stamp: editing it does not re-tag
  const stamp = createHash("sha1").update(JSON.stringify([cfg.channels.map(({ name, about }) => ({ name, about })), cfg.prompts, cfg.profile.about])).digest("hex");
  const saved = await readFile(CACHE, "utf8").then(JSON.parse, () => null);
  const cache: Record<string, Tags> = saved?.lineup === stamp ? saved.tags : {};
  const todo = videos.filter((v) => !cache[v.id]);
  try {
    await pool(todo, 4, async (v) => {
      cache[v.id] = await tag(v, cfg);
    });
  } finally {
    if (todo.length) {
      await mkdir(".data", { recursive: true });
      await writeFile(CACHE, JSON.stringify({ lineup: stamp, tags: cache })); // keep what succeeded even if one call failed
    }
  }
  return cache;
}
