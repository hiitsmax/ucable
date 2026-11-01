export const DAYPARTS = ["morning", "afternoon", "primetime", "latenight"] as const;
export type Daypart = (typeof DAYPARTS)[number];

// One entry of channels.json. Array order = channel number (101, 102, …); the LAST one is the catch-all.
// `about` is read by the Jev model to decide which videos belong here: describe the content, in English.
// `group` only feeds the guide's numbered menu (first 9 groups = keys 1-9, 0 = all channels); Jev never sees it.
export type Channel = { name: string; about: string; group?: string };

export type Video = {
  id: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
  categoryId: string;
  duration: number; // seconds
  views: number; // YouTube view count: the "famous" signal
  thumb?: string;
  publishedAt: string; // ISO
};

// What the Jev decision model decides about a video. The scheduler reads only these.
export type Tags = {
  channel: string;
  daypart: Record<Daypart, number>; // probability per slot, sums to ~1
  timely: number; // 0..1, value drops within days (news, events, trends)
  fit: number; // 0..1, how well it matches the viewer profile (profile.json), judged by Jev
};

export type Programme = Video & Tags;
// what the browser gets: no description/tags
export type Slim = Omit<Programme, "description" | "tags">;
export type Schedulable = Pick<Slim, "id" | "author" | "duration" | "views" | "publishedAt" | "daypart" | "timely" | "fit">;

// per-video viewing history, kept in the browser
// skipped = epoch ms when the viewer pressed N on it unfinished: it is never proposed again (kept as a record; U undoes the last one).
// skips is the old counter, still read so skips made before `skipped` existed count too. title/author make the record readable.
// snoozed = epoch ms until which it is hidden: "not in the mood now" (L). No penalty, it comes back by itself. snoozedAt is for U.
// seenAt = epoch ms it last played: for 10 minutes after it, an unfinished video stays first on its channel (the "buffer").
// interested = epoch ms it passed 10 min watched or 50% of its length; `keep` is then a copy of the video so it outlives the fetch window.
export type Watch = {
  t: number; watched: number; done: boolean; skips: number; skipped?: number; snoozed?: number; snoozedAt?: number;
  seenAt?: number; interested?: number; keep?: Slim; author?: string; title?: string;
};

// profile.json: who is watching + how the scheduler weighs things. Edited by hand / in /lab.
export type Weights = {
  daypart: number; // fit with the current time of day
  fresh: number; // newer first
  timely: number; // time-sensitive videos lose value fast
  fit: number; // Jev's "would this viewer like it" judgement
  fame: number; // log of YouTube views
  creator: number; // creators the viewer interacts with most (profile.creators + own history)
  resume: number; // started but not finished
  seen: number; // finished (negative)
  skip: number; // per earlier-skipped video of the same creator, max 3 (negative); the skipped video itself is gone for good
};
export type Profile = {
  about: string; // free text read by Jev as "the viewer"
  creators: Record<string, number>; // creator name (case-insensitive substring) -> 0..1 interaction strength
  weights: Weights;
  snoozeHours?: number; // how long "not now" (L) hides a video, default 8
  days?: number; // how far back the fetch looks for uploads, default 14
};

// prompts.json: the instructions of the Jev questions
export type Prompts = {
  channel: string;
  daypart: { instruction: string } & Record<Daypart, string>;
  timely: string;
  fit: { instruction: string; levels: string[] }; // 2..10 levels, worst to best
};

// all the hand-edited config, loaded together
export type Config = { channels: Channel[]; prompts: Prompts; profile: Profile };

// ---- what the TV UI components receive (built by buildGuide in lib/schedule.ts) ----
// One programme in a channel's schedule. start = epoch ms when it airs (the current one starts "now minus what you already watched").
export type Slot = {
  id: string;
  title: string;
  author: string;
  duration: number; // seconds
  progress: number; // 0..1 already watched
  done: boolean;
  start: number; // epoch ms
};
export type GuideChannel = {
  num: number; // 101, 102, ...
  name: string; // "uCable Sport"
  group?: string; // guide menu category, e.g. "Sport e Motori"
  logo: string; // url of the channel logo, e.g. /channels/sport.png
  slots: Slot[]; // schedule order, first = airs first
};
