---
issue: 710
issue_title: "pi-permission-system: Forwarded subagent permission prompts render unbounded tool input inline and push the parent transcript out of view"
---

# Retro: #710 — Bounded local renderers for the permission dialog

## Stage: Planning (2026-08-15T07:18:11Z)

### Session summary

Planned Phase 13 Step 2: `src/presentation/dialog-renderer.ts` rendering the landed `PromptPayload` under a row budget plus a per-field width cap, wired into the inline TUI dialog and the `select`/`input` fallback, with `Ctrl+O` toggling the complete view.
Nine TDD cycles; batch `"presentation-payload"` tail, so this issue's `fix:` is the release vehicle for Step 1 ([#744]) as well.
Plan committed at `packages/pi-permission-system/docs/plans/0710-bounded-dialog-renderer.md`.

### Observations

- **The issue is third-party (`aoguai`), but the direction was already settled.**
  [ADR 0011] adopted [#710] as "fixed by construction" and the Phase 13 roadmap assigns it to Step 2, so the `ask_user` gate spent its budget on design parameters rather than on whether to build it.
- **Measured, not estimated.**
  A disposable spike over the real `wrapTextWithAnsi` put the reported case at **202 rows** local / **205 rows** forwarded for a 200-line here-string (10 236 chars), identical at widths 80/120/160 — the here-string carries its own newlines, so a wider terminal buys nothing.
  That number is the plan's baseline and becomes a regression assertion.
- **[ADR 0011] §3 and §5 only cohere under one reading, and this plan states it.**
  §3 says no budget may elide the `request` core; §5 justifies the width cap by "a here-string on one logical line" — which in this very report *is* `request.value`.
  Operator confirmed: "never elided" means never **omitted**, so a core fact always keeps its labelled line while its text may be shortened and reached in full.
  Under the alternative reading the reported ask still costs 86–202 rows and [#710] is not fixed, so this is load-bearing and goes into the architecture doc.
- **The row budget bounds evidence; the field cap bounds the core.**
  Stating the precedence explicitly (§3 outranks §5 when a capped core alone exceeds `maxRows`) avoided a shrink-to-fit algorithm that would have been fiddly to test and impossible to explain.
- **`Ctrl+O` reuse over a new key.**
  `handleToolsExpandAction` already intercepts `app.tools.expand` for the host forward ([#642]); it gains the dialog's own toggle so "expand" means one thing in both places, and the [#642] forward assertion is extended in the same cycle that adds the toggle.
- **PR [#738]'s `highlightText` field is redundant under the payload.**
  The flagged element is derivable from `request.value` (or the `external path` evidence for the bash external-directory kind), which removes the "highlight target diverges from rendered text" risk the PR guarded with tests.
  Both PR [#738] and PR [#716] close as superseded at ship, with `Co-authored-by` credit in the relevant cycles.
- **Config defaults chosen roomy:** `promptMaxRows` 24, `promptFieldMaxWidth` 400.
  The field cap does the work for the reported case (400 chars ≈ 4 rows at width 100); the row budget mostly bounds evidence.
- **Rejected:** an expansion affordance in the `select`/`input` fallback.
  [ADR 0011] §6 records that renderer as assuming none and a `select` has no keystroke channel; recorded as rationale in Open Questions rather than filed as a follow-up.
- **No follow-up issues filed.**
  Every deferral this plan names already has an issue — [#745] (wire + broadcast + preview-cap soft-deprecation), [#746] (agent + review-log renderers), [#654] (annotations), [#519] (RPC/frontend prompt surface).

[#519]: https://github.com/gotgenes/pi-packages/issues/519
[#642]: https://github.com/gotgenes/pi-packages/issues/642
[#654]: https://github.com/gotgenes/pi-packages/issues/654
[#710]: https://github.com/gotgenes/pi-packages/issues/710
[#716]: https://github.com/gotgenes/pi-packages/pull/716
[#738]: https://github.com/gotgenes/pi-packages/pull/738
[#744]: https://github.com/gotgenes/pi-packages/issues/744
[#745]: https://github.com/gotgenes/pi-packages/issues/745
[#746]: https://github.com/gotgenes/pi-packages/issues/746
[ADR 0011]: https://github.com/gotgenes/pi-packages/blob/main/packages/pi-permission-system/docs/decisions/0011-prompt-presentation-contract.md
