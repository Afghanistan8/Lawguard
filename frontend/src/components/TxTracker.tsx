import { useEffect, useState } from "react";
import { useTx, PHASE_META } from "../tx/TxContext";
import { ExplorerLinks, formatElapsed } from "./TxStatusView";

const BADGE_CLS: Record<string, string> = {
  signing: "warn",
  pending: "warn",
  accepted: "info",
  finalized: "ok",
  error: "danger",
};

/**
 * Global, always-visible transaction tracker. Because transactions live in
 * TxContext (not in any panel), they keep running and stay visible here while
 * the user switches tabs — the fix for "the app feels frozen during consensus".
 */
export function TxTracker() {
  const { records, dismiss, clearFinished } = useTx();
  const anyRunning = records.some(
    (r) => r.phase === "signing" || r.phase === "pending" || r.phase === "accepted"
  );

  // Tick once a second while anything is in flight so elapsed timers update.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  if (records.length === 0) return null;

  return (
    <div className="tx-tracker" role="region" aria-label="Transaction activity">
      <div className="tx-tracker-head">
        <strong>Transactions</strong>
        {anyRunning && <span className="spinner" />}
        <span className="faint" style={{ fontSize: 12 }}>
          {records.length} recent
        </span>
        <button
          className="small ghost"
          style={{ marginLeft: "auto" }}
          onClick={clearFinished}
        >
          Clear finished
        </button>
      </div>
      <div className="tx-tracker-list">
        {records.map((r) => {
          const meta = PHASE_META[r.phase];
          const running =
            r.phase === "signing" || r.phase === "pending" || r.phase === "accepted";
          const elapsed = (r.endedAt ?? Date.now()) - r.startedAt;
          return (
            <div className="tx-row" key={r.id}>
              <span className={`badge ${BADGE_CLS[r.phase] ?? "info"}`}>
                {meta.label}
              </span>
              <span className="tx-row-title">{r.toolTitle}</span>
              {running && (
                <span className="mono faint">{formatElapsed(elapsed)}</span>
              )}
              {typeof r.analysisId === "number" && (
                <span className="pill mono" title="On-chain analysis id">
                  #{r.analysisId}
                </span>
              )}
              {r.hash && <ExplorerLinks hash={r.hash} />}
              {r.error && (
                <span className="faint" style={{ color: "var(--danger)", fontSize: 12 }}>
                  {r.error.slice(0, 80)}
                </span>
              )}
              <button
                className="tx-dismiss"
                title="Dismiss"
                onClick={() => dismiss(r.id)}
                disabled={running}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
