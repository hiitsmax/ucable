"use client";
import { useEffect, useState } from "react";

// The "no picture" screen shown between two videos: uCable navy, and a spinner only if tuning takes a while.
// Mounted by the page while phase === "tuning"; the page re-keys it on every zap so the timer restarts.
export default function Tuning() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(t);
  }, []);
  return <div className="tuning">{slow && <div className="tuning-spin" />}</div>;
}
