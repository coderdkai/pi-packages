---
issue: 721
issue_title: "pi-permission-system: liveness detection for out-of-process forwarded permission requests"
---

# Retro: #721 — pi-permission-system: liveness detection for out-of-process forwarded permission requests

## Stage: Planning (2026-08-17T03:23:21Z)

### Session summary

Planned Phase 13 Step 5: a filesystem serving heartbeat (`<forwardingDir>/serving/<encoded-session-id>.json`) that lets an out-of-process forwarding child tell "a human is deliberating" from "nobody is home," so it abandons in ~2 s instead of burning the full 600 s `forwardingTimeoutMs`.
The clarification gate settled three parameters the issue left open: **serving heartbeat only** (no per-request claim artifact), **absence of a record means not serving** (fast-fail, accepting the upgrade-window skew cost), and **constants only, no new config field**.
Seven TDD steps, three of them `refactor:` for the module nothing imports yet, then `feat:` for publishing the heartbeat, `fix:` for the child's fast-fail, a composition-root test, and the docs commit carrying the roadmap `✅`.

### Observations

- **The parking condition had already been met, and the roadmap knew it.**
  The issue says "not worth building until someone reports the stall on a process-based subagent extension." [#735] is that report — a detached `pi-subagents` run forwarding to a parent that exited the previous day, with review-log evidence and a measured 30+ minutes per child.
  `docs/architecture/architecture.md` had already adopted both as Phase 13 Step 5 with `Release: independent` and prescribed the module name `src/authority/forwarding-liveness.ts` (a health-metric row greps for it).
  So the direction was settled before planning started, and the gate could spend its whole budget on mechanism rather than on "whether."
- **The claim artifact is worse than the issue text suggests, and the code is what shows it.**
  `ForwardedRequestServer.processInbox` drains **serially**, awaiting each escalation.
  While a human deliberates on request A, request B sits unclaimed in the same directory for minutes — so a naive claim falsely abandons it.
  Batch-claiming at scan time fixes that but degrades the artifact's meaning to "the loop saw you," and it still adds a third per-request file inside the tree whose removal ordering already produced the [#398] ENOENT write loop.
  That argument came from reading `processInbox`, not from the issue's framing, and it is what made the heartbeat the clear pick.
- **The heartbeat's placement is load-bearing.**
  A sibling `serving/` directory rather than a file inside `sessions/<id>/`, because `cleanupPermissionForwardingLocationIfEmpty` removes the session root when empty and a heartbeat there would entangle liveness with the [#398] ordering.
  For the same reason the `serving/` directory is created on demand and **never removed** — deleting it reintroduces exactly that race.
- **The sharpest correctness detail is the refresh's position relative to the `processing` guard.**
  `ForwardingManager`'s interval callback early-returns while `processing` is true, which is precisely the state a parent occupies while a human deliberates at the forwarded dialog — for as long as they take.
  A refresh after that guard would let the heartbeat go stale exactly when the parent is most demonstrably alive, and every other child would fast-fail against it.
  The plan puts the refresh first and pins it with a dedicated test in step 4; it is flagged as the one test that must not be dropped.
- **The provenance seam [#719] built paid off immediately.**
  `resolvePermissionForwardingTarget` already returns `{ sessionId, source }`, so the second channel did not need a new discriminator.
  Rather than giving `ParentAuthorizer` two lookups and a three-way branch, the plan introduces one target-keyed seam (`TargetServingLookup`) that owns the dispatch, and `checkServingLiveness` collapses to a single question with no provenance branch.
- **`markServing` doubling as the refresh avoided widening the seam.**
  The alternative was a third `refreshServing` method on `ServingAnnouncer`, which `ServingSessionRegistry` would implement as a no-op (an in-memory mark does not decay).
  Since `markServing` is already idempotent by contract and the heartbeat store can throttle internally, the two-method seam survives unchanged and only `index.ts` composition changes.
- **Rejected: treating absence as "not judgeable."**
  That is the skew-proof direction and mirrors [#719]'s stale-mark rule, but a cleanly exited parent leaves no record at all — so it would have delivered almost nothing for [#735] scenario 1, the exact reported case.
  The operator took the skew cost knowingly; the mitigation is an upgrade-the-parent-first note in `docs/subagent-integration.md`, mirroring [#745]'s ordering guidance, not a `docs/migration/` file, since nothing requires a user edit.
- **Doc greps found four stale rows, two of which no symbol grep would have caught.**
  `docs/subagent-integration.md` lines 71–72 state the liveness signal is process-local and out-of-process children still wait the full timeout — prose this change makes false with no removed symbol to match.
  `docs/configuration.md` line 106 and `.pi/skills/package-pi-permission-system/SKILL.md` line 64 carry the same in-process-only claim.
  The `in-process|out-of-process|process-local` sweep across docs, README, and the skills tree was the right instrument.
- **No follow-up issues filed.**
  The operator chose "heartbeat only" rather than "heartbeat now, claim as a follow-up," and the claim needs [#722]'s diagnosis before it is more than speculation.
  Both open questions in the plan are conditional on future evidence, so nothing was filed.

[#398]: https://github.com/gotgenes/pi-packages/issues/398
[#719]: https://github.com/gotgenes/pi-packages/issues/719
[#722]: https://github.com/gotgenes/pi-packages/issues/722
[#735]: https://github.com/gotgenes/pi-packages/issues/735
[#745]: https://github.com/gotgenes/pi-packages/issues/745
