---
issue: 709
issue_title: "pi-subagents: child disposal skips session_shutdown and leaks extension-owned processes"
---

# Retro: #709 — pi-subagents: child disposal skips `session_shutdown` and leaks extension-owned processes

## Stage: Planning (2026-08-13T17:55:00Z)

### Session summary

Verified the third-party bug report against the pinned SDK (`@earendil-works/pi-coding-agent@0.80.5`) and confirmed it is accurate: `AgentSession.dispose()` invalidates the extension runner without ever emitting `session_shutdown`, and pi-subagents does not use the `AgentSessionRuntime` path that would emit it.
Ran the `ask_user` direction gate (mandatory for a third-party issue) and got four decisions: fix as proposed, full await chain, bounded timeout, `fix:` with a behavior-change note.
Wrote `packages/pi-subagents/docs/plans/0709-child-session-shutdown-on-dispose.md` — a new `child-shutdown.ts` emitter plus async propagation through `SubagentSession` → `Subagent` → `SubagentManager` → `SessionLifecycleHandler`, in seven TDD steps.

### Observations

- **The fix is available on the public SDK surface.**
  `emitSessionShutdownEvent` is module-private in Pi and not re-exported from the package entry — checked both the installed `dist/` and the sibling `../pi` checkout on `main` — but `AgentSession.hasExtensionHandlers()` and `AgentSession.extensionRunner` are both public, so the three lines can be replicated.
  No deep import, no upstream dependency.
- **The ordering constraint is forced, not stylistic.**
  `AgentSession.dispose()` calls `extensionRunner.invalidate(...)`, and every `ctx` getter calls `assertActive()` and throws once invalidated.
  So a fire-and-forget emit followed by a synchronous `dispose()` would hand every shutdown handler a stale context — which is exactly why the "internal async, sync signatures" option was rejected in the `ask_user` gate.
- **Cross-package check paid off.**
  `pi-permission-system`'s `subagent-registry.ts:41` and `serving-registry.ts:93` already carry comments saying a child's `session_shutdown` must not wipe parent registrations, which is strong evidence the ecosystem anticipated this event firing in children and that the change is safe for the one known consumer.
- **Alternatives rejected.**
  Adopting `AgentSessionRuntime` for children (it emits shutdown for free) was rejected as disproportionate — the runtime also owns session replacement, UI context, and `/new`/`/fork`/`/resume` flows a child never uses.
  Filing a companion upstream Pi issue was offered and declined.
  A configurable `childShutdownTimeoutMs` setting was offered and declined in favor of a module constant.
- **Scope boundary held against [#617].**
  Shutting extensions down at child *completion* rather than *disposal* would release resources sooner but break resume, since retention deliberately outlives the run.
  The plan ties the emit to disposal and lists the completion-time variant as an Open Question with no issue filed.
- **No quantitative baseline was claimed.**
  The reporter's 25-pair / 221 MB figures are their measurement, not one reproduced here (it needs a configured stdio MCP server).
  The plan's verifiable assertion is deterministic and test-level instead: exactly one `session_shutdown` per disposed child, emitted before the runner is invalidated.
- **Lint hazard flagged up front.**
  `eslint.config.js` enables `recommendedTypeCheckedOnly`, so `no-floating-promises` and `no-misused-promises` are live.
  The plan keeps `sweep()` a synchronous function (so the `setInterval` callback still returns `void`) and requires an explicit `void promise.catch(debugLog)` at each fire-and-forget.
- **Three separate session mocks need the new runner stub** — `test/helpers/mock-session.ts`, its local counterpart inside `test/lifecycle/subagent-session.test.ts`, and (transitively, via a spread) `test/helpers/subagent-session-io.ts`.
  Step 2 of the TDD order lands that helper prep on its own so the type-forced steps that follow stay small.

[#617]: https://github.com/gotgenes/pi-packages/issues/617
