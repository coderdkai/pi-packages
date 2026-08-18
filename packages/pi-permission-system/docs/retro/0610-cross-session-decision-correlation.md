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

[#752]: https://github.com/gotgenes/pi-packages/issues/752
[#753]: https://github.com/gotgenes/pi-packages/issues/753
[#772]: https://github.com/gotgenes/pi-packages/issues/772
