import { useCallback, useEffect, useState } from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { TrustedSources, TxStatus } from "../types";
import { JURISDICTIONS } from "../config";
import { TxStatusView } from "./TxStatusView";

/**
 * View the country-aware registry of trusted primary/official law sources, and
 * (owner only) add or remove HTTPS sources. The contract enforces HTTPS-only
 * and owner access control; the UI mirrors those constraints.
 */
export function TrustedSourcesPanel({
  api,
  connected,
}: {
  api: GenLayerApi;
  connected: boolean;
}) {
  const [sources, setSources] = useState<TrustedSources>({});
  const [country, setCountry] = useState(JURISDICTIONS[0].code);
  const [url, setUrl] = useState("");
  const [tx, setTx] = useState<TxStatus>({ phase: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!api.ready) return;
    try {
      setSources(await api.read<TrustedSources>("get_trusted_sources"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const isHttps = /^https:\/\/\S+$/.test(url.trim());

  async function mutate(fn: "add_trusted_source" | "remove_trusted_source", c: string, u: string) {
    setErr(null);
    setBusy(true);
    try {
      await api.write(fn, [c, u], setTx);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Trusted primary sources</h2>
      <p className="desc">
        Every AI analysis is grounded in these official sources. Caller-supplied
        URLs are only honoured when they fall under one of these trusted origins.
        Adding/removing sources is owner-restricted and HTTPS-only.
      </p>

      <div className="notice" style={{ marginBottom: 14 }}>
        The contract rejects non-HTTPS URLs and non-owner mutations. If your
        connected account is not the deployer, admin writes will return an error.
      </div>

      <div className="toolbar">
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          {JURISDICTIONS.map((j) => (
            <option key={j.code} value={j.code}>
              {j.label} ({j.code})
            </option>
          ))}
        </select>
        <input
          type="text"
          value={url}
          placeholder="https://official.gov/…"
          onChange={(e) => setUrl(e.target.value)}
          style={{ minWidth: 260, flex: 1 }}
        />
        <button
          className="primary small"
          onClick={() => mutate("add_trusted_source", country, url.trim())}
          disabled={!connected || !api.ready || busy || !isHttps}
        >
          Add
        </button>
      </div>

      <TxStatusView status={tx} />
      {err && <div className="error-box">⚠ {err}</div>}

      <hr className="sep" />

      {Object.keys(sources).length === 0 ? (
        <p className="muted">No sources loaded.</p>
      ) : (
        Object.entries(sources)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([c, urls]) => (
            <div className="list-item" key={c}>
              <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                <span className="badge info">{c}</span>
                <span className="faint">{urls.length} source(s)</span>
              </div>
              <ul className="sources" style={{ margin: 0, paddingLeft: 18 }}>
                {urls.map((u) => (
                  <li key={u} className="row-between" style={{ marginBottom: 4 }}>
                    <a href={u} target="_blank" rel="noreferrer noopener">
                      {u}
                    </a>
                    <button
                      className="small ghost"
                      onClick={() => mutate("remove_trusted_source", c, u)}
                      disabled={!connected || !api.ready || busy}
                      title="Owner only"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
      )}
    </div>
  );
}
