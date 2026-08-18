import type { AnalysisResult, AnalysisStatus } from "../types";

const STATUS_BADGE: Record<AnalysisStatus, { cls: string; label: string }> = {
  VERIFIED: { cls: "ok", label: "Verified" },
  INSUFFICIENT_EVIDENCE: { cls: "warn", label: "Insufficient evidence" },
  UNAVAILABLE: { cls: "danger", label: "Unavailable" },
  CONFLICT: { cls: "danger", label: "Conflict / superseded" },
};

const CONF_BADGE: Record<string, string> = {
  HIGH: "ok",
  MEDIUM: "info",
  LOW: "warn",
};

/** What a reviewing lawyer can do next, per non-verified status. */
const STATUS_GUIDANCE: Partial<Record<AnalysisStatus, { cls: string; text: string }>> = {
  INSUFFICIENT_EVIDENCE: {
    cls: "warn",
    text:
      "The trusted sources fetched did not clearly contain the answer (often the " +
      "landing page, not the provision text). Add a deep link to the exact " +
      "statute/section in “Additional trusted source URLs” (it must sit under an " +
      "already-trusted official origin) and re-run.",
  },
  UNAVAILABLE: {
    cls: "danger",
    text:
      "Trusted sources were unreachable, or none are configured for this " +
      "jurisdiction. Check the Trusted sources tab, add an official HTTPS source, " +
      "or retry — some sites intermittently block automated fetches.",
  },
  CONFLICT: {
    cls: "danger",
    text:
      "Sources suggest the provision may be amended, repealed, superseded, or in " +
      "conflict with other legislation. Review the notes and cited sources with " +
      "counsel before relying on it.",
  },
};

/**
 * Renders a normalised on-chain analysis result: status, citation, exact text
 * or summary, applicability meter, confidence, sources, notes, and the
 * ever-present disclaimer.
 */
export function ResultCard({ result }: { result: AnalysisResult }) {
  const badge = STATUS_BADGE[result.status] ?? {
    cls: "info",
    label: result.status,
  };
  return (
    <div className="result">
      <div className="row">
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span className={`badge ${CONF_BADGE[result.confidence] ?? "info"}`}>
          {result.confidence} confidence
        </span>
        {typeof result.id === "number" && (
          <span className="pill mono" title="On-chain analysis id">
            #{result.id}
          </span>
        )}
        {result.citation && <span className="cite">{result.citation}</span>}
      </div>

      {STATUS_GUIDANCE[result.status] && (
        <div className={`callout ${STATUS_GUIDANCE[result.status]!.cls}`}>
          <strong>What you can do next:</strong>{" "}
          {STATUS_GUIDANCE[result.status]!.text}
        </div>
      )}

      <div className="block-label">Applicability</div>
      <div className="row" style={{ gap: 12 }}>
        <div className="meter" style={{ flex: 1 }}>
          <span
            style={{ width: `${Math.max(0, Math.min(100, result.applicability_score))}%` }}
          />
        </div>
        <span className="mono faint">
          {result.applicability_score}/100 · {result.applicability_bucket}
        </span>
      </div>

      <div className="block-label">Exact text / summary</div>
      <pre>{result.exact_text_or_summary || "—"}</pre>

      {result.notes && (
        <>
          <div className="block-label">Notes for reviewing counsel</div>
          <pre>{result.notes}</pre>
        </>
      )}

      <div className="block-label">Grounded sources</div>
      {result.sources && result.sources.length > 0 ? (
        <ul className="sources" style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {result.sources.map((s) => (
            <li key={s}>
              <a href={s} target="_blank" rel="noreferrer noopener">
                {s}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="faint" style={{ margin: "4px 0 0" }}>
          No trusted source produced usable text.
        </p>
      )}

      <hr className="sep" />
      <p className="faint" style={{ fontSize: 12, margin: 0 }}>
        {result.disclaimer}
      </p>
    </div>
  );
}
