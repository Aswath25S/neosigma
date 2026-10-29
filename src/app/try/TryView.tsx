"use client";

import { useRef, useState } from "react";
import { PostingReport, type ReportData } from "@/components/PostingReport";
import { EXAMPLES } from "@/lib/examples";

const STAGES = [
  { id: "reading", label: "Reading posting" },
  { id: "splitting", label: "Splitting duties" },
  { id: "matching", label: "Matching to NeoSigma" },
  { id: "live", label: "Checking for a live agent" },
  { id: "scoring", label: "Scoring" },
] as const;
type StageId = (typeof STAGES)[number]["id"];
type StageState = Partial<Record<StageId, "running" | "done">>;

const MAX = 20_000;

function Chip({ label, state }: { label: string; state?: "running" | "done" }) {
  return (
    <span className={`inline-flex items-center gap-2 h-8 px-3 rounded-full bg-surface-2 font-mono text-[12px] ${state ? "text-ink" : "text-muted"}`}>
      {state === "done" ? (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 L5 9 L10 3" stroke="var(--covered)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${state === "running" ? "bg-covered pulse" : "bg-notcovered"}`} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function TryView() {
  const [text, setText] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [stages, setStages] = useState<StageState>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportData | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  function load(key: keyof typeof EXAMPLES) {
    const ex = EXAMPLES[key];
    setText(ex.text);
    setCompany(ex.company);
    setTitle(ex.title);
    setResult(null);
    setError(null);
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setStages({});
    const t0 = performance.now();
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, company: company || undefined, title: title || undefined }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Something went wrong. Please try again.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "stage") setStages((s) => ({ ...s, [ev.stage]: ev.status }));
          else if (ev.type === "result") {
            setResult(ev.data);
            setElapsed((performance.now() - t0) / 1000);
            setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
          } else if (ev.type === "error") throw new Error(ev.message);
        }
      }
    } catch (err) {
      // The pasted text stays in the box.
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const verdict = result
    ? result.gates.passed
      ? `This is a qualifying lead role: ${Math.round(result.gates.overlap * 100)}% overlap with an agent already in front of users.`
      : `Not a lead. ${result.gates.failText ?? ""} ${result.gates.failDetail ?? ""}`.trim()
    : null;

  return (
    <div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-8">
        <div>
          <label htmlFor="posting" className="label block mb-2">Posting text</label>
          <textarea id="posting" value={text} onChange={(e) => setText(e.target.value.slice(0, MAX))} rows={16}
            placeholder="Paste the full job posting here…"
            className="w-full p-4 text-[14.5px] leading-relaxed font-sans resize-y" />
          <div className="mono !text-[11px] text-muted mt-1 text-right">{text.length.toLocaleString()} / {MAX.toLocaleString()}</div>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="company" className="label block mb-2">Company (optional)</label>
            <input id="company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full h-11 px-3 text-[14px]" />
          </div>
          <div>
            <label htmlFor="title" className="label block mb-2">Title (optional)</label>
            <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full h-11 px-3 text-[14px]" />
          </div>
          <button className="btn btn-primary w-full" disabled={running || text.trim().length < 200} onClick={run}>
            {running ? "Analyzing…" : "Analyze posting"}
          </button>
          <div className="label mt-2">Try an example</div>
          <div className="flex flex-col gap-2">
            <button className="btn btn-secondary btn-sm w-full" onClick={() => load("strong")} disabled={running}>Strong lead · AI quality analyst</button>
            <button className="btn btn-secondary btn-sm w-full" onClick={() => load("rejected")} disabled={running}>Rejected · founding AI engineer</button>
          </div>
        </div>
      </div>

      {(running || Object.keys(stages).length > 0) && (
        <div className="flex flex-wrap gap-2 mt-8" aria-live="polite">
          {STAGES.map((s) => <Chip key={s.id} label={s.label} state={stages[s.id]} />)}
          {elapsed != null && <span className="mono !text-[11px] text-muted self-center ml-2">{elapsed.toFixed(1)}s</span>}
        </div>
      )}

      {error && <p role="alert" className="mt-6 card card-pad text-[14px] text-ink">{error}</p>}

      {result && (
        <div ref={resultRef} className="mt-14 scroll-mt-24 fade-in">
          <p className="text-[18px] text-ink mb-8 max-w-[760px]">{verdict}</p>
          <div className="label mb-2">{result.company}</div>
          <h2 className="h-page mb-8">{result.title}</h2>
          <PostingReport data={result} />
        </div>
      )}
    </div>
  );
}
