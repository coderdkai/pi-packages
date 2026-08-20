---
issue: 786
issue_title: "pi-permission-system: decide the cross-node extension contract — node-locality, registration channel, and the subagent adapter convention (ADR 0012)"
---

# Retro: #786 — Cross-node extension contract ADR

## Stage: Planning (2026-08-20T17:02:12Z)

### Session summary

This session started as `/plan-issue 699` (a third-party issue proposing an exported child detector and a typed duplicate-registration error) and ended by filing #786 and planning the ADR instead.
Investigation reframed the reported throw as one symptom of a wider contract gap; the operator directed a full contract deliberation ("no sacred cows"), chose the new-ADR-issue packaging, and #699 stays open as a downstream implementation issue.
The plan (`docs/plans/0786-cross-node-extension-contract-adr.md`) structures the build session as five `ask_user` deliberation gates over seven parameters, then ADR authoring — the [#581] pattern.

### Observations

- Key mechanical findings the ADR rests on (all verified against source, re-verify commands in the plan's Test Impact Analysis):
  - The SDK event bus hands `pi.events.on` handlers only the payload — no `ctx`.
    Both #699's Option A snippet and PR [#702]'s doc example (`(_event, ctx) => …`) are wrong against the real SDK, which rules out a `ctx`-keyed predicate at the documented `permissions:ready` registration site.
  - The service's three registries are read by different nodes: extractors/formatters by the requesting node's own gates ([#635]), links only by the adjudicating node (ADR 0007 §7).
    An in-process child registering into the parent's service gets a duplicate throw parent-side and a missing extractor child-side — the latter is a latent path-gating weakening worse than the reported symptom.
  - Process shape changes the symptom, not the question: an own-process child's link registration succeeds into a registry nothing reads.
    Any fix keyed on the in-process registry is process-specific by construction.
  - `authorizerSelection.activate` runs before `serviceLifecycle.activate`, so `adjudicatesLocally` and the #302 `ownsService` boolean are both available at `emitReadyEvent` time.
  - `excludedExtensionPackages` (pi-subagents) makes extension loading asymmetric today; excluding an extractor provider from children would break the child's own gates, so the contract must make riding along harmless.
- Two `ask_user` direction gates were bounced before converging: the first for offering the issue's options as the frame ("we need to come up with our own proposals"), the second for insufficient grounding ("back up more").
  The full mechanism walkthrough (diagram, timeline, node-shape table) is what unlocked the deliberation — for a third-party issue in a contested design space, brief the operator to parity before offering any option list.
- The operator's challenge ("do children even get the same extensions?") was correct and added plan parameter 6; verify loading symmetry claims against pi-subagents source, not assumption.
- A headless CI node adjudicates locally with `DenyingAuthorizer` and runs its chain — the counterexample that kills "authorizers sit strictly at the parent".
- Candidate mechanisms deliberately left undecided in the plan (C1 role-gated emission / C2 capability-on-payload / C3 advisory fields / session-keyed accessor); the operator explicitly declined to vote during planning.
- Re-scope comment posted on [#699] crediting the reporter's accurate trace and naming the SDK-signature gap; PR [#702] gets evaluated against the settled contract, not against #699's option list.
- roadmap-fit: no open phase (13 archived) — exited at step 1 for #786.

[#581]: https://github.com/gotgenes/pi-packages/issues/581
[#635]: https://github.com/gotgenes/pi-packages/issues/635
[#699]: https://github.com/gotgenes/pi-packages/issues/699
[#702]: https://github.com/gotgenes/pi-packages/pull/702
