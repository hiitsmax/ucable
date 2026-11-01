import type { Daypart, GuideChannel, Profile, Schedulable, Slot, Watch } from "./types.ts";

// The "programming" algorithm: orders a channel's videos like a TV schedule for *now*.
// Inputs: Jev's tags (daypart, timely, fit), YouTube fame (views), creators the viewer interacts with
// (profile.creators + own history), and what was already watched. No model call here: tune the weights in profile.json.

export function daypartOf(d: Date): Daypart {
  const h = d.getHours();
  return h < 6 ? "latenight" : h < 12 ? "morning" : h < 18 ? "afternoon" : h < 23 ? "primetime" : "latenight";
}

// Skipped for good: pressed N before the end. Legacy `skips` made before `skipped` existed count as skipped unless watched since.
export const isSkipped = (w?: Watch) => !!w && (!!w.skipped || (w.skips > 0 && !w.done));

// "Not now": hidden until `snoozed`, then it competes again. Unlike a skip it says nothing about the video or the creator.
export const isSnoozed = (w: Watch | undefined, now: Date) => !!w?.snoozed && w.snoozed > now.getTime();
export const snoozeUntil = (profile: Profile, now = new Date()) => now.getTime() + (profile.snoozeHours ?? 8) * 3600e3;

// Buffer: a video left unfinished stays first on its channel for HOLD ms after it last played (you come back, it is still there).
// The guide stretches with it (slots() starts the first programme when you did). After HOLD the normal order decides.
export const HOLD = 10 * 60e3;
// bonus is huge, and larger the more recently it played (1 s = 100 points), so the last one watched leads among several
const held = (w: Watch | undefined, now: Date) =>
  w && !w.done && w.t > 5 && now.getTime() - (w.seenAt ?? 0) < HOLD ? 1e6 + ((w.seenAt ?? 0) - now.getTime()) / 10 : 0;

// 0..1: how much the viewer interacts with this creator. Hand-set strength, or learned from own finished videos.
export function creatorAffinity(author: string, profile: Profile, history: Record<string, Watch>): number {
  const a = author.toLowerCase();
  const set = Object.entries(profile.creators).reduce((m, [k, w]) => (a.includes(k.toLowerCase()) ? Math.max(m, w) : m), 0);
  const finished = Object.values(history).filter((w) => w.author === author && (w.done || w.interested)).length;
  return Math.min(1, Math.max(set, finished / 5));
}

export function score(p: Schedulable, w: Watch | undefined, profile: Profile, history: Record<string, Watch>, now: Date): number {
  const W = profile.weights;
  const fresh = Math.max(0, 1 - (now.getTime() - Date.parse(p.publishedAt)) / (7 * 864e5));
  const fame = Math.min(1, Math.log10(p.views + 1) / 7); // 10M views = 1
  let s =
    W.daypart * p.daypart[daypartOf(now)] +
    W.fresh * fresh +
    W.timely * p.timely * fresh +
    W.fit * p.fit +
    W.fame * fame +
    W.creator * creatorAffinity(p.author, profile, history);
  if (w?.done) s += W.seen;
  else if (w && w.t / p.duration > 0.05) s += W.resume;
  // creators whose videos were skipped before are trusted less
  const skippedOfAuthor = Object.values(history).filter((x) => x.author === p.author && isSkipped(x)).length;
  return s + W.skip * Math.min(skippedOfAuthor, 3);
}

export function queue<P extends Schedulable>(ps: P[], history: Record<string, Watch>, profile: Profile, now = new Date()): P[] {
  return ps
    .filter((p) => !isSkipped(history[p.id]) && !isSnoozed(history[p.id], now)) // skipped: never back; snoozed: back later
    .map((p) => [score(p, history[p.id], profile, history, now) + held(history[p.id], now), p] as const)
    .sort((a, b) => b[0] - a[0])
    .map(([, p]) => p);
}

// Lay a channel's queue on a clock: the first programme "started" when you began it, the rest follow back to back.
export function slots(q: (Schedulable & { title: string }) [], history: Record<string, Watch>, now: Date): Slot[] {
  let t = now.getTime();
  return q.map((p, i) => {
    const h = history[p.id];
    const progress = h?.done ? 1 : Math.min(1, (h?.t ?? 0) / p.duration);
    if (i === 0 && !h?.done) t -= progress * p.duration * 1000;
    const slot: Slot = { id: p.id, title: p.title, author: p.author, duration: p.duration, progress, done: !!h?.done, start: t };
    t += p.duration * 1000;
    return slot;
  });
}

export function buildGuide(
  channels: { num: number; name: string; group?: string }[],
  queues: ((Schedulable & { title: string })[] | undefined)[],
  history: Record<string, Watch>,
  logo: (name: string) => string,
  now: Date
): GuideChannel[] {
  return channels.map((c, i) => ({ num: c.num, name: c.name, group: c.group, logo: logo(c.name), slots: slots(queues[i] ?? [], history, now) }));
}
