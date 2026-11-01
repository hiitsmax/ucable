"use client";
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import Banner from "./Banner";
import Boot from "./Boot";
import Dialer from "./Dialer";
import Guide from "./Guide";
import PauseScreen from "./PauseScreen";
import Tuning from "./Tuning";
import { buildGuide, isSkipped, queue, slots, snoozeUntil } from "@/lib/schedule";
import { logoUrl } from "@/lib/slug";
import type { Profile, Slim, Watch } from "@/lib/types";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type Channel = { num: number; name: string; group?: string; videos: Slim[] };

const HISTORY = "ucable.history";
const startOf = (h?: Watch) => (h && !h.done && h.t > 5 ? h.t : 0); // resume unless finished

// Keys: digits = channel number (101…) · space pause · ←/→ ∓10 s · ↑/↓ channel · N not interested (gone for good) · L not now (back later) · U undo · P previous · R restart · M mute · I/Enter show the banner · G guide
// In the guide: arrows move, Enter plays, Esc/G closes.
export default function Page() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "login" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [on, setOn] = useState(false);
  const [queues, setQueues] = useState<Slim[][]>([]);
  const [pos, setPos] = useState({ c: 0, v: 0 });
  const [osd, setOsd] = useState(false);
  const [guideQ, setGuideQ] = useState<Slim[][] | null>(null); // queues of all channels, frozen while the guide is open
  // Zap sequence: tuning (navy screen + banner, spinner if slow) -> playing (video + channel logo appear together).
  // userPaused is only our own pause (Space), never YouTube's internal states, so "PAUSA" can't flash during a zap.
  const [phase, setPhase] = useState<"tuning" | "playing">("tuning");
  const [shownC, setShownC] = useState(0); // channel whose video is on screen: the logo follows the picture, not the keypress
  const [userPaused, setUserPaused] = useState(false);
  const [digits, setDigits] = useState("");
  const [secs, setSecs] = useState(0); // seconds played of the current video
  const [clock, setClock] = useState(() => new Date());
  const player = useRef<any>(null);
  const hist = useRef<Record<string, Watch>>({});
  const osdTimer = useRef(0);
  const dialTimer = useRef(0);
  const dialed = useRef("");

  useEffect(() => {
    try {
      hist.current = JSON.parse(localStorage.getItem(HISTORY) ?? "{}");
    } catch {}
    fetch("/api/videos")
      .then(async (r) => {
        const d = await r.json();
        if (r.status === 401) return setState("login");
        if (!r.ok) {
          setError(d.error);
          return setState("error");
        }
        // videos I got into (10 min or half watched) outlive the fetch window until finished, skipped or 30 days idle
        // ponytail: only back into a channel that still has videos; a channel emptied by the lineup drops them
        const have = new Set(d.channels.flatMap((c: Channel) => c.videos.map((v) => v.id)));
        for (const h of Object.values(hist.current)) {
          const k = h.keep;
          if (!k || h.done || isSkipped(h) || have.has(k.id) || Date.now() - (h.seenAt ?? 0) > 30 * 864e5) continue;
          d.channels.find((c: Channel) => c.name === k.channel)?.videos.push(k);
        }
        setChannels(d.channels);
        setProfile(d.profile);
        setState("ready");
      })
      .catch((e) => {
        setError(String(e));
        setState("error");
      });
  }, []);

  const w = (p: Slim) => (hist.current[p.id] ??= { t: 0, watched: 0, done: false, skips: 0, author: p.author, title: p.title });
  const save = () => {
    try {
      localStorage.setItem(HISTORY, JSON.stringify(hist.current));
    } catch {}
  };

  const q = queues[pos.c];
  const cur = q?.[pos.v];
  const ch = channels[pos.c];

  const flash = () => {
    setOsd(true);
    clearTimeout(osdTimer.current);
    osdTimer.current = window.setTimeout(() => setOsd(false), 5000);
  };
  // a different video is about to load: cover the screen until it really plays
  const retune = () => {
    setPhase("tuning");
    setUserPaused(false);
  };
  // tuning in re-runs the scheduler for that channel, so the order always fits "now", your profile and your history
  // a channel with nothing left to show (all skipped / not now) is passed over in the direction of `step`
  const tune = (c: number, step = 1) => {
    let nq: Slim[] = [];
    for (let i = 0; i < channels.length && !nq.length; i++) {
      c = (c + channels.length) % channels.length;
      nq = queue(channels[c].videos, hist.current, profile!);
      if (!nq.length) c += step;
    }
    setQueues((all) => Object.assign([...all], { [c]: nq }));
    if (nq[0]?.id !== cur?.id) retune();
    setPos({ c, v: 0 });
    setSecs(0);
    flash();
  };
  const jump = (v: number) => {
    const nv = (v + queues[pos.c].length) % queues[pos.c].length;
    if (nv !== pos.v) retune();
    setPos(({ c }) => ({ c, v: nv }));
    setSecs(0);
    flash();
  };
  // take the current video out of this channel's queue; the next one slides into its slot
  const dropCurrent = () => {
    if (q.length === 1) return tune(pos.c + 1); // channel exhausted
    setQueues((all) => Object.assign([...all], { [pos.c]: all[pos.c].filter((p) => p.id !== cur.id) }));
    retune();
    setPos(({ c, v }) => ({ c, v: v % (q.length - 1) }));
    setSecs(0);
    flash();
  };
  // N = "not interested": skipped for good. Recorded in the history (time, title, author), never proposed again,
  // and the creator is trusted a bit less. Past 90% (or already finished) it is just "next", not a skip.
  const skip = () => {
    if (!cur) return;
    const h = w(cur);
    if (h.done || h.t >= 0.9 * cur.duration) return jump(pos.v + 1);
    Object.assign(h, { skipped: Date.now(), skips: h.skips + 1 });
    save();
    dropCurrent();
  };
  // L = "not in the mood now": a different thing. Hidden for profile.snoozeHours (default 8 h), then it competes again.
  // No penalty: it says nothing about the video or the creator.
  const later = () => {
    if (!cur) return;
    Object.assign(w(cur), { snoozed: snoozeUntil(profile!), snoozedAt: Date.now() });
    save();
    dropCurrent();
  };
  // U = take back the last N or L; the video returns when its channel is tuned
  const undo = () => {
    const at = (x: Watch) => Math.max(x.skipped ?? 0, x.snoozedAt ?? 0);
    const last = Object.values(hist.current).filter((x) => at(x) > 0).sort((a, b) => at(b) - at(a))[0];
    if (!last) return;
    delete last.skipped;
    delete last.snoozed;
    delete last.snoozedAt;
    last.skips = 0;
    save();
    tune(pos.c);
  };
  const end = () => {
    if (!cur) return;
    const h = w(cur);
    Object.assign(h, { done: true, t: 0 });
    delete h.keep; // finished: no need to outlive the fetch window
    save();
    if (q.length === 1) {
      player.current?.seekTo(0, true); // same video would not reload by itself
      player.current?.playVideo();
    } else jump(pos.v + 1);
  };
  const restart = () => {
    if (!cur) return;
    Object.assign(w(cur), { t: 0, done: false });
    setUserPaused(false);
    player.current?.seekTo(0, true);
    player.current?.playVideo();
    setSecs(0);
    flash();
  };
  const openGuide = () =>
    setGuideQ(channels.map((c, i) => (i === pos.c && queues[i]) || queue(c.videos, hist.current, profile!)));
  const playFromGuide = (c: number, v: number) => {
    setQueues(guideQ!);
    if (guideQ![c]?.[v]?.id !== cur?.id) retune();
    setPos({ c, v });
    setSecs(0);
    setGuideQ(null);
    flash();
  };
  // typed channel number: 3 digits go at once, 1-2 digits wait a moment and count as 100+n (5 -> 105)
  const dial = (d: string) => {
    const next = (dialed.current + d).slice(0, 3);
    dialed.current = next;
    setDigits(next);
    clearTimeout(dialTimer.current);
    const commit = () => {
      const n = next.length < 3 ? 100 + Number(next) : Number(next);
      const i = live.current.channels.findIndex((c) => c.num === n);
      dialed.current = "";
      setDigits("");
      if (i >= 0) live.current.tune(i);
    };
    if (next.length === 3) commit();
    else dialTimer.current = window.setTimeout(commit, 1800);
  };

  // handlers registered once read the latest closures through this ref
  const live = useRef({ cur, pos, channels, guideOpen: false, userPaused: false, tune, jump, skip, later, undo, end, restart, openGuide, dial });
  live.current = { cur, pos, channels, guideOpen: !!guideQ, userPaused, tune, jump, skip, later, undo, end, restart, openGuide, dial };

  // YouTube player: no controls, everything else hidden by CSS (see globals.css), we drive it with the keyboard
  useEffect(() => {
    if (!on) return;
    const make = () => {
      const c = live.current.cur;
      player.current = new window.YT.Player("yt", {
        videoId: c?.id,
        playerVars: {
          autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3, cc_load_policy: 0, playsinline: 1,
          start: Math.floor(startOf(c && hist.current[c.id])),
        },
        events: {
          onStateChange: (e: any) => {
            const onScreen = e.target.getVideoData?.().video_id === live.current.cur?.id;
            if (e.data === 0) onScreen && live.current.end(); // a late ENDED of the previous video must not finish the new one
            // the new video really plays: lift the navy screen and bring the logo of ITS channel
            else if (e.data === 1 && onScreen) {
              setPhase("playing");
              setShownC(live.current.pos.c);
            }
          },
          onError: () => live.current.jump(live.current.pos.v + 1), // embedding disabled etc. -> next
        },
      });
    };
    if (window.YT?.Player) make();
    else {
      window.onYouTubeIframeAPIReady = make;
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.append(s);
    }
  }, [on]);

  useEffect(() => {
    if (cur) player.current?.loadVideoById?.({ videoId: cur.id, startSeconds: startOf(hist.current[cur.id]) });
  }, [cur?.id]);

  // clock + watch-time tracker: counts only seconds actually playing
  useEffect(() => {
    if (!on) return;
    let n = 0;
    const timer = setInterval(() => {
      setClock(new Date());
      const p = player.current;
      const c = live.current.cur;
      if (!c || p?.getPlayerState?.() !== 1 || p.getVideoData?.().video_id !== c.id) return;
      const h = w(c);
      Object.assign(h, { t: p.getCurrentTime(), done: false, seenAt: Date.now() });
      h.watched++;
      if (!h.keep && c.duration > 0 && (h.watched >= 600 || h.watched >= c.duration / 2)) Object.assign(h, { interested: h.interested ?? Date.now(), keep: c }); // after a replay `keep` comes back too
      setSecs(Math.floor(h.t));
      if (++n % 5 === 0) save();
    }, 1000);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const L = live.current;
      if (L.guideOpen) return; // the guide handles its own keys
      const p = player.current;
      const k = e.key.toLowerCase();
      if (/^[0-9]$/.test(k)) L.dial(k);
      else if (k === " ") {
        if (L.userPaused) p?.playVideo?.();
        else p?.pauseVideo?.();
        setUserPaused(!L.userPaused);
      }
      else if (k === "arrowleft" || k === "arrowright") {
        p?.seekTo?.(p.getCurrentTime() + (k === "arrowright" ? 10 : -10), true);
        flash();
      } else if (k === "arrowup") L.tune(L.pos.c - 1, -1);
      else if (k === "arrowdown") L.tune(L.pos.c + 1);
      else if (k === "n") L.skip();
      else if (k === "l") L.later();
      else if (k === "u") L.undo();
      else if (k === "p") L.jump(L.pos.v - 1);
      else if (k === "r") L.restart();
      else if (k === "m") p?.isMuted?.() ? p.unMute() : p?.mute?.();
      else if (k === "g") L.openGuide();
      else if (k === "i" || k === "enter") flash(); // show the banner again (5 s)
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);

  if (state !== "ready" || !on)
    return (
      <Boot
        state={state}
        error={error}
        channelCount={channels.length}
        programmeCount={channels.reduce((n, c) => n + c.videos.length, 0)}
        onStart={() => {
          setOn(true);
          tune(0);
        }}
        onLogin={() => signIn("google")}
      />
    );

  const chSlots = q ? slots(q, hist.current, clock) : [];

  return (
    <main className="tv">
      <div className="stage">
        <div id="yt" />
      </div>
      {phase === "tuning" && <Tuning key={`${pos.c}.${pos.v}`} />}
      {/* one bug: the channel's lockup replaces the platform logo; it appears WITH the picture, not before */}
      {phase === "playing" && channels[shownC] && (
        <img
          className="bug"
          key={channels[shownC].name}
          src={logoUrl(channels[shownC].name)}
          alt={channels[shownC].name}
          onError={(e) => {
            e.currentTarget.onerror = null; // no logo yet -> plain uCable
            e.currentTarget.src = "/logo.png";
          }}
        />
      )}

      {userPaused && phase === "playing" && !guideQ && cur && <PauseScreen title={cur.title} author={cur.author} position={secs} duration={cur.duration} />}
      {osd && !guideQ && cur && ch && (
        <Banner channel={{ num: ch.num, name: ch.name }} now={chSlots[pos.v]} next={chSlots[pos.v + 1]} clock={clock} position={secs} />
      )}
      {digits && <Dialer digits={digits} />}
      {guideQ && (
        <Guide
          channels={buildGuide(channels, guideQ, hist.current, logoUrl, clock)}
          current={pos}
          now={clock}
          onPlay={playFromGuide}
          onClose={() => setGuideQ(null)}
        />
      )}
    </main>
  );
}
