/**
 * useGenLayer — creates a genlayer-js client bound to the connected account and
 * target chain, and exposes typed read/write helpers for the Lawguard contract.
 *
 * Reads use `readContract` (no gas, instant). Writes use `writeContract`, which
 * returns a transaction hash; the transaction is then tracked through its
 * lifecycle (signing → pending → accepted → finalized) via
 * `waitForTransactionReceipt`. Because a GenLayer write returns its value into
 * on-chain state (not directly to the caller), callers read the result back
 * from a view method after finality — see `ToolPanel`.
 */
import { useCallback, useMemo, useState } from "react";
import { createClient } from "genlayer-js";
import {
  TransactionStatus,
  type Account,
  type CalldataEncodable,
  type GenLayerChain,
  type TransactionHash,
} from "genlayer-js/types";
import { CHAIN, CONTRACT_ADDRESS, RPC_URL_OVERRIDE } from "./config";
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
  ready: boolean;
  contractAddress: string;
  hasContract: boolean;
  /** Read a view method and JSON-parse the returned string. */
  read: <T = unknown>(functionName: string, args?: unknown[]) => Promise<T>;
  /**
   * Call a write method, tracking tx phases. Resolves once the transaction is
   * FINALIZED. Read the resulting state via `read` afterward.
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
  account: Account | null,
  contractAddress: string = CONTRACT_ADDRESS
): GenLayerApi {
  const [chain] = useState<GenLayerChain>(() => resolveChain());

  const client = useMemo(() => {
    if (!account) return null;
    return createClient({ chain, account });
  }, [account, chain]);

  const hasContract = /^0x[0-9a-fA-F]{40}$/.test(contractAddress);
  const ready = !!client && hasContract;

  const read = useCallback(
    async <T,>(functionName: string, args: unknown[] = []): Promise<T> => {
      if (!client) throw new Error("Connect an account first.");
      if (!hasContract) throw new Error("No contract address configured.");
      const res = await client.readContract({
        address: contractAddress as Address,
        functionName,
        args: args as CalldataEncodable[],
      });
      return parseMaybeJson<T>(res);
    },
    [client, contractAddress, hasContract]
  );

  const write = useCallback(
    async (
      functionName: string,
      args: unknown[],
      onStatus?: (s: TxStatus) => void
    ): Promise<void> => {
      if (!client) throw new Error("Connect an account first.");
      if (!hasContract) throw new Error("No contract address configured.");
      try {
        onStatus?.({ phase: "signing", message: "Awaiting signature…" });
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

        // First wait for the transaction to be ACCEPTED by the leader.
        await client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.ACCEPTED,
          interval: 3000,
          retries: 40,
        });
        onStatus?.({
          phase: "accepted",
          hash: String(hash),
          message: "Accepted — awaiting validator finality…",
        });

        // Then wait for validator FINALIZED consensus.
        await client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.FINALIZED,
          interval: 3000,
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
    [client, contractAddress, hasContract]
  );

  return { ready, contractAddress, hasContract, read, write };
}
