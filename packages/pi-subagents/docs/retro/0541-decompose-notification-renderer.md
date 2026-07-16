---
issue: 541
issue_title: "pi-subagents Phase 20 Step 7: decompose the notification renderer"
---

# Retro: #541 — pi-subagents Phase 20 Step 7: decompose the notification renderer

## Stage: Planning (2025-06-16T00:00:00Z)

### Session summary

Planned the decomposition of the `createNotificationRenderer` arrow in `src/observation/renderer.ts` into three pure, theme-free helpers (`resolveStatusPresentation`, `buildStatsParts`, `buildPreviewLines`) with the arrow reduced to a thin composing wrapper.
The plan is a behavior-neutral `refactor:` landing across four TDD steps, filed at `packages/pi-subagents/docs/plans/0541-decompose-notification-renderer.md`.

### Observations

- Verified each extracted helper returns a value and owns a real decision (status→presentation OCP dispatch, stat selection, truncation) — not procedure-splitting, per the `code-design` gate.
- `buildStatsParts` takes an ISP-narrowed `Pick<NotificationDetails, …>` (`StatsSource`) rather than the full details type, matching the file's existing narrow-interface discipline from Step 5 (`#539`).
- Chose to keep the `⎿` marker, indentation, and `theme.fg` styling in the wrapper (presentation) so the exact whitespace layout is preserved; helpers return only content lines.
- Release marker is `ship independently`; noted explicitly that a `refactor:`-only plan cuts no release on its own and auto-batches into the next unhidden release (per AGENTS.md, so as not to over-claim).
- Flagged the Step 5 narrow-`RendererTheme` invariant as at-risk, pinned by the two-method `stubTheme()` in the existing test — the refactor strengthens it (helpers need no theme) and must not widen the interface.
- Architecture-doc step-mark (heading `✅`, Mermaid `S7` node, `Landed:` note) is listed as an expected doc update landed by `/tdd-plan` at completion, not deferred.
- No follow-up issues filed — nothing deferred.

## Stage: Implementation — TDD (2025-06-16T01:00:00Z)

### Session summary

Executed all four TDD steps from the plan: extracted `resolveStatusPresentation`, `buildStatsParts`, and `buildPreviewLines` as pure, exported helpers from the `createNotificationRenderer` arrow in `src/observation/renderer.ts`, then pruned one redundant wrapper test.
Each helper landed in its own red→green→commit cycle; the `tidy-first-assessor` found no preparatory refactoring warranted before starting.
Package test count went `975 → 991`; the pre-completion reviewer returned PASS.

### Observations

- `tidy-first-assessor` recommended no preparatory commits — the arrow was already visually segmented by `// Line 1:`–`// Line 4:` comments that mapped 1:1 onto the plan's three helpers, so the extraction itself was the tidying.
- Had to correct the `buildStatsParts` test's expected format strings during Red: `formatTurns` returns `⟳5≤10` (not `5/10 turns`), `formatTokens` returns `1.0k token` (singular), and `formatMs` returns `5.0s` (not `5s`) — worth re-reading a formatter's actual output before writing assertions against it, rather than inferring the shape from its name.
- In TDD step 4, pruned the `renders steered status as completed (steered)` wrapper test as fully subsumed by the new `resolveStatusPresentation` steered-case unit test (no unique composition detail beyond what the `completed`/`error` wrapper tests already establish for theme wrapping).
  All other wrapper tests were kept — each exercises genuine multi-piece theme composition (icon + bold description + dim status, or the per-line `theme.fg` loop in expanded mode) that the theme-free pure helpers cannot cover.
- Verified the plan's quantitative claim (`renderer.ts` off the fallow triage list) directly via `fallow health --targets --format json` (empty `targets` array covering the file) and `fallow dead-code` (zero issues), rather than trusting the human-readable output.
- Architecture-doc update (✅ Step 7 heading, `Landed:` note, Mermaid `S7` node) landed as its own `docs:` commit at completion, per the roadmap step-mark convention — Phase 20's phase-status row was correctly left unflipped since Steps 8–9 remain incomplete.
- Pre-completion reviewer: **PASS** — all deterministic checks, doc updates, design review, Mermaid rendering, dead-code gate, and the Step 5 (`#539`) narrow-`RendererTheme` invariant (strengthened, not just preserved) confirmed clean.
  No WARN findings.
