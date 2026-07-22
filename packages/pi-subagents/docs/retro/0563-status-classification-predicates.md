---
issue: 563
issue_title: "Status classification predicates are re-derived outside SubagentState"
---

# Retro: #563 — Status classification predicates are re-derived outside SubagentState

## Stage: Planning (2026-07-18T00:00:00Z)

### Session summary

Planned the extraction of status classification predicates into `subagent-state.ts` as the single decision point, replacing ~11 re-derived multi-status groupings across 8 files.
The design pairs exported free functions (`isActiveStatus`, `isTerminalErrorStatus`, `isRunningStatus`) over `SubagentStatus` for methods-less DTO consumers with delegating instance methods (`isActive`, `isTerminalError`, `isRunning`, `canBeSteered`) on `SubagentState` and `Subagent` for record holders.
Committed the plan as `docs/plans/0563-status-classification-predicates.md`; four TDD cycles (`refactor:`-typed), ship independently.

### Observations

- The architecture roadmap (Phase 21, Step 1) had already settled most of the design — instance predicates plus exported status-level functions, delegating — so the plan mostly confirms and sequences it.
- Two genuine forks the roadmap left open were surfaced via `ask_user` and answered by the operator: (1) model the `=== "running"` sites as **both** `canBeSteered()` (steer) and `isRunning()` (abort + streaming), delegating to one `isRunningStatus`; (2) **tighten** the two `string`-typed presentation DTOs (`NotificationDetails.status`, `WidgetAgent.status`) to `SubagentStatus` and convert their groupings too — reaching **0** residual rather than the roadmap's ≤ 2.
- Key trap avoided: `ERROR_STATUSES` (display.ts) looks like the terminal-error grouping but includes `steered` and is a widget-linger presentation set — a different semantic; the plan explicitly does **not** unify it with `isTerminalError()`.
- `resolveStatusPresentation` and `getStatusLabel` stay as presentation dispatch; only the `isError` _classification_ inside `resolveStatusPresentation` routes through a predicate.
- DTO tightening is producer-safe: both loose fields come straight from `record.status`; `AgentDetails.status`'s extra `"background"` variant never reaches them, so it is untouched.
- The `resolveStatusPresentation("unknown")` test becomes a type error once the parameter tightens — planned for removal (out-of-domain fallback is unreachable under the tightened type).
- Skill references to the grouping (`improvement-discovery`, `code-design`) are generic teaching exemplars, not this package's code — no skill edits needed.
