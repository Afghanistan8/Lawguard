import type { TxStatus } from "../types";

const LABELS: Record<string, string> = {
  signing: "Signing",
  pending: "Pending",
  accepted: "Accepted",
  finalized: "Finalized",
  error: "Error",
};

/** Compact transaction lifecycle indicator. */
export function TxStatusView({ status }: { status: TxStatus }) {
  if (status.phase === "idle") return null;
  const busy = status.phase === "signing" || status.phase === "pending";
  return (
    <div className={`tx ${status.phase}`}>
      {busy ? <span className="spinner" /> : <span className="dot" />}
      <strong>{LABELS[status.phase] ?? status.phase}</strong>
      <span className="muted">{status.message}</span>
      {status.hash && (
        <span className="mono faint" style={{ marginLeft: "auto" }}>
          {status.hash.slice(0, 10)}…
        </span>
      )}
    </div>
  );
}
