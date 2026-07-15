---
issue: 591
issue_title: "pi-permission-system: design the model-assisted permission judge (tool-augmented, deny-first, extensible)"
---

# Retro: #591 — design the model-assisted permission judge (tool-augmented, deny-first, extensible)

## Stage: Planning (2026-07-15T15:59:02Z)

### Session summary

Planned Phase 11 Step 7 as `docs/plans/0591-model-judge-authorizer-chain-adr.md`: a documentation-only ADR (0007) settling the full design of the model-assisted permission judge across both use cases (auto-deny errant typo paths; adjudicate opaque bash), superseding the reverted [#581] ADR.
The design was settled interactively over four `ask_user` rounds rather than transcribed — this is the [#581] carve-out (a decision-record issue's deliberation *is* the deliverable, so the `Decide` gate is not skipped).
Next stage is `/build-plan` (no test cycles).

### Observations

- The operator's Chain-of-Responsibility mental model reframed and *improved* my initial "terminal leaf + decorators" framing: one role (`Authorizer` = decide-or-defer), one invariant (the terminal cannot defer, enforced at the type level via a distinct `TerminalAuthorizer` returning only `allow | deny`).
  The verdict range is `allow | deny | defer` — a superset of the reverted ADR's ask-only allow-or-escalate, driven by use case 1 being deny-first.
- Three of my design pushbacks were accepted over the operator's first-pass preferences: (1) inject a narrow session-scoped `PermissionQuery` into each link rather than have the judge reach for `PermissionsService` via `Symbol.for()` (LoD/ISP); (2) split config so this package owns only the bounded-delegation policy it enforces and the downstream extension owns model/provider/prompt (the "declared-but-unread config is a trap" priority); (3) opt-in activation — `registerAuthorizer(name, fn)` only *offers* a capability, and a link decides nothing until the operator names it in `authorizerChain`, so installing an extension grants no authority by itself.
- Key security invariants recorded in the plan: config order (not registration order) is authoritative for the security-relevant chain order; skipping any unregistered non-terminal link is always fail-safe (more prompting, never less); the bounded-delegation enforcement checkpoint lives in the chain owner, so a buggy external judge cannot exceed policy.
- Two-slice sequencing is a capability gradient on one `ModelTriageAuthorizer` link, not two mechanisms: slice 1 (`deny`/`defer`, always safe, minimal envelope) ships first; slice 2 adds `allow` behind the full envelope, whose residual risk is decomposition infidelity (obfuscation).
- `Release: independent`, but docs-only across `docs/decisions` + `docs/architecture` (release-please excluded paths), so it cuts no physical release on its own — the same distinction [#581] drew.
- `ModelTriageAuthorizer` was grep-confirmed to live only in `docs/` (live architecture doc plus frozen history/plans/retros); no `src/`/`test/`/README/config/schema surface references the not-yet-built symbols, so the plan is docs-only.
- Filed no follow-up issues: [#472] stays the implementation umbrella carrying the ADR; the next `/plan-improvements` pass sequences its decomposition (chain infra, slice 1, slice 2) plus the dogfood extension into roadmap steps and files the extension issue there.
- A post-commit amendment recorded the operator's **dogfooding objective**: slice 1 is accepted by a first-party monorepo package (e.g. `packages/pi-permission-model-judge`) implementing the deny-first typo-path reviewer — a design safeguard making `registerAuthorizer` born consumed (the `#267` vacant-surface guard) and exercising the config split end to end.
  Settled via `ask_user`: monorepo package (not external repo); issue filed by `/plan-improvements`, not now.
- The build stage's chief risk is the [#581] failure mode: an internally consistent ADR that contradicts un-reconciled architecture-doc prose.
  The plan's `Invariants at risk` section prescribes a whole-file grep (`ask-only|allow-or-escalate|escalate|ModelTriageAuthorizer|quarantine`) rather than a single-section sweep, since [#581] missed a parenthetical at line ~627 by targeting one section.

## Stage: Implementation — Build (2026-07-15T16:51:03Z)

### Session summary

Executed the docs-only plan in two commits: authored `docs/decisions/0007-model-judge-authorizer-chain-adr.md` (the Chain-of-Responsibility model judge — `allow | deny | defer` verdict, type-level non-deferring terminal, injected `PermissionQuery`, opt-in named `registerAuthorizer`, config split, two-slice gradient, dogfooding as slice-1 acceptance), then reconciled `architecture.md` (rewrote `Discriminating delegation`, subsumed the pluggable-escalation seam, reconciled the recursion/aspirational passages, marked Phase 11 Step 7 `✅` on both the heading and the `S7` Mermaid node with the ADR linked).
No `src/`/`test/` changes; `rumdl`, `lint`, `check`, `test`, and `fallow dead-code` all green; the four Mermaid diagrams render under `mmdc`.
Next stage is `/ship-issue`.

### Observations

- Pre-completion reviewer: **WARN** (1 non-blocking finding).
  Reviewer warning: the plan's Open Questions names the dogfood-extension follow-up but it carries no recorded issue number — an intentional, explicitly-reasoned deferral to the next `/plan-improvements` pass, not an oversight.
  No action taken; flagged so it is not lost before that pass runs.
- The [#581] failure mode was actively guarded, not just avoided: the reviewer ran the plan's whole-file grep and confirmed the exact reverting miss — the `or is persisted quarantined for human review` non-persistence parenthetical — is gone, along with the `ModelTriageAuthorizer(inner)` decorator framing.
  Remaining grep hits are all intentional (the reconciled chain framing, the explicit `a superset of the earlier allow-or-escalate framing` supersession callout, and the `ModelTriageAuthorizer` anchor label the plan said to leave).
- Deviation from plan scope: **none.**
  Both build steps ran as written; the frozen history/plan/retro files listed in the plan's `Not edited` section were left untouched.
- Phase 11 close (heading `(complete)` + `history/phase-11-*.md` extraction) is deliberately out of scope — all seven steps are now `✅`, but the archival is a distinct `/finish-phase` activity, as with [#581].
