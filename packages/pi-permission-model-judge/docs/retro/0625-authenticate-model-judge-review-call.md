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

## Stage: Implementation — TDD (2026-07-21T00:53:18Z)

### Session summary

Implemented the auth fix across three TDD cycles: (1) widened `CompleteFn`/`ModelRegistryLike`/`ReviewPathInputs` and forwarded `apiKey`/`headers` in `reviewPath`; (2) resolved auth via `registry.getApiKeyAndHeaders(model)` in `createTypoReviewer` with a defer+warn fail-safe branch; (3) featured the corrected dropped-prefix typo pattern in the example config, README, docs, and corrected the stale `#600` retro pattern.
Test count went from 37 to 40 (+3) in the package; full suite, `check`, `lint`, and `fallow dead-code` all green.

### Observations

- Deviation from the plan: the `makeRegistry` test-fake `getApiKeyAndHeaders` stub was folded into step 1 instead of step 2.
  Widening `ModelRegistryLike` with a **required** `getApiKeyAndHeaders` breaks the fake at type-check time (`TS2741`), so the fixture must be satisfied in the same commit as the interface change to keep `pnpm run check` green at the step-1 boundary.
  Noted in the step-1 commit body.
- `extension.test.ts`'s `ctxWithRegistry` fake, by contrast, breaks only at **runtime** (its ctx is passed through an `unknown`-typed lifecycle map, so tsc does not check its shape), so its `getApiKeyAndHeaders` stub correctly landed in step 2 with the auth-resolution behavior.
- The `if (!registry || !model)` guard narrows `registry` to defined for the `getApiKeyAndHeaders` call, so no non-null assertion was needed (avoids the Biome/ESLint assertion loop).
- Ironic live validation: an `Edit` to `docs/configuration.md` used a dropped-prefix absolute path (`/Users/chris/development/pi/pi-permission-model-judge/...`) and the permission guard denied it — exactly the typo class this issue's secondary pattern targets.
  Retried with the correct relative path.
- Corrected dropped-prefix pattern `development/pi/(?!pi-packages/)pi-[^/]+(/|$)` verified against all four edge cases (bare package path → match, doubled → match, correct `pi-packages` → no match, sibling `pi` monorepo → no match) via `node -e` before landing.
- Pre-completion reviewer: PASS — all deterministic checks green, no design/doc/test-artifact concerns.
- Not yet done (manual verification the operator requested): a live OAuth dogfood confirming a real typo path now reaches a `deny` before the human.
  Deterministic unit coverage is complete; the manual note is confirmation, not the gate.
