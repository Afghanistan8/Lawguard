import { useEffect, useState } from "react";
import type { TxRecord } from "../tx/TxContext";
import { PHASE_META } from "../tx/TxContext";
import { EXPLORERS, explorerTxUrl } from "../config";

const PROGRESS: Record<string, number> = {
  signing: 12,
  pending: 40,
  accepted: 82,
  finalized: 100,
  error: 100,
};

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

/** Live elapsed timer that ticks while the tx is in flight. */
function useElapsed(startedAt: number, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return (running ? now : startedAt) - startedAt;
}

/** Explorer links for a tx hash (active network first). */
export function ExplorerLinks({ hash }: { hash: string }) {
  return (
    <span className="explorer-links">
      {EXPLORERS.map((e) => (
        <a
          key={e.key}
          href={explorerTxUrl(e.base, hash)}
          target="_blank"
          rel="noreferrer noopener"
          className="explorer-link"
          title={`View tx on ${e.label} explorer`}
        >
          {e.label} ↗
        </a>
      ))}
    </span>
  );
}

/**
 * Inline transaction status: progressive phase, live elapsed timer, a
 * non-blocking progress bar, contextual guidance, and explorer links as soon as
 * the hash exists.
 */
export function TxStatusView({ record }: { record?: TxRecord }) {
  const running =
    !!record &&
    (record.phase === "signing" ||
      record.phase === "pending" ||
      record.phase === "accepted");
  const elapsed = useElapsed(record?.startedAt ?? Date.now(), running);
  if (!record || record.phase === "idle") return null;

  const meta = PHASE_META[record.phase];
  const busy = record.phase === "signing" || record.phase === "pending";
  const pct = PROGRESS[record.phase] ?? 0;

  return (
    <div className={`tx ${meta.cls}`} role="status" aria-live="polite">
      <div className="tx-head">
        {busy ? <span className="spinner" /> : <span className="dot" />}
        <strong>{meta.label}</strong>
        {record.phase !== "error" && (
          <span className="mono faint">· {formatElapsed(elapsed)}</span>
        )}
        {record.hash && (
          <span style={{ marginLeft: "auto" }}>
            <ExplorerLinks hash={record.hash} />
          </span>
        )}
      </div>

      {record.phase !== "error" && (
        <div className="tx-progress" aria-hidden="true">
          <span
            className={busy ? "indeterminate" : ""}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="tx-msg muted">
        {record.phase === "error"
          ? record.error
          : record.message || meta.hint}
      </div>
      {record.phase === "accepted" && meta.hint && (
        <div className="tx-hint faint">{meta.hint}</div>
      )}
    </div>
  );
}
