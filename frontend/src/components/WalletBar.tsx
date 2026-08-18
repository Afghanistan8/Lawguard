import { useState } from "react";
import type { WalletState, DiscoveredWallet } from "../useWallet";
import { shortAddress, switchNetwork } from "../lib/wallet";
import { NET } from "../config";

/**
 * Wallet controls in the header. Standard browser-wallet connection
 * (MetaMask / OKX / any EIP-1193 wallet) with a chooser when several are
 * installed, a wrong-network guard, and disconnect.
 */
export function WalletBar({ wallet }: { wallet: WalletState }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doConnect(detail?: DiscoveredWallet) {
    setErr(null);
    setBusy(true);
    const r = await wallet.connect(detail);
    if (!r.ok) setErr(r.error ?? "Connection failed");
    setBusy(false);
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

  if (!wallet.connected) {
    const wallets = wallet.discovered;
    return (
      <div className="wallet">
        {wallets.length > 1 ? (
          wallets.map((w) => (
            <button
              key={w.info.rdns ?? w.info.name}
              className="header-btn small"
              disabled={busy}
              onClick={() => doConnect(w)}
              title={`Connect ${w.info.name}`}
            >
              {w.info.icon && (
                <img
                  src={w.info.icon}
                  alt=""
                  width={14}
                  height={14}
                  style={{ verticalAlign: "-2px", marginRight: 6 }}
                />
              )}
              {w.info.name}
            </button>
          ))
        ) : (
          <button
            className="header-btn"
            disabled={busy}
            onClick={() => doConnect(wallets[0])}
          >
            {busy ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
        {err && <span className="pill" title={err}>{err.slice(0, 48)}</span>}
      </div>
    );
  }

  return (
    <div className="wallet">
      {!wallet.onChain && (
        <button
          className="header-btn small"
          onClick={doSwitch}
          disabled={busy}
          title={`Switch to ${NET.chainName}`}
        >
          ⚠ Switch to {NET.chainName}
        </button>
      )}
      <span className="pill">
        {wallet.onChain ? "Connected" : "Wrong network"}{" "}
        <span className="addr">{shortAddress(wallet.address)}</span>
      </span>
      <button
        className="header-btn small"
        title="Copy address"
        onClick={() => wallet.address && navigator.clipboard?.writeText(wallet.address)}
      >
        Copy
      </button>
      <button
        className="header-btn small ghost"
        onClick={wallet.disconnect}
        title="Disconnect wallet"
      >
        Disconnect
      </button>
    </div>
  );
}
