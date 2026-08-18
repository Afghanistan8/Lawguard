import type { WalletState } from "../useWallet";
import { NETWORK_KEY } from "../config";
import { WalletBar } from "./WalletBar";

/** Application header: brand, network indicator, theme toggle, wallet. */
export function Header({
  wallet,
  theme,
  onToggleTheme,
}: {
  wallet: WalletState;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">
          <svg
            className="logo-mark"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M24 4l16 6v10c0 10-6.8 18.4-16 22-9.2-3.6-16-12-16-22V10l16-6z"
              fill="#b48a3c"
              opacity="0.18"
            />
            <path
              d="M24 4l16 6v10c0 10-6.8 18.4-16 22-9.2-3.6-16-12-16-22V10l16-6z"
              stroke="#b48a3c"
              strokeWidth="2"
            />
            <path
              d="M24 13v18M16 20h16M18 20l-3 6a3 3 0 006 0l-3-6zM30 20l-3 6a3 3 0 006 0l-3-6z"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <h1>Lawguard</h1>
            <p className="tag">
              On-chain, source-grounded law verification for legal teams
            </p>
          </div>
        </div>

        <div className="header-spacer" />

        <span className="pill" title="Target GenLayer network">
          {NETWORK_KEY}
        </span>
        <button
          className="header-btn small"
          onClick={onToggleTheme}
          title="Toggle light/dark"
        >
          {theme === "dark" ? "☀︎" : "☾"}
        </button>
        <WalletBar wallet={wallet} />
      </div>
    </header>
  );
}
