import { useCallback, useEffect, useState } from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { CaseRecord } from "../types";
import type { Jurisdiction } from "../config";
import { useTx } from "../tx/TxContext";
import { TxStatusView } from "./TxStatusView";

/**
 * Privacy-preserving case registry. Stores only minimal, lawyer-supplied
 * metadata (title, jurisdiction, matter type, internal reference) and links
 * on-chain analyses to a matter. No sensitive personal data is collected.
 */
export function CaseRegistryPanel({
  api,
  connected,
  jurisdictions,
}: {
  api: GenLayerApi;
  connected: boolean;
  jurisdictions: Jurisdiction[];
}) {
  const tx = useTx();
  const [title, setTitle] = useState("");
  const [country, setCountry] = useState(jurisdictions[0]?.code ?? "US");
  const [matterType, setMatterType] = useState("");
  const [reference, setReference] = useState("");
  const [linkCase, setLinkCase] = useState("");
  const [linkAnalysis, setLinkAnalysis] = useState("");

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const record = tx.get(activeId);
  const busy =
    record?.phase === "signing" ||
    record?.phase === "pending" ||
    record?.phase === "accepted";

  const load = useCallback(async () => {
    if (!api.ready) return;
    setLoading(true);
    try {
      const res = await api.read<{ items: CaseRecord[] }>("search_cases", [
        query.trim(),
        100,
      ]);
      setCases(res.items ?? []);
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

  async function register() {
    setErr(null);
    const { id, done } = tx.runRaw("Register case", (onStatus) =>
      api.write("register_case", [title, country, matterType, reference], onStatus)
    );
    setActiveId(id);
    try {
      await done;
      setTitle("");
      setMatterType("");
      setReference("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function link() {
    setErr(null);
    const { id, done } = tx.runRaw("Link analysis to case", (onStatus) =>
      api.write(
        "link_analysis_to_case",
        [Number(linkCase), Number(linkAnalysis)],
        onStatus
      )
    );
    setActiveId(id);
    try {
      await done;
      setLinkCase("");
      setLinkAnalysis("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="panel">
      <h2>Case registry</h2>
      <p className="desc">
        Minimal, access-controlled matter records. Only the creator of a case can
        modify it. Never store sensitive personal identifiers here.
      </p>

      <div className="grid cols-2">
        <div className="field">
          <label>Title *</label>
          <input
            type="text"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Acme Corp — regulatory review"
          />
        </div>
        <div className="field">
          <label>Jurisdiction</label>
          <select
            value={country}
            disabled={busy}
            onChange={(e) => setCountry(e.target.value)}
          >
            {jurisdictions.map((j) => (
              <option key={j.code} value={j.code}>
                {j.label} ({j.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Matter type</label>
          <input
            type="text"
            value={matterType}
            disabled={busy}
            onChange={(e) => setMatterType(e.target.value)}
            placeholder="criminal / civil / regulatory"
          />
        </div>
        <div className="field">
          <label>Internal reference</label>
          <input
            type="text"
            value={reference}
            disabled={busy}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. MAT-2026-0142"
          />
        </div>
      </div>
      <button
        className="primary"
        onClick={register}
        disabled={!connected || !api.ready || busy || !title.trim()}
        title={!connected ? "Connect a wallet first" : undefined}
      >
        {busy ? "Working…" : "Register case"}
      </button>

      <hr className="sep" />

      <h2 style={{ fontSize: 16 }}>Link analysis to case</h2>
      <div className="toolbar">
        <input
          type="text"
          value={linkCase}
          placeholder="case id"
          disabled={busy}
          onChange={(e) => setLinkCase(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <input
          type="text"
          value={linkAnalysis}
          placeholder="analysis id"
          disabled={busy}
          onChange={(e) => setLinkAnalysis(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <button
          className="small"
          onClick={link}
          disabled={!connected || !api.ready || busy || !linkCase || !linkAnalysis}
        >
          Link
        </button>
      </div>

      <TxStatusView record={record} />
      {err && <div className="error-box">⚠ {err}</div>}

      <hr className="sep" />

      <div className="toolbar">
        <input
          type="text"
          value={query}
          placeholder="Search cases…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ maxWidth: 280 }}
        />
        <button className="small" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Search"}
        </button>
      </div>

      {loading && cases.length === 0 ? (
        <div className="skeleton-list">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : cases.length === 0 ? (
        <p className="muted">No cases registered yet.</p>
      ) : (
        cases.map((c) => (
          <div className="list-item" key={c.id}>
            <div className="row-between">
              <div className="row" style={{ marginBottom: 0, gap: 8 }}>
                <span className="pill mono">#{c.id}</span>
                <strong>{c.title}</strong>
                <span className="badge info">{c.country}</span>
                {c.matter_type && <span className="faint">{c.matter_type}</span>}
              </div>
              {c.reference && <span className="mono faint">{c.reference}</span>}
            </div>
            {c.linked_analyses?.length > 0 && (
              <p className="faint" style={{ margin: "8px 0 0", fontSize: 12 }}>
                Linked analyses: {c.linked_analyses.map((n) => `#${n}`).join(", ")}
              </p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
