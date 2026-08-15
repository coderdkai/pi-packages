---
issue: 744
issue_title: "pi-permission-system: introduce the structured PromptPayload and dissolve the five prompt-assembly sites"
---

# Retro: #744 — Structured `PromptPayload` and the dissolution of the ask-prompt assembly sites

## Stage: Planning (2026-08-15T05:12:37Z)

### Session summary

Planned Phase 13 Step 1: the `PromptPayload` type, the `src/presentation/` domain directory seeded with six payload builders, a transitional `renderLegacyMessage(payload)`, and display-only executed-unit extraction for bash wrappers.
Nine TDD cycles, all hidden changelog types, batched behind Step 2 ([#710]) for release.
Plan committed at `packages/pi-permission-system/docs/plans/0744-structured-prompt-payload.md`.

### Observations

- **Six assembly sites, not five.**
  Both the issue body and [ADR 0011] enumerate five.
  A grep of `src/` for the shared subject idiom (`Current agent`) found `formatPathAskPrompt` in `src/handlers/gates/path.ts`, consumed by **both** `path.ts` and `bash-path.ts`.
  The plan folds it in and lists the count correction as an architecture-doc update.
- **`executedUnit` had no source at all.**
  Issue [#713]'s body cites `classifyAndExtractWrapper`, `payloadText`, and `STRIPPABLE_WRAPPERS` — none of which exist at `main`.
  What exists is `classifyWrapperCommand`, which only *flags* a wrapper.
  So `timeout 10 grep foo` does not surface `grep foo` today, contrary to the issue's "prior work" note.
  Populating the fact required planning a new extraction module with a curated per-wrapper flag table; the operator chose full display-only extraction now over deferring it.
- **Three deliberate divergences from ADR 0011 §2's illustrative shape**, each recorded in the plan with rationale: a `kind` discriminant (nine message shapes are not separable by `(surface, source)`; mirrors `DenialContext`, which ADR §7 already praises), `| null` instead of `| undefined` (Step 3 puts the payload on the JSON wire; matches `accessFactsFromPath`'s existing `boundaryValue` convention), and `commandContext` on the request facts (so `matchQualifier` stays a render rather than a pre-rendered clause in the payload).
- **`renderLegacyMessage` as a completeness proof.**
  Of the three options offered, the operator chose a single renderer that regenerates every message from the payload alone.
  That converts the ~20 existing string assertions from redundant coverage into the proof that the payload carries everything — the alternative (builders returning `{ payload, message }`) would have left the payload unexercised until Step 2.
- **PR [#738] is an unlanded collision**, opened the day before the Phase 13 sweep and untriaged: it touches nearly every file this step rewrites.
  Disposition decided at planning — its highlight intent is adopted in Step 2's renderer with authorship credited, and the PR is closed as superseded at ship time, exactly as [#716] was handled.
  A roadmap disposition line is in the plan's doc updates.
- **`PromptPermissionDetails` is public.**
  It is re-exported through `src/service.ts` and gated by `scripts/verify-public-types.sh`, so the plan adds `PromptPayload` to that script's symbol list.
  Making `payload` required is safe for external `Authorizer` consumers (they read details, never construct them) and is confined to one cycle to absorb the six authority test files.
- **Scope kept narrow deliberately.**
  `tool-preview-formatter.ts` stays at the `src/` root — it also serves `getPermissionLogContext` on the review-log path, which Step 4 owns; its prompt output becomes an evidence entry instead.
  Gating the extracted inner command ([#713]'s second option) is explicitly declined so the wrapper floor stands unchanged.

## Stage: Implementation — TDD (2026-08-15T06:38:38Z)

### Session summary

Landed the `PromptPayload` seam across 12 commits: two tidy-first prep commits, eight `refactor:` cycles, one `docs:`, and one `test:` follow-up from the pre-completion review.
All six ask-prompt assembly sites are dissolved into `src/presentation/` builders, `message` is rendered from the payload alone by a single transitional `renderLegacyMessage`, and `PromptPermissionDetails.payload` is required.
Test count 2836 → 2944 (+108); both roadmap metrics hit target (`formatAskPrompt` refs 4 → 0, `src/presentation/` 0 → 1); behavior byte-identical.

### Observations

- **The tidy-first assessor earned its keep twice.**
  It found that `test/helpers/gate-fixtures.ts` and `test/handlers/gates/runner.test.ts` would break when `payload` became required — both absent from the plan's inventory — and that the plan's "six authority test files" was really five with local factories (plus two with inline literals).
  It also caught a live divergence: three of those factories default `agentName: null` and two default `"test-agent"` **and assert it**, so a naive fold would have silently flipped assertions.
  Landing `makePromptDetails` as a prep commit turned the type-tightening cycle into a one-line change.
- **Plan deviation — module scope.**
  The plan named `executed-unit.ts`.
  Implementing it revealed that nesting (`sudo timeout 5 xargs grep foo`) requires re-classifying each remainder, which would have meant a **second** wrapper classifier beside `classifyWrapperCommand` — connascence of algorithm on a gating-critical vocabulary.
  Shipped instead as `wrapper-analysis.ts` owning both questions, with `classifyWrapperCommand` reduced to a node adapter.
  Cost one extra commit; the classification is now directly unit-testable without a parse, which it never was.
- **The issue's own premise was wrong twice, and both were caught at planning.**
  There is a **sixth** assembler (`formatPathAskPrompt`, two consumers) that the issue and ADR 0011 both omit, and [#713]'s `classifyAndExtractWrapper`/`payloadText`/`STRIPPABLE_WRAPPERS` do not exist — so `executedUnit` had no source at all and needed a new curated extraction module rather than a field read.
- **`renderLegacyMessage` as a completeness proof worked exactly as intended.**
  Because it reads the payload and nothing else, relocating the ~29 old string assertions onto it *is* the proof that the payload carries everything the sentences said.
  Two builder bugs surfaced this way rather than in review: `getNonEmptyString` returns `null`, not `undefined` (my `=== undefined` guard emitted `(full command: 'null')`), and the first `wrapper-analysis` test helper tokenized `"rm -rf /"` into three words where tree-sitter emits one — a fixture bug that looked like five code failures.
- **`| null` over `| undefined` throughout**, diverging from ADR 0011 §2's sketch, because step 3 puts the payload on the JSON wire; `accessFactsFromPath` already set that precedent for `boundaryValue`.
  Likewise `kind` as an explicit discriminant: `(surface, source)` cannot separate the tool and bash external-directory asks.
- **`PromptEvidence.detail`** was added beyond the ADR sketch so an escaping path and its canonical alias ride one entry — a bounded render cannot show the path while eliding what it resolves to.
- **Pre-completion reviewer: PASS.**
  Two non-blocking notes: the seven descriptor tests never gained the payload assertion the plan named, and the `find -exec` terminator is excluded where the plan said "up to and including" (deliberate, tested).
  The first was addressed in a follow-up `test:` commit — but not as written: asserting mere presence is noise when `message` and `payload` come from one local and the field is required, so the tests pin *which kind and value* each gate emits, which is not structurally closed.
- **Deferred to step 2 as planned:** nothing renders `executedUnit` or `invokedToolName` yet, and PR [#738]'s highlight intent is recorded in the roadmap for the dialog renderer, with the PR closing as superseded at ship time.

[#710]: https://github.com/gotgenes/pi-packages/issues/710
[#713]: https://github.com/gotgenes/pi-packages/issues/713
[#716]: https://github.com/gotgenes/pi-packages/pull/716
[#738]: https://github.com/gotgenes/pi-packages/pull/738
[ADR 0011]: https://github.com/gotgenes/pi-packages/blob/main/packages/pi-permission-system/docs/decisions/0011-prompt-presentation-contract.md
