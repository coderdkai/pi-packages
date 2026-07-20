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

[#599]: https://github.com/gotgenes/pi-packages/issues/599
[#620]: https://github.com/gotgenes/pi-packages/issues/620
