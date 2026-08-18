import { useCallback, useEffect, useState } from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { AnalysisResult } from "../types";
import { ResultCard } from "./ResultCard";

interface Listing {
  total?: number;
  count: number;
  items: AnalysisResult[];
}

/**
 * Browse, search, and inspect stored analyses. Every result is permanently
 * on-chain and fully auditable; this panel reads them back for review and
 * supports JSON export of the current view.
 */
export function AnalysesPanel({ api }: { api: GenLayerApi }) {
  const [items, setItems] = useState<AnalysisResult[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!api.ready) return;
    setLoading(true);
    setErr(null);
    try {
      const res = query.trim()
        ? await api.read<Listing>("search_analyses", [query.trim(), 100])
        : await api.read<Listing>("list_analyses", [100, 0]);
      setItems(res.items ?? []);
      setTotal(res.total ?? res.count ?? 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api, query]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.ready]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lawguard_analyses.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <div className="row-between">
        <h2>Analyses ledger {total ? <span className="faint">({total})</span> : null}</h2>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="small" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            className="small ghost"
            onClick={exportJson}
            disabled={items.length === 0}
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 10 }}>
        <input
          type="text"
          value={query}
          placeholder="Search citations, crimes, notes…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ maxWidth: 340 }}
        />
        <button className="small" onClick={load}>
          Search
        </button>
        {query && (
          <button
            className="small ghost"
            onClick={() => {
              setQuery("");
              setTimeout(load, 0);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {err && <div className="error-box">⚠ {err}</div>}

      {items.length === 0 && !loading && (
        <p className="muted">No analyses yet. Run a tool to create one.</p>
      )}

      {items.map((a) => (
        <div className="list-item" key={a.id}>
          <div className="row-between">
            <div className="row" style={{ gap: 8, marginBottom: 0 }}>
              <span className="pill mono">#{a.id}</span>
              <strong>{a.kind}</strong>
              <span className={`badge ${a.status === "VERIFIED" ? "ok" : a.status === "CONFLICT" || a.status === "UNAVAILABLE" ? "danger" : "warn"}`}>
                {a.status}
              </span>
              {a.citation && <span className="cite">{a.citation}</span>}
            </div>
            <button
              className="small ghost"
              onClick={() => setExpanded(expanded === a.id ? null : (a.id ?? null))}
            >
              {expanded === a.id ? "Hide" : "View"}
            </button>
          </div>
          {expanded === a.id && <ResultCard result={a} />}
        </div>
      ))}
    </div>
  );
}
