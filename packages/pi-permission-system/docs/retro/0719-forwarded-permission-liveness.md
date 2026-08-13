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

## Stage: Implementation — TDD (2026-08-13T04:01:54Z)

### Session summary

Landed ten commits: two preparatory refactorings from the plan, one preparatory test fixture from the Tidy-First assessor, five behavior commits, and a docs commit.
The `pi-permission-system` suite grew from 2721 to 2757 tests (+36) across 131 → 132 files.
All deterministic gates green throughout: `check`, root `lint` (0 findings), full workspace `test`, and `fallow dead-code`.

### Observations

- **Pre-completion reviewer: PASS** — ready for `/ship-issue`.
- **Reviewer warnings** — the four new liveness tests run against real timers and the 2000 ms grace window, costing ~2.0–2.5 s wall clock each (measured 2011/2262/2518/2236 ms).
  None raced across repeated local runs and all sit well inside vitest's 5000 ms default, but they are the tests most exposed to a slow CI runner.
  The reviewer suggests `vi.useFakeTimers()` as a follow-up tidy pass only if CI margin becomes a problem; deliberately not done here, since converting them late would trade a measured-safe margin for a fresh flakiness risk.
- **Deviation: the timeout seam moved a step earlier.**
  The plan put `getTimeoutMs` in step 8 with the config field, but step 6 needs it: the poll-timeout abandonment path is otherwise a literal ten-minute test.
  Splitting the seam (step 6) from the operator-facing config key (step 8) is the better split anyway.
- **Deviation: the Tidy-First `abandon()` extraction was folded in, not landed separately.**
  The assessor was right that five hand-edited abandonment sites is the friction, but every honest version of the extraction also changes the returned decision shape — a "behavior-preserving" preparatory commit would have needed a helper name that lied about the current behavior.
  Folding it into step 6 gave the same result: all six paths now route through one `abandon()` helper, so no future path can omit the marker.
  The assessor's other recommendation (`makeParentAuthorizerDeps`) was genuinely preparatory and landed as its own `test:` commit — it absorbed both new deps in one place instead of six.
- **Deviation: `config-loader.ts` was missing from the plan's file table.**
  The plan attributed the scalar merge loop to `extension-config.ts`'s `mergeUnifiedConfigs()`; that function actually lives in `config-loader.ts`.
  A field added to the runtime type but not that loop is silently dropped before runtime — the failure class the package skill already warns about — so the omission would have been caught by the merge test regardless, but the plan's grep should have located the function rather than trusting the skill's prose.
- **The composition-root round trip was quietly depending on nobody watching.**
  It hand-writes the parent's response instead of running the poll timer, so once the fast-fail landed it was racing the 2 s grace window rather than asserting anything.
  Fixing it with an explicit `markServing(parentSessionId)` made the test state what it had been assuming, and the paired new test (no `markServing`) is the closest thing in the suite to the reported bug.
- **Strengthening assertions surfaced the point of the change.**
  Converting the target-resolution tests from `toBe("parent-x")` to `toEqual({ sessionId, source })` was mechanical, but it is what makes the `registry`-vs-`env` distinction — the whole reason out-of-process children are never fast-failed — visible in the test names rather than buried in a branch.
- **`toMatchObject` will not assert a key's absence.**
  `confirmationUnavailable: undefined` in a `toMatchObject` expectation fails rather than passing on a missing key, so the "a real parent denial is not marked unavailable" discrimination lives in the abandonment tests' `toEqual` assertions instead.
- **One test earns its complexity.**
  Forcing the request-write failure needs a `chmod 0o500` on the requests directory, and the `finally` had to become conditional because the new cleanup removes that directory on the way out — which is itself the assertion that abandonment cleans up after itself.

[#721]: https://github.com/gotgenes/pi-packages/issues/721
[#722]: https://github.com/gotgenes/pi-packages/issues/722
