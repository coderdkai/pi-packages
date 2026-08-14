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

[#526]: https://github.com/gotgenes/pi-packages/issues/526
[#570]: https://github.com/gotgenes/pi-packages/issues/570
