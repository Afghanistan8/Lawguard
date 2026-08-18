/**
 * TxContext — app-level transaction manager.
 *
 * GenLayer consensus is slow (minutes), and users must be able to switch tabs
 * while a write is in flight. Owning transactions here (instead of inside the
 * ToolPanel) means a tx keeps running and stays visible in the global TxTracker
 * even after the originating panel unmounts.
 *
 * A write resolves at ACCEPTED, at which point we read the freshly-committed
 * analysis back and attach it to the record; finalization is reported later.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GenLayerApi } from "../useGenLayer";
import type { ToolDef } from "../tools";
import type { AnalysisResult, TxPhase, TxStatus } from "../types";

export interface TxRecord {
  id: string;
  toolKey: string;
  toolTitle: string;
  phase: TxPhase;
  message?: string;
  hash?: string;
  startedAt: number;
  endedAt?: number;
  analysisId?: number;
  result?: AnalysisResult;
  error?: string;
}

interface TxContextValue {
  records: TxRecord[];
  /** Start a tool write; returns the record id so a panel can follow it. */
  run: (api: GenLayerApi, tool: ToolDef, args: unknown[]) => string;
  /**
   * Start an arbitrary write (e.g. admin ops) that isn't a tool. Returns the
   * record id plus a promise the caller can await to know when it's accepted.
   */
  runRaw: (
    title: string,
    work: (onStatus: (s: TxStatus) => void) => Promise<void>
  ) => { id: string; done: Promise<void> };
  get: (id: string | null) => TxRecord | undefined;
  dismiss: (id: string) => void;
  clearFinished: () => void;
}

const Ctx = createContext<TxContextValue | null>(null);

const MAX_RECORDS = 10;
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function TxProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<TxRecord[]>([]);

  const update = useCallback((id: string, patch: Partial<TxRecord>) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const run = useCallback(
    (api: GenLayerApi, tool: ToolDef, args: unknown[]) => {
      const id = uid();
      const rec: TxRecord = {
        id,
        toolKey: tool.key,
        toolTitle: tool.title,
        phase: "signing",
        startedAt: Date.now(),
      };
      setRecords((rs) => [rec, ...rs].slice(0, MAX_RECORDS));

      (async () => {
        try {
          await api.write(tool.fn, args, (s) =>
            update(id, { phase: s.phase, message: s.message, hash: s.hash })
          );
          // ACCEPTED reached — the analysis is committed to readable state.
          const listing = await api.read<{ items: AnalysisResult[] }>(
            "list_analyses",
            [1, 0]
          );
          const latest = listing.items?.[0];
          if (latest) {
            update(id, {
              analysisId: latest.id,
              result: latest,
              endedAt: Date.now(),
            });
          } else {
            update(id, {
              error: "Transaction accepted but no analysis was found in the ledger.",
              endedAt: Date.now(),
            });
          }
        } catch (e) {
          update(id, {
            phase: "error",
            error: e instanceof Error ? e.message : String(e),
            endedAt: Date.now(),
          });
        }
      })();

      return id;
    },
    [update]
  );

  const runRaw = useCallback(
    (title: string, work: (onStatus: (s: TxStatus) => void) => Promise<void>) => {
      const id = uid();
      setRecords((rs) =>
        [
          {
            id,
            toolKey: "admin",
            toolTitle: title,
            phase: "signing" as TxPhase,
            startedAt: Date.now(),
          },
          ...rs,
        ].slice(0, MAX_RECORDS)
      );
      const done = (async () => {
        try {
          await work((s) =>
            update(id, { phase: s.phase, message: s.message, hash: s.hash })
          );
          update(id, { endedAt: Date.now() });
        } catch (e) {
          update(id, {
            phase: "error",
            error: e instanceof Error ? e.message : String(e),
            endedAt: Date.now(),
          });
          throw e;
        }
      })();
      return { id, done };
    },
    [update]
  );

  const get = useCallback(
    (id: string | null) => (id ? records.find((r) => r.id === id) : undefined),
    [records]
  );

  const dismiss = useCallback((id: string) => {
    setRecords((rs) => rs.filter((r) => r.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setRecords((rs) =>
      rs.filter((r) => r.phase !== "finalized" && r.phase !== "error")
    );
  }, []);

  const value = useMemo(
    () => ({ records, run, runRaw, get, dismiss, clearFinished }),
    [records, run, runRaw, get, dismiss, clearFinished]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTx(): TxContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTx must be used within <TxProvider>");
  return ctx;
}

/** Phase → label / css class / short guidance, shared by status components. */
export const PHASE_META: Record<
  TxPhase,
  { label: string; cls: string; hint?: string }
> = {
  idle: { label: "Idle", cls: "" },
  signing: { label: "Signing", cls: "signing", hint: "Approve in your wallet." },
  pending: {
    label: "Pending on GenLayer",
    cls: "pending",
    hint: "Waiting for the network to accept (~1–3 min).",
  },
  accepted: {
    label: "Accepted",
    cls: "accepted",
    hint: "Result is available. Finalizing can take 5–30 min — you can keep working.",
  },
  finalized: {
    label: "Finalized",
    cls: "finalized",
    hint: "Permanently committed on-chain.",
  },
  error: { label: "Failed", cls: "error" },
};
