/**
 * Central runtime configuration for the Lawguard frontend.
 *
 * Values are read from Vite env vars (`import.meta.env`) with safe defaults so
 * the app boots even before a contract is deployed. See `.env.example`.
 */
import { studionet, localnet, testnetAsimov } from "genlayer-js/chains";
import type { GenLayerChain } from "genlayer-js/types";

export type NetworkKey = "studionet" | "localnet" | "testnet_asimov";

const NETWORKS: Record<NetworkKey, GenLayerChain> = {
  studionet,
  localnet,
  testnet_asimov: testnetAsimov,
};

const rawNetwork = (import.meta.env.VITE_GENLAYER_NETWORK ?? "studionet") as string;
export const NETWORK_KEY: NetworkKey = (
  rawNetwork in NETWORKS ? rawNetwork : "studionet"
) as NetworkKey;

export const CHAIN: GenLayerChain = NETWORKS[NETWORK_KEY];

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

/** Countries/jurisdictions offered in the UI selectors (extensible). */
export const JURISDICTIONS: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "UK", label: "United Kingdom" },
  { code: "EU", label: "European Union" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
];
