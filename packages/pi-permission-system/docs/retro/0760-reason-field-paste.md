---
issue: 760
issue_title: "pi-permission-system: pasting a denial reason into the inline TUI permission prompt does nothing"
---

# Retro: #760 — pasting a denial reason into the inline TUI permission prompt does nothing

## Stage: Planning (2026-08-17T15:58:57Z)

### Session summary

Traced the reported bug end to end through `@earendil-works/pi-tui@0.79.1` and confirmed it: a bracketed paste arrives at `PermissionPromptComponent.handleInput` as one multi-character chunk, and the hand-rolled reason editor's `isPrintable` guard rejects anything longer than one character.
The issue was filed by `kuoruan` (a third party), so the direction went to the operator, who chose delegating the reason step to pi-tui's framework `Input` component rather than a targeted paste fix — and chose the label-above-editor layout plus collapsing pasted newline runs to single spaces.
Wrote `packages/pi-permission-system/docs/plans/0760-reason-field-paste.md`: four TDD steps (pure collapser → delegation → drop the dead `reasonDraft` field → docs).

### Observations

- Two disposable vitest spikes drove the real `Input` class and `matchesKey` before the design was written, so every behavioral claim in the plan is measured rather than argued: paste acceptance, newline deletion (`"one\ntwo"` → `"onetwo"`, which is what motivated the collapse-to-space pre-pass), `Ctrl+O` rejected as a control character, `render(40)` returning exactly one padded row after a 500-character paste, and `Ctrl+C` reaching `onEscape`.
  A second spike established that a paste chunk matches none of the decision-step hotkeys — a stray paste cannot decide a permission — which became a new pinned invariant rather than an assumption.
- Two behavior deltas fall out of delegation and are recorded rather than hidden: `Ctrl+C` during reason entry now returns to the decision step (it lands on the decision step, never an approval), and the framework editor reads pi-tui's module-global keybindings, which an extension-side module instance may not share with the host.
  The latter is not a regression — today's editor uses the config-free `matchesKey` and honors no rebinding either.
- Planning surfaced write-only state: `PromptViewState.reasonDraft` is assigned in four places and read nowhere, duplicating the adapter's `reasonBuffer`.
  Delegation makes it unmistakably dead, so it is removed in the plan's step 3 rather than filed as a follow-up.
- Open PR [#757] rewrites the same component and test file (bordered-panel render).
  The conflict is confined to the render path, but its fate is worth deciding around this ship.
- No follow-up issues were filed: nothing in the plan names deferred work beyond the already-tracked [#751].

[#751]: https://github.com/gotgenes/pi-packages/issues/751
[#757]: https://github.com/gotgenes/pi-packages/pull/757
