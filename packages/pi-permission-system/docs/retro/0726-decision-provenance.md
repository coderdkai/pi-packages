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

## Stage: Implementation — TDD (2026-08-17T01:47:50Z)

### Session summary

Landed all nine planned TDD cycles plus two Tidy-First preparatory commits (13 commits total).
`decidedBy` is now stamped at all twelve terminal decision sites and carried across the forwarding wire, required on `PermissionPromptDecision` and `GateBypass`.
Test count went 3010 → 3065 (+55) with `pnpm run check`, root `pnpm run lint`, and `pnpm fallow dead-code` all clean.

### Observations

- The `tidy-first-assessor` earned its keep by **rejecting** more than it recommended.
  It declined a blanket `test/helpers/` decision factory over the ~150 literals — correctly, on the grounds that most are `toEqual` **assertions** pinning the value under test, which no factory can supply, and that pre-collapsing them would be the large-blast-radius commit the plan's own Risks table mitigates via per-producer decomposition.
  It also declined a `GateBypass` builder (three sites sharing only `action: "allow"`) and a `PermissionGateParams` narrowing (already role-scoped).
  Its two Recommended commits both paid off: naming the chain links first made cycle 3 a two-line change, and defaulting the filler decisions in two helpers absorbed edits cycles 2 and 3 would otherwise have made by hand.
- One assessor claim needed checking rather than trusting: it described 12 call sites as "unexercised filler".
  Reading them showed a mix — in `permission-prompter.test.ts` line 83's test *subject* is that an approval logs `permission_request.approved`, so hiding the decision in a default would have harmed it.
  Adding the default and dropping the literal only at the genuinely-filler sites was the right resolution; a default parameter forces nothing.
- **Design decision not in the plan:** `UnattributedDecision` (`Omit<PermissionPromptDecision, "decidedBy">`).
  The plan sketched the dispatcher stamping `{kind:"user", via}` but did not name the type that makes it work under required-ness.
  This is the same shape `GateBypass.decision` uses for the request id (#752's "a gate keeps emitting only what it knows"), which is why it felt idiomatic rather than invented.
  It settles a real connascence question: having `reducePrompt` and `requestPermissionDecisionFromUi` each name their own surface would be two sites that must agree with the dispatcher's `mode === "tui"` branch.
- **Deviation from the plan (minor):** the plan's cycle-5 sketch had the bash bypasses carrying a session pattern.
  They cannot — a whole-command bypass covers many tokens at once, each possibly matched by a different session grant, so one pattern would be a guess.
  They record the surface with `pattern: null`, and the entry's existing `tokens`/`externalPaths` lists what was covered.
- Cycle 8 was a **characterization** cycle, not a feature one: two of its three tests passed on first run, because `capLogFieldWidths` already recursed and the redaction replacer descends by nature.
  The plan predicted this correctly ("pins it rather than trusting the reading"), and `test:` was the right commit type.
  The one failure was my own expectation being wrong — at width 10 the cap also shortened `name: "model-judge"`, which is correct behavior.
- The scripted test migration in the required-ness flip is the risk the AGENTS.md scripted-substitution warning describes, and it did misfire twice: it added `decidedBy` to an assertion over `presentInlinePermissionPrompt` (deliberately unattributed) and missed a bypass log assertion.
  Both were caught by `toEqual`'s exactness within one run — the exact-assertion convention is what made a scripted edit safe to attempt at all.
  The reviewer re-read every `test/` hunk and found no further slips.
- Two `Edit` calls failed on a wrong absolute path (`pi/pi-permission-system/...` instead of `pi/pi-packages/packages/pi-permission-system/...`) and were correctly blocked by the `external_directory` gate — the package's own gate catching a path mistake in a change to that package.
- Anchoring an `Edit` on a decorative `─` rule line failed as AGENTS.md warns; re-anchoring on the adjacent unique `describe(...)` line worked first time.

[#610]: https://github.com/gotgenes/pi-packages/issues/610
[#746]: https://github.com/gotgenes/pi-packages/issues/746
[#752]: https://github.com/gotgenes/pi-packages/issues/752
