/**
 * Declarative definitions for Lawguard's AI verification tools.
 *
 * Each tool maps 1:1 to a `@gl.public.write` method on the Intelligent
 * Contract. Driving the panels from this config keeps every tool's form,
 * validation, and argument-building in one auditable place while still
 * rendering as an individual, dedicated panel in the UI.
 */

export type FieldType = "text" | "textarea" | "country" | "urls";

export interface ToolField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
}

export interface ToolDef {
  key: string;
  title: string;
  /** Contract write method name. */
  fn: string;
  short: string;
  description: string;
  fields: ToolField[];
  /** Build positional contract args from collected field values. */
  buildArgs: (v: Record<string, string>) => unknown[];
}

/** Parse a newline/comma separated list of URLs into a clean string array. */
export function parseUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const urlsField: ToolField = {
  name: "trusted_urls",
  label: "Additional trusted source URLs (optional)",
  type: "urls",
  placeholder: "https://www.congress.gov/bill/...\nhttps://www.govinfo.gov/...",
  help:
    "HTTPS only. Ignored unless they fall under an already-trusted official " +
    "origin — the contract never blindly trusts caller-supplied URLs.",
};

export const TOOLS: ToolDef[] = [
  {
    key: "verify_statute",
    title: "Verify Statute",
    fn: "verify_statute",
    short: "Confirm the statute/code section for a crime or charge.",
    description:
      "Identify and verify the official statute or code section that governs a " +
      "crime or charge in a chosen jurisdiction, grounded in primary sources.",
    fields: [
      {
        name: "crime_or_charge",
        label: "Crime or charge",
        type: "text",
        required: true,
        placeholder: "e.g. wire fraud",
      },
      { name: "country", label: "Jurisdiction", type: "country", required: true },
      urlsField,
    ],
    buildArgs: (v) => [v.crime_or_charge, v.country, parseUrls(v.trusted_urls)],
  },
  {
    key: "screen_application",
    title: "Screen Application",
    fn: "screen_application",
    short: "Check if a law's application appears consistent with the statute.",
    description:
      "Screen whether a described application of a law against a person appears " +
      "consistent with the statute text and public case law. Never judges guilt.",
    fields: [
      {
        name: "described_application",
        label: "Described application",
        type: "textarea",
        required: true,
        placeholder:
          "Describe how the law is being applied against the person (facts only).",
      },
      { name: "country", label: "Jurisdiction", type: "country", required: true },
      {
        name: "statute_hint",
        label: "Statute hint (optional)",
        type: "text",
        placeholder: "e.g. 18 U.S.C. § 1343",
      },
      urlsField,
    ],
    buildArgs: (v) => [
      v.described_application,
      v.country,
      v.statute_hint ?? "",
      parseUrls(v.trusted_urls),
    ],
  },
  {
    key: "extract_law_text",
    title: "Extract Law Text",
    fn: "extract_law_text",
    short: "Return the exact current text of a specific provision.",
    description:
      "Retrieve the exact, current text of a specific statute/citation with its " +
      "official reference and source. Uses strict equivalence consensus.",
    fields: [
      {
        name: "statute_citation",
        label: "Statute citation",
        type: "text",
        required: true,
        placeholder: "e.g. 17 U.S.C. § 106",
      },
      { name: "country", label: "Jurisdiction", type: "country", required: true },
      urlsField,
    ],
    buildArgs: (v) => [v.statute_citation, v.country, parseUrls(v.trusted_urls)],
  },
  {
    key: "compare_jurisdictions",
    title: "Cross-Jurisdiction Compare",
    fn: "compare_jurisdictions",
    short: "Compare how a crime/topic is treated in two countries.",
    description:
      "Compare the elements, penalties, and defences for the same crime or topic " +
      "across two jurisdictions, each grounded in its own official sources.",
    fields: [
      {
        name: "crime_or_topic",
        label: "Crime or topic",
        type: "text",
        required: true,
        placeholder: "e.g. insider trading",
      },
      { name: "country_a", label: "Jurisdiction A", type: "country", required: true },
      { name: "country_b", label: "Jurisdiction B", type: "country", required: true },
      urlsField,
    ],
    buildArgs: (v) => [
      v.crime_or_topic,
      v.country_a,
      v.country_b,
      parseUrls(v.trusted_urls),
    ],
  },
  {
    key: "check_statute_of_limitations",
    title: "Statute of Limitations",
    fn: "check_statute_of_limitations",
    short: "Find limitation periods / procedural deadlines.",
    description:
      "Identify the statute of limitations or procedural deadline applicable to a " +
      "crime or civil claim, with the provision that sets it and any exceptions.",
    fields: [
      {
        name: "crime_or_claim",
        label: "Crime or civil claim",
        type: "text",
        required: true,
        placeholder: "e.g. breach of written contract",
      },
      { name: "country", label: "Jurisdiction", type: "country", required: true },
      urlsField,
    ],
    buildArgs: (v) => [v.crime_or_claim, v.country, parseUrls(v.trusted_urls)],
  },
  {
    key: "check_conflicts",
    title: "Conflict / Superseding Check",
    fn: "check_conflicts",
    short: "Detect amendments, repeals, or conflicting legislation.",
    description:
      "Check whether a provision is still in force or has been amended, repealed, " +
      "superseded, or conflicts with other legislation. Flags CONFLICT status.",
    fields: [
      {
        name: "statute_citation",
        label: "Statute citation",
        type: "text",
        required: true,
        placeholder: "e.g. s.1 Theft Act 1968",
      },
      { name: "country", label: "Jurisdiction", type: "country", required: true },
      urlsField,
    ],
    buildArgs: (v) => [v.statute_citation, v.country, parseUrls(v.trusted_urls)],
  },
  {
    key: "map_facts_to_provisions",
    title: "Map Facts → Provisions",
    fn: "map_facts_to_provisions",
    short: "Issue-spot the most relevant provisions for a fact pattern.",
    description:
      "Map a factual description to the most relevant criminal/civil provisions a " +
      "lawyer should review. Issue-spotting support only — not a legal opinion.",
    fields: [
      {
        name: "fact_description",
        label: "Fact description",
        type: "textarea",
        required: true,
        placeholder: "Describe the facts (no sensitive personal identifiers).",
      },
      { name: "country", label: "Jurisdiction", type: "country", required: true },
      urlsField,
    ],
    buildArgs: (v) => [v.fact_description, v.country, parseUrls(v.trusted_urls)],
  },
  {
    key: "generate_verification_report",
    title: "Verification Report",
    fn: "generate_verification_report",
    short: "Produce an auditable, on-chain reference report.",
    description:
      "Generate a concise, auditable verification report for a crime, statute, or " +
      "situation — governing provision, current text, conflicts, confidence, and " +
      "the professional-review disclaimer — committed on-chain.",
    fields: [
      {
        name: "subject",
        label: "Subject",
        type: "text",
        required: true,
        placeholder: "e.g. money laundering under the Proceeds of Crime Act",
      },
      { name: "country", label: "Jurisdiction", type: "country", required: true },
      urlsField,
    ],
    buildArgs: (v) => [v.subject, v.country, parseUrls(v.trusted_urls)],
  },
];

export const TOOLS_BY_KEY: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.key, t])
);
