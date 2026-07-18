---
issue: 618
issue_title: "pi-autoformat: real-CLI acceptance tests flake under concurrent workspace test runs"
---

# Retro: #618 — Real-CLI acceptance harness timeout

## Stage: Planning (2026-05-24T00:00:00Z)

### Session summary

Planned the fix for the real-`pi`-CLI acceptance flake: the harness `timeoutMs = 10_000` in `test/helpers/rpc.ts` blows under `pnpm -r run test` cross-package contention.
The operator chose direction A (raise the harness timeout) with an env-overridable raised default.
Plan raises the default to 30 s, adds an env-parameterized `resolveRpcTimeoutMs` / `rpcVitestTimeoutMs` seam gated on `PI_AUTOFORMAT_RPC_TIMEOUT_MS`, derives each acceptance file's Vitest budget from the harness timeout plus a margin, and documents the knob in `docs/testing.md`.

### Observations

- Issue #67 already touched this surface but explicitly deferred the harness `timeoutMs` change ("Non-Goals: Changing `runRpcSession`'s internal `timeoutMs` default") — #618 is that deferred decision.
  #67's "Vitest budget must exceed harness budget" invariant lived only in plan prose; this plan makes it structural (budget = harness + margin) and pins it with a unit assertion.
- Two files spawn the real CLI (`acceptance.test.ts`, `acceptance-event-bus.test.ts`) — matching the "2 flakes" in the #596/#597 retros.
  `fallback-acceptance.test.ts` is named "acceptance" but does not spawn the CLI, so it is out of scope.
- Rejected directions: retry-once (B) adds control flow and doubles worst-case failure time; in-package serialization (C) cannot fix cross-package contention since `pnpm -r` runs each package's vitest as its own process.
  Both noted as future levers in Non-Goals; the cross-package root cause is mitigated, not removed.
- Release: ship independently — the substantive change is `test:`-scoped (hidden changelog type); the shipped `docs/testing.md` update (`docs(pi-autoformat):`, `docs/*.md` is in the `files` allowlist) is the unhidden type that carries the release.
- Env name follows the package's `PI_AUTOFORMAT_` convention (`PI_AUTOFORMAT_RECORDER_LOG`, `PI_AUTOFORMAT_LLM_TESTS`).
- No architecture roadmap exists for pi-autoformat, so no `✅` step-mark / Mermaid node doc update applies.
