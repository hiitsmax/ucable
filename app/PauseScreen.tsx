"use client";

import "./hud.css";

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

type Props = { title: string; author: string; position: number; duration: number };

export default function PauseScreen({ title, author, position, duration }: Props) {
  const pct = duration > 0 ? Math.min(1, Math.max(0, position / duration)) * 100 : 0;

  return (
    <div className="hud-pause" role="dialog" aria-label="Pausa">
      <div className="hud-pause-btn" aria-hidden="true">
        <i />
        <i />
      </div>
      <div className="hud-pause-label">PAUSA</div>
      <div className="hud-pause-title">{title}</div>
      <div className="hud-pause-author">{author}</div>
      <div className="hud-pause-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="hud-pause-time">
        {fmt(position)} / {fmt(duration)}
      </div>
      <div className="hud-legend hud-pause-legend">
        <span className="hud-leg">
          <kbd className="hud-key">SPAZIO</kbd>Riprendi
        </span>
        <span className="hud-leg">
          <kbd className="hud-key">← →</kbd>±10 s
        </span>
        <span className="hud-leg">
          <kbd className="hud-key">N</kbd>Non mi interessa
        </span>
        <span className="hud-leg">
          <kbd className="hud-key">L</kbd>Non ora
        </span>
        <span className="hud-leg">
          <kbd className="hud-key">U</kbd>Annulla
        </span>
      </div>
    </div>
  );
}
