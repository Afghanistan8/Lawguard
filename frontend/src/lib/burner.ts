/* src/lib/burner.ts
 *
 * Optional local "burner" wallet for instant testing without a browser
 * extension — a common GenLayer demo pattern. A private key is generated (or
 * imported) in-browser, persisted in localStorage, and used by genlayer-js to
 * sign locally.
 *
 * SECURITY: a burner key in localStorage is appropriate ONLY for testnets /
 * StudioNet with no real funds. It is never a substitute for a real wallet on a
 * network with value. The UI states this clearly.
 */
import { createAccount, generatePrivateKey } from "genlayer-js";
import type { Account } from "genlayer-js/types";
import { CHAIN, NETWORK_KEY } from "../config";

export type Hex = `0x${string}`;

const STORAGE_KEY = "lawguard.burner.pk";

export function isValidKey(key: string | null | undefined): key is Hex {
  return !!key && /^0x[0-9a-fA-F]{64}$/.test(key.trim());
}

/** The persisted burner private key, if any. */
export function loadBurnerKey(): Hex | null {
  const k = localStorage.getItem(STORAGE_KEY);
  return isValidKey(k) ? (k as Hex) : null;
}

export function saveBurnerKey(key: Hex): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearBurnerKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Create (and persist) a fresh burner key, returning it. */
export function createBurnerKey(): Hex {
  const pk = generatePrivateKey();
  saveBurnerKey(pk);
  return pk;
}

/** Build a genlayer-js Account from a private key. */
export function accountFromKey(key: Hex): Account {
  return createAccount(key);
}

/**
 * Best-effort faucet for a burner on StudioNet (the simulator supports
 * `sim_fundAccount`). No-op / silently ignored on networks that don't. Returns
 * true if the funding request was accepted.
 */
export async function tryFundBurner(address: string): Promise<boolean> {
  if (NETWORK_KEY !== "studionet") return false;
  const rpc = CHAIN.rpcUrls?.default?.http?.[0];
  if (!rpc) return false;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sim_fundAccount",
        // Amount is in native units on the simulator; 100 GEN is plenty for gas.
        params: [address, 100],
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { error?: unknown };
    return !json.error;
  } catch {
    return false;
  }
}
