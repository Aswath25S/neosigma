"use client";

import { useEffect, useState } from "react";

interface Status { running: boolean; step?: string; startedAt?: string; finishedAt?: string; ok?: boolean; error?: string }

// Starts `npm run all` on the server and polls until it finishes.
export function RefreshButton() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(async () => {
      const res = await fetch("/api/refresh");
      const s = (await res.json()) as Status;
      setStatus(s);
      if (!s.running) {
        clearInterval(t);
        if (s.ok) window.location.reload();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [status?.running]);

  async function start() {
    setError(null);
    const res = await fetch("/api/refresh", { method: "POST" });
    const s = await res.json();
    if (!res.ok) setError(s.error ?? "Could not start a refresh.");
    else setStatus(s);
  }

  return (
    <span className="relative inline-flex">
      <button className="btn btn-primary btn-sm" onClick={start} disabled={!!status?.running} title={error ?? status?.error ?? undefined}>
        {status?.running ? (
          <>
            <span className="pulse inline-block w-1.5 h-1.5 rounded-full bg-black" aria-hidden="true" />
            {status.step ?? "Refreshing"}
          </>
        ) : (
          "Refresh data"
        )}
      </button>
      {(error || (status && !status.running && status.ok === false)) && (
        <span role="status" className="absolute right-0 top-11 w-64 rounded-[10px] border border-line bg-surface p-3 text-xs text-body">
          {error ?? status?.error ?? "Refresh failed. See data/pipeline.log."}
        </span>
      )}
    </span>
  );
}
