/**
 * Shared TypeScript types mirroring the on-chain JSON schema returned by the
 * Lawguard Intelligent Contract. The contract stores compact JSON strings; the
 * frontend parses them into these shapes.
 */

export type AnalysisStatus =
  | "VERIFIED"
  | "INSUFFICIENT_EVIDENCE"
  | "UNAVAILABLE"
  | "CONFLICT";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type ApplicabilityBucket = "LOW" | "MEDIUM" | "HIGH";

/** The normalised, decision-critical result produced by every AI tool. */
export interface AnalysisResult {
  kind: string;
  status: AnalysisStatus;
  citation: string;
  exact_text_or_summary: string;
  applicability_score: number;
  applicability_bucket: ApplicabilityBucket;
  confidence: Confidence;
  sources: string[];
  notes: string;
  disclaimer: string;
  /** Present once stored on-chain. */
  id?: number;
  meta?: Record<string, string>;
}

/** Envelope returned by write tools: { id, result }. */
export interface ToolResponse {
  id?: number;
  result?: AnalysisResult;
  error?: string;
}

export interface Alert {
  analysis_id: number;
  kind: string;
  reason: string;
}

export interface Stats {
  total_analyses: number;
  verified: number;
  unavailable: number;
  conflicts: number;
  low_confidence: number;
  alerts: number;
  cases: number;
}

export interface CaseRecord {
  id: number;
  title: string;
  country: string;
  matter_type: string;
  reference: string;
  linked_analyses: number[];
}

export type TrustedSources = Record<string, string[]>;

/** Transaction lifecycle states surfaced in the UI. */
export type TxPhase =
  | "idle"
  | "signing"
  | "pending"
  | "accepted"
  | "finalized"
  | "error";

export interface TxStatus {
  phase: TxPhase;
  hash?: string;
  message?: string;
}

/** A sample scenario for import/export. */
export interface SampleScenario {
  tool: string;
  label: string;
  fields: Record<string, string>;
}
