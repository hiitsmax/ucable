"use client";

// Throw-away preview of <Guide> at /dev/guide. Mock data uses the real lineup (channels.json).
// Built after mount so server and client markup match, and the handlers can be plain functions.

import { useEffect, useState } from "react";
import Guide from "@/app/Guide";
import lineup from "@/channels.json";
import { slug } from "@/lib/slug";
import type { GuideChannel, Slot } from "@/lib/types";

const TITLES = [
  "Viaggio nel Sahara",
  "Cucina di strada",
  "Il mistero del faro",
  "Concerto all'alba",
  "Robot che imparano",
  "La storia del caffe",
  "Pesca in laguna",
  "Notiziario della sera",
  "Lezione di chitarra",
  "Citta sotto la neve",
  "Orchestra giovanile",
  "Il giardino segreto",
  "Prova: la tua auto",
  "Mercato del pesce",
  "Trekking sulle Dolomiti",
  "Storia della radio",
];
const AUTHORS = ["Luca Rossi", "Sara Bianchi", "Marco Neri", "Giulia Verdi", "Paolo Greco", "Chiara Russo"];

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function build(now: Date): GuideChannel[] {
  const t0 = now.getTime();
  return lineup.map((lc, ci) => {
    const count = 4 + Math.floor(Math.random() * 5); // 4..8 programmes
    // durations in seconds: the first one is on air now (10..90 min), the rest 3..90 min
    const durs = Array.from({ length: count }, (_, i) =>
      (i === 0 ? 10 + Math.floor(Math.random() * 80) : 3 + Math.floor(Math.random() * 88)) * 60,
    );
    let start = t0 - Math.random() * durs[0] * 1000; // started a bit before now
    return {
      num: 101 + ci,
      name: lc.name,
      group: lc.group,
      logo: `/channels/${slug(lc.name)}.png`,
      slots: durs.map((duration, vi): Slot => {
        const seen = vi > 0 && Math.random() < 0.15;
        const progress =
          vi === 0 ? (t0 - start) / (duration * 1000) : seen ? 1 : Math.random() < 0.3 ? Math.random() : 0;
        const slot: Slot = {
          id: `c${ci}-${vi}`,
          title: pick(TITLES),
          author: pick(AUTHORS),
          duration,
          progress,
          done: progress >= 1,
          start,
        };
        start += duration * 1000;
        return slot;
      }),
    };
  });
}

export default function GuideDev() {
  const [model, setModel] = useState<{ channels: GuideChannel[]; now: Date } | null>(null);

  useEffect(() => {
    const now = new Date();
    setModel({ channels: build(now), now });
  }, []);

  if (!model) return null;

  return (
    <Guide
      channels={model.channels}
      current={{ c: 6, v: 1 }}
      now={model.now}
      onPlay={(c, v) => console.log("play", c, v)}
      onClose={() => console.log("close")}
    />
  );
}
