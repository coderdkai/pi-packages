---
issue: 741
issue_title: "pi-permission-system: commands inside redirect targets and heredoc bodies bypass the bash rules (residual #306 gap)"
---

# Retro: #741 — Commands inside redirect targets and heredoc bodies bypass the bash rules

## Stage: Planning (2026-08-15T03:19:18Z)

### Session summary

The session opened as `/plan-issue #306`, but [#306] was already closed as implemented and carried a later comment from `nikaro` reporting that `echo "hello world" > $(rm *.txt)` still bypasses the gate.
I reproduced the claim end-to-end against a real `PermissionManager`, found it correct and broader than reported, filed it as [#741], replied to `nikaro` on [#306], and then planned [#741].
Planning also uncovered a matching hole on the `path` / `external_directory` surfaces, which widened the issue's scope; the plan covers both surfaces plus a shared `nested-execution.ts` extraction, and defers control-flow bodies to [#742].

### Observations

- **The live repro was worth running.**
  The package skill's debugging rule ("reproduce the literal repro before concluding it is already handled") paid off in both directions: it confirmed `nikaro`'s case *and* surfaced four more (`>>`, `2>`, `&>`, `< <(…)`, unquoted heredoc) that the report did not mention.
  A pure code reading of `COMMAND_ENUM_SKIP` would have found the redirect case but probably not the heredoc one.
- **Root cause is a conflated set, not a missing branch.**
  `COMMAND_ENUM_SKIP` answers two questions at once — "is this a command?"
  and "can this host a command?"
  — and a redirect answers them differently.
  Framing the fix as splitting that set (rather than adding a special case for `file_redirect`) is what made the heredoc case fall out for free.
- **tree-sitter already solves the quoted-heredoc problem.**
  I expected to need a `heredoc_start` quote check; probing showed `<<'EOF'` and `<<"EOF"` simply produce no `command_substitution` node.
  Writing the issue before probing meant the filed text said "needs verifying" — the probe then simplified the design, and the issue was updated.
- **The review-log scan settled two decisions without an `ask_user`.**
  2950 unique bash commands: 0 with a redirect-hosted substitution (so the change is pure hardening), but 1341 (45%) carrying a redirect — which killed the tempting idea of folding the redirect into the enclosing unit's matched text, since that would break exact-match rules across half of real traffic.
  That went into Non-Goals with the number attached.
- **ADR 0009 triage mattered for framing.**
  The ADR lists "a command substitution (`$(cmd)`)" as an accepted residual, which could easily be misread as sanctioning this gap.
  It does not: the residual is the *computed filename*, not the inner command's own literal operands, which the projection already guarantees in argument position.
  Same shape as the `$HOME` half of [#694] — a guarantee met inconsistently across positions.
  The plan therefore includes an ADR clarification so the distinction is written down.
- **Versioning precedent was split and needed the operator.**
  [#301] shipped `fix:`, [#306] shipped `feat:`, but [#645] — the analogous *path*-projection widening — shipped `fix!:`.
  Because this plan does both kinds of widening, I surfaced the choice rather than guessing; the decision was non-breaking, justified by the 0-of-2950 measurement (no user needs to edit config, unlike [#645]'s 118 real hits).
- **Shared-module extraction was deliberately deferred until it had two consumers.**
  `nested-execution.ts` is justified only because the path surface needs the same context vocabulary once it must skip a host's text while descending its executions.
  Step 1 moves only what `command-enumeration.ts` already uses, so no export is dead at any commit and `fallow dead-code` stays clean.
- **Scope grew twice, both times on measured evidence.**
  Command surface only → both surfaces (path gap measured), and redirect targets only → plus heredoc bodies (quoted-delimiter handling proved free).
  Both were put to the operator as `ask_user` decisions with the measurements presented first.

[#301]: https://github.com/gotgenes/pi-packages/issues/301
[#306]: https://github.com/gotgenes/pi-packages/issues/306
[#645]: https://github.com/gotgenes/pi-packages/issues/645
[#694]: https://github.com/gotgenes/pi-packages/issues/694
[#742]: https://github.com/gotgenes/pi-packages/issues/742
