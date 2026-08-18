/**
 * useWallet — lightweight account management for the Lawguard demo.
 *
 * GenLayer transactions are signed by a local account. For a Studio/testnet
 * demo we use a *burner* account: a private key generated in-browser (or
 * imported by the user) and persisted in localStorage so the session survives
 * reloads.
 *
 * SECURITY NOTE: A burner key in localStorage is appropriate ONLY for
 * demos/testnets with no real funds. For production, integrate a proper wallet
 * provider (e.g. MetaMask via EIP-1193) and never persist private keys. The
 * `importKey` path lets a firm paste a dedicated testnet key instead.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createAccount } from "genlayer-js";
import type { Account } from "genlayer-js/types";

const STORAGE_KEY = "lawguard.burner.pk";

type Hex = `0x${string}`;

/** Generate a 32-byte secp256k1 private key using the Web Crypto API. */
function generatePrivateKey(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as Hex;
}

function isValidKey(key: string): key is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(key.trim());
}

export interface WalletState {
  account: Account | null;
  address: string | null;
  connected: boolean;
  connect: () => void;
  importKey: (key: string) => { ok: boolean; error?: string };
  disconnect: () => void;
  exportKey: () => string | null;
}

export function useWallet(): WalletState {
  const [privateKey, setPrivateKey] = useState<Hex | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isValidKey(stored) ? (stored as Hex) : null;
  });

  const account = useMemo<Account | null>(() => {
    if (!privateKey) return null;
    try {
      return createAccount(privateKey);
    } catch {
      return null;
    }
  }, [privateKey]);

  useEffect(() => {
    if (privateKey) localStorage.setItem(STORAGE_KEY, privateKey);
  }, [privateKey]);

  const connect = useCallback(() => {
    setPrivateKey((prev) => prev ?? generatePrivateKey());
  }, []);

  const importKey = useCallback((key: string) => {
    const trimmed = key.trim();
    if (!isValidKey(trimmed)) {
      return { ok: false, error: "Expected a 0x-prefixed 64-hex-char key." };
    }
    setPrivateKey(trimmed as Hex);
    return { ok: true };
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPrivateKey(null);
  }, []);

  const exportKey = useCallback(() => privateKey, [privateKey]);

  return {
    account,
    address: account ? (account.address as string) : null,
    connected: !!account,
    connect,
    importKey,
    disconnect,
    exportKey,
  };
}
