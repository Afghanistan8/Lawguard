/**
 * useWallet — React binding over the EIP-6963 wallet module (src/lib/wallet.ts).
 *
 * Exposes the current wallet snapshot and connect/disconnect actions, discovers
 * injected wallets (MetaMask, OKX, …), and attempts a silent reconnect on load.
 * Signing is done by the connected browser wallet — there is no private-key
 * import and no local burner account.
 */
import { useCallback, useEffect, useState } from "react";
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

export type { DiscoveredWallet } from "./lib/wallet";

export interface WalletState {
  address: string | null;
  connected: boolean;
  /** Wallet is connected AND on the correct GenLayer chain. */
  onChain: boolean;
  discovered: DiscoveredWallet[];
  hasWallet: boolean;
  connect: (detail?: DiscoveredWallet) => Promise<{ ok: boolean; error?: string }>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [snap, setSnap] = useState<WalletSnapshot>(() => getState());
  const [discovered, setDiscovered] = useState<DiscoveredWallet[]>(() =>
    getDiscoveredWallets()
  );

  useEffect(() => {
    const unsub = subscribe(setSnap);
    // EIP-6963 announcements can arrive just after mount; refresh the list.
    const t = setTimeout(() => setDiscovered(getDiscoveredWallets()), 300);
    void trySilentReconnect();
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  const connect = useCallback(async (detail?: DiscoveredWallet) => {
    try {
      await walletConnect(detail);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Wallet connection failed.",
      };
    }
  }, []);

  const disconnect = useCallback(() => walletDisconnect(), []);

  return {
    address: snap.address,
    connected: !!snap.address,
    onChain: snap.onChain,
    discovered,
    hasWallet: hasWallet(),
    connect,
    disconnect,
  };
}
