/**
 * Central runtime configuration for the Lawguard frontend.
 *
 * Lawguard targets **GenLayer StudioNet only** (chain 61999). There is no
 * network selector — the app is hardcoded to this chain so a connected wallet
 * can never sign against the wrong network's contract.
 */
import { studionet } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";

/** Fixed network identity, kept as a constant for display/logic that needs it. */
export const NETWORK_KEY = "studionet" as const;

export const CHAIN: GenLayerChain = studionet;

/**
 * EVM `wallet_addEthereumChain` parameters for StudioNet, derived from the
 * genlayer-js chain. Used by the wallet layer to add/switch a browser wallet
 * (MetaMask, OKX, …) onto StudioNet before signing.
 */
export const NET = {
  chainId: "0x" + CHAIN.id.toString(16),
  chainIdDecimal: CHAIN.id,
  chainName: CHAIN.name,
  rpcUrls: [...CHAIN.rpcUrls.default.http],
  blockExplorerUrls: CHAIN.blockExplorers
    ? [CHAIN.blockExplorers.default.url]
    : [],
  nativeCurrency: CHAIN.nativeCurrency ?? {
    name: "GEN",
    symbol: "GEN",
    decimals: 18,
  },
};

/** Optional explicit RPC override (useful for a local GenLayer Studio). */
export const RPC_URL_OVERRIDE: string | undefined =
  import.meta.env.VITE_GENLAYER_RPC_URL || undefined;

/** The deployed Lawguard contract address (0x...) on StudioNet. */
export const CONTRACT_ADDRESS: string = (
  import.meta.env.VITE_LAWGUARD_CONTRACT_ADDRESS ?? ""
).trim();

/** Permanent, non-dismissible product disclaimer shown across the UI. */
export const DISCLAIMER =
  "This is decision-support only — not legal advice. Lawguard provides " +
  "transparent, source-grounded reference information for professional review. " +
  "It does not practice law, does not judge guilt or innocence, and does not " +
  "replace qualified counsel. Always consult a licensed lawyer.";

/**
 * Human-readable labels for jurisdiction codes. The live list is read from the
 * contract's trusted-source registry (`get_trusted_sources`); any code without
 * a label here falls back to the raw code.
 */
export const JURISDICTION_LABELS: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  EU: "European Union",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  DE: "Germany",
  FR: "France",
  IE: "Ireland",
  NZ: "New Zealand",
  SG: "Singapore",
  ZA: "South Africa",
};

export interface Jurisdiction {
  code: string;
  label: string;
}

/** Default jurisdictions used until the on-chain registry loads (fallback). */
export const JURISDICTIONS: Jurisdiction[] = [
  "US",
  "UK",
  "EU",
  "CA",
  "AU",
  "IN",
].map((code) => ({ code, label: JURISDICTION_LABELS[code] ?? code }));

/** Build a jurisdiction list from raw country codes (from the contract). */
export function jurisdictionsFromCodes(codes: string[]): Jurisdiction[] {
  const seen = new Set<string>();
  const out: Jurisdiction[] = [];
  for (const raw of codes) {
    const code = String(raw).toUpperCase().trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, label: JURISDICTION_LABELS[code] ?? code });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/** The StudioNet block explorer. Single-network app — one explorer, always. */
export interface Explorer {
  key: "studionet";
  label: string;
  base: string;
}

export const EXPLORERS: Explorer[] = [
  { key: "studionet", label: "StudioNet", base: "https://genlayer-explorer.vercel.app" },
];

/** Direct link to a transaction on a given explorer base. */
export function explorerTxUrl(base: string, hash: string): string {
  return `${base.replace(/\/+$/, "")}/tx/${hash}`;
}

/** Human guidance for adding/switching to StudioNet in a wallet. */
export const CHAIN_HELP = {
  name: NET.chainName,
  chainIdDecimal: NET.chainIdDecimal,
  chainIdHex: NET.chainId,
  rpc: NET.rpcUrls[0] ?? "",
  currency: NET.nativeCurrency.symbol,
};
