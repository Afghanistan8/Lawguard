import { useState } from "react";
import type { WalletState, DiscoveredWallet } from "../useWallet";
import { shortAddress, switchNetwork } from "../lib/wallet";
import { CHAIN_HELP, NET } from "../config";

/**
 * Wallet controls: connect an injected browser wallet (MetaMask / OKX / any
 * EIP-6963 wallet) OR spin up an instant burner wallet for testing without an
 * extension. Includes a wrong-network guard and manual chain-add instructions.
 */
export function WalletBar({ wallet }: { wallet: WalletState }) {
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function withBusy(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Failed");
    else {
      setOpen(false);
      setKeyInput("");
    }
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

  // ---- Connected ----
  if (wallet.connected) {
    const isBurner = wallet.mode === "local";
    return (
      <div className="wallet">
        {!isBurner && !wallet.onChain && (
          <button
            className="header-btn small"
            onClick={doSwitch}
            disabled={busy}
            title={`Switch to ${NET.chainName}`}
          >
            ⚠ Switch network
          </button>
        )}
        <span className="pill" title={wallet.address ?? ""}>
          {isBurner ? "Burner" : wallet.onChain ? "Connected" : "Wrong network"}{" "}
          <span className="addr">{shortAddress(wallet.address)}</span>
        </span>
        {isBurner && (
          <button
            className="header-btn small"
            title="Copy the burner private key (testnet only) so you can reuse it"
            onClick={() => {
              const k = wallet.exportKey();
              if (k) navigator.clipboard?.writeText(k);
            }}
          >
            Export key
          </button>
        )}
        <button
          className="header-btn small ghost"
          onClick={wallet.disconnect}
          title="Disconnect"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // ---- Not connected ----
  return (
    <div className="wallet" style={{ position: "relative" }}>
      <button
        className="header-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
      >
        {busy ? "Connecting…" : "Connect Wallet ▾"}
      </button>

      {open && (
        <div className="wallet-menu">
          <div className="wm-section-title">Browser wallet</div>
          {wallet.discovered.length > 0 ? (
            wallet.discovered.map((w: DiscoveredWallet) => (
              <button
                key={w.info.rdns ?? w.info.name}
                className="wm-item"
                disabled={busy}
                onClick={() => withBusy(() => wallet.connectExternal(w))}
              >
                {w.info.icon && (
                  <img src={w.info.icon} alt="" width={16} height={16} />
                )}
                {w.info.name}
              </button>
            ))
          ) : (
            <button
              className="wm-item"
              disabled={busy}
              onClick={() => withBusy(() => wallet.connectExternal())}
            >
              MetaMask / OKX / injected
            </button>
          )}
          <div className="wm-note">
            You'll be asked to add & switch to {NET.chainName} (chain{" "}
            {CHAIN_HELP.chainIdDecimal}).{" "}
            <button className="linklike" onClick={() => setShowHelp((s) => !s)}>
              {showHelp ? "hide" : "how?"}
            </button>
          </div>
          {showHelp && (
            <div className="wm-help">
              <div>
                <b>Network name:</b> {CHAIN_HELP.name}
              </div>
              <div>
                <b>Chain ID:</b> {CHAIN_HELP.chainIdDecimal} ({CHAIN_HELP.chainIdHex})
              </div>
              <div className="mono" style={{ wordBreak: "break-all" }}>
                <b>RPC:</b> {CHAIN_HELP.rpc}
              </div>
              <div>
                <b>Currency:</b> {CHAIN_HELP.currency}
              </div>
              <button
                className="small ghost"
                onClick={() =>
                  navigator.clipboard?.writeText(
                    `${CHAIN_HELP.name} | Chain ID ${CHAIN_HELP.chainIdDecimal} | RPC ${CHAIN_HELP.rpc} | ${CHAIN_HELP.currency}`
                  )
                }
              >
                Copy details
              </button>
            </div>
          )}

          <div className="wm-divider" />

          <div className="wm-section-title">Instant — no extension</div>
          <button
            className="wm-item"
            disabled={busy}
            onClick={() => withBusy(() => wallet.connectBurner())}
          >
            🔥 Create burner wallet
          </button>
          <div className="wm-note">
            A throwaway key, generated in your browser and auto-funded on
            StudioNet. Testnet only — never for real funds.
          </div>

          <div className="wm-divider" />

          <div className="wm-section-title">Import a testnet key</div>
          <div className="wm-import">
            <input
              type="text"
              value={keyInput}
              placeholder="0x… 64-hex private key"
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button
              className="small"
              disabled={busy || !keyInput.trim()}
              onClick={() => withBusy(() => wallet.importKey(keyInput))}
            >
              Import
            </button>
          </div>

          {err && <div className="wm-err">{err}</div>}
        </div>
      )}
      {err && !open && <span className="pill">{err.slice(0, 40)}</span>}
    </div>
  );
}
