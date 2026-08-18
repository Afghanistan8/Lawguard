import { useCallback, useEffect, useState } from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { Alert } from "../types";

/**
 * Alerts raised automatically by the contract when a result is low-confidence,
 * unavailable, conflicting, or lacks usable sources — the items a reviewing
 * lawyer should scrutinise first.
 */
export function AlertsPanel({ api }: { api: GenLayerApi }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!api.ready) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await api.read<{ items: Alert[] }>("get_alerts", [100]);
      setAlerts(res.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="panel">
      <div className="row-between">
        <h2>Review alerts {alerts.length ? <span className="faint">({alerts.length})</span> : null}</h2>
        <button className="small" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {err && <div className="error-box">⚠ {err}</div>}
      {alerts.length === 0 && !loading && (
        <p className="muted">No alerts. Grounded results with adequate confidence do not raise flags.</p>
      )}
      {alerts.map((a, i) => (
        <div className="list-item" key={`${a.analysis_id}-${i}`}>
          <div className="row" style={{ marginBottom: 0, gap: 8 }}>
            <span className="badge warn">Flagged</span>
            <span className="pill mono">analysis #{a.analysis_id}</span>
            <strong>{a.kind}</strong>
          </div>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {a.reason}
          </p>
        </div>
      ))}
    </div>
  );
}
