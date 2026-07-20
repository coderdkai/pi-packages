---
issue: 600
issue_title: "pi-permission-model-judge: dogfood package for the deny-first typo-path Authorizer"
---

# Retro: #600 — pi-permission-model-judge: dogfood package for the deny-first typo-path Authorizer

## Stage: Planning (2026-07-18T00:00:00Z)

### Session summary

Planned a new first-party monorepo package, `@gotgenes/pi-permission-model-judge`, that consumes the `registerAuthorizer` seam ([#599]) and implements ADR 0007's deny-first typo-path reviewer (verdicts `deny | defer` only).
Read ADR 0007, the Phase 12 Track B roadmap, the shipped seam (`service.ts`, `authorizer.ts`, `authorizer-selection.ts`, `authorizer-chain.ts`, `delegation-envelope.ts`), the `@earendil-works/pi-ai` `complete` surface, and the pi-autoformat package as a scaffold reference.
Produced an 8-cycle TDD plan filed at `packages/pi-permission-model-judge/docs/plans/0600-dogfood-model-judge-authorizer.md`.

### Observations

- First-party issue (author `gotgenes` = gh CLI user), so the proposal was treated as the working hypothesis; three implementation-level ambiguities were surfaced via `ask_user`.
- Operator decisions: (1) typo detection = **config regex pre-filter (`typoPatterns`) + model confirms** the typo and writes the teaching reason; (2) review scope = **`external_directory` only, hardcoded** (defer all other surfaces cheaply); (3) config loading = **hand-rolled layered loader using zod** for the schema (no `@gotgenes/pi-subagents/settings` dependency), mirroring pi-permission-system's ADR 0004.
- The `Symbol.for()` service accessor makes a separate-copy consumer work: under `linkWorkspacePackages: false` this package imports a registry copy of pi-permission-system, but `getPermissionsService()` reads the same process-global slot the loaded workspace extension published.
  A wiring test pins this.
- The delegation envelope only caps `allow` on excluded surfaces; an `external_directory` `deny` passes through unchanged — so the deny-first reviewer's core output is honored as-is.
  Verified in `delegation-envelope.ts`.
- Fail-safe is the throughline: missing model, invalid config, timeout, parse failure, or model uncertainty all resolve to `defer` (more prompting, never less — ADR 0007 invariant 2).
- Two deferred concerns recorded as Open Questions rather than filed: [#620] already tracks the allow-capable slice 2; and the pi-permission-system roadmap `✅` step-mark for Step 6 is a sibling-doc edit to confirm at ship time, not silently drop.
- Version-coupling risk flagged: the package peer/dev-depends on a published pi-permission-system that includes `registerAuthorizer`; verify `npm view` at implementation time and pin the dev dependency accordingly.
- Plan and retro filed in the new package's own `docs/{plans,retro}/`; the wiring step adds both to `release-please-config.json` `exclude-paths`.

## Stage: Implementation — TDD (2026-07-19T13:00:00Z)

### Session summary

Implemented the entire `@gotgenes/pi-permission-model-judge` package across 8 TDD cycles (plus a monorepo-wiring correction and a pi-permission-system roadmap-mark commit): zod config schema + layered loader, typo-pattern matching, model confirmation via `@earendil-works/pi-ai` `complete`, the deny-first `external_directory` reviewer, extension registration on `permissions:ready`, and the generated JSON schema + example.
Added 37 tests across 6 files, all green; `pnpm run check`/`lint`/`test` and `pnpm fallow dead-code` all pass from the root.
Pre-completion reviewer returned **PASS**.

### Observations

Deviations from the plan, all judged sound by the reviewer:

- `model-resolver.ts` was folded into `model-review.ts` as the `ModelRegistryLike` ISP type with inline resolution in the reviewer — the plan's separate module would have been a pure-relay wrapper (procedure-splitting), so folding it avoided an indirection layer.
- Added a per-package `biome.json` disabling `noExplicitAny` (not in the plan), mirroring pi-subagents' precedent: the pi-ai `Model<any>` SDK type is unavoidable and trips biome (but not eslint) in `src/`. pi-subagents ships the identical override for the same reason.
- `buildModelJudgeJsonSchema` uses `io: "input"` so defaulted fields (`typoPatterns`, `timeoutMs`) are not marked `required` in the published JSON schema — correct input-semantics for a config file where zod fills omitted defaults.
- The extension registers the link from **both** `session_start` and `permissions:ready` (idempotent dual-trigger via a `dispose` guard), not the plan sketch's ready-only path.
  This handles a real ordering hazard: pi-permission-system emits `permissions:ready` inside its own `session_start`, which can run before this extension's `session_start` (config not yet loaded).
  Both orderings plus double-fire are tested.
- The plan's `.pi/settings.json` `npm:@gotgenes/pi-permission-model-judge` disable entry was added then reverted: the package is unpublished, so the entry makes Pi (and the subagent launcher) try to `npm install` a nonexistent package — which actually broke the first two pre-completion-reviewer dispatches until the entry was removed.
  AGENTS.md's own wording ("once it is in global settings") confirms the entry belongs only after the first publish; re-add it then.

Other notes:

- Verified the published `@gotgenes/pi-permission-system@20.9.0` tarball exports `registerAuthorizer` + the needed types before building against it — the plan's version-coupling risk is closed.
- `pnpm install` appended `@gotgenes/pi-permission-system@20.9.0` to `pnpm-workspace.yaml` `minimumReleaseAgeExclude` (freshly published within the supply-chain cutoff); staged with the first feat commit.
- Marked pi-permission-system Phase 12 Step 6 `✅` (heading + Mermaid node + `Landed:` note) in the implementation doc-update commit rather than deferring; the architecture path is release-excluded, so it cuts no sibling release.
  The full Phase 12 phase-close (metrics recompute, [#565] sweep, history file) remains pi-permission-system's own concern.
- Reviewer verdict: **PASS** — no WARN findings; ready for `/ship-issue`.

[#565]: https://github.com/gotgenes/pi-packages/issues/565
[#599]: https://github.com/gotgenes/pi-packages/issues/599
[#620]: https://github.com/gotgenes/pi-packages/issues/620
