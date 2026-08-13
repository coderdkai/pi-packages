---
issue: 719
issue_title: "Subagent `ask` permissions stall for 10 minutes, then auto-deny without parent prompt"
---

# Retro: #719 — Subagent `ask` permissions stall for 10 minutes, then auto-deny without parent prompt

## Stage: Planning (2026-08-13T00:52:48Z)

### Session summary

Planned a third-party bug report from `akozhin-yint`: a `@gotgenes/pi-subagents` child hit an `ask` rule, no parent dialog appeared, and after exactly ten minutes the child received `User denied bash command 'pwd'`.
Traced the whole forwarding stack (`ParentAuthorizer` → file protocol → `ForwardingManager` → `ForwardedRequestServer`) and Pi's own `showExtensionCustom`, and could not determine statically why the parent failed to drain the request.
The plan therefore delivers the failure-mode half in full — truthful `confirmationUnavailable` denials, an in-process serving registry so the child abandons in seconds naming the target session id, serving-side log lines, and a `forwardingTimeoutMs` config field — and splits the unexplained stall into [#722] with the evidence gathered here.

### Observations

- **What the ten-minute wait proves.**
  `selectAuthorizer` checks `ctx.hasUI` before `isSubagent`, and an unresolved target denies immediately, so the duration alone pins the child to the `ParentAuthorizer` path with a resolved target and a written request file.
  `ForwardedRequestServer.resolveDecision` catches escalation errors and writes a denial promptly, so the parent never reached it — `processInbox` returned early.
  That narrows the cause to a stopped timer or a session-id mismatch without needing the reporter's logs.
- **A hypothesis worth killing early.**
  I spent real effort on "the TUI cannot mount `ui.custom` while the parent is idle at the editor prompt", which fit the `run_in_background: true` detail and explained why #710's reporter saw prompts render.
  An `Explore` subagent on the sibling `../pi` checkout refuted it in 80 seconds: `showExtensionCustom` (`interactive-mode.ts:2659`) has no turn-state gating and stdin is read non-blockingly, so timers fire while idle.
  Cheap refutation of a plausible-but-wrong theory was the highest-value tool call of the session.
- **The root cause is not the deliverable.**
  The operator chose "observability + truthful failure + fast-fail liveness" over a diagnose-first plan.
  That is the right call here: the misleading `User denied` message is a definite defect regardless of cause, and the serving-side log line the plan adds is precisely the instrument that makes the next report diagnosable in one diff.
- **The fix was mostly already in the codebase.**
  `PermissionPromptDecision.confirmationUnavailable` already flips the block message to `buildUnavailableBody` and the review-log resolution to `confirmation_unavailable`.
  `DenyingAuthorizer` sets it; `ParentAuthorizer` never does.
  Most of the "truthful abandonment" work is setting an existing flag, not building a mechanism.
- **One asymmetry blocks the reason from reaching the model.**
  `applyPermissionGate` takes `userDeniedReason` as `(decision) => string` but `unavailableReason` as a precomputed `string`, so a `denialReason` on an unavailable decision is silently dropped.
  Removing the asymmetry is a better framing than adding a field.
- **Provenance over re-derivation.**
  The fast-fail must not fire for out-of-process children, and `resolvePermissionForwardingTargetSessionId` already knows whether it resolved via the in-process registry or env vars — then throws that away.
  Returning a `{ sessionId, source }` product beats re-deriving "in-process" inside `ParentAuthorizer`, which would leave two places that must agree.
  Landed as a Tidy First `refactor:` step so the feature steps stay small.
- **Injecting the timeout unlocks coverage.**
  `getTimeoutMs` is nominally about the new config field, but its real payoff is that `ParentAuthorizer`'s timeout branch becomes unit-testable.
  Today a test covering it would run for ten minutes, which is why `test/composition-root.test.ts` had to build a fire-without-await round trip in the first place.
- **Rejected alternatives.**
  A filesystem claim artifact and a serving heartbeat both cover out-of-process children but carry a version-skew hazard (an older serving node never claims, so a newer child fast-fails on a parent that is about to prompt).
  The process-global registry has no skew hazard because an in-process child is by construction the same install.
  Both filesystem options are parked in [#721].
- **Scope note.**
  The issue carries both `pkg:` labels, but no `pi-subagents` code changes — its side of the contract (`subagents:child:session-created` carrying `parentSessionId`) is already correct.
  Filed as a single-package plan under `packages/pi-permission-system/docs/plans/`.
- **Version skew in the report.**
  The reporter is on `pi-permission-system@22.0.0` against a current `25.0.0`.
  I read the intervening changelogs; nothing between them touches forwarding, so the bug is expected to reproduce on current versions.

[#721]: https://github.com/gotgenes/pi-packages/issues/721
[#722]: https://github.com/gotgenes/pi-packages/issues/722
