import { useState } from "react";
import type { WalletState } from "../useWallet";
import { switchNetwork } from "../lib/wallet";
import { NET } from "../config";

/**
 * Visible guard shown whenever a connected browser wallet is on the wrong
 * chain. Lawguard targets GenLayer StudioNet ONLY — writes are blocked (see
 * `useGenLayer`'s `canWrite`) until the wallet is switched, and this banner
 * makes that explicit instead of leaving it to a deep error during signing.
 * Burner-wallet mode never shows this (it signs locally, always on StudioNet).
 */
export function NetworkGuard({ wallet }: { wallet: WalletState }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!wallet.connected || wallet.mode !== "external" || wallet.onChain) {
    return null;
  }

  async function doSwitch() {
    setErr(null);
    setBusy(true);
    try {
      await switchNetwork();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Switch failed");
    }
    setBusy(false);
  }

  return (
    <div className="callout danger" style={{ marginTop: 0, marginBottom: 14 }}>
      <strong>⚠ Wrong network.</strong> Your wallet is not on{" "}
      <b>{NET.chainName}</b> (chain {NET.chainIdDecimal}) — Lawguard only runs on
      StudioNet, so this action is disabled until you switch.{" "}
      <button className="small" onClick={doSwitch} disabled={busy} style={{ marginLeft: 6 }}>
        {busy ? "Switching…" : "Switch to StudioNet"}
      </button>
      {err && <div style={{ marginTop: 6 }}>{err}</div>}
    </div>
  );
}
