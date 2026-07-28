---
issue: 664
issue_title: "pi-subagents: ESC (parent interrupt) aborts all background agents — should this be a policy setting?"
---

# Retro: #664 — ESC (parent interrupt) aborts all background agents

## Stage: Triage (2026-07-27T21:44:53Z)

### Session summary

## 664 is a proposal from @daoguademeng (not a defect report) asking whether ESC aborting every background agent should become a policy setting rather than fixed behavior

It surfaced while reviewing that contributor's PR #665, and the operator opted to **accept the design and implement it in-repo ourselves** rather than take the contributor's existing patch.
The discussion also produced a mechanical trace of Pi's ESC handling, which ruled out a richer interactive design on ESC itself and spun out #676.

### Decision

**Implement `abortAllOnInterrupt` ourselves, taking the design as #664 specifies it:**

- `abortAllOnInterrupt` defaulting to **`true`**, so current behavior is preserved exactly on upgrade and no user's panic button changes.
  This keeps the change pure-addition and non-breaking.
- The policy predicate is consulted **at abort time**, not at wiring time, so a mid-session settings change applies immediately.
- Persisted alongside the existing numeric settings (`sanitize` + `snapshot` + layered load), toggleable from `/subagents:settings` as a direct flip with no input prompt.

The touch point is `InterruptHandler` (`src/handlers/interrupt.ts`), which latches the parent turn signal and calls `manager.abortAll()` when it fires.

#### Attribution and communication

**Do not comment on #664 until our work is delivered.**
The operator's explicit call: we say nothing now, and explain what we did once it ships.
The contributor has an implementation on their fork (`daoguademeng/pi-packages@feat/interrupt-abort-setting`, commit `fc45d4c`) which we are declining in favor of our own — that is a decision to explain at delivery, not to negotiate in advance.

The contributor gets credit regardless.
Every implementation and docs commit carries, after a blank line at the end of the body:

```text
Co-authored-by: daoguademeng <whumaple@gmail.com>
```

Open choice for the implementation session: whether to read the contributor's branch.
Reading it makes co-authorship unambiguous; not reading it keeps our implementation independent.
Either way the trailer goes on, since the design itself is theirs.

#### Why the richer ESC design is not reachable

The operator's instinct was that ESC is *ambiguous* when both the parent and background agents are running, and that the right answer is to ask — a menu offering "stop the main agent," "stop the background ones," "stop one," "stop everything," with repeated presses escalating toward stop-it-all.
That design is sound but cannot be built on ESC.
Verified against the pinned `@earendil-works/pi-coding-agent` 0.80.5, not just the `../pi` checkout:

1. `app.interrupt` sits in `RESERVED_KEYBINDINGS_FOR_EXTENSION_CONFLICTS` (with `app.clear`, `app.exit`, and others).
   `ExtensionRunner.getShortcuts()` skips a reserved binding with a warning, so `registerShortcut("escape", …)` silently does nothing.
2. The abort is **synchronous on the keypress call stack** — keypress → `CustomEditor.handleInput` → `onEscape` → `agent.abort()` → `runAbortController.abort()` — with no extension-visible hook in between.
3. There is **no `interrupt` or `abort` extension event**.
   `InterruptHandler` learns about ESC only by latching `ctx.signal` and listening for `abort`, which is a notification after the fact: the parent is already gone.

So a prompt at ESC time could never ask about the parent, because the parent is already dead.
This is correct behavior on Pi's part — an interceptable panic button is not a panic button.

Two further constraints worth remembering:

- **Double-ESC is already taken.**
  `settingsManager.getDoubleEscapeAction(): "fork" | "tree" | "none"` fires on two ESCs within 500 ms when the editor is empty.
  Mashing ESC already escalates today — into session navigation — which collides directly with any "mash to stop everything" scheme.
- `ui.onTerminalInput()` returns `{ consume?: boolean }` and *could* swallow ESC before the editor sees it.
  Rejected: it routes around Pi's reserved-key policy through a side door and would have this package seize the global interrupt key even when no subagents exist.

#### Follow-on

## 676 carries the reachable half of the operator's design: dedicated shortcuts we own, which fire *before* anything is aborted, so every outcome is still live

Agreed shape there is two keys — an immediate "stop all subagents" fast path plus a picker for one/all/everything — both configurable through the package's existing `loadLayeredSettings` config with defaults.

## 664 and #676 are independent and can land in either order

## 664 governs what ESC destroys by default; #676 governs whether the operator has a deliberate alternative to reaching for ESC at all

Unrelated to both: #674 tracks the queued-stop lifecycle defect from the same contributor's PR #665.

## Stage: Planning (2026-07-28T01:38:26Z)

### Session summary

Wrote `packages/pi-subagents/docs/plans/0664-abort-all-on-interrupt-policy-setting.md` on top of the triage decision: an `abortAllOnInterrupt` setting defaulting to `true`, a policy predicate consulted inside `InterruptHandler`'s abort listener, and a direct-flip toggle in `/subagents:settings`.
Four steps — persist the setting, gate the interrupt, add the toggle, document it — with the `Co-authored-by: daoguademeng <whumaple@gmail.com>` trailer required on every commit.
Release recommendation is ship independently: the issue is in no roadmap phase and the change is a self-contained additive `feat:`.

### Observations

- **Measurement that shaped the design.**
  Traced the abort paths rather than assuming: `spawnBackground` passes no `signal`, so `InterruptHandler` is the *only* thing that aborts a background agent on ESC; `runForeground` and the resume path both pass the tool's `signal` straight through to `Subagent.run()`'s `listeners.wireSignal`, so a foreground agent self-aborts on ESC regardless of the setting.
  The contributor's offered "scope it to background-only agents" variant is therefore already the effective behavior — no filtering needed in `abortAll()`.
- **Operator decisions taken at the `ask_user` gate.** (1) Keep the name `abortAllOnInterrupt` and document the foreground nuance in the README, rather than renaming to a background-explicit key. (2) Fold the boolean into `subagents-settings.ts`'s descriptor table as a `kind`-discriminated union (`numeric` | `toggle`) with one dispatch point, rather than a second table or an inline special case. (3) With the policy off, skip `abortAll()` entirely so queued agents are spared too — no "drop the queue, spare the running" variant.
- **Tell-Don't-Ask on the toggle.**
  The manager exposes `toggleAbortAllOnInterrupt()` and owns the negation; the UI descriptor never reads the boolean, negates it, and writes it back.
  Consequently no public setter and no `applyAbortAllOnInterrupt(value)` — a value-taking apply method would be dead code.
- **Predicate over settings object.**
  `InterruptHandler` takes a required `() => boolean`, matching `new ConcurrencyLimiter(() => settings.maxConcurrent)` in `index.ts`, so the handler never learns the settings key's name and the value is read at abort time.
  Required rather than defaulted so a future wiring site cannot silently opt out.
- **Open for the implementation session.**
  Whether to read the contributor's fork branch (`fc45d4c`); the plan recommends not reading it, since the design is fully specified here and the co-author trailer goes on regardless.
- No follow-up issues filed — everything deferred is already tracked by #676 (shortcut-driven stop UX) and #674 (queued-stop lifecycle).
