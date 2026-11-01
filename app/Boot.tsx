"use client";

import { useEffect } from "react";
import "./hud.css";

type Props = {
  state: "loading" | "login" | "error" | "ready";
  error?: string;
  channelCount: number;
  programmeCount: number;
  onStart: () => void; // "Accendi"
  onLogin: () => void; // "Accedi con Google"
};

export default function Boot({ state, error, channelCount, programmeCount, onStart, onLogin }: Props) {
  // Enter / Space act on the visible button. Skipped when a real control has focus: its native click already fires.
  useEffect(() => {
    if (state !== "ready" && state !== "login") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
      if (e.target instanceof Element && e.target.closest("button, a, input, textarea, select")) return;
      e.preventDefault();
      if (state === "ready") onStart();
      else onLogin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onStart, onLogin]);

  return (
    <div className="hud-boot">
      <div className="hud-boot-band" aria-hidden="true" />

      <div className="hud-boot-main">
        <img className="hud-boot-logo" src="/logo.png" alt="uCable" />

        {state === "loading" && (
          <div className="hud-boot-status">
            <span className="hud-spinner" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            Sintonizzo i canali…
          </div>
        )}

        {state === "login" && (
          <button type="button" className="hud-pill hud-pill-big" onClick={onLogin}>
            Accedi con Google
          </button>
        )}

        {state === "error" && (
          <div className="hud-error" role="alert">
            {error || "Errore sconosciuto"}
          </div>
        )}

        {state === "ready" && (
          <>
            <div className="hud-boot-status">
              {channelCount} canali · {programmeCount} programmi
            </div>
            <button type="button" className="hud-pill hud-pill-big" onClick={onStart}>
              Accendi
            </button>
          </>
        )}
      </div>

      {(state === "ready" || state === "login") && (
        <div className="hud-legend hud-boot-legend">
          <span className="hud-leg">
            <kbd className="hud-key">OK</kbd>
            {state === "ready" ? "Accendi" : "Accedi"}
          </span>
        </div>
      )}
    </div>
  );
}
