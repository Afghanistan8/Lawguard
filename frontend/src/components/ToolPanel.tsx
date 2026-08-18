import { useMemo, useState } from "react";
import type { ToolDef } from "../tools";
import type { GenLayerApi } from "../useGenLayer";
import type { SampleScenario } from "../types";
import type { Jurisdiction } from "../config";
import { useTx } from "../tx/TxContext";
import { TxStatusView } from "./TxStatusView";
import { ResultCard } from "./ResultCard";

/**
 * Config-driven panel for a single Lawguard AI tool. Renders the form, submits
 * the write through the app-level transaction manager (so it survives tab
 * switches), and displays the consensus-backed result once accepted on-chain.
 */
export function ToolPanel({
  tool,
  api,
  connected,
  samples,
  jurisdictions,
}: {
  tool: ToolDef;
  api: GenLayerApi;
  connected: boolean;
  samples: SampleScenario[];
  jurisdictions: Jurisdiction[];
}) {
  const tx = useTx();
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const f of tool.fields) {
      v[f.name] = f.type === "country" ? jurisdictions[0]?.code ?? "US" : "";
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, jurisdictions.length]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);

  const record = tx.get(activeId);
  const running =
    record?.phase === "signing" ||
    record?.phase === "pending" ||
    record?.phase === "accepted";
  const result = record?.result ?? null;
  const error = record?.error ?? null;

  const set = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const mySamples = samples.filter((s) => s.tool === tool.key);

  const missingRequired = tool.fields
    .filter((f) => f.required)
    .some((f) => !values[f.name] || values[f.name].trim() === "");

  function submit() {
    const args = tool.buildArgs(values);
    const id = tx.run(api, tool, args);
    setActiveId(id);
  }

  const disabledReason = !connected
    ? "Connect a wallet first (top-right)"
    : !api.hasContract
    ? "Set a deployed contract address"
    : undefined;

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
              disabled={running}
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
              disabled={running}
              onChange={(e) => set(f.name, e.target.value)}
            >
              {jurisdictions.map((j) => (
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
              disabled={running}
              onChange={(e) => set(f.name, e.target.value)}
            />
          ) : (
            <input
              id={`${tool.key}-${f.name}`}
              type="text"
              value={values[f.name]}
              placeholder={f.placeholder}
              disabled={running}
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
          disabled={!!disabledReason || running || missingRequired}
          title={disabledReason}
        >
          {running ? "Running under consensus…" : `Run ${tool.title}`}
        </button>
        <button
          className="ghost small"
          onClick={() => {
            setValues(initial);
            setActiveId(null);
          }}
          disabled={running}
        >
          Reset
        </button>
        {running && (
          <span className="faint" style={{ fontSize: 12 }}>
            You can switch tabs — this keeps running (see the tracker below).
          </span>
        )}
      </div>

      <TxStatusView record={record} />
      {error && <div className="error-box">⚠ {error}</div>}
      {result && <ResultCard result={result} />}
    </div>
  );
}
