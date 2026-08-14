---
issue: 712
issue_title: "pi-permission-system: yolo mode prompts for wrapper-floored and unparseable bash asks"
---

# Retro: #712 — pi-permission-system: yolo mode prompts for wrapper-floored and unparseable bash asks

## Stage: Planning (2026-08-14T21:50:48Z)

### Session summary

Traced the reported bug (yolo prompting for wrapper-floored and unparseable bash asks) through `resolveBashCommandCheck` → `GateRunner`, then reproduced it live with a throwaway composition-root spike that ran the real factory under `yoloMode: true` and captured `ui.select` titles.
The spike confirmed both reported cases and surfaced a third, yolo-independent defect: the `<unparseable-bash-command>` branch never consults the resolver, so an explicit `bash` `deny` is masked into an approvable prompt.
Wrote `docs/plans/0712-yolo-residual-synthetic-asks.md` — four TDD cycles (deny consult, gate-level yolo grant, end-to-end repro pin, docs) shipping independently.

### Observations

- The issue is third-party (`maertayn`) and re-files [#570], which was closed NOT_PLANNED for provenance, not merit.
  The `ask_user` gate confirmed all three open decisions at once: fix it, place the reconciliation at the `GateRunner` choke point, fold the deny-masking fix into the same plan.
- Measurement beat argument: the spike (`makeFakePi` + real factory + a UI ctx that records prompt titles) produced the exact prompt string from the issue, and probing for a genuinely unparseable command showed `cat <<'EOF'` parses fine while `> out.txt` and `2>&1` hit the sentinel.
  Both facts are in the plan as measured rows, not inferences.
- Design tension named in the plan: `docs/architecture/architecture.md` § "yolo is recorded authority" claims the decision path loses all yolo knowledge, and `PermissionPrompter`'s docstring claims no `ask` reaches it under yolo.
  Both are false today; the floors are per-parse, not per-pattern, so no rules-only fix exists and the doc claims must be amended.
- Blast radius of the runner-level catch-all was enumerated rather than assumed: every `preCheck` source already flows through the yolo-rewritten resolver, `synthesizeDefaults` guarantees the `evaluate()` builtin fallback never surfaces, and only `describeSkillReadGate`'s `preResolved` can carry a non-ruleset `ask` (a stale skill entry after a mid-session yolo toggle).
- Rejected alternatives recorded: reconciling inside `resolveBashCommandCheck` (three-layer parameter relay, contract still unenforced) and selecting an auto-approving `TerminalAuthorizer` under yolo (breaks the single `auto_approved` review-entry parity from [#526]).
- Deferred without filing: yolo parity on the advisory path (`resolveBashAdvisoryCheck`).
  The discrepancy is in the safe direction — advisory stricter than the gate — and no known consumer depends on it.
- Two existing assertions (`expect(resolver.resolve).not.toHaveBeenCalled()` in `bash-command.test.ts` and `bash-advisory-check.test.ts`) invert with the deny consult; the implementation session should expect that, not treat it as a regression.

[#452]: https://github.com/gotgenes/pi-packages/issues/452
[#481]: https://github.com/gotgenes/pi-packages/issues/481
[#490]: https://github.com/gotgenes/pi-packages/issues/490
[#526]: https://github.com/gotgenes/pi-packages/issues/526
[#570]: https://github.com/gotgenes/pi-packages/issues/570

## Stage: Implementation — TDD (2026-08-14T22:07:49Z)

### Session summary

Landed one tidy-first preparatory commit plus the plan's three TDD cycles and the doc commit: the unparseable branch now resolves the whole command and returns an explicit `deny` before synthesizing its sentinel `ask`, and `GateRunner` grants any residual `ask` under yolo through the new pure `resolveYoloGrant` helper, wired from a single `isYoloEnabled` reader in `index.ts` shared with `PermissionManager`.
Five composition-root tests drive the real factory over the issue's literal repro (`git status | xargs grep foo` and `> out.txt`), covering yolo-on, yolo-off, and explicit-deny.
The `pi-permission-system` suite went 2769 → 2784 tests; check, root lint, and `pnpm fallow dead-code` are green.

### Observations

- The `tidy-first-assessor` found one Recommended prep: `resolveBashCommandCheck` already resolved the whole command inline at two sites and the fix would have added a third, so `resolveWholeCommand` was extracted first (`refactor:`).
  That is the only deviation from the plan's file list, and it made the step-1 diff a single call.
  The assessor's Optional item (a shared `() => false` reader across the three `GateRunner` test fixtures) was declined as the plan predicted.
- The plan's two predicted assertion inversions (`expect(resolver.resolve).not.toHaveBeenCalled()` in `bash-command.test.ts` and `bash-advisory-check.test.ts`) landed exactly as described; no other existing assertion moved, and the [#526] yolo-origin runner test was left untouched to hold review-log parity.
- The advisory path inherits the deny consult for free (it shares `resolveBashCommandCheck`), so a denied unparseable command now reports `deny` there too — an extra test pins it.
  The advisory path's yolo discrepancy remains deferred and unfiled per the plan's Open Questions.
- Pre-completion reviewer: WARN (no FAILs).
  Finding 1 — the `runner.ts` module-tree entry cited `#712` as bare provenance; fixed by rewording to the constraint itself ("the sole place a post-resolution ask is reconciled with yolo") and amended into the docs commit.
  Finding 2 — the plan's deferred advisory-parity question carries no issue number; left as an accepted, reasoned deferral recorded in the plan.
- Reviewer confirmed the [#452] fail-closed, [#481]/[#490] wrapper-floor, and [#526] parity invariants survive by diff, not prose.
