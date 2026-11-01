"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Banner from "@/app/Banner";
import Boot from "@/app/Boot";
import Dialer from "@/app/Dialer";
import PauseScreen from "@/app/PauseScreen";
import type { Slot } from "@/lib/types";

// Throw-away preview of the HUD components. Not linked from the app.
type View = "loading" | "login" | "error" | "ready" | "banner" | "dialer" | "pause";

const POS = 250; // seconds already played
const DUR = 1260;

const bar: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 100,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
  padding: 6,
  background: "rgba(0, 0, 0, 0.85)",
};
const btn: CSSProperties = { fontSize: 13, padding: "4px 12px" };

export default function HudPreview() {
  const [view, setView] = useState<View>("ready");
  const [digits, setDigits] = useState(2);
  const [clock, setClock] = useState<Date | null>(null);
  const [log, setLog] = useState("");

  useEffect(() => {
    setClock(new Date());
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const onStart = useCallback(() => setLog("Accendi premuto"), []);
  const onLogin = useCallback(() => setLog("Accedi con Google premuto"), []);

  const base = clock?.getTime() ?? 0;
  const now: Slot = {
    id: "a",
    title: "Il tramonto sul Tevere",
    author: "Viaggi Lenti",
    duration: DUR,
    progress: POS / DUR,
    done: false,
    start: base - POS * 1000,
  };
  const next: Slot = {
    id: "b",
    title: "Cucina di strada, episodio 12",
    author: "Sapori & Co",
    duration: 900,
    progress: 0,
    done: false,
    start: base + (DUR - POS) * 1000,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#000" }}>
      <div style={bar}>
        {(["loading", "login", "error", "ready"] as const).map((v) => (
          <button key={v} type="button" className="hud-pill" style={btn} onClick={() => setView(v)}>
            Boot: {v}
          </button>
        ))}
        <button type="button" className="hud-pill" style={btn} onClick={() => setView("banner")}>
          Banner
        </button>
        {[0, 1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            className="hud-pill"
            style={btn}
            onClick={() => {
              setDigits(n);
              setView("dialer");
            }}
          >
            Dialer {n}
          </button>
        ))}
        <button type="button" className="hud-pill" style={btn} onClick={() => setView("pause")}>
          Pausa
        </button>
        <span style={{ color: "#fff", fontSize: 12 }}>{log}</span>
      </div>

      {view === "banner" && clock && (
        <Banner
          channel={{ num: 101, name: "uCable Calcio" }}
          now={now}
          next={next}
          clock={clock}
          position={POS}
        />
      )}
      {view === "dialer" && <Dialer digits={"123".slice(0, digits)} />}
      {view === "pause" && (
        <PauseScreen title="Il tramonto sul Tevere" author="Viaggi Lenti" position={POS} duration={DUR} />
      )}
      {view !== "banner" && view !== "dialer" && view !== "pause" && (
        <Boot
          state={view}
          error={view === "error" ? "Impossibile leggere il calendario: HTTP 403 (quota YouTube esaurita)" : undefined}
          channelCount={12}
          programmeCount={340}
          onStart={onStart}
          onLogin={onLogin}
        />
      )}
    </div>
  );
}
