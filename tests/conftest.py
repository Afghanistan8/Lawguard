"""
Test harness for Lawguard.

The Lawguard contract targets the GenLayer GenVM runtime, which is not present
in an ordinary CI/dev environment. To keep the test suite runnable with plain
``pytest`` (``pip install pytest`` and go), this conftest installs a faithful
*test double* of the ``genlayer`` module BEFORE the contract is imported.

The double implements exactly the surface Lawguard uses:

* ``gl.Contract``                       — a plain base class
* ``gl.public.view`` / ``gl.public.write`` — pass-through decorators
* ``gl.message.sender_address``         — a settable current sender
* ``gl.nondet.web.render(url, mode)``   — routed to a pluggable fake fetcher
* ``gl.nondet.exec_prompt(prompt)``     — routed to a pluggable fake model
* ``gl.eq_principle.strict_eq / prompt_comparative`` — run the callable and,
  to emulate leader/validator agreement, run it a second time and require the
  decision keys to match (mismatch raises, exercising the fail-safe path)
* storage types ``TreeMap``, ``DynArray``, ``u256``, ``Address``

When run inside a real GenLayer test environment where ``genlayer`` is already
importable, the double is skipped automatically.
"""

import sys
import types

import pytest


# ---------------------------------------------------------------------------
# Pluggable behaviour the tests can control.
# ---------------------------------------------------------------------------
class FakeRuntime:
    """Holds the fetcher/model behaviour and the current message sender."""

    def __init__(self):
        # url -> text, or a callable(url) -> text (raise to simulate failure)
        self.web_responses = {}
        self.default_web = None  # callable(url) or None
        # callable(prompt) -> str
        self.model = lambda prompt: '{"status":"UNAVAILABLE"}'
        self.sender = "0x" + "11" * 20
        # Depth counter mirroring the real GenVM constraint: gl.nondet.* may only
        # execute *inside* an equivalence-principle block. eq_principle wrappers
        # increment this while running the leader/validator callables; fetch()
        # and prompt() refuse to run when it is zero. This makes the offline
        # double reject the same patterns the real linter rejects (E010: nondet
        # outside an eq block) rather than silently passing.
        self.in_eq = 0

    def _require_eq_context(self, what):
        if self.in_eq <= 0:
            raise RuntimeError(
                f"non-deterministic {what} called outside an equivalence "
                "principle block — forbidden by GenVM (mirrors lint E010/E025)."
            )

    def fetch(self, url, mode="text"):
        self._require_eq_context("web.render")
        if url in self.web_responses:
            r = self.web_responses[url]
            return r(url) if callable(r) else r
        if self.default_web is not None:
            return self.default_web(url)
        raise RuntimeError(f"no fake response for {url}")

    def prompt(self, prompt):
        self._require_eq_context("exec_prompt")
        return self.model(prompt)


RUNTIME = FakeRuntime()


# ---------------------------------------------------------------------------
# Minimal storage collection doubles.
# ---------------------------------------------------------------------------
class _TreeMap(dict):
    # Support the generic annotation form ``TreeMap[u256, str]``.
    def __class_getitem__(cls, item):
        return cls

    def get(self, key, default=""):
        return super().get(key, default)


class _DynArray(list):
    def __class_getitem__(cls, item):
        return cls


class _Address:
    def __init__(self, value):
        self._v = str(value)

    def __eq__(self, other):
        return isinstance(other, _Address) and other._v == self._v

    def __ne__(self, other):
        return not self.__eq__(other)

    def __hash__(self):
        return hash(self._v)

    @property
    def as_hex(self):
        return self._v


def _u256(v):
    # Plain int is a faithful stand-in for on-chain u256 in tests.
    return int(v)


def _install_fake_genlayer():
    if "genlayer" in sys.modules:
        return  # real runtime present

    mod = types.ModuleType("genlayer")

    # ---- gl namespace ----
    gl = types.SimpleNamespace()

    class Contract:
        """
        Base that mirrors GenVM behaviour: annotated storage fields are
        auto-instantiated before the subclass ``__init__`` runs.
        """

        def __new__(cls, *args, **kwargs):
            self = object.__new__(cls)
            anns = {}
            for klass in reversed(cls.__mro__):
                anns.update(getattr(klass, "__annotations__", {}))
            for name, ann in anns.items():
                if ann is _TreeMap:
                    setattr(self, name, _TreeMap())
                elif ann is _DynArray:
                    setattr(self, name, _DynArray())
                elif ann is _Address:
                    setattr(self, name, _Address(RUNTIME.sender))
                elif ann is _u256 or getattr(ann, "__name__", "") == "_u256":
                    setattr(self, name, 0)
                elif ann is str:
                    setattr(self, name, "")
            return self

    gl.Contract = Contract

    # decorators
    def _identity(fn):
        return fn

    gl.public = types.SimpleNamespace(view=_identity, write=_identity)

    # message
    gl.message = types.SimpleNamespace()

    class _Msg:
        @property
        def sender_address(self):
            return _Address(RUNTIME.sender)

    gl.message = _Msg()

    # nondet
    web = types.SimpleNamespace(render=lambda url, mode="text": RUNTIME.fetch(url, mode))
    gl.nondet = types.SimpleNamespace(
        web=web,
        exec_prompt=lambda prompt: RUNTIME.prompt(prompt),
    )

    # equivalence principle — emulate leader + validator agreement.
    #
    # Each wrapper marks that we are INSIDE an equivalence block while it runs
    # the callable(s), so any gl.nondet.* the contract performs is only allowed
    # here (see FakeRuntime._require_eq_context). This mirrors the real GenVM /
    # linter constraint at runtime.
    def _run_in_eq(fn):
        RUNTIME.in_eq += 1
        try:
            return fn()
        finally:
            RUNTIME.in_eq -= 1

    def _canonical(value):
        """Canonicalise for byte-equivalent comparison, like calldata encoding."""
        try:
            return json.dumps(value, sort_keys=True, separators=(",", ":"))
        except Exception:
            return repr(value)

    def _strict_eq(fn):
        # Leader and each validator run the SAME callable; the result must be a
        # deterministic, canonical value (the contract returns a sorted JSON
        # string). Compared canonically so dict ordering can never mask a
        # divergence.
        leader = _run_in_eq(fn)
        validator = _run_in_eq(fn)
        if _canonical(leader) != _canonical(validator):
            raise RuntimeError("validators disagreed (strict_eq)")
        return leader

    def _prompt_comparative(fn, principle=""):
        leader = _run_in_eq(fn)
        validator = _run_in_eq(fn)
        # Compare only the decision-critical keys, mirroring the principle.
        def key(d):
            if not isinstance(d, dict):
                return d
            return (
                d.get("status"),
                str(d.get("citation", "")).strip().lower(),
                d.get("applicability_bucket"),
                d.get("confidence"),
            )
        if key(leader) != key(validator):
            raise RuntimeError("validators disagreed (comparative)")
        return leader

    def _prompt_non_comparative(fn, task="", criteria=""):
        return _run_in_eq(fn)

    gl.eq_principle = types.SimpleNamespace(
        strict_eq=_strict_eq,
        prompt_comparative=_prompt_comparative,
        prompt_non_comparative=_prompt_non_comparative,
    )

    mod.gl = gl
    mod.Address = _Address
    mod.TreeMap = _TreeMap
    mod.DynArray = _DynArray
    mod.u256 = _u256
    # A couple of extra names sometimes imported via `*`.
    mod.i256 = int
    mod.u8 = int
    mod.bigint = int

    # `from genlayer import *` needs these names exported.
    mod.__all__ = [
        "gl", "Address", "TreeMap", "DynArray", "u256", "i256", "u8", "bigint",
    ]

    sys.modules["genlayer"] = mod


_install_fake_genlayer()


@pytest.fixture
def runtime():
    """Reset and expose the fake runtime for each test."""
    RUNTIME.web_responses = {}
    RUNTIME.default_web = None
    RUNTIME.model = lambda prompt: '{"status":"UNAVAILABLE"}'
    RUNTIME.sender = "0x" + "11" * 20
    RUNTIME.in_eq = 0
    return RUNTIME
