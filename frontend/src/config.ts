/**
 * Central runtime configuration for the Lawguard frontend.
 *
 * Values are read from Vite env vars (`import.meta.env`) with safe defaults so
 * the app boots even before a contract is deployed. See `.env.example`.
 */
import { studionet, localnet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";

export type NetworkKey =
  | "studionet"
  | "localnet"
  | "testnet_asimov"
  | "testnet_bradbury";

const NETWORKS: Record<NetworkKey, GenLayerChain> = {
  studionet,
  localnet,
  testnet_asimov: testnetAsimov,
  testnet_bradbury: testnetBradbury,
};

const rawNetwork = (import.meta.env.VITE_GENLAYER_NETWORK ?? "studionet") as string;
export const NETWORK_KEY: NetworkKey = (
  rawNetwork in NETWORKS ? rawNetwork : "studionet"
) as NetworkKey;

export const CHAIN: GenLayerChain = NETWORKS[NETWORK_KEY];

/**
 * EVM `wallet_addEthereumChain` parameters for the active network, derived from
 * the genlayer-js chain. Used by the wallet layer to add/switch a browser
 * wallet (MetaMask, OKX, …) onto the GenLayer chain before signing.
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

/** The deployed Lawguard contract address (0x...), or empty until deployed. */
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

/**
 * Block explorers. We always offer the active-network explorer first, plus the
 * other public GenLayer explorers so a tx hash is never a dead end.
 */
export interface Explorer {
  key: NetworkKey | "bradbury";
  label: string;
  base: string;
}

export const EXPLORERS: Explorer[] = [
  { key: "studionet", label: "StudioNet", base: "https://genlayer-explorer.vercel.app" },
  { key: "bradbury", label: "Bradbury", base: "https://explorer-bradbury.genlayer.com" },
];

/** Direct link to a transaction on a given explorer base. */
export function explorerTxUrl(base: string, hash: string): string {
  return `${base.replace(/\/+$/, "")}/tx/${hash}`;
}

/** The explorer that matches the active network (best-effort). */
export function primaryExplorer(): Explorer {
  if (NETWORK_KEY === "testnet_bradbury") {
    return EXPLORERS.find((e) => e.key === "bradbury") ?? EXPLORERS[0];
  }
  return EXPLORERS.find((e) => e.key === "studionet") ?? EXPLORERS[0];
}

/** Human guidance for adding/switching to the active GenLayer chain in a wallet. */
export const CHAIN_HELP = {
  name: NET.chainName,
  chainIdDecimal: NET.chainIdDecimal,
  chainIdHex: NET.chainId,
  rpc: NET.rpcUrls[0] ?? "",
  currency: NET.nativeCurrency.symbol,
};
