"use client";

import type { Slot } from "@/lib/types";
import "./hud.css";

type Props = {
  channel: { num: number; name: string };
  now: Slot;
  next?: Slot;
  clock: Date;
  position: number; // seconds already played of `now`
};

const DAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const mss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
};

export default function Banner({ channel, now, next, clock, position }: Props) {

  const fraction = now.duration > 0 ? Math.min(1, Math.max(0, position / now.duration)) : 0;
  const mins = Math.floor(position / 60);
  const started = mins < 1 ? "Iniziato da meno di 1 minuto" : `Iniziato da ${mins} ${mins === 1 ? "minuto" : "minuti"}`;
  const clockText = `${DAYS[clock.getDay()]} ${clock.getDate()} ${MONTHS[clock.getMonth()]} ${hhmm(clock)}`;

  return (
    <div className="hud-banner" role="status" aria-live="polite">
      <div className="hud-banner-top">
        <div className="hud-banner-chan">
          <span>{channel.num}</span>
          <span className="hud-banner-name">{channel.name}</span>
        </div>
        <div className="hud-banner-right">
          <span className="hud-tag">
            <b>HD</b> Lingua
          </span>
          <span className="hud-clock">{clockText}</span>
        </div>
      </div>

      <div className="hud-banner-body">
        <div className="hud-col">
          <div className="hud-kicker">{started}</div>
          <div className="hud-title">{now.title}</div>
          <div className="hud-time">
            {hhmm(new Date(now.start))} · {now.author}
          </div>
          <div className="hud-foot">
            <div className="hud-progress">
              <i style={{ width: `${fraction * 100}%` }} />
            </div>
            <span className="hud-remain">-{mss(now.duration - position)}</span>
          </div>
        </div>

        <div className="hud-col">
          {next ? (
            <>
              <div className="hud-kicker">Dopo</div>
              <div className="hud-title">{next.title}</div>
              <div className="hud-time">
                {hhmm(new Date(next.start))} · {next.author}
              </div>
            </>
          ) : (
            <div className="hud-kicker">Nessun programma successivo</div>
          )}
        </div>
      </div>

      <div className="hud-banner-legend">
        <span className="hud-leg">
          <span className="hud-arrows">
            <span className="hud-tri l" />
            <span className="hud-tri r" />
          </span>
          Orario
        </span>
        <span className="hud-leg">
          <span className="hud-arrows">
            <span className="hud-tri u" />
            <span className="hud-tri d" />
          </span>
          Canale
        </span>
        <span className="hud-leg">
          <span className="hud-dot" />
          Canali preferiti
        </span>
      </div>
    </div>
  );
}
