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

## Stage: Implementation — TDD (2026-08-17T16:20:31Z)

### Session summary

All four planned TDD cycles landed as planned, plus a one-line comment fixup the reviewer flagged: the pure `collapsePastedNewlines` helper, the delegation of the dialog's reason step to the pi-tui `Input` line editor, removal of the write-only `PromptViewState.reasonDraft`, and the architecture/configuration doc updates.
The target package went from 3123 to 3136 tests (+13: eight for `bracketed-paste.ts`, five for the component).
The `tidy-first-assessor` found no preparatory tidying warranted, and the pre-completion reviewer returned PASS.

### Observations

- The Red step caught a **vacuous assertion** in my own new test: `expect(after.join("\n")).toContain("x")` passed before the fix because the fixture's rendered `path : /repo/secret.txt` line contains an `x` in `.txt`.
  It surfaced only because I checked which of the five new cases actually went red and then probed the render with a temporary `toBe("PROBE")`.
  Switched the probe character to `q`, which appears nowhere else in that render.
  A single-character `toContain` probe against a render that includes filesystem paths is a trap worth remembering.
- Two of the five new component cases pass against the pre-fix code by design — the stray-paste-at-the-decision-step case and the expand-key case pin invariants that were already true (the plan's Invariants table says so).
  The reviewer verified this empirically by checking out the pre-fix tree and re-running the suite, and confirmed the three paste-specific cases all fail without the fix.
- One deviation from the plan, in the safe direction: instead of `setValue("")` on entering the reason step, the component builds a **fresh** `Input` per visit (`createReasonEditor`).
  The framework editor carries an undo stack and a kill ring, so a reused instance would let a reason the operator backed out of be undone back into a later ask.
- The reviewer's one WARN was a stale comment naming the deleted `isPrintable` guard in an untouched test case; fixed as a separate `test:` commit.
- Only one `feat`/`fix` line reaches the changelog (`fix(pi-permission-system): accept pasted text in the denial-reason field`), which is the correct user-observable framing — the helper and the model cleanup are `refactor:`.

[#751]: https://github.com/gotgenes/pi-packages/issues/751
[#757]: https://github.com/gotgenes/pi-packages/pull/757
