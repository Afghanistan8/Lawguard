import { useState } from "react";
import type { WalletState } from "../useWallet";

/**
 * Wallet controls shown in the header. Manages the demo burner account:
 * connect (generate), import a testnet key, copy/export, and disconnect.
 */
export function WalletBar({ wallet }: { wallet: WalletState }) {
  const [showImport, setShowImport] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  if (!wallet.connected) {
    return (
      <div className="wallet">
        {showImport ? (
          <>
            <input
              type="text"
              value={keyInput}
              placeholder="0x… 64-hex testnet key"
              onChange={(e) => setKeyInput(e.target.value)}
              style={{ width: 240 }}
            />
            <button
              className="header-btn small"
              onClick={() => {
                const r = wallet.importKey(keyInput);
                if (!r.ok) setErr(r.error ?? "Invalid key");
                else setErr(null);
              }}
            >
              Import
            </button>
            <button
              className="header-btn small ghost"
              onClick={() => setShowImport(false)}
            >
              Cancel
            </button>
            {err && <span className="pill">{err}</span>}
          </>
        ) : (
          <>
            <button className="header-btn" onClick={wallet.connect}>
              Connect demo wallet
            </button>
            <button
              className="header-btn small"
              onClick={() => setShowImport(true)}
            >
              Import key
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="wallet">
      <span className="pill">
        Connected <span className="addr">{short(wallet.address!)}</span>
      </span>
      <button
        className="header-btn small"
        title="Copy address"
        onClick={() => navigator.clipboard?.writeText(wallet.address!)}
      >
        Copy
      </button>
      <button
        className="header-btn small ghost"
        onClick={wallet.disconnect}
        title="Forget this burner account"
      >
        Disconnect
      </button>
    </div>
  );
}
