"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import type { GuideChannel, Slot } from "@/lib/types";
import "./guide.css";

type Props = {
  channels: GuideChannel[];
  current: { c: number; v: number };
  now: Date;
  onPlay: (c: number, v: number) => void;
  onClose: () => void;
};

type MenuItem = { key: string; label: string; count: number; bucket: number | null };

const ROWS = 6; // programme rows on the grid screen: big rows, big logos
const HALF_HOUR = 30 * 60 * 1000;
const COLS = 6; // 3 hours of half-hour columns
const WINDOW = COLS * HALF_HOUR;
const MIN_W = 2.5; // % of window: very short cells stay clickable
const TITLE_MIN_W = 5; // % of window: narrower cells hide their title
const OTHER = "Altri canali";
const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const stamp = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${hhmm(d.getTime())}`;
const dur = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
// first visible row so that row p is on screen
const follow = (p: number, top: number) => (p < top ? p : p >= top + ROWS ? p - ROWS + 1 : top);
const clampTop = (top: number, n: number) => clamp(top, 0, Math.max(0, n - ROWS));
// index of the slot airing at time t (last one starting at or before t), 0 if none
const slotAt = (slots: Slot[], t: number) => {
  let idx = 0;
  slots.forEach((s, i) => {
    if (s.start <= t) idx = i;
  });
  return idx;
};
// same time on screen: the slot airing at the visible left edge of the old selection
const pickSlot = (from: GuideChannel | undefined, v: number, to: GuideChannel, winStart: number) => {
  const old = from?.slots[v];
  return slotAt(to.slots, old ? Math.max(old.start, winStart) : winStart);
};

// Header oval. The PNG has the oval and icon painted on it; if it is missing, a CSS oval stands in.
function Btn({ src, label, on = false }: { src: string; label: string; on?: boolean }) {
  const [ok, setOk] = useState(true);
  return (
    <div className={on ? "sg-btn sg-btn--on" : "sg-btn"}>
      {ok ? (
        <img className="sg-btn-img" src={src} alt="" onError={() => setOk(false)} />
      ) : (
        <span className="sg-oval">
          <span className="sg-ico" />
        </span>
      )}
      <div className="sg-blabel">{label}</div>
    </div>
  );
}

// Channel cell: the logo already carries the name; the name is only shown if the logo fails.
function ChanCell({
  num,
  name,
  logo,
  sel,
  onClick,
}: {
  num: number;
  name: string;
  logo: string;
  sel: boolean;
  onClick: () => void;
}) {
  const [ok, setOk] = useState(true);
  return (
    <div className={sel ? "sg-chan sg-chan--sel" : "sg-chan"} onClick={onClick}>
      <span className="sg-num">{num}</span>
      {ok ? (
        <img className="sg-logo" src={logo} alt={name} onError={() => setOk(false)} />
      ) : (
        <span className="sg-name">{name}</span>
      )}
    </div>
  );
}

function Ruler({ winStart }: { winStart: number }) {
  return (
    <div className="sg-ruler">
      <div className="sg-chan-col">Oggi</div>
      <div className="sg-track">
        {Array.from({ length: COLS }, (_, k) => (
          <div key={k} className="sg-tick" style={{ left: `${(k / COLS) * 100}%` }}>
            {hhmm(winStart + k * HALF_HOUR)}
          </div>
        ))}
        <span className="sg-ra sg-ra--l" />
        <span className="sg-ra sg-ra--r" />
      </div>
    </div>
  );
}

export default function Guide({ channels, current, now, onPlay, onClose }: Props) {
  const n = channels.length;
  const d = new Date(now);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  const winStart = d.getTime();
  const winEnd = winStart + WINDOW;

  // Categories: first 9 distinct groups get keys 1..9, extra groups merge into the 9th. Key 0 = all.
  const groupOf = (ch: GuideChannel) => ch.group ?? OTHER;
  const groupOrder: string[] = [];
  for (const ch of channels) if (!groupOrder.includes(groupOf(ch))) groupOrder.push(groupOf(ch));
  const bucketOf = (ch: GuideChannel) => Math.min(groupOrder.indexOf(groupOf(ch)), 8);
  const items: MenuItem[] = [
    ...Array.from({ length: 9 }, (_, b) => ({
      key: String(b + 1),
      label: (groupOrder[b] ?? "").toUpperCase(),
      count: channels.filter((ch) => bucketOf(ch) === b).length,
      bucket: b,
    })),
    { key: "0", label: "TUTTI I CANALI", count: n, bucket: null },
  ];

  const currentBucket = channels[current.c] ? bucketOf(channels[current.c]) : 9;
  const [screen, setScreen] = useState<"menu" | "grid">("menu");
  const [menuSel, setMenuSel] = useState(currentBucket);
  const [bucket, setBucket] = useState<number | null>(null); // grid filter, null = all
  const [sel, setSel] = useState(() => ({
    c: clamp(current.c, 0, Math.max(0, n - 1)),
    v: Math.max(0, current.v),
  }));
  const [top, setTop] = useState(0); // first visible row, in list positions

  const list = channels.map((_, ci) => ci).filter((ci) => bucket === null || bucketOf(channels[ci]) === bucket);
  const ch: GuideChannel | undefined = channels[sel.c];
  const cur: Slot | undefined = ch?.slots[sel.v];
  const status = !cur ? "" : cur.done ? "VISTO" : cur.progress > 0 ? `${Math.round(cur.progress * 100)}%` : "NUOVO";

  // Enter a group (or all). Keeps the tuned channel when it belongs to the group.
  const openGroup = (b: number | null) => {
    const ids = channels.map((_, ci) => ci).filter((ci) => b === null || bucketOf(channels[ci]) === b);
    if (!ids.length) return;
    const keep = ids.includes(sel.c);
    const c = keep ? sel.c : ids[0];
    const v = keep ? sel.v : slotAt(channels[c].slots, now.getTime());
    setBucket(b);
    setSel({ c, v });
    setTop(clampTop(follow(ids.indexOf(c), 0), ids.length));
    setScreen("grid");
  };

  useEffect(() => {
    const stop = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const isG = k === "g" || k === "G";
      const isEsc = k === "Escape" || k === "Esc";
      const isDigit = /^[0-9]$/.test(k);
      const isNav = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(k);

      if (screen === "menu") {
        if (isG || isEsc) {
          stop(e);
          onClose();
          return;
        }
        if (isDigit) {
          stop(e);
          openGroup(items[k === "0" ? 9 : Number(k) - 1].bucket);
          return;
        }
        if (!isNav) return;
        stop(e);
        const col = menuSel < 5 ? 0 : 1;
        const row = menuSel % 5;
        if (k === "ArrowUp") setMenuSel(col * 5 + clamp(row - 1, 0, 4));
        else if (k === "ArrowDown") setMenuSel(col * 5 + clamp(row + 1, 0, 4));
        else if (k === "ArrowLeft") setMenuSel(row);
        else if (k === "ArrowRight") setMenuSel(5 + row);
        else if (k === "Enter") openGroup(items[menuSel].bucket);
        return;
      }

      // grid screen
      if (isG) {
        stop(e);
        onClose();
        return;
      }
      if (isEsc) {
        stop(e);
        setScreen("menu");
        setMenuSel(bucket ?? 9);
        return;
      }
      const isPage = k === "PageUp" || k === "PageDown";
      if (!isNav && !isPage) return;
      stop(e);
      if (!list.length) return;
      const { c, v } = sel;
      const p = list.indexOf(c);
      const len = channels[c].slots.length;
      const cross = (p2: number) => {
        const q = clamp(p2, 0, list.length - 1);
        const c2 = list[q];
        setSel({ c: c2, v: pickSlot(channels[c], v, channels[c2], winStart) });
        setTop(clampTop(follow(q, top), list.length));
      };
      switch (k) {
        case "ArrowUp":
          cross(p - 1);
          break;
        case "ArrowDown":
          cross(p + 1);
          break;
        case "PageUp":
          cross(p - ROWS);
          break;
        case "PageDown":
          cross(p + ROWS);
          break;
        case "ArrowLeft":
          if (len) setSel({ c, v: clamp(v - 1, 0, len - 1) });
          break;
        case "ArrowRight":
          if (len) setSel({ c, v: clamp(v + 1, 0, len - 1) });
          break;
        case "Enter":
          if (len) onPlay(c, v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, menuSel, bucket, sel, top, channels, now, current, onPlay, onClose, winStart]);

  const play = (c: number, v: number) => {
    setSel({ c, v });
    onPlay(c, v);
  };
  const selectChannel = (c: number) => {
    setSel({ c, v: pickSlot(ch, sel.v, channels[c], winStart) });
  };

  const head = (
    <header className="sg-head">
      <div className="sg-side">
        <Btn src="/ui/icon-guida.png" label="GUIDA TV" on />
        <Btn src="/ui/icon-primafila.png" label="PRIMAFILA" />
      </div>
      <div className="sg-brand">
        <img className="sg-logo-main" src="/logo.png" alt="uCable" />
        <div className="sg-clock">{stamp(now)}</div>
      </div>
      <div className="sg-side sg-side--r">
        <Btn src="/ui/icon-menu.png" label="MENU" />
        <Btn src="/ui/icon-interattivi.png" label="INTERATTIVI" />
      </div>
    </header>
  );

  if (screen === "menu") {
    return (
      <div className="sg-root">
        <div className="sg-screen" role="dialog" aria-label="Guida TV, menu">
          {head}
          <Ruler winStart={winStart} />
          <div className="sg-menu">
            {[0, 1].map((col) => (
              <div key={col} className="sg-mcol">
                {items.slice(col * 5, col * 5 + 5).map((it, r) => {
                  const i = col * 5 + r;
                  return (
                    <div
                      key={it.key}
                      className={menuSel === i ? "sg-mrow sg-mrow--sel" : "sg-mrow"}
                      onClick={() => {
                        setMenuSel(i);
                        openGroup(it.bucket);
                      }}
                    >
                      <span className="sg-mkey">{it.key}</span>
                      <span className="sg-mbar">
                        <span className="sg-mlabel">{it.label}</span>
                        <span className="sg-mcount">{it.count} canali</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <footer className="sg-legend">
            <span><span className="sg-key">OK</span>Visualizza</span>
            <span><span className="sg-key">ESC</span>Indietro</span>
            <span><span className="sg-dot sg-dot--yellow" />Programmi A-Z</span>
            <span><span className="sg-dot sg-dot--blue" />Agenda Personale</span>
          </footer>
        </div>
      </div>
    );
  }

  const rowIdx = Array.from({ length: ROWS }, (_, i) => (top + i < list.length ? list[top + i] : -1));

  return (
    <div className="sg-root">
      <div className="sg-screen" role="dialog" aria-label="Guida TV">
        {head}
        <Ruler winStart={winStart} />
        <div className="sg-rows">
          {top > 0 && <span className="sg-more sg-more--up" />}
          {top + ROWS < list.length && <span className="sg-more sg-more--down" />}
          {rowIdx.map((ci, i) => {
            if (ci < 0) return <div key={`e${i}`} className="sg-row" />;
            const chn = channels[ci];
            return (
              <div key={ci} className="sg-row">
                <ChanCell
                  num={chn.num}
                  name={chn.name.replace(/^uCable\s+/i, "")}
                  logo={chn.logo}
                  sel={ci === sel.c}
                  onClick={() => selectChannel(ci)}
                />
                <div className="sg-track">
                  {chn.slots.map((s, vi) => {
                    const end = s.start + s.duration * 1000;
                    if (end <= winStart || s.start >= winEnd) return null;
                    const cs = Math.max(s.start, winStart);
                    const ce = Math.min(end, winEnd);
                    const w = Math.max(MIN_W, ((ce - cs) / WINDOW) * 100);
                    const l = Math.min(((cs - winStart) / WINDOW) * 100, 100 - w);
                    const selected = ci === sel.c && vi === sel.v;
                    const cls = [
                      "sg-cell",
                      selected && "sg-cell--sel",
                      s.done && "sg-cell--done",
                      s.start < winStart && "sg-cell--from",
                      end > winEnd && "sg-cell--to",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div
                        key={`${s.id}-${vi}`}
                        className={cls}
                        style={{ left: `${l}%`, width: `${w}%` }}
                        title={s.title}
                        onClick={() => play(ci, vi)}
                      >
                        {w >= TITLE_MIN_W && <span className="sg-title">{s.title}</span>}
                        <span className="sg-bar" style={{ width: `${Math.round(s.progress * 100)}%` }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="sg-info">
          {cur && (
            <>
              <span className="sg-info-t">{cur.title}</span>
              <span className="sg-info-a">{cur.author}</span>
              <span>{dur(cur.duration)}</span>
              <span className="sg-info-s">{status}</span>
            </>
          )}
        </div>
        <footer className="sg-legend">
          <span><span className="sg-key">OK</span>Guarda</span>
          <span><span className="sg-key">i</span>Info</span>
          <span><span className="sg-key">ESC</span>Indietro</span>
          <span><span className="sg-dot sg-dot--red" />Pagina Su</span>
          <span><span className="sg-dot sg-dot--green" />Pagina Giù</span>
          <span><span className="sg-dot sg-dot--yellow" />-1 ora</span>
          <span><span className="sg-dot sg-dot--blue" />+1 ora</span>
        </footer>
      </div>
    </div>
  );
}
