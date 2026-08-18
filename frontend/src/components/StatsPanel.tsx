import { useCallback, useEffect, useState } from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { Stats } from "../types";

const CELLS: { key: keyof Stats; label: string }[] = [
  { key: "total_analyses", label: "Analyses" },
  { key: "verified", label: "Verified" },
  { key: "conflicts", label: "Conflicts" },
  { key: "unavailable", label: "Unavailable" },
  { key: "low_confidence", label: "Low confidence" },
  { key: "alerts", label: "Alerts" },
  { key: "cases", label: "Cases" },
];

/** Read-only dashboard of aggregate on-chain statistics. */
export function StatsPanel({ api }: { api: GenLayerApi }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!api.ready) return;
    setLoading(true);
    setErr(null);
    try {
      setStats(await api.read<Stats>("get_stats"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="panel">
      <div className="row-between">
        <h2>On-chain statistics</h2>
        <button className="small" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {err && <div className="error-box">⚠ {err}</div>}
      <div className="grid cols-4" style={{ marginTop: 12 }}>
        {CELLS.map((c) => (
          <div className="stat" key={c.key}>
            <div className="n">{stats ? stats[c.key] : "—"}</div>
            <div className="k">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
