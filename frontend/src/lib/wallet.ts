/* src/lib/wallet.ts
 *
 * Wallet integration (works with MetaMask, OKX, or anything that injects an EVM
 * provider). Ported from the proven EIP-6963 setup used in epl27-predict:
 *   - discover wallets (EIP-6963) with a legacy injected fallback
 *   - connect / disconnect
 *   - detect & switch/add the GenLayer chain (from config NET)
 *   - emit address / chain change events
 *   - persist last connected wallet for silent reconnect on reload
 *
 * GenLayer transactions are ordinary EVM transactions to the consensus
 * contract, so a standard injected wallet signs them once it is on the
 * GenLayer chain — no snap required.
 */
import { NET } from "../config";

/* ---------- EIP-6963 provider discovery ---------- */

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
}

export interface WalletInfo {
  name: string;
  icon?: string;
  rdns?: string;
}

export interface DiscoveredWallet {
  info: WalletInfo;
  provider: Eip1193Provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    okxwallet?: Eip1193Provider;
  }
}

// Wallets announce themselves per EIP-6963. Collect them (deduped by rdns) so
// the user can pick which one to use instead of us guessing.
const announced: DiscoveredWallet[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as CustomEvent<DiscoveredWallet>).detail;
    if (!detail?.provider) return;
    const rdns = detail.info?.rdns;
    const dup = announced.some((a) =>
      rdns ? a.info?.rdns === rdns : a.provider === detail.provider
    );
    if (!dup) announced.push(detail);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/* The wallet the user actually chose. All reads/writes use this exact provider
 * so a multi-wallet setup never sends a tx from the wrong account. */
let activeProvider: Eip1193Provider | null = null;

export function getDiscoveredWallets(): DiscoveredWallet[] {
  return announced.slice();
}

// Fallback provider when EIP-6963 found nothing (single legacy injected wallet).
function legacyProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  if (window.okxwallet) return window.okxwallet;
  if (window.ethereum?.providers?.length) {
    return (
      window.ethereum.providers.find((p) => p.isMetaMask) ||
      window.ethereum.providers[0]
    );
  }
  return window.ethereum || null;
}

export function getActiveProvider(): Eip1193Provider | null {
  return activeProvider || legacyProvider();
}

export function hasWallet(): boolean {
  return announced.length > 0 || legacyProvider() !== null;
}

/* ---------- internal state + subscribers ---------- */

export interface WalletSnapshot {
  address: string | null;
  chainId: string | null;
  onChain: boolean;
}

let state: WalletSnapshot = { address: null, chainId: null, onChain: false };

const subs = new Set<(s: WalletSnapshot) => void>();

export function subscribe(cb: (s: WalletSnapshot) => void): () => void {
  subs.add(cb);
  cb(state);
  return () => {
    subs.delete(cb);
  };
}

const TARGET_CHAIN = NET.chainId.toLowerCase();

function setState(patch: Partial<WalletSnapshot>): void {
  state = { ...state, ...patch };
  state.onChain = toHexChainId(state.chainId) === TARGET_CHAIN;
  if (state.address) localStorage.setItem("lawguard-last-address", state.address);
  else localStorage.removeItem("lawguard-last-address");
  subs.forEach((cb) => cb(state));
}

export function getState(): WalletSnapshot {
  return state;
}

/* ---------- connect / disconnect ---------- */

export async function connect(detail?: DiscoveredWallet): Promise<WalletSnapshot> {
  const provider = detail?.provider || getActiveProvider();
  if (!provider) {
    throw new Error(
      "No wallet detected. Install MetaMask, OKX, or another wallet and refresh."
    );
  }
  activeProvider = provider;
  if (detail?.info?.rdns)
    localStorage.setItem("lawguard-wallet-rdns", detail.info.rdns);
  attachListeners(provider);

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  setState({ address: accounts[0]?.toLowerCase() ?? null, chainId });

  // Nudge onto the GenLayer chain now, but don't fail the connection if the
  // user declines — the write path re-checks and blocks there (ensureNetwork).
  if (toHexChainId(chainId) !== TARGET_CHAIN) {
    await switchNetwork().catch((e) =>
      console.warn("network switch declined:", (e as Error).message)
    );
  }
  return state;
}

export function disconnect(): void {
  activeProvider = null;
  localStorage.removeItem("lawguard-wallet-rdns");
  setState({ address: null, chainId: null });
}

/* ---------- chain switching ---------- */

// Normalize any chainId shape (0xf22f, 0xF22F, 61999 decimal, '61999') to lower hex.
function toHexChainId(id: string | number | null): string | null {
  if (id == null) return null;
  const s = String(id);
  if (s.startsWith("0x") || s.startsWith("0X")) return s.toLowerCase();
  const n = Number(s);
  return Number.isFinite(n) ? "0x" + n.toString(16) : s.toLowerCase();
}

/* Switch the wallet to the GenLayer chain and VERIFY it landed there.
 *
 * Robustness (EIP-3326 + wallet quirks): don't trust the switch promise
 * resolving — wallets can resolve without switching, or report "chain missing"
 * with different codes. Handle 4902 AND -32603 plus the "Unrecognized chain"
 * message, add the chain if needed, then re-read eth_chainId and throw if we're
 * not actually on the target chain. */
export async function switchNetwork(): Promise<WalletSnapshot> {
  const provider = getActiveProvider();
  if (!provider) throw new Error("No wallet available.");

  const already = toHexChainId(
    (await provider.request({ method: "eth_chainId" })) as string
  );
  if (already === TARGET_CHAIN) {
    setState({ chainId: already });
    return state;
  }

  const addParams = {
    chainId: NET.chainId,
    chainName: NET.chainName,
    rpcUrls: NET.rpcUrls,
    nativeCurrency: NET.nativeCurrency,
    blockExplorerUrls: NET.blockExplorerUrls,
  };

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NET.chainId }],
    });
  } catch (err) {
    const e = err as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    const missing =
      e?.code === 4902 ||
      e?.code === -32603 ||
      e?.data?.originalError?.code === 4902 ||
      /Unrecognized chain|not.*added|add.*network/i.test(e?.message ?? "");
    if (missing) {
      // Add, then explicitly switch again — adding does not reliably activate.
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [addParams],
      });
      await provider
        .request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: NET.chainId }],
        })
        .catch(() => {});
    } else {
      throw err;
    }
  }

  // Verify — do not trust resolution alone.
  const nowHex = toHexChainId(
    (await provider.request({ method: "eth_chainId" })) as string
  );
  setState({ chainId: nowHex });
  if (nowHex !== TARGET_CHAIN) {
    throw new Error(
      `Wallet is still on chain ${parseInt(nowHex ?? "0x0", 16)}. Please switch ` +
        `to ${NET.chainName} (chain ${NET.chainIdDecimal}) to continue.`
    );
  }
  return state;
}

/* Hard gate for writes: guarantees the wallet is on the GenLayer chain or
 * throws. Called before every signed transaction so a stale chain flag can
 * never let a tx reach genlayer-js on the wrong network. Returns the provider. */
export async function ensureNetwork(): Promise<Eip1193Provider> {
  const provider = getActiveProvider();
  if (!provider) throw new Error("No wallet available.");
  const live = toHexChainId(
    (await provider.request({ method: "eth_chainId" })) as string
  );
  setState({ chainId: live });
  if (live !== TARGET_CHAIN) {
    await switchNetwork();
  }
  return getActiveProvider() as Eip1193Provider;
}

/* ---------- provider event listeners ---------- */

let listenersAttachedTo: Eip1193Provider | null = null;
function attachListeners(provider: Eip1193Provider): void {
  if (!provider?.on || listenersAttachedTo === provider) return;
  listenersAttachedTo = provider;
  provider.on("accountsChanged", (...args: unknown[]) => {
    const accounts = args[0] as string[];
    setState({ address: accounts[0]?.toLowerCase() ?? null });
  });
  provider.on("chainChanged", (...args: unknown[]) => {
    setState({ chainId: args[0] as string });
  });
}

/* ---------- silent reconnect on page load ---------- */

export async function trySilentReconnect(): Promise<void> {
  const stored = localStorage.getItem("lawguard-last-address");
  if (!stored) return;

  const rdns = localStorage.getItem("lawguard-wallet-rdns");
  const chosen = rdns ? announced.find((a) => a.info?.rdns === rdns) : null;
  const provider = chosen?.provider || getActiveProvider();
  if (!provider) return;

  try {
    const accounts = (await provider.request({
      method: "eth_accounts",
    })) as string[];
    if (accounts?.[0]) {
      activeProvider = provider;
      attachListeners(provider);
      const chainId = (await provider.request({
        method: "eth_chainId",
      })) as string;
      setState({ address: accounts[0].toLowerCase(), chainId });
    }
  } catch (e) {
    console.warn("silent reconnect failed:", (e as Error).message);
  }
}

/* ---------- helpers ---------- */

export function shortAddress(addr: string | null): string {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
