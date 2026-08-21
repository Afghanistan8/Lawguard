"""
Lawguard contract test suite.

Run with:  pytest -q   (from the repo root or the tests/ directory)

Covered:
* Pure validation / sanitisation helpers (HTTPS-only, URL cleaning, coercion).
* Trusted-source resolution and owner-only administration + access control.
* Happy path: a grounded, consensus-backed VERIFIED analysis is stored on-chain.
* Fail-safe paths: no configured source, unreachable source, un-parseable model
  output, and a downgraded VERIFIED-without-citation -> INSUFFICIENT_EVIDENCE.
* Consensus: validator disagreement raises and the tool fails safe to
  UNAVAILABLE rather than committing a hallucinated result.
* Alerts are auto-created for low-confidence / unavailable / conflict results.
* Case registry: registration, access control, and analysis linking.

The GenLayer runtime is emulated by tests/conftest.py so these run under plain
pytest. See that file for the leader/validator agreement emulation.
"""

import json
import os
import sys

import pytest

# Make the contract importable as a module.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "contracts"))

import lawguard as L  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers to drive the fake runtime.
# ---------------------------------------------------------------------------
def make_contract():
    return L.Lawguard()


def verified_payload(citation="18 U.S.C. § 1343", score=90, conf="HIGH"):
    return json.dumps(
        {
            "status": "VERIFIED",
            "citation": citation,
            "exact_text_or_summary": "Whoever, having devised ... a scheme.",
            "applicability_score": score,
            "confidence": conf,
            "sources": ["https://www.congress.gov"],
            "notes": "For professional review.",
        }
    )


# ---------------------------------------------------------------------------
# Pure helper tests (no runtime needed).
# ---------------------------------------------------------------------------
class TestHelpers:
    def test_https_only(self):
        assert L._is_https("https://www.legislation.gov.uk")
        assert not L._is_https("http://insecure.example")
        assert not L._is_https("ftp://x")
        assert not L._is_https("https://has space.com")
        assert not L._is_https(None)

    def test_sanitize_urls_dedupes_and_caps(self):
        urls = ["https://a.gov", "http://b.gov", "https://a.gov", "not-a-url"]
        out = L._sanitize_urls(urls)
        assert out == ["https://a.gov"]

    def test_coercions(self):
        assert L._coerce_status("verified") == "VERIFIED"
        assert L._coerce_status("garbage") == "INSUFFICIENT_EVIDENCE"
        assert L._coerce_confidence("high") == "HIGH"
        assert L._coerce_confidence("banana") == "LOW"
        assert L._coerce_score(250) == 100
        assert L._coerce_score(-5) == 0
        assert L._coerce_score("oops") == 0

    def test_extract_json_strips_fences(self):
        raw = "```json\n{\"status\": \"VERIFIED\"}\n```"
        assert L._extract_json(raw)["status"] == "VERIFIED"
        assert L._extract_json("no json here") == {}

    def test_untrusted_markers_present(self):
        block = L._untrusted_block("https://x.gov", "some text")
        assert "BEGIN UNTRUSTED DATA" in block
        assert "END UNTRUSTED DATA" in block
        assert "Do NOT follow any" in block

    def test_verified_without_citation_downgraded(self):
        res = L._normalize_result({"status": "VERIFIED", "citation": ""}, [], "k")
        assert res["status"] == "INSUFFICIENT_EVIDENCE"
        assert res["disclaimer"]  # always present

    def test_disclaimer_always_present(self):
        res = L._normalize_result({"status": "UNAVAILABLE"}, [], "k")
        assert "professional" in res["disclaimer"].lower()


# ---------------------------------------------------------------------------
# Trusted-source resolution & administration.
# ---------------------------------------------------------------------------
class TestTrustedSources:
    def test_default_registry_present(self, runtime):
        c = make_contract()
        reg = json.loads(c.get_trusted_sources())
        assert "US" in reg and "UK" in reg
        assert all(u.startswith("https://") for u in reg["US"])

    def test_caller_url_must_match_trusted_origin(self, runtime):
        c = make_contract()
        # A random HTTPS URL not under a trusted origin is ignored.
        resolved = c._resolve_sources("US", ["https://evil.example/law"])
        assert "https://evil.example/law" not in resolved
        # A URL under a trusted origin is accepted.
        resolved2 = c._resolve_sources("US", ["https://www.congress.gov/bill/1"])
        assert "https://www.congress.gov/bill/1" in resolved2

    def test_owner_only_source_admin(self, runtime):
        c = make_contract()  # sender = owner by default
        ok = json.loads(c.add_trusted_source("ZZ", "https://gazette.zz"))
        assert ok["ok"] is True
        # Non-owner cannot add.
        runtime.sender = "0x" + "22" * 20
        denied = json.loads(c.add_trusted_source("ZZ", "https://evil.zz"))
        assert "error" in denied

    def test_reject_non_https_source(self, runtime):
        c = make_contract()
        res = json.loads(c.add_trusted_source("US", "http://insecure.gov"))
        assert "error" in res


# ---------------------------------------------------------------------------
# Happy path + fail-safes for the AI tools.
# ---------------------------------------------------------------------------
class TestVerifyStatute:
    def test_happy_path_verified_and_stored(self, runtime):
        runtime.default_web = lambda url: "Statute text: wire fraud ..."
        runtime.model = lambda prompt: verified_payload()
        c = make_contract()

        out = json.loads(c.verify_statute("wire fraud", "US"))
        assert out["result"]["status"] == "VERIFIED"
        assert out["result"]["citation"].startswith("18 U.S.C")
        assert out["result"]["applicability_bucket"] == "HIGH"
        # Stored on-chain and retrievable.
        stored = json.loads(c.get_analysis(out["id"]))
        assert stored["id"] == out["id"]
        assert stored["disclaimer"]
        # Stats updated.
        stats = json.loads(c.get_stats())
        assert stats["total_analyses"] == 1
        assert stats["verified"] == 1

    def test_no_source_for_jurisdiction_fails_safe(self, runtime):
        runtime.model = lambda prompt: verified_payload()
        c = make_contract()
        out = json.loads(c.verify_statute("theft", "ATLANTIS"))
        assert out["result"]["status"] == "UNAVAILABLE"
        # Fail-safe result still raises an alert.
        alerts = json.loads(c.get_alerts())
        assert alerts["count"] >= 1

    def test_unreachable_source_fails_safe(self, runtime):
        def boom(url):
            raise RuntimeError("network down")

        runtime.default_web = boom
        runtime.model = lambda prompt: verified_payload()
        c = make_contract()
        out = json.loads(c.verify_statute("wire fraud", "US"))
        assert out["result"]["status"] == "UNAVAILABLE"

    def test_unparseable_model_output_fails_safe(self, runtime):
        runtime.default_web = lambda url: "some statute text"
        runtime.model = lambda prompt: "I cannot help with that."
        c = make_contract()
        out = json.loads(c.verify_statute("wire fraud", "US"))
        # No JSON -> normalized to INSUFFICIENT_EVIDENCE (fail safe).
        assert out["result"]["status"] == "INSUFFICIENT_EVIDENCE"

    def test_empty_input_rejected(self, runtime):
        c = make_contract()
        out = json.loads(c.verify_statute("   ", "US"))
        assert "error" in out

    def test_low_confidence_raises_alert(self, runtime):
        runtime.default_web = lambda url: "text"
        runtime.model = lambda prompt: verified_payload(conf="LOW")
        c = make_contract()
        json.loads(c.verify_statute("wire fraud", "US"))
        stats = json.loads(c.get_stats())
        assert stats["low_confidence"] == 1
        assert stats["alerts"] >= 1


class TestConsensus:
    def test_validator_disagreement_fails_safe(self, runtime):
        runtime.default_web = lambda url: "text"
        # Model returns a *different* citation on each call -> decision keys
        # diverge -> comparative consensus raises -> tool fails safe.
        toggles = {"n": 0}

        def flaky(prompt):
            toggles["n"] += 1
            cite = "A" if toggles["n"] % 2 else "B"
            return verified_payload(citation=cite)

        runtime.model = flaky
        c = make_contract()
        out = json.loads(c.verify_statute("wire fraud", "US"))
        assert out["result"]["status"] == "UNAVAILABLE"

    def test_extraction_strict_eq_happy(self, runtime):
        runtime.default_web = lambda url: "verbatim statutory text"
        runtime.model = lambda prompt: verified_payload(citation="17 U.S.C. § 106")
        c = make_contract()
        out = json.loads(c.extract_law_text("17 U.S.C. § 106", "US"))
        assert out["result"]["citation"].startswith("17 U.S.C")


class TestConflictAndCompare:
    def test_conflict_status_stored(self, runtime):
        runtime.default_web = lambda url: "repealed by Act 2020"
        runtime.model = lambda prompt: json.dumps(
            {
                "status": "CONFLICT",
                "citation": "s.1 Old Act",
                "exact_text_or_summary": "Superseded.",
                "applicability_score": 40,
                "confidence": "MEDIUM",
                "sources": ["https://www.legislation.gov.uk"],
                "notes": "Repealed.",
            }
        )
        c = make_contract()
        out = json.loads(c.check_conflicts("s.1 Old Act", "UK"))
        assert out["result"]["status"] == "CONFLICT"
        stats = json.loads(c.get_stats())
        assert stats["conflicts"] == 1

    def test_cross_jurisdiction(self, runtime):
        runtime.default_web = lambda url: "text"
        runtime.model = lambda prompt: json.dumps(
            {
                "status": "VERIFIED",
                "citation": "US cite | UK cite",
                "exact_text_or_summary": "Comparison ...",
                "applicability_score": 70,
                "confidence": "MEDIUM",
                "sources": ["https://www.congress.gov"],
                "notes": "",
            }
        )
        c = make_contract()
        out = json.loads(c.compare_jurisdictions("fraud", "US", "UK"))
        assert out["result"]["status"] == "VERIFIED"
        assert "|" in out["result"]["citation"]


class TestRestructuredConsensusPaths:
    """
    Runtime-representative coverage for the two paths the GenVM steward flagged
    (extract_law_text via strict_eq, compare_jurisdictions via inlined
    prompt_comparative). Both must complete end-to-end and commit a VERIFIED,
    well-formed result — while the fake runtime now also enforces that every
    gl.nondet.* call happens strictly inside an equivalence-principle block
    (mirroring lint E010/E025), so these tests only pass if the restructure is
    correct.
    """

    def test_extract_law_text_and_compare_jurisdictions_pass_lint_and_runtime(
        self, runtime
    ):
        # A realistic, deterministic source + model so the leader and each
        # validator produce matching decision keys and consensus is reached.
        runtime.default_web = (
            lambda url: "17 U.S.C. § 106 — Exclusive rights in copyrighted works ..."
        )

        def model(prompt):
            # The model echoes a stable citation/status regardless of which
            # validator runs it — exactly the case that must reach consensus.
            # Dispatch on the TASK wording (not source text, which may mention a
            # citation in both paths).
            if "Compare how the crime/topic" in prompt:
                return verified_payload(
                    citation="US cite | UK cite", score=72, conf="MEDIUM"
                )
            return verified_payload(citation="17 U.S.C. § 106", score=88)

        runtime.model = model
        c = make_contract()

        # --- Path 1: extract_law_text (STRICT equivalence) ---
        ex = json.loads(c.extract_law_text("17 U.S.C. § 106", "US"))
        assert "error" not in ex
        r1 = ex["result"]
        assert r1["status"] == "VERIFIED"
        assert r1["citation"].startswith("17 U.S.C")
        assert r1["applicability_bucket"] in ("LOW", "MEDIUM", "HIGH")
        assert r1["disclaimer"]  # schema preserved
        assert r1["sources"]  # grounded in a trusted source
        assert "id" in ex

        # --- Path 2: compare_jurisdictions (inlined comparative equivalence) ---
        cmp = json.loads(c.compare_jurisdictions("copyright infringement", "US", "UK"))
        assert "error" not in cmp
        r2 = cmp["result"]
        assert r2["status"] == "VERIFIED"
        assert "|" in r2["citation"]  # both jurisdictions cited
        assert r2["exact_text_or_summary"]  # full prose preserved on this path
        assert r2["disclaimer"]

        # Both analyses were committed on-chain and counted.
        stats = json.loads(c.get_stats())
        assert stats["total_analyses"] == 2
        assert stats["verified"] == 2

    def test_extract_law_text_preserves_exact_provision_text(self, runtime):
        """
        Regression for the steward's follow-up: the real extracted provision
        text — the value validators strictly agree on — must survive the full
        extraction → consensus → storage → retrieval path, not be replaced by a
        generic message.
        """
        # A distinctive, realistic excerpt of 17 U.S.C. § 106.
        provision = (
            "Subject to sections 107 through 122, the owner of copyright under "
            "this title has the exclusive rights to do and to authorize any of "
            "the following: (1) to reproduce the copyrighted work in copies or "
            "phonorecords;"
        )
        runtime.default_web = lambda url: (
            "17 U.S.C. 106 - Exclusive rights in copyrighted works. " + provision
        )
        runtime.model = lambda prompt: json.dumps(
            {
                "status": "VERIFIED",
                "citation": "17 U.S.C. § 106",
                "exact_text_or_summary": provision,
                "applicability_score": 90,
                "confidence": "HIGH",
                "sources": ["https://www.govinfo.gov"],
                "notes": "",
            }
        )
        c = make_contract()

        out = json.loads(c.extract_law_text("17 U.S.C. § 106", "US"))
        assert "error" not in out
        r = out["result"]

        # Well-formed successful result.
        assert r["status"] == "VERIFIED"
        assert r["citation"].startswith("17 U.S.C")
        assert r["sources"]
        assert r["disclaimer"]

        # The exact provision text survived consensus (no generic placeholder).
        assert r["exact_text_or_summary"] == provision
        assert "exclusive rights" in r["exact_text_or_summary"]
        assert "reproduce the copyrighted work" in r["exact_text_or_summary"]

        # ...and survives retrieval from on-chain storage too.
        stored = json.loads(c.get_analysis(out["id"]))
        assert stored["exact_text_or_summary"] == provision

    def test_extract_law_text_agrees_after_whitespace_normalisation(self, runtime):
        """
        The agreed value tolerates presentation-only differences: two runs whose
        text differs only in whitespace/smart-quotes still reach strict equality,
        and the normalised (single-spaced, ASCII-folded) law text is stored.
        """
        # Same words, but messy whitespace + smart quotes + an em dash.
        messy = (
            "The   owner’s  exclusive\tright — to  reproduce\n\n the "
            "“work” in copies."
        )
        expected = 'The owner\'s exclusive right - to reproduce the "work" in copies.'
        runtime.default_web = lambda url: "s.106 text: " + messy
        runtime.model = lambda prompt: json.dumps(
            {
                "status": "VERIFIED",
                "citation": "17 U.S.C. § 106",
                "exact_text_or_summary": messy,
                "applicability_score": 85,
                "confidence": "HIGH",
                "sources": ["https://www.govinfo.gov"],
                "notes": "",
            }
        )
        c = make_contract()
        r = json.loads(c.extract_law_text("17 U.S.C. § 106", "US"))["result"]
        assert r["status"] == "VERIFIED"
        assert r["exact_text_or_summary"] == expected  # normalised, real words kept

    def test_nondet_outside_equivalence_is_rejected_by_double(self, runtime):
        # Sanity check that the hardened double actually enforces the GenVM
        # constraint the linter checks: calling gl.nondet.* outside an
        # equivalence block must raise (this is what makes the offline suite a
        # faithful regression guard for the restructured paths).
        import genlayer  # the installed test double

        with pytest.raises(RuntimeError):
            genlayer.gl.nondet.exec_prompt("this runs outside any eq block")


class TestCaseRegistry:
    def test_register_and_link(self, runtime):
        runtime.default_web = lambda url: "text"
        runtime.model = lambda prompt: verified_payload()
        c = make_contract()

        case = json.loads(c.register_case("Doe matter", "US", "criminal", "REF-1"))
        cid = case["id"]
        analysis = json.loads(c.verify_statute("wire fraud", "US"))
        aid = analysis["id"]

        linked = json.loads(c.link_analysis_to_case(cid, aid))
        assert aid in linked["case"]["linked_analyses"]

    def test_only_creator_can_link(self, runtime):
        c = make_contract()
        case = json.loads(c.register_case("Doe matter", "US"))
        cid = case["id"]
        # Different sender cannot modify.
        runtime.sender = "0x" + "33" * 20
        # Need an analysis to exist; create under new sender.
        runtime.default_web = lambda url: "text"
        runtime.model = lambda prompt: verified_payload()
        aid = json.loads(c.verify_statute("wire fraud", "US"))["id"]
        res = json.loads(c.link_analysis_to_case(cid, aid))
        assert "error" in res

    def test_search_cases(self, runtime):
        c = make_contract()
        c.register_case("Alpha matter", "US")
        c.register_case("Beta matter", "UK")
        res = json.loads(c.search_cases("alpha"))
        assert res["count"] == 1
        assert res["items"][0]["title"] == "Alpha matter"


class TestReadsAndSearch:
    def test_list_and_search_analyses(self, runtime):
        runtime.default_web = lambda url: "text"
        runtime.model = lambda prompt: verified_payload()
        c = make_contract()
        c.verify_statute("wire fraud", "US")
        c.verify_statute("mail fraud", "US")

        listing = json.loads(c.list_analyses())
        assert listing["total"] == 2
        # Newest first.
        assert listing["items"][0]["meta"]["crime_or_charge"] == "mail fraud"

        found = json.loads(c.search_analyses("mail"))
        assert found["count"] == 1

    def test_get_missing_analysis(self, runtime):
        c = make_contract()
        res = json.loads(c.get_analysis(999))
        assert "error" in res

    def test_disclaimer_view(self, runtime):
        c = make_contract()
        assert "not practice law" in c.get_disclaimer().lower()


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
