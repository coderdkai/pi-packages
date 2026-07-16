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
