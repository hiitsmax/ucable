"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { DAYPARTS, type Slim } from "@/lib/types";
import "./lab.css";

type Tab = "channels" | "prompts" | "profile";
type Sort = "fit" | "views" | "date";
type Group = { num: number; name: string; videos: Slim[] };

const TABS: Tab[] = ["channels", "prompts", "profile"];
const LOGIN = "Fai login nella app (http://localhost:3001) poi rilancia.";
const DAY = 86_400_000;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const SORTS: Record<Sort, (a: Slim, b: Slim) => number> = {
  fit: (a, b) => b.fit - a.fit,
  views: (a, b) => b.views - a.views,
  date: (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
};
const topDaypart = (v: Slim) => DAYPARTS.reduce((a, b) => (v.daypart[b] > v.daypart[a] ? b : a));
const ageDays = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY);
// the last channel of channels.json is the catch-all ("zapping")
function catchAllName(text: string): string | undefined {
  try {
    return (JSON.parse(text) as { name: string }[]).at(-1)?.name;
  } catch {
    return undefined;
  }
}

export default function Lab() {
  const [tab, setTab] = useState<Tab>("channels");
  const [texts, setTexts] = useState<Record<Tab, string>>({ channels: "", prompts: "", profile: "" });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Group[] | null>(null);
  const [since, setSince] = useState<number | null>(null); // run start, epoch ms
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("fit");
  const [copied, setCopied] = useState(false);

  const busy = since !== null;
  const elapsed = since === null ? 0 : Math.floor((now - since) / 1000);

  useEffect(() => {
    fetch("/api/lab")
      .then((r) => r.json())
      .then(setTexts)
      .catch(() => setError("Impossibile leggere i file di configurazione."));
  }, []);

  useEffect(() => {
    if (since === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [since]);

  const setText = (v: string) => setTexts((t) => ({ ...t, [tab]: v }));

  async function run() {
    const t = Date.now();
    setError(null);
    setSince(t);
    setNow(t);
    try {
      const r = await fetch("/api/videos");
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) setError(LOGIN);
      else if (!r.ok) setError(d.error ?? `Errore ${r.status}`);
      else setResult(d.channels);
    } catch (e) {
      setError(String(e));
    } finally {
      setSince(null);
    }
  }

  async function saveAndRun() {
    setError(null);
    const r = await fetch("/api/lab", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(texts),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error ?? `Errore ${r.status}`);
      return;
    }
    await run();
  }

  async function reset() {
    if (!confirm("Cancella tutti i tag salvati? Al prossimo giro Jev ri-tagga ogni video (lento).")) return;
    await fetch("/api/lab", { method: "DELETE" });
    await run();
  }

  async function copy() {
    const text = (result ?? [])
      .flatMap((g) => g.videos.map((v) => `${g.name} | ${v.title} | ${v.author}`))
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Tab inserts two spaces (execCommand keeps the caret and the undo stack)
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    document.execCommand("insertText", false, "  ");
  };

  const q = filter.trim().toLowerCase();
  const groups = (result ?? []).map((g) => ({
    ...g,
    videos: g.videos
      .filter((v) => !q || v.title.toLowerCase().includes(q) || v.author.toLowerCase().includes(q))
      .sort(SORTS[sort]),
  }));
  const all = (result ?? []).flatMap((g) => g.videos);
  const zapN = (result ?? []).find((g) => g.name === catchAllName(texts.channels))?.videos.length ?? 0;
  const zapPct = all.length ? Math.round((100 * zapN) / all.length) : 0;
  const max = Math.max(1, ...groups.map((g) => g.videos.length));

  return (
    <main className="lab-page">
      <section>
        <nav className="lab-tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? "lab-on" : ""} onClick={() => setTab(t)}>
              {t}.json
            </button>
          ))}
        </nav>
        <textarea
          value={texts[tab]}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <div className="lab-actions">
          <button disabled={busy} onClick={saveAndRun}>Salva e rilancia</button>
          <button disabled={busy} onClick={run}>Rilancia</button>
          <button disabled={busy} onClick={reset}>Ritaglia tutto da zero</button>
          {busy && <span className="lab-timer">in corso… {elapsed}s</span>}
        </div>
        {error && <pre className="lab-error">{error}</pre>}
      </section>

      <section>
        {!result ? (
          <p className="lab-hint">Nessun risultato. Premi «Rilancia».</p>
        ) : (
          <>
            <p className="lab-summary">
              {result.length} canali · {all.length} video · {zapPct}%
            </p>
            <div className="lab-tools">
              <input
                placeholder="filtra per titolo o autore"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="fit">ordina: fit</option>
                <option value="views">ordina: views</option>
                <option value="date">ordina: data</option>
              </select>
              <button onClick={copy}>{copied ? "Copiato" : "Copia come testo"}</button>
            </div>

            {groups.map((g) => (
              <div className="lab-bar-row" key={g.num}>
                <span>{g.name}</span>
                <div className="lab-bar">
                  <div className="lab-fill" style={{ width: `${(100 * g.videos.length) / max}%` }} />
                </div>
                <b>{g.videos.length}</b>
              </div>
            ))}

            {groups.map((g, i) => (
              <details key={g.num} open={i === 0}>
                <summary>
                  {g.num} {g.name} ({g.videos.length})
                </summary>
                <div className="lab-scroll">
                  <table className="lab-table">
                    <thead>
                      <tr>
                        <th>Titolo</th>
                        <th>Autore</th>
                        <th>Fit</th>
                        <th>Fascia</th>
                        <th>Views</th>
                        <th>Giorni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.videos.map((v) => (
                        <tr key={v.id}>
                          <td>{v.title}</td>
                          <td>{v.author}</td>
                          <td className="lab-num" style={{ background: `rgba(60, 200, 100, ${v.fit})` }}>
                            {Math.round(v.fit * 100)}%
                          </td>
                          <td>{topDaypart(v)}</td>
                          <td className="lab-num">{compact.format(v.views)}</td>
                          <td className="lab-num">{ageDays(v.publishedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </>
        )}
      </section>
    </main>
  );
}
