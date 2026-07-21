---
issue: 625
issue_title: "pi-permission-model-judge never authenticates its model call, so it defers every path to the human"
---

# Retro: #625 — pi-permission-model-judge never authenticates its model call

## Stage: Planning (2026-07-21T00:14:52Z)

### Session summary

Planned the fix for the model-judge reviewer never authenticating its model call, so it fail-safe-defers every path.
The primary fix resolves auth via `registry.getApiKeyAndHeaders(model)` in `createTypoReviewer` (symmetric with the existing `find`) and threads `apiKey`/`headers` into `reviewPath`'s `complete` call.
The secondary fix features a corrected dropped-prefix typo pattern (`pi-[^/]+(/|$)`) in the shipped example config and docs.

### Observations

- The primary defect is unambiguous and matches the issue's proposal exactly; the ambiguity was in the secondary defect's scope.
- State mismatch on the secondary defect: the buggy dropped-prefix pattern `development/pi/(?!pi-packages/)pi-[^/]+/` lives only in the `#600` retro (ship-excluded).
  The shipped example config + `docs/configuration.md` feature only the doubled-package pattern `([^/]+)/packages/\1(/|$)`, which already carries the `(/|$)` anchor (added in `abcfa23e`, before this issue was filed).
  So "the shipped example config and docs should carry the corrected pattern" did not map cleanly to the current tree.
- Resolved via `ask_user`: operator chose to feature both corrected typo patterns in the shipped artifacts, and to verify with unit tests plus a manual OAuth dogfood note.
- Design decision: resolve auth in `typo-reviewer.ts` (where the registry already lives), not in `reviewPath` — keeps `reviewPath` registry-free and warn-free (Law of Demeter), and mirrors the existing model-resolution placement.
- `ResolvedRequestAuth` is not re-exported from `@earendil-works/pi-coding-agent` (only the `ModelRegistry` class is), so the plan redeclares a minimal local type — consistent with `ModelRegistryLike` already being a local ISP projection.
- Featuring the dropped-prefix pattern also requires extending the example config's `instructions` so the model recognizes the dropped-`pi-packages/packages/` typo class, not just the doubled-package one.
- Test-fixture touch points: `makeRegistry` (`typo-reviewer.test.ts`) and `ctxWithRegistry` (`extension.test.ts`) both need a `getApiKeyAndHeaders` stub, or the model-consulting tests throw at runtime and false-red the deny assertions.
- Release: ship independently — no roadmap batch references this issue; `fix:` cuts a release on land.
