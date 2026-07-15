---
issue: 539
issue_title: "pi-subagents Phase 20 Step 5: narrow tui/theme render interfaces"
---

# Retro: #539 — pi-subagents Phase 20 Step 5: narrow tui/theme render interfaces

## Stage: Planning (2026-07-15T21:47:58Z)

### Session summary

Planned the type-only refactor to narrow the `tui`/`theme`/`result` render-callback params in `agent-widget.ts` and `agent-tool.ts` and remove their file-level `eslint-disable` headers.
Verified every needed SDK type (`AgentToolResult`, `AgentToolUpdateCallback`, `ToolRenderResultOptions`, `ExtensionContext`, `Theme`, `TUI`) is already exported from the public entries of the installed `0.79.1`, so no dependency-floor bump is required.
Confirmed the running file-level-disable tally is already 3 (Step 4 cleared `model-resolver`/`spawn-config`); this step takes it to 1.

### Observations

- The operator flagged that bumping the pi dependency floor was a valid option and pointed at the `~/development/pi/pi` source (0.80.7 tag).
  Investigated and found it unnecessary — the types this step consumes are all public in 0.79.1.
  Kept the plan on the installed version since `tsc` checks against what is installed.
- One genuine scope choice surfaced via `ask_user`: type `renderResult`'s `result` as `AgentToolResult<unknown>` + keep the `as AgentDetails` cast (minimal) vs. retype the shared `textResult` helper so `TDetails` infers `AgentDetails | undefined` and the cast disappears (fuller).
  Chose fuller — the issue's intent is replacing `any`-boundary implicitness with honest types, a cast is exactly the implicit assertion to avoid, and the fuller path also clears the named `foreground-runner` `details as any` target.
  All 17 `textResult` call sites were grepped and pass nothing or a `buildDetails(...)` (`AgentDetails`), so the retype is compiler-enforced-safe.
- Key assignability findings that de-risk the plan: SDK `Theme` uses method-syntax `fg`/`bold` (bivariant params), so it is assignable to the local `display.Theme` (`fg(color: string, ...)`); and the widget UI seam passes the SDK context through `unknown` (`ToolStartWidget.setUICtx(ctx: unknown)`), so narrowing `UICtx.setWidget`'s callback param has no checked `SDK-ctx → UICtx` assignment to break.
- The widget tests already stub `{ terminal: { columns: 200 }, requestRender: () => {} }` — the exact `TuiSurface` shape — so the lean local interface is the de-facto contract, favoring it over importing the SDK `TUI` class.
- Chose to type `_ctx`/inner `ctx` as the exported `ExtensionContext` to clear the last `no-unsafe-argument` in `agent-tool.ts`, aiming for zero residual there; the plan keeps a line-level-disable fallback only if lint surfaces an irreducible gap.
- This is `refactor:`-only (hidden changelog type): it auto-batches into the next release rather than cutting one, despite the roadmap's `Release: independent` tag.
