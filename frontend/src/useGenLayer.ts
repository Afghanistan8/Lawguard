/**
 * useGenLayer — genlayer-js client access for Lawguard.
 *
 * Reads use a lightweight chain-only client (no wallet required), so the ledger,
 * stats, alerts and sources load for anyone. Writes build a signing client per
 * call from the connected browser wallet — after a hard chain gate
 * (`ensureNetwork`) — mirroring the proven epl27-predict setup:
 *   createClient({ chain, account, provider })
 *
 * The wallet is the exact provider the user chose (EIP-6963), so a multi-wallet
 * browser never signs from the wrong extension.
 */
import { useCallback, useMemo, useState } from "react";
import { createClient } from "genlayer-js";
import {
  TransactionStatus,
  type CalldataEncodable,
  type GenLayerChain,
  type TransactionHash,
} from "genlayer-js/types";
import { CHAIN, CONTRACT_ADDRESS, RPC_URL_OVERRIDE } from "./config";
import { ensureNetwork } from "./lib/wallet";
import type { TxStatus } from "./types";

type Address = `0x${string}`;

/** Build a chain object, optionally overriding the RPC endpoint. */
function resolveChain(): GenLayerChain {
  if (!RPC_URL_OVERRIDE) return CHAIN;
  return {
    ...CHAIN,
    rpcUrls: {
      ...CHAIN.rpcUrls,
      default: { http: [RPC_URL_OVERRIDE] },
      public: { http: [RPC_URL_OVERRIDE] },
    },
  } as GenLayerChain;
}

export interface GenLayerApi {
  /** True once a contract address is configured (reads are wallet-free). */
  ready: boolean;
  contractAddress: string;
  hasContract: boolean;
  /** Read a view method and JSON-parse the returned string. */
  read: <T = unknown>(functionName: string, args?: unknown[]) => Promise<T>;
  /**
   * Call a write method through the connected wallet, tracking tx phases
   * (signing → pending → accepted → finalized). Resolves once FINALIZED.
   */
  write: (
    functionName: string,
    args: unknown[],
    onStatus?: (s: TxStatus) => void
  ) => Promise<void>;
}

function parseMaybeJson<T>(value: unknown): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }
  return value as T;
}

export function useGenLayer(
  contractAddress: string = CONTRACT_ADDRESS
): GenLayerApi {
  const [chain] = useState<GenLayerChain>(() => resolveChain());

  // Read-only client: chain only, no wallet needed.
  const readClient = useMemo(() => createClient({ chain }), [chain]);

  const hasContract = /^0x[0-9a-fA-F]{40}$/.test(contractAddress);
  const ready = hasContract;

  const read = useCallback(
    async <T,>(functionName: string, args: unknown[] = []): Promise<T> => {
      if (!hasContract) throw new Error("No contract address configured.");
      const res = await readClient.readContract({
        address: contractAddress as Address,
        functionName,
        args: args as CalldataEncodable[],
      });
      return parseMaybeJson<T>(res);
    },
    [readClient, contractAddress, hasContract]
  );

  const write = useCallback(
    async (
      functionName: string,
      args: unknown[],
      onStatus?: (s: TxStatus) => void
    ): Promise<void> => {
      if (!hasContract) throw new Error("No contract address configured.");
      try {
        onStatus?.({ phase: "signing", message: "Confirm in your wallet…" });

        // Hard gate: guarantee the wallet is on the GenLayer chain before
        // signing, then build a signing client bound to the chosen provider.
        const provider = await ensureNetwork();
        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        const addr = accounts?.[0];
        if (!addr) throw new Error("Wallet not connected.");

        const client = createClient({
          chain,
          account: addr as Address,
          provider,
        });

        const hash = (await client.writeContract({
          address: contractAddress as Address,
          functionName,
          args: args as CalldataEncodable[],
          value: 0n,
        })) as TransactionHash;

        onStatus?.({
          phase: "pending",
          hash: String(hash),
          message: "Submitted to network…",
        });

        await client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.ACCEPTED,
          interval: 5000,
          retries: 40,
        });
        onStatus?.({
          phase: "accepted",
          hash: String(hash),
          message: "Accepted — awaiting validator finality…",
        });

        await client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.FINALIZED,
          interval: 5000,
          retries: 60,
        });
        onStatus?.({
          phase: "finalized",
          hash: String(hash),
          message: "Finalized on-chain.",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onStatus?.({ phase: "error", message });
        throw err;
      }
    },
    [chain, contractAddress, hasContract]
  );

  return { ready, contractAddress, hasContract, read, write };
}
