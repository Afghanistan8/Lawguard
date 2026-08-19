<p align="center">
  <img src="docs/banner.svg" alt="Lawguard" width="100%" />
</p>

<h1 align="center">Lawguard</h1>

<p align="center">
  <b>On-chain, source-grounded law verification &amp; decision-support for law firms.</b><br/>
  Built as a <a href="https://genlayer.com">GenLayer</a> Intelligent Contract — every analysis is grounded in trusted primary sources, validated by leader/validator consensus, and permanently auditable on-chain.
</p>

<p align="center">
  <a href="#live-demo">Live demo</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#tools">Tools</a> ·
  <a href="#how-consensus-works">Consensus</a> ·
  <a href="#security--safety">Security</a> ·
  <a href="#tests">Tests</a>
</p>

---

> ⚖️ **Decision-support only — not legal advice.** Lawguard **supports** lawyers and law firms.
> It does **not** practise law, does **not** give legal advice, and does **not** judge guilt,
> innocence, or outcomes. Every output is *verified reference information grounded in public
> sources* for professional review. Always consult qualified counsel.

## What Lawguard does

Lawguard helps legal teams **screen whether a law or legal claim against a person or entity is
correctly implemented / applied in any country**. It verifies and returns the correct, current
law text applicable to a crime or legal situation, grounds every AI analysis in trusted official
sources, and records the entire workflow on-chain for transparent, auditable results.

Because it runs on GenLayer, the "AI judgment" steps are not a black box: multiple validators
independently fetch the same primary sources and re-run the analysis, and a result is **only
committed when they agree on the decision-critical fields** (status, citation, applicability,
confidence). If trusted sources are unavailable or insufficient, Lawguard returns
`UNAVAILABLE` / `INSUFFICIENT_EVIDENCE` — it never hallucinates statutes or case law.

<p align="center"><img src="docs/architecture.svg" alt="Architecture" width="92%"/></p>

## Live demo

| Resource | Link |
| --- | --- |
| **Live demo** | **https://lawguard.vercel.app** ✅ (wired to the StudioNet contract below) |
| **Contract (StudioNet, chain 61999)** | `0xA7D9B1B288E4D1da9C94aC9b06452c7bdbCfd298` — **live** ✅ |
| StudioNet explorer | https://genlayer-explorer.vercel.app |
| Network | **GenLayer StudioNet only** (`studio.genlayer.com/api`, chain 61999) — the app targets no other network. |

> **Deployment note (important):** deploy with a **pinned runner hash** in the magic
> header, not the `:test` tag —
> `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`.
> On the hosted networks the `py-genlayer:test` tag does not currently resolve to a
> working runner and every deploy (including the official starter template) fails
> validation with `contract_error: invalid_contract`. The pinned hash — the one the
> official docs use — deploys cleanly. Local `gltest`/pytest still work with either.

## Tools

**Eight AI verification tools** (each a consensus-backed on-chain write), plus a
privacy-preserving **case registry**, auto-raised **alerts**, and owner-managed
**trusted-source** administration.

<p align="center"><img src="docs/tools.svg" alt="Tools" width="92%"/></p>

| # | AI tool | Contract method | What it returns |
|---|------|-----------------|-----------------|
| 1 | **Verify Statute** | `verify_statute` | The official statute/code section for a crime or charge in a jurisdiction. |
| 2 | **Screen Application** | `screen_application` | Whether a described application of a law appears consistent with statute + case law (never judges guilt). |
| 3 | **Extract Law Text** | `extract_law_text` | The exact current text of a specific provision, with citation + source (strict-equivalence extraction). |
| 4 | **Cross-Jurisdiction Compare** | `compare_jurisdictions` | Similarities/differences for the same crime/topic across two countries. |
| 5 | **Statute of Limitations** | `check_statute_of_limitations` | The limitation period / procedural deadline and the provision that sets it. |
| 6 | **Conflict / Superseding Check** | `check_conflicts` | Whether a provision is in force, amended, repealed, superseded, or conflicting. |
| 7 | **Map Facts → Provisions** | `map_facts_to_provisions` | Issue-spotting: the most relevant provisions to review for a fact pattern. |
| 8 | **Verification Report** | `generate_verification_report` | An auditable reference report: provision, text, conflicts, confidence, disclaimer. |

**Beyond the AI tools:**

| Feature | Contract methods | Notes |
|---|---|---|
| **Case registry** | `register_case` / `link_analysis_to_case` / `search_cases` | Privacy-preserving matter records with creator-only access control. |
| **Alerts** | `get_alerts` | Auto-raised on low confidence, conflicts, or unavailable/insufficient sources. |
| **Trusted sources (owner)** | `add_trusted_source` / `remove_trusted_source` / `get_trusted_sources` | HTTPS-only, owner-restricted. The UI reads this registry to build the jurisdiction list dynamically. |
| **Ledger & stats** | `list_analyses` / `search_analyses` / `get_analysis` / `get_stats` | Wallet-free reads over the full auditable history. |

Every AI tool returns the same normalised, auditable shape:

```json
{
  "status": "VERIFIED | INSUFFICIENT_EVIDENCE | UNAVAILABLE | CONFLICT",
  "citation": "18 U.S.C. § 1343",
  "exact_text_or_summary": "…",
  "applicability_score": 0-100,
  "applicability_bucket": "LOW | MEDIUM | HIGH",
  "confidence": "LOW | MEDIUM | HIGH",
  "sources": ["https://…"],
  "notes": "caveats for reviewing counsel",
  "disclaimer": "Decision-support only — not legal advice…"
}
```

## How consensus works

<p align="center"><img src="docs/workflow.svg" alt="Workflow" width="92%"/></p>

Non-deterministic steps (web fetch + LLM reasoning) are always wrapped in GenLayer's
**Equivalence Principle**, so they run under leader/validator consensus:

1. **Validate & sanitise** the lawyer's input (length caps, allowed characters).
2. **Resolve trusted sources** from a country-aware registry of official/primary law sites.
3. Inside the consensus block, the **leader and every validator independently**:
   - fetch each source over **HTTPS only** (`gl.nondet.web.render`),
   - wrap the fetched content in explicit **`UNTRUSTED DATA`** markers,
   - run a **grounded** prompt (`gl.nondet.exec_prompt`) that forbids inventing law,
   - normalise the answer to a small, stable **decision key**.
4. The result is **committed on-chain only when validators agree**:
   - `extract_law_text` uses **`gl.eq_principle.strict_eq`** (deterministic extraction),
   - analytical tools use **`gl.eq_principle.prompt_comparative`** with a principle that requires
     the same `status`, `citation`, `applicability_bucket`, and `confidence`.
5. **Fail-safe:** any unreachable source or failed consensus yields `UNAVAILABLE` /
   `INSUFFICIENT_EVIDENCE`, and an **alert** is auto-created for low-confidence / conflict results.

## Project structure

```
lawguard/
├── contracts/
│   └── lawguard.py            # GenLayer Intelligent Contract (all tools + consensus)
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Composition, navigation, sample import/export
│   │   ├── useGenLayer.ts     # genlayer-js client + read/write + tx lifecycle
│   │   ├── useWallet.ts       # Burner/imported account management
│   │   ├── tools.ts           # Declarative tool definitions (1:1 with contract)
│   │   ├── types.ts           # Shared types mirroring the on-chain schema
│   │   ├── config.ts          # Network, contract address, jurisdictions, disclaimer
│   │   └── components/        # Tool panels + Ledger/Alerts/Cases/Sources/Stats
│   ├── public/sample_cases.json
│   └── package.json
├── tests/
│   ├── test_lawguard.py       # pytest suite (happy paths, fail-safes, consensus)
│   └── conftest.py            # GenVM test double so tests run under plain pytest
├── docs/                      # banner / architecture / workflow / tools (SVG)
├── README.md
├── LICENSE                    # MIT
└── .gitignore
```

## Quick start

### 1. Prerequisites
- **Node.js 18+** and npm
- **Python 3.11+** (for the contract tests)
- A running **GenLayer Studio** (local) or access to **StudioNet** —
  see the [GenLayer docs](https://docs.genlayer.com).

### 2. Deploy the contract
Deploy `contracts/lawguard.py` with GenLayer Studio (UI) or the GenLayer CLI / `gltest`.
Copy the deployed address (`0x…`).

### 3. Run the frontend
```bash
cd frontend
cp .env.example .env          # set VITE_LAWGUARD_CONTRACT_ADDRESS (StudioNet only)
npm install
npm run dev                   # http://localhost:5173
```
`.env.example` documents every variable (contract address, optional RPC override).
The defaults already point at the live StudioNet deployment, so `npm run dev` works
out of the box. There is no network selector — the app targets StudioNet only.

### How to test live

1. Open the app (locally or **https://lawguard.vercel.app**). The **Analyses ledger**,
   **Alerts**, **Dashboard**, and **Trusted sources** load immediately — reads need no wallet.
2. Click **Connect Wallet** (top-right) and pick one:
   - **Browser wallet** (MetaMask / OKX / any EIP-6963 wallet) — you'll be prompted to
     add & switch to **GenLayer StudioNet** (chain **61999**, RPC `https://studio.genlayer.com/api`).
     The menu's **"how?"** link shows the exact network details to copy.
   - **🔥 Create burner wallet** — an instant, throwaway key generated in your browser and
     **auto-funded on StudioNet**. Best for a quick demo without an extension. *Testnet only.*
   - **Import a testnet key** — paste a funded `0x…` key.
3. Go to **Verification tools**, pick a tool, click a **sample scenario** preset (the ones
   labelled *"deep link → likely VERIFIED"* point at the exact provision text), and **Run**.
4. Watch the transaction: **Signing → Pending → Accepted** (the result appears here — a few
   minutes) → **Finalized** (the extra security window, 5–30 min, watched in the background).
   You can **switch tabs while it runs** — the sticky **Transactions** tracker at the bottom
   keeps every tx visible with a live timer and a **StudioNet explorer link**.

> Burner keys live in `localStorage` and are for testnets only — never store a funded key.
> For production, use a real wallet.

## Known limitations & live status

Lawguard is a working, on-chain demo. A few honest caveats:

- **Consensus timing.** GenLayer runs every AI tool through leader/validator consensus.
  A result is readable at **Accepted** (typically 1–3 min); full **Finalization** can take
  **5–30 minutes**. The UI resolves at Accepted and finalizes in the background so it never
  blocks — but this is inherent to the network, not a bug.
- **`VERIFIED` is probabilistic.** Because validators independently run an LLM and must agree
  on the decision fields (status, citation, confidence), rich free-text can occasionally land
  as **`UNDETERMINED`** (nothing commits — the *safe* outcome). Pointing a tool at a **deep link
  to the exact statute** (via *Additional trusted source URLs*, under an already-trusted origin)
  makes validators converge and reliably returns `VERIFIED`. The fail-safe path
  (`INSUFFICIENT_EVIDENCE` / `UNAVAILABLE` + auto-alert) is by design when sources are thin.
- **Wallets on StudioNet.** StudioNet is a hosted simulator; a real wallet must add it as a
  custom chain (the UI guides this). The **burner wallet** is the smoothest path for evaluation
  and is auto-funded there.
- **StudioNet only, by design.** The app is hardcoded to GenLayer StudioNet (chain 61999) —
  there is no network selector and no other chain is wired in. If a connected browser wallet is
  on a different chain, the UI shows "Wrong network" and every write hard-gates through
  `ensureNetwork()`, which forces (or blocks on) a switch to StudioNet before signing — so a
  transaction can never be silently sent to the wrong network.
- **Deploy header.** Deploy with the **pinned runner hash** (see the deploy note above), not
  `py-genlayer:test`, which does not currently resolve on StudioNet.

## Tests

The contract logic — validation, HTTPS enforcement, source resolution, consensus, fail-safes,
alerts, access control, and the case registry — is covered by a pytest suite that runs offline
via a faithful GenVM **test double** (`tests/conftest.py`).

```bash
pip install pytest
pytest -q                     # from the repo root
```

For **on-chain integration testing**, `genlayer-test` (`gltest`) can deploy the contract to a
local GenLayer node / StudioNet and exercise it end-to-end (its *direct mode* downloads the
matching GenVM SDK). See the [gltest docs](https://github.com/genlayerlabs/genlayer-test).

## Security &amp; safety

| Control | How Lawguard enforces it |
|---|---|
| **HTTPS-only fetches** | `_is_https` rejects any non-`https://` URL before it is ever fetched. |
| **Untrusted-data isolation** | All external content is wrapped in explicit `UNTRUSTED DATA` markers instructing the model to treat it as data, never instructions. |
| **No blind URL trust** | Caller-supplied URLs are honoured only when they fall under an already-registered trusted origin. |
| **Grounding / no hallucination** | Prompts forbid inventing statutes/case law; a `VERIFIED` result without a citation or source is auto-downgraded. |
| **Fail-safe defaults** | Missing sources, unreachable fetches, or failed consensus → `UNAVAILABLE` / `INSUFFICIENT_EVIDENCE`. |
| **Consensus commitment** | Results commit only when leader + validators agree on the decision key (Equivalence Principle). |
| **Input validation** | Length caps and sanitisation on every field; bounded prompts and storage. |
| **Access control** | Only a case's creator can modify it; only the contract owner can manage trusted sources. |
| **Data minimisation** | The case registry stores only minimal lawyer-supplied metadata — no sensitive personal identifiers. |
| **Auditability** | Every analysis, its sources, scores, status, and alerts are stored on-chain and readable. |
| **Repeated disclaimers** | The professional-review disclaimer is embedded in every result and shown throughout the UI. |

## Extending Lawguard

- **New jurisdictions:** add sources via `add_trusted_source(country, url)` (owner) — the tools are
  country-agnostic and pick them up automatically. Add the country to `JURISDICTIONS` in
  `frontend/src/config.ts` to surface it in the UI.
- **New tools:** add a `@gl.public.write` method following the `_run_grounded_analysis` /
  `_run_extraction` pattern, then add one entry to `frontend/src/tools.ts`. The panel renders itself.

## License

[MIT](LICENSE) © Lawguard contributors.

---

<p align="center"><i>Lawguard is a transparent, on-chain, source-grounded reference for professional legal review only. It does not replace a lawyer.</i></p>
