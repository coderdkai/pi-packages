---
issue: 626
issue_title: "pi-permission-model-judge records nothing, so its decisions are unobservable"
---

# Retro: #626 — pi-permission-model-judge records nothing, so its decisions are unobservable

## Stage: Planning (2026-07-21T02:30:00Z)

### Session summary

Planned the model-judge decision trail as a **cross-package** change: a new `AuthorizerLog` seam threaded into the pi-permission-system `Authorizer` chain (Phase 1), consumed by `pi-permission-model-judge` to write a positive, structured decision record per `external_directory` ask it evaluates (Phase 2).
The operator chose issue option 1 (route through the shared review log, not a judge-owned JSONL) and debug-gated raw model replies.
The governing principle — "absence of evidence is not evidence of absence" — drove the design: every pattern-matched ask always gets a positive `model_judge.decision` review entry with a concrete verdict + defer-reason, so a silent 100%-defer regression like [#625] can never hide again.

### Observations

- **Hard publish gate is the central constraint.**
  `linkWorkspacePackages: false` means the judge type-checks against the **published** `@gotgenes/pi-permission-system` (20.9.0 in `node_modules`), not the workspace source.
  A 3-param `authorize` callback is not assignable to the published 2-param type, so Phase 2 cannot be built until Phase 1 publishes.
  This forces two releases in a fixed order and likely two `/ship-issue` cycles.
- **Design fork resolved via `ask_user`** — the operator picked A (shared review log) over B (own JSONL) and C (hybrid), and debug-gated raw reply.
  Discovered during exploration that option B would not have fully lost the "single audit trail" benefit (the judge's `authorize` receives `details.requestId`, so an own-log could join to the review log) — surfaced in the ask, but the operator still preferred A for a single trail.
- **Seam shape:** a third `log: AuthorizerLog` parameter on `Authorizer.authorize`, mirroring the ADR 0007 §3 `query`-injection precedent.
  `AuthorizerLog` (`{ review, debug }`) is structurally satisfied by the existing session `DebugReviewLogger`, so no new logger implementation — `AuthorizerSelection.escalate` already holds `this.deps.logger` and just passes it through.
  Non-breaking: a 2-param callback stays assignable to the 3-param type (`feat`, not `feat!`).
- **Log-level split** keeps the review log signal-rich: pattern-matched asks → `log.review` (the [#625]-class signal, on by default); `no-path` / `pattern-miss` short-circuits and the raw reply → `log.debug` (off by default).
  Non-`external_directory` asks are not logged at all (not the judge's surface; a line per bash/tool ask would be noise).
- **`reviewPath` restructure** returns a `ReviewOutcome` distinguishing four model-call defer reasons; added `call-failed` as the honest superset the issue's enum omits (a 401 that slips past pre-call auth throws inside `complete` and lands here — the [#625]-class signal).
  Verdict behavior is unchanged (all failures still defer, ADR 0007 invariant 2); the outcome only annotates why.
- **Ties to the held [#625].**
  The judge release in Phase 2 carries [#625]'s auth fix (already unreleased on `main`); the new trail is the verification mechanism the operator held [#625] for.
  The plan ends with the concrete verification recipe.
- **Doc touch points identified:** ADR 0007 line 66 signature + a §3 subsection; `architecture.md` line 764 module-tree signature copy; the judge README + `configuration.md`.
- Release: ship independently (two independent releases, publish-gated); no roadmap batch references this issue.

## Stage: Implementation — TDD Phase 1 (2026-07-21T21:35:00Z)

### Session summary

Implemented **Phase 1 only** — the pi-permission-system review-log seam — in three commits (a tidy-first fixture, the `feat` seam, and docs).
Added a public `AuthorizerLog` (`{ review, debug }`), widened `Authorizer.authorize` with a third `log` parameter, threaded it through `composeAuthorizerChain` and `encloseInDelegationEnvelope`, and supplied the session `DebugReviewLogger` from `AuthorizerSelection.escalate`.
Phase 2 (the `pi-permission-model-judge` consumer) is **not** started — it is blocked on the publish gate. pi-permission-system test count 2533 → 2535 (+2 new injection/forwarding assertions; net after the migrated fixture).

### Observations

- **Publish gate holds — Phase 2 deferred by design.**
  `linkWorkspacePackages: false` means the judge type-checks against the registry copy of `@gotgenes/pi-permission-system`; a 3-param `authorize` callback is not assignable to the published 2-param type, so Phase 2 cannot be built until Phase 1 ships and publishes and the judge's dep is bumped.
  This session correctly stops at the end of Phase 1.
- **Tidy-First (assessor dispatched):** landed one preparatory `test:` commit extracting a shared `makeAuthorizerLog()` fixture (`test/helpers/authorizer-log-fixtures.ts`) and migrating the two existing `{ review, debug }` literals in `authorizer-selection.test.ts` onto it — so the fixture is consumed immediately (no dead export, no unused import) and the feature commit's ~16 new call sites became one-line `, log` appends.
  Rejected-as-scope-creep items (migrating `permission-prompter.test.ts` `{ review }`-only literals, extracting `makeQuery`/`makeDetails`) were correctly declined.
- **Non-breaking confirmed:** `AuthorizerLog` is structurally identical to the existing internal `DebugReviewLogger`, so the session logger passes straight through with no new implementation; a 2-param link callback stays assignable to the widened type (`feat`, not `feat!`).
- **Ship caveat for `/ship-issue`:** shipping Phase 1 cuts a **pi-permission-system** release but must **not close #626** — the issue is only half done; Phase 2 (judge + the held [#625] verification) follows after the pi-permission-system publish.
- Pre-completion reviewer: **PASS** (Phase 1 scope) — all deterministic checks green, ADR/architecture docs updated, invariants preserved, no design concerns.
- Remaining work (next session, after publish): Phase 2 steps — bump the judge dep to the published pi-permission-system version, `reviewPath` structured outcome, `matchTypoPattern`, the decision-trail logging in `createTypoReviewer`, and the judge user docs; then run the [#625] verification recipe and ship both.
