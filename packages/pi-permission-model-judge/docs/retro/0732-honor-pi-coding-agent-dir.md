---
issue: 732
issue_title: "pi-permission-model-judge: global config path ignores PI_CODING_AGENT_DIR, diverging from pi-permission-system"
---

# Retro: #732 — pi-permission-model-judge: global config path ignores `PI_CODING_AGENT_DIR`

## Stage: Planning (2026-08-17T17:00:34Z)

### Session summary

Confirmed the defect by reading `src/config-loader.ts` and `src/extension.ts` side by side against the installed SDK's `getAgentDir()` (`dist/config.js:393`), then chose boundary injection over a loader-internal default and wrote `docs/plans/0732-honor-pi-coding-agent-dir.md`.
Ran a disposable spike test to measure the red before planning the TDD cycle, and filed the identical `pi-autoformat` defect as a follow-up.

### Observations

- The spike was the session's most valuable step.
  A test asserting only that `registerAuthorizer` was called **passed against unfixed `main`** on this machine, because a real `~/.pi/agent/extensions/pi-permission-model-judge/config.json` exists here and the hardcoded default loaded it.
  That same test would have failed on CI — an environment-dependent false green.
  The plan therefore mandates a content-discriminating assertion (`complete` receives `systemPrompt` equal to a marker `instructions` string from the temp scope), which was measured red pre-fix and green post-fix.
- The issue proposed mirroring `pi-permission-system/src/policy-loader.ts:107`, which calls `getAgentDir()` as a loader-internal default.
  Rejected in favor of resolving at the extension boundary: `pi-permission-system/src/index.ts:56` and `pi-colgrep/src/extension.ts:59` both do it that way, and `pi-permission-system/src/permission-manager.ts:375` carries a comment explicitly framing the removal of "the hidden `getAgentDir()` env-read" as the intent.
  The `policy-loader.ts` form is the pattern being migrated away from, not the convention to copy.
- `docs/configuration.md:5` already claimed the global path "respects `PI_CODING_AGENT_DIR`", so the docs were right and the code was wrong.
  Listed under Non-Goals so implementation does not "fix" a line that becomes true.
- The `process.cwd()` default is the same class of hidden global read on the adjacent line, so it is removed in the same commit rather than split into a preparatory `refactor:`.
  A split would produce a signature-only commit with no caller change.
- All six existing `config-loader.test.ts` cases already pass `{ cwd, agentDir }` explicitly, so making both required costs zero test churn — which is what made boundary injection cheap rather than invasive.
- Every one of the seven existing `createModelJudgeExtension` tests injects `loadConfig`, so the default seam — the exact line carrying the bug — had zero coverage.
  That coverage gap is why the bug shipped, and closing it is the point of the new test.
- Filed [#762] for the byte-identical defect in `packages/pi-autoformat/src/config-loader.ts:61` / `src/extension.ts:625`.
  Noted but did not file: `packages/pi-session-tools/src/session-file.ts:59` computes `DEFAULT_SESSIONS_ROOT` from `homedir()` at module scope, which may be deliberate.
- Classified as `fix:`, not `fix!:`, per the operator's choice of a clean fix with no legacy fallback.
  The behavior change on upgrade is real but narrow, and is called out in the commit body and the close comment.

## Stage: Implementation — TDD (2026-08-17T17:31:51Z)

### Session summary

Landed the plan's single TDD cycle plus one Tidy-First preparatory commit: `config-loader.ts` no longer reads `homedir()` or `process.cwd()`, and `extension.ts` supplies both scopes with `agentDir` resolved from the SDK's `getAgentDir()`.
Package tests went 47 → 48; `check`, root `lint`, full `test`, and `fallow dead-code` are green, and the pre-completion reviewer returned PASS.

### Observations

- The `tidy-first-assessor` returned exactly one Recommended item — widen `ctxWithRegistry()` to take a `cwd` — and it was the right call: the new test is the first in that file to need a `ctx.cwd` other than the hardcoded `"/project"` while still needing the same `modelRegistry` shape.
  Its Optional `RegisteredAuthorizer` type alias was folded into the same `refactor:` commit so the `fix:` commit stayed purely behavioral.
- It explicitly declined two things worth recording: a `driveAuthorizer()` helper wrapping the system-under-test call (against the `testing` skill's rule that the repeated act *is* the test subject), and sharing a temp-config fixture with `config-loader.test.ts` (same mechanics, different logical purpose — unit-testing merge semantics vs. an end-to-end wiring fixture).
  It also checked, rather than assumed, that Vitest's outer-then-inner `beforeEach` / inner-then-outer `afterEach` ordering lets a nested `describe` add env stubbing without fighting the file-scoped hooks.
- The planning session's spike paid off exactly as intended.
  The landed red was `complete` called 0 times, not a registration failure — on this machine the link *did* register from the real `~/.pi/agent` config, which is the false green the plan predicted and designed the assertion around.
- No deviations from the plan's Module-Level Changes: all three listed files were touched and nothing listed went untouched.
  `docs/configuration.md` correctly needed no edit — it already claimed `PI_CODING_AGENT_DIR` support, so the fix made an existing line true.
- A tool call in this session tripped the permission system's own `external_directory` gate by dropping the `pi-packages/packages/` prefix from a `Read` path — the exact typo-path class this package exists to judge, and a live reminder to pass file-tool paths repo-relative.
- Pre-completion reviewer: PASS, no warnings.
  It independently confirmed the missed-caller grep, the teardown ordering, and the `fix:` (not `fix!:`) typing.

[#762]: https://github.com/gotgenes/pi-packages/issues/762
