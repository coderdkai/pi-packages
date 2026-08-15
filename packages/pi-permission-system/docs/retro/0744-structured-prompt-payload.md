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

[#710]: https://github.com/gotgenes/pi-packages/issues/710
[#713]: https://github.com/gotgenes/pi-packages/issues/713
[#716]: https://github.com/gotgenes/pi-packages/pull/716
[#738]: https://github.com/gotgenes/pi-packages/pull/738
[ADR 0011]: https://github.com/gotgenes/pi-packages/blob/main/packages/pi-permission-system/docs/decisions/0011-prompt-presentation-contract.md
