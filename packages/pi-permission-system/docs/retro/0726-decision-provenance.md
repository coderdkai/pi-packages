---
issue: 726
issue_title: "pi-permission-system: permission decisions record no responder provenance — a human approval is indistinguishable from an auto-approval"
---

# Retro: #726 — permission decisions record no responder provenance

## Stage: Planning (2026-08-16T22:25:05Z)

### Session summary

Planned Phase 13 Step 6: a `DecisionSource` discriminated union (`decidedBy`) threaded from each decision site into the review log and across the forwarding wire.
Inventoried all twelve terminal decision sites and confirmed the issue's diagnosis — the ask path is where provenance is genuinely lost, because `composeAuthorizerChain` collapses a link decision, a human dialog decision, an absent-authority denial, and a relayed parent answer into the same `{approved, state, denialReason}`.
Plan committed at `packages/pi-permission-system/docs/plans/0726-decision-provenance.md` with nine red→green→commit cycles.

### Observations

- Two of the issue's three asks were already resolved or moot.
  The cross-ID-space join complaint was fixed by [#752] (the forwarding edge adopts the requester's `requestId`), and the `/permissions` history view it asks about does not exist — `/permission-system` is a config modal.
  Only the provenance half is real work.
- Operator decided at the clarification gate to **exclude** the `permissions:decision` bus event: consumers of the channel are not yet known, so widening it is premature.
  This narrows the roadmap's own Step 6 `Outcome:` line, which claims "every `permission_request.*` **and decision event** names its decider" — the plan lists correcting that line as a doc update.
- Operator chose **nested** forwarded provenance (`{kind:"forwarded", responderSessionId, decision}`) over a flat relay, and **self-contained** variants over lean ones.
  Self-contained is load-bearing rather than stylistic: `ForwardedPermissionResponse` has no `surface`/`pattern`/`origin` column, so a lean variant would lose which parent rule fired the moment it crossed the boundary.
- Measured rather than estimated, from the operator's live 7.44 MB review log: 9522 lines, 1432 terminal prompted decisions with no decider recorded, 5777 decision-bearing lines averaging 765 bytes.
  Predicted log growth is +7.4% worst case (a `rule` variant adds 95 bytes, a nested forwarded one 134) — set against the 28.7% [#746] removed.
- Confirmed by reading `log-field-cap.ts` and `log-redaction.ts` that both the width cap and the key-name mask **recurse** into nested objects, so a nested `decidedBy` needs no new bounding work.
  The plan pins this with a regression test rather than trusting the reading.
- The recursive tolerant guard is a fail-closed surface: `decidedBy` arrives off disk, so `asDecisionSource` is depth-bounded.
  Same class as [#752]'s filename-safety guard on an adopted request id — adoption is where an inbound value first gets to steer this process.
- Migration risk is concentrated in tests, not production: ~150 decision object literals across 19 test files plus 5 helpers.
  Many are `toEqual` assertions, which break as soon as production sets the field regardless of optionality — so the decomposition is per-producer (cycles 2–6) with the required-ness flip isolated to cycle 7, rather than optional-then-required as a blanket shield.
- Sequencing note for whoever picks this up: [#610] (Step 10) also enriches the review-log write path, and the roadmap says land Steps 6 and 10 in sequence.
  This lands first.

[#610]: https://github.com/gotgenes/pi-packages/issues/610
[#746]: https://github.com/gotgenes/pi-packages/issues/746
[#752]: https://github.com/gotgenes/pi-packages/issues/752
