// run: node lib/check.ts
import assert from "node:assert";
import { parse } from "./jev.ts";
import { creatorAffinity, isSkipped, isSnoozed, queue, slots, snoozeUntil } from "./schedule.ts";
import { secs } from "./youtube.ts";
import type { Profile } from "./types.ts";

assert.equal(secs("PT1H2M3S"), 3723);
assert.equal(secs("PT45S"), 45);
assert.equal(secs("P0D"), 0);

const res = {
  answers: {
    channel: { type: "choice", choice: "Musica", probabilities: { Musica: 0.9 }, confidence: 0.9 },
    daypart: { type: "choice", choice: "primetime", probabilities: { primetime: 0.7, latenight: 0.3 }, confidence: 0.7 },
    timely: { type: "noul", noul: 0.1 },
    fit: { type: "score", score: 4, legend: { 1: "a", 2: "b", 3: "c", 4: "d", 5: "e" }, probabilities: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 } },
  },
};
const lineup = [{ name: "Musica", about: "" }, { name: "Altro", about: "" }];
assert.deepEqual(parse(res, lineup), { channel: "Musica", daypart: { morning: 0, afternoon: 0, primetime: 0.7, latenight: 0.3 }, timely: 0.1, fit: 0.75 });
assert.equal(parse({ answers: { ...res.answers, channel: { choice: "???" } } }, lineup).channel, "Altro"); // unknown -> last channel
assert.equal(parse({ answers: { ...res.answers, fit: { score: 0, legend: { 0: "a", 1: "b" } } } }, lineup).fit, 0); // 0-based levels work too

const profile: Profile = {
  about: "",
  creators: { "salvatore sanfilippo": 1 },
  weights: { daypart: 2, fresh: 1, timely: 2, fit: 2, fame: 0.6, creator: 1.5, resume: 1.5, seen: -3, skip: -1.5 },
};

// 20:00 local = primetime
const now = new Date("2026-10-25T20:00:00");
const p = (id: string, prime: number, o: object = {}) => ({
  id,
  title: id,
  author: "x",
  duration: 600,
  views: 0,
  fit: 0.5,
  publishedAt: new Date(now.getTime() - 864e5).toISOString(),
  daypart: { morning: 1 - prime, afternoon: 0, primetime: prime, latenight: 0 },
  timely: 0,
  ...o,
});
const [A, B, C] = [p("A", 0.8), p("B", 0.1), p("C", 0.8)];
const w = (o: object) => ({ t: 0, watched: 0, done: false, skips: 0, ...o });
const ids = (x: { id: string }[]) => x.map((v) => v.id).join("");
const q = (ps: ReturnType<typeof p>[], h = {}) => ids(queue(ps, h, profile, now));

assert.equal(q([B, A]), "AB"); // primetime fits now
assert.equal(q([A, B, C], { C: w({ done: true }) }), "ABC"); // seen -> bottom
assert.equal(q([A, B], { B: w({ t: 300 }) }), "BA"); // half watched -> resume first
assert.equal(q([A, B], { A: w({ skipped: 1 }) }), "B"); // skipped -> never proposed again
assert.equal(q([A, B], { A: w({ skips: 1 }) }), "B"); // old skip counter counts too
assert.equal(q([A, B], { A: w({ skips: 1, done: true }) }), "BA"); // skipped once but watched to the end later -> back (as seen, last)
assert.equal(q([A, B], { A: w({ snoozed: now.getTime() + 1000 }) }), "B"); // "not now" hides it for a while
assert.equal(q([A, B], { A: w({ snoozed: now.getTime() - 1000 }) }), "AB"); // ...and it comes back once the time has passed
assert.ok(!isSkipped(w({ snoozed: now.getTime() + 1000 })) && isSnoozed(w({ snoozed: now.getTime() + 1 }), now));
assert.equal(snoozeUntil(profile, now) - now.getTime(), 8 * 3600e3); // default 8 h
assert.ok(isSkipped(w({ skipped: 5 })) && !isSkipped(w({})) && !isSkipped(undefined));
assert.equal(q([p("a1", 0.5, { author: "Annoying" }), p("b1", 0.5)], { z: w({ skipped: 1, author: "Annoying" }) }), "b1a1"); // creator skipped before -> lower
assert.equal(q([p("lo", 0.5, { fit: 0 }), p("hi", 0.5, { fit: 1 })]), "hilo"); // Jev says it fits the viewer
assert.equal(q([p("small", 0.5), p("big", 0.5, { views: 5_000_000 })]), "bigsmall"); // famous first
assert.equal(q([p("rand", 0.5), p("fav", 0.5, { author: "Salvatore Sanfilippo" })]), "favrand"); // favourite creator first
assert.equal(creatorAffinity("Boh", profile, { a: w({ author: "Boh", done: true }), b: w({ author: "Boh", done: true }) }), 0.4); // learned from own history

// buffer: a half-watched weak video (resume bonus alone can't lead) stays first for 10 minutes after it last played
const [weak, strong] = [p("weak", 0.1, { fit: 0 }), p("strong", 0.9, { fit: 1 })];
const seen = (ago: number, o: object = {}) => ({ weak: w({ t: 300, seenAt: now.getTime() - ago, ...o }) });
assert.equal(q([strong, weak], seen(11 * 60e3)), "strongweak"); // idle for 11 min: normal order
assert.equal(q([strong, weak], seen(5 * 60e3)), "weakstrong"); // 5 min ago: it is still "on air"
assert.equal(q([strong, weak], seen(5 * 60e3, { done: true })), "strongweak"); // finished: no buffer
const [hi, lo] = [p("hi", 0.9, { fit: 1 }), p("lo", 0.1, { fit: 0 })]; // both half-watched: the one played last leads, not the one with the better score
assert.equal(q([hi, lo], { hi: w({ t: 300, seenAt: now.getTime() - 8 * 60e3 }), lo: w({ t: 300, seenAt: now.getTime() - 2 * 60e3 }) }), "lohi");
assert.equal(creatorAffinity("Boh", profile, { a: w({ author: "Boh", interested: 1 }), b: w({ author: "Boh", done: true }) }), 0.4); // interest counts like finishing

// the guide's clock: the half-watched programme "started" earlier, the next one follows back to back
const s = slots([A, B], { A: w({ t: 300 }) }, now);
assert.equal(s[0].start, now.getTime() - 300_000);
assert.equal(s[1].start, s[0].start + 600_000);
console.log("ok");
