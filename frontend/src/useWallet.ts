/**
 * useWallet — wallet management for Lawguard, supporting two paths:
 *
 *  1. Injected browser wallet (MetaMask / OKX / any EIP-6963 wallet) — signs via
 *     the extension after switching to the GenLayer chain. See src/lib/wallet.ts.
 *  2. Local "burner" wallet — a key generated or imported in-browser that signs
 *     locally through genlayer-js. Ideal for instant StudioNet testing without
 *     an extension (auto-funded on StudioNet). See src/lib/burner.ts.
 *
 * The two are mutually exclusive at runtime; the user picks one.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "genlayer-js/types";
import {
  connect as walletConnect,
  disconnect as walletDisconnect,
  getDiscoveredWallets,
  getState,
  hasWallet,
  subscribe,
  trySilentReconnect,
  type DiscoveredWallet,
  type WalletSnapshot,
} from "./lib/wallet";
import {
  accountFromKey,
  clearBurnerKey,
  createBurnerKey,
  isValidKey,
  loadBurnerKey,
  saveBurnerKey,
  tryFundBurner,
  type Hex,
} from "./lib/burner";

export type { DiscoveredWallet } from "./lib/wallet";
export type WalletMode = "external" | "local";

export interface WalletState {
  mode: WalletMode | null;
  address: string | null;
  connected: boolean;
  /** Connected AND on the correct GenLayer chain (local mode is always true). */
  onChain: boolean;
  /** Local signer (present only in burner/local mode). */
  account: Account | null;
  /** Injected wallets discovered via EIP-6963. */
  discovered: DiscoveredWallet[];
  hasWallet: boolean;
  /** True while a burner is being created/funded. */
  funding: boolean;
  connectExternal: (detail?: DiscoveredWallet) => Promise<{ ok: boolean; error?: string }>;
  connectBurner: () => Promise<{ ok: boolean; error?: string }>;
  importKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
  exportKey: () => string | null;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [snap, setSnap] = useState<WalletSnapshot>(() => getState());
  const [discovered, setDiscovered] = useState<DiscoveredWallet[]>(() =>
    getDiscoveredWallets()
  );
  const [mode, setMode] = useState<WalletMode | null>(null);
  const [localKey, setLocalKey] = useState<Hex | null>(null);
  const [funding, setFunding] = useState(false);

  useEffect(() => {
    const unsub = subscribe(setSnap);
    const t = setTimeout(() => setDiscovered(getDiscoveredWallets()), 300);
    // Prefer restoring an existing burner (explicit choice); otherwise try to
    // silently re-attach an injected wallet the user already authorized.
    const existing = loadBurnerKey();
    if (existing) {
      setLocalKey(existing);
      setMode("local");
    } else {
      void trySilentReconnect();
    }
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  // When the external wallet reports an address, reflect external mode (unless
  // the user is deliberately on a burner).
  useEffect(() => {
    if (snap.address && mode !== "local") setMode("external");
  }, [snap.address, mode]);

  const account = useMemo<Account | null>(() => {
    if (mode === "local" && localKey) {
      try {
        return accountFromKey(localKey);
      } catch {
        return null;
      }
    }
    return null;
  }, [mode, localKey]);

  const connectExternal = useCallback(async (detail?: DiscoveredWallet) => {
    try {
      clearBurnerKey();
      setLocalKey(null);
      setMode("external");
      await walletConnect(detail);
      return { ok: true };
    } catch (e) {
      setMode(null);
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Wallet connection failed.",
      };
    }
  }, []);

  const activateLocal = useCallback(async (key: Hex) => {
    setLocalKey(key);
    setMode("local");
    const addr = accountFromKey(key).address as string;
    setFunding(true);
    try {
      await tryFundBurner(addr);
    } finally {
      setFunding(false);
    }
    return addr;
  }, []);

  const connectBurner = useCallback(async () => {
    try {
      walletDisconnect();
      const key = createBurnerKey();
      await activateLocal(key);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Could not create burner wallet.",
      };
    }
  }, [activateLocal]);

  const importKey = useCallback(
    async (key: string) => {
      const trimmed = key.trim();
      if (!isValidKey(trimmed)) {
        return { ok: false, error: "Expected a 0x-prefixed 64-hex-character key." };
      }
      try {
        walletDisconnect();
        saveBurnerKey(trimmed as Hex);
        await activateLocal(trimmed as Hex);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Could not import key.",
        };
      }
    },
    [activateLocal]
  );

  const exportKey = useCallback(() => localKey, [localKey]);

  const disconnect = useCallback(() => {
    walletDisconnect();
    clearBurnerKey();
    setLocalKey(null);
    setMode(null);
  }, []);

  const address =
    mode === "local" ? account?.address ?? null : snap.address;
  const onChain = mode === "local" ? true : snap.onChain;

  return {
    mode,
    address,
    connected: mode !== null && !!address,
    onChain,
    account,
    discovered,
    hasWallet: hasWallet(),
    funding,
    connectExternal,
    connectBurner,
    importKey,
    exportKey,
    disconnect,
  };
}
