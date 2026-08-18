import { useMemo, useState } from "react";
import type { ToolDef } from "../tools";
import type { GenLayerApi } from "../useGenLayer";
import type { AnalysisResult, SampleScenario, TxStatus } from "../types";
import { JURISDICTIONS } from "../config";
import { TxStatusView } from "./TxStatusView";
import { ResultCard } from "./ResultCard";

/**
 * Generic, config-driven panel for a single Lawguard AI tool. It renders the
 * tool's form fields, validates required inputs, submits the corresponding
 * on-chain write, tracks the transaction lifecycle, and displays the parsed,
 * consensus-backed result.
 */
export function ToolPanel({
  tool,
  api,
  connected,
  samples,
}: {
  tool: ToolDef;
  api: GenLayerApi;
  connected: boolean;
  samples: SampleScenario[];
}) {
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const f of tool.fields) {
      v[f.name] = f.type === "country" ? JURISDICTIONS[0].code : "";
    }
    return v;
  }, [tool]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [tx, setTx] = useState<TxStatus>({ phase: "idle" });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const mySamples = samples.filter((s) => s.tool === tool.key);

  const missingRequired = tool.fields
    .filter((f) => f.required)
    .some((f) => !values[f.name] || values[f.name].trim() === "");

  async function submit() {
    setError(null);
    setResult(null);
    setBusy(true);
    setTx({ phase: "signing" });
    try {
      const args = tool.buildArgs(values);
      // Submit the write and wait for FINALIZED consensus.
      await api.write(tool.fn, args, setTx);
      // A GenLayer write commits its result to on-chain state. Every tool run
      // stores exactly one analysis (fail-safe results included), so the newest
      // ledger entry is the one this call just produced. Read it back.
      const listing = await api.read<{ items: AnalysisResult[] }>(
        "list_analyses",
        [1, 0]
      );
      const latest = listing.items?.[0];
      if (latest) {
        setResult(latest);
      } else {
        setError("Transaction finalized but no analysis was found in the ledger.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row-between">
        <div>
          <h2>{tool.title}</h2>
          <p className="desc">{tool.description}</p>
        </div>
      </div>

      {mySamples.length > 0 && (
        <div className="toolbar">
          <span className="faint" style={{ fontSize: 12 }}>
            Load sample:
          </span>
          {mySamples.map((s) => (
            <button
              key={s.label}
              className="small ghost"
              onClick={() =>
                setValues((prev) => ({ ...prev, ...initial, ...s.fields }))
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {tool.fields.map((f) => (
        <div className="field" key={f.name}>
          <label htmlFor={`${tool.key}-${f.name}`}>
            {f.label}
            {f.required && <span style={{ color: "var(--danger)" }}> *</span>}
          </label>
          {f.type === "country" ? (
            <select
              id={`${tool.key}-${f.name}`}
              value={values[f.name]}
              onChange={(e) => set(f.name, e.target.value)}
            >
              {JURISDICTIONS.map((j) => (
                <option key={j.code} value={j.code}>
                  {j.label} ({j.code})
                </option>
              ))}
            </select>
          ) : f.type === "textarea" || f.type === "urls" ? (
            <textarea
              id={`${tool.key}-${f.name}`}
              value={values[f.name]}
              placeholder={f.placeholder}
              onChange={(e) => set(f.name, e.target.value)}
            />
          ) : (
            <input
              id={`${tool.key}-${f.name}`}
              type="text"
              value={values[f.name]}
              placeholder={f.placeholder}
              onChange={(e) => set(f.name, e.target.value)}
            />
          )}
          {f.help && <span className="help">{f.help}</span>}
        </div>
      ))}

      <div className="toolbar" style={{ marginTop: 4 }}>
        <button
          className="primary"
          onClick={submit}
          disabled={!connected || !api.ready || busy || missingRequired}
          title={
            !connected
              ? "Connect a wallet first"
              : !api.ready
              ? "Set a deployed contract address"
              : undefined
          }
        >
          {busy ? "Running under consensus…" : `Run ${tool.title}`}
        </button>
        <button
          className="ghost small"
          onClick={() => {
            setValues(initial);
            setResult(null);
            setError(null);
            setTx({ phase: "idle" });
          }}
          disabled={busy}
        >
          Reset
        </button>
      </div>

      <TxStatusView status={tx} />
      {error && <div className="error-box">⚠ {error}</div>}
      {result && <ResultCard result={result} />}
    </div>
  );
}
