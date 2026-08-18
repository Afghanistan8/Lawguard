import { useCallback, useEffect, useState } from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { CaseRecord, TxStatus } from "../types";
import { JURISDICTIONS } from "../config";
import { TxStatusView } from "./TxStatusView";

/**
 * Privacy-preserving case registry. Stores only minimal, lawyer-supplied
 * metadata (title, jurisdiction, matter type, internal reference) and links
 * on-chain analyses to a matter. No sensitive personal data is collected.
 */
export function CaseRegistryPanel({
  api,
  connected,
}: {
  api: GenLayerApi;
  connected: boolean;
}) {
  const [title, setTitle] = useState("");
  const [country, setCountry] = useState(JURISDICTIONS[0].code);
  const [matterType, setMatterType] = useState("");
  const [reference, setReference] = useState("");
  const [linkCase, setLinkCase] = useState("");
  const [linkAnalysis, setLinkAnalysis] = useState("");

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [tx, setTx] = useState<TxStatus>({ phase: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!api.ready) return;
    try {
      const res = await api.read<{ items: CaseRecord[] }>("search_cases", [
        query.trim(),
        100,
      ]);
      setCases(res.items ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [api, query]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.ready]);

  async function register() {
    setErr(null);
    setBusy(true);
    try {
      await api.write("register_case", [title, country, matterType, reference], setTx);
      setTitle("");
      setMatterType("");
      setReference("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function link() {
    setErr(null);
    setBusy(true);
    try {
      await api.write(
        "link_analysis_to_case",
        [Number(linkCase), Number(linkAnalysis)],
        setTx
      );
      setLinkCase("");
      setLinkAnalysis("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Acme Corp — regulatory review"
          />
        </div>
        <div className="field">
          <label>Jurisdiction</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {JURISDICTIONS.map((j) => (
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
            onChange={(e) => setMatterType(e.target.value)}
            placeholder="criminal / civil / regulatory"
          />
        </div>
        <div className="field">
          <label>Internal reference</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. MAT-2026-0142"
          />
        </div>
      </div>
      <button
        className="primary"
        onClick={register}
        disabled={!connected || !api.ready || busy || !title.trim()}
      >
        Register case
      </button>

      <hr className="sep" />

      <h2 style={{ fontSize: 16 }}>Link analysis to case</h2>
      <div className="toolbar">
        <input
          type="text"
          value={linkCase}
          placeholder="case id"
          onChange={(e) => setLinkCase(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <input
          type="text"
          value={linkAnalysis}
          placeholder="analysis id"
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

      <TxStatusView status={tx} />
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
        <button className="small" onClick={load}>
          Search
        </button>
      </div>

      {cases.length === 0 ? (
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
