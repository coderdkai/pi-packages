---
issue: 610
issue_title: "pi-permission-system: make UI prompt decisions correlatable in the serving session"
---

# Retro: #610 — make UI prompt decisions correlatable in the serving session

## Stage: Planning (2026-08-18T14:30:40Z)

### Session summary

Planned Phase 13 Step 10: the serving session emits a parent-side `permissions:decision` for every forwarded request it escalates, reusing the `requestId` its own `permissions:ui_prompt` carried, and the fail-closed `tool_call` boundary emits a `gate_error` terminal decision ([#753], folded in per the roadmap).
The plan is at `packages/pi-permission-system/docs/plans/0610-cross-session-decision-correlation.md`: four steps, one `refactor:` prep, two `feat:` cycles, one `docs:` commit.
Filed [#772] for a pre-existing mis-attribution the design ran into.

### Observations

- **[#752] already supplied everything the issue asked for except the emit.**
  `ForwardedPermissionRequest.id` *is* the child's minted request id, `buildForwardedAskDetails` puts it on `details.requestId`, and `buildUiPrompt` copies it onto the broadcast.
  So the issue's items 1 and 3 (add `requestId` to the decision event, reuse the prompt's id) were already satisfied or trivial; the whole change is item 2 plus one contract field.
- **The emit-site choice came down to which site sees an escalation that throws.**
  Three candidates held `details` and the decision: `ForwardedRequestServer`, `LocalUserAuthorizer`, and `PermissionPrompter`.
  The authorizer would pair the two events structurally (same object, same input), but the server's existing `catch` is the only place that sees a dialog failure *after* the `ui_prompt` went out — the exact permanent-blocked bug at a rarer site.
  The operator chose the server with the broad scope (every escalated request), which also removes the need to inspect `decidedBy` to decide whether to emit.
- **`PromptRequestFacts.surface` and `value` are non-nullable, which removed a sentinel from the design.**
  `PermissionDecisionEvent.surface`/`value` are `string` while the prompt's are `string | null`, so a version-skew forwarded request needed a fallback.
  The payload's own request facts supply it, so no `"<unknown>"` sentinel and no widening of the published field types.
- **`deriveResolution` was deliberately not reused.**
  It maps a gate *outcome* (check state + gate action + three collected flags); the server holds the `PermissionPromptDecision` itself.
  Reusing it would mean an `authority/` → `handlers/gates/` import for a five-parameter call whose first two arguments are constants.
  A five-line local mapping that reads the decider's own stamp won.
- **The mapping exposed a pre-existing defect rather than introducing one.**
  An `authorizerChain` link's verdict is already broadcast as `user_approved` / `user_denied` on the local path, because `GateRunner` never reads `decidedBy`.
  Filed as [#772] instead of folded in: fixing it changes the resolution an existing local decision reports, so it is a contract change while this issue is purely additive.
- **`index.ts` builds `GateDecisionReporter` ~90 lines *after* `ForwardedRequestServer`.**
  The new `broadcaster` dep needs it earlier, so the construction hoist rides the `refactor:` prep step rather than surfacing mid-`feat:`.
- **Scope check on the labels.**
  The issue carries both `pkg:pi-permission-system` and `pkg:pi-subagents`, but nothing in pi-subagents changes — the label reflects the reported scenario, not the diff — so this is a single-package plan.

## Stage: Implementation — TDD (2026-08-18T18:41:27Z)

### Session summary

Landed the plan's four steps plus one tidy-first prep commit: `escalateAsk` extracted, `DecisionBroadcaster` split out of `DecisionReporter`, the fail-closed boundary's `gate_error` broadcast ([#753]), and the serving session's terminal decision for a forwarded ask (this issue).
Test count went 3162 → 3173 (+11: eight served-decision cases, three boundary cases).
Pre-completion reviewer: **PASS**, no warnings.

### Observations

- **The tidy-first assessor's one recommendation was the right one and was accepted verbatim.**
  Hoisting `buildForwardedAskDetails` out of the escalation `try` and naming the fail-closed catch `escalateAsk` was a precondition for the design, not optional restructuring — the feature commit then added only the dep, the emit, and the two builders.
  It also declined to re-propose the `DecisionBroadcaster` split because the plan already scheduled it as its own commit, which is the correct read of the protocol.
- **A shared test fixture was producing a value its declared type forbids.**
  `makeServerDeps`'s default escalator resolved `{ approved: true, state: "approved" }` with no `decidedBy`, which `PermissionPromptDecision` requires; `vi.fn().mockResolvedValue(…)` is typed loosely enough that `tsc` never saw it.
  `servedResolution` reads `decision.decidedBy.kind`, so every test using the default would have thrown once the emit was wired.
  Fixed the fixture (with `satisfies PermissionPromptDecision`, so it cannot drift again) rather than making the production read defensive.
- **One new test passed during Red in each step, and both are pins rather than broken probes.**
  "still blocks when the broadcast itself throws" and "broadcasts nothing when recorded authority resolves the request" both assert an absence that was already true; each became load-bearing the moment the emit existed.
- **The exact-equality assertion is doing contract work, not style work.**
  The approval case asserts the whole emitted event with `toEqual` specifically so a later `decidedBy` (or any other field) leaking onto the bus fails a test — ADR 0011 §6 makes that the narrowest renderer, and a `toMatchObject` there would absorb the leak silently.
- **Three tests deviate upward from the plan.**
  The boundary gained a third case pinning the `value: command ?? toolName` fallback the plan specified but did not test; the server's nine planned cases landed as eight, with the "same projection as the prompt" assertion folded into the full-shape approval case rather than repeated.
- **`index.ts` needed the reporter hoisted ~90 lines**, exactly as planning predicted, and it rode the `refactor:` commit so the feature commit carried no unrelated motion.

[#752]: https://github.com/gotgenes/pi-packages/issues/752
[#753]: https://github.com/gotgenes/pi-packages/issues/753
[#772]: https://github.com/gotgenes/pi-packages/issues/772
