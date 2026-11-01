"use client";

import "./hud.css";

// Channel-number entry: three slots, typed digits in yellow, missing ones as a light-blue dash.
export default function Dialer({ digits }: { digits: string }) {
  return (
    <div className="hud-dialer" aria-label={`Canale ${digits || "da inserire"}`}>
      {[0, 1, 2].map((i) => {
        const d = digits[i];
        return d ? (
          <span key={i} className="hud-digit">
            {d}
          </span>
        ) : (
          <span key={i} className="hud-digit hud-digit-empty">
            –
          </span>
        );
      })}
    </div>
  );
}
