import { useCallback, useEffect, useState } from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { WalletState } from "../useWallet";
import type { TrustedSources } from "../types";
import type { Jurisdiction } from "../config";
import { JURISDICTION_LABELS } from "../config";
import { useTx } from "../tx/TxContext";
import { TxStatusView } from "./TxStatusView";
import { NetworkGuard } from "./NetworkGuard";

/**
 * View the country-aware registry of trusted primary/official law sources, and
 * (owner only) add or remove HTTPS sources. The contract enforces HTTPS-only
 * and owner access control; the UI mirrors those constraints.
 */
export function TrustedSourcesPanel({
  api,
  wallet,
  jurisdictions,
}: {
  api: GenLayerApi;
  wallet: WalletState;
  jurisdictions: Jurisdiction[];
}) {
  const tx = useTx();
  const [sources, setSources] = useState<TrustedSources>({});
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState(jurisdictions[0]?.code ?? "US");
  const [url, setUrl] = useState("");
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
      setSources(await api.read<TrustedSources>("get_trusted_sources"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const isHttps = /^https:\/\/\S+$/.test(url.trim());
  const validCountry = /^[A-Z]{2,4}$/.test(country.trim());

  async function mutate(
    fn: "add_trusted_source" | "remove_trusted_source",
    c: string,
    u: string
  ) {
    setErr(null);
    const label = fn === "add_trusted_source" ? "Add trusted source" : "Remove source";
    const { id, done } = tx.runRaw(label, (onStatus) => api.write(fn, [c, u], onStatus));
    setActiveId(id);
    try {
      await done;
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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
        The jurisdiction list is read live from this registry.
      </div>

      <NetworkGuard wallet={wallet} />

      <div className="toolbar">
        <input
          type="text"
          list="jurisdiction-codes"
          value={country}
          disabled={busy}
          onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="Country code (e.g. US)"
          style={{ maxWidth: 160 }}
        />
        <datalist id="jurisdiction-codes">
          {jurisdictions.map((j) => (
            <option key={j.code} value={j.code}>
              {JURISDICTION_LABELS[j.code] ?? j.code}
            </option>
          ))}
        </datalist>
        <input
          type="text"
          value={url}
          placeholder="https://official.gov/…"
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          style={{ minWidth: 260, flex: 1 }}
        />
        <button
          className="primary small"
          onClick={() => mutate("add_trusted_source", country.trim(), url.trim())}
          disabled={!api.canWrite || busy || !isHttps || !validCountry}
          title={!wallet.connected ? "Connect a wallet first" : undefined}
        >
          {busy ? "Working…" : "Add"}
        </button>
      </div>

      <TxStatusView record={record} />
      {err && <div className="error-box">⚠ {err}</div>}

      <hr className="sep" />

      {loading && Object.keys(sources).length === 0 ? (
        <div className="skeleton-list">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : Object.keys(sources).length === 0 ? (
        <p className="muted">No sources loaded.</p>
      ) : (
        Object.entries(sources)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([c, urls]) => (
            <div className="list-item" key={c}>
              <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                <span className="badge info">{c}</span>
                <span className="faint">
                  {JURISDICTION_LABELS[c] ? `${JURISDICTION_LABELS[c]} · ` : ""}
                  {urls.length} source(s)
                </span>
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
                      disabled={!api.canWrite || busy}
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
