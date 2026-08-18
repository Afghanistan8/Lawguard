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
