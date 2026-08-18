/**
 * useGenLayer — genlayer-js client access for Lawguard.
 *
 * Reads use a wallet-free chain-only client, so the ledger/stats/alerts/sources
 * load for anyone. Writes sign through whichever wallet the user connected:
 *   - local/burner mode:  createClient({ chain, account })          (signs locally)
 *   - external mode:      createClient({ chain, account, provider }) (signs via wallet)
 *
 * Long-consensus UX: a write resolves as soon as the tx is ACCEPTED — the point
 * at which the result is committed to non-final state and readable — instead of
 * blocking for the full 5–30 minute finalization window. Finalization is then
 * watched in the background and reported when it lands, so the UI never freezes.
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
import type { WalletState } from "./useWallet";

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

/** Turn raw genlayer-js / wallet errors into guidance a lawyer can act on. */
export function humanizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (/user rejected|user denied|4001|rejected the request/.test(m))
    return "You declined the request in your wallet.";
  if (/insufficient funds|insufficient balance|not enough/.test(m))
    return "This account has no GEN for gas. Use the burner wallet on StudioNet (auto-funded), or fund your address, then retry.";
  if (/undetermined/.test(m))
    return "Validators could not reach agreement (UNDETERMINED). Retry, or add a deep link to the exact statute in the trusted-sources field so validators converge.";
  if (/timeout|timed out|deadline|exceeded/.test(m))
    return "The network is taking longer than expected. The transaction may still complete — check the Analyses ledger or the explorer in a few minutes.";
  if (/no contract address/.test(m))
    return "No contract address configured. Set the deployed Lawguard address in the Connection bar.";
  if (/wrong network|chain|switch/.test(m))
    return raw; // already actionable from ensureNetwork
  return raw;
}

const FINALIZE_MSG =
  "Accepted — result is available now. Finalizing on-chain (this can take 5–30 min)…";

export interface GenLayerApi {
  /** True once a contract address is configured (reads are wallet-free). */
  ready: boolean;
  /** True when a wallet is connected AND a contract is configured (writes ok). */
  canWrite: boolean;
  contractAddress: string;
  hasContract: boolean;
  read: <T = unknown>(functionName: string, args?: unknown[]) => Promise<T>;
  /**
   * Call a write method. Resolves at ACCEPTED (result readable); finalization is
   * watched in the background and reported via onStatus.
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
  contractAddress: string = CONTRACT_ADDRESS,
  wallet?: Pick<WalletState, "mode" | "account">
): GenLayerApi {
  const [chain] = useState<GenLayerChain>(() => resolveChain());

  const readClient = useMemo(() => createClient({ chain }), [chain]);

  const hasContract = /^0x[0-9a-fA-F]{40}$/.test(contractAddress);
  const ready = hasContract;
  const canWrite = hasContract && !!wallet?.mode;

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
        onStatus?.({ phase: "signing", message: "Preparing transaction…" });

        // Build a signing client for the active wallet mode.
        let client;
        if (wallet?.mode === "local" && wallet.account) {
          client = createClient({ chain, account: wallet.account });
        } else if (wallet?.mode === "external") {
          onStatus?.({ phase: "signing", message: "Confirm in your wallet…" });
          const provider = await ensureNetwork();
          const accounts = (await provider.request({
            method: "eth_requestAccounts",
          })) as string[];
          const addr = accounts?.[0];
          if (!addr) throw new Error("Wallet not connected.");
          client = createClient({ chain, account: addr as Address, provider });
        } else {
          throw new Error("Connect a wallet first.");
        }

        const hash = (await client.writeContract({
          address: contractAddress as Address,
          functionName,
          args: args as CalldataEncodable[],
          value: 0n,
        })) as TransactionHash;

        onStatus?.({
          phase: "pending",
          hash: String(hash),
          message: "Submitted — waiting for GenLayer to accept…",
        });

        await client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.ACCEPTED,
          interval: 4000,
          retries: 90, // ~6 min ceiling for acceptance
        });
        onStatus?.({ phase: "accepted", hash: String(hash), message: FINALIZE_MSG });

        // Finalization can take much longer; watch it without blocking the UI.
        void client
          .waitForTransactionReceipt({
            hash,
            status: TransactionStatus.FINALIZED,
            interval: 10000,
            retries: 240, // up to ~40 min
          })
          .then(() =>
            onStatus?.({
              phase: "finalized",
              hash: String(hash),
              message: "Finalized on-chain.",
            })
          )
          .catch(() => {
            /* leave it in the accepted state; result is already available */
          });
      } catch (err) {
        onStatus?.({ phase: "error", message: humanizeError(err) });
        throw err;
      }
    },
    [chain, contractAddress, hasContract, wallet?.mode, wallet?.account]
  );

  return { ready, canWrite, contractAddress, hasContract, read, write };
}
