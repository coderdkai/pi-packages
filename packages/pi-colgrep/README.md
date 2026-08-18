# @gotgenes/pi-colgrep

[![npm version](https://img.shields.io/npm/v/@gotgenes/pi-colgrep?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@gotgenes/pi-colgrep) [![CI](https://img.shields.io/github/actions/workflow/status/gotgenes/pi-packages/ci.yml?style=flat&logo=github&label=CI)](https://github.com/gotgenes/pi-packages/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/) [![Pi Package](https://img.shields.io/badge/Pi-Package-6366F1?style=flat)](https://pi.mariozechner.at/)

Pi extension that integrates [ColGrep](https://github.com/lightonai/next-plaid#colgrep) semantic code search as a tool available to the agent.

ColGrep is a fully local semantic code search CLI built on multi-vector ColBERT embeddings and tree-sitter parsing.
It combines regex filtering with semantic ranking, supports 25 languages, and runs entirely on the user's machine.
This package exposes ColGrep as a Pi tool that complements (not replaces) the built-in `grep`.

## Scope and non-goals

**Purpose.**
The built-in `grep` finds text matching a pattern, but it cannot find code by intent when you do not know the exact wording.
This extension exposes the external ColGrep CLI as an agent tool and keeps its index warm across a session, so semantic search is useful without the agent having to manage it.

**In scope.**
The tool surface (argument building, result formatting, availability probing), the index lifecycle (debounce, coalescing, shutdown), and agent guidance about when semantic search is the right instrument.

**Non-goals.**

- _Replacing `grep`._
  Exact string, regex, and symbol matching stay with the built-in tools.
  The shipped skill exists specifically to stop the agent defaulting to semantic search for everything.
- _Owning the ColGrep binary._
  ColGrep is a user-supplied prerequisite on `PATH`.
  This extension does not bundle, install, patch, or vendor it, and a bug in the CLI is reported upstream rather than worked around here.
  It is also not an abstraction layer over interchangeable search engines — ColGrep is the backend.
- _Blocking startup on indexing._
  Startup indexing is fire-and-forget, so a session is usable immediately whatever the index is doing.
- _Indexing a directory nobody searched._
  The write/edit auto-reindex is gated on an index already existing, so editing files in an opted-out directory never creates one.
- _Trigger-policy heuristics._
  No git-repo detection, well-known-directory lists, or allow/deny path policy.
  One `indexOnStartup` boolean plus the index-existence gate covers the need without a policy enum.
- _Tunable debounce and timeout knobs._
  The reindex timings are fixed and the config surface stays deliberately small.
- _Reindexing from `bash`._
  Mutation triggers are scoped to the `write` and `edit` tools; inferring file mutation from an arbitrary shell command is unreliable.
- _Full CLI parity._
  The tool exposes a curated parameter subset.
  Flags it does not carry remain reachable by running `colgrep` through `bash`.
- _Failing hard when ColGrep is missing._
  The binary is an optional external dependency, so a missing, broken, or slow CLI degrades to a safe result and never blocks the agent.

**Where adjacent requests belong.**
Exact pattern or symbol matching → the built-in `grep`.
Finding files by name or glob → the built-in `find`.
Index freshness at search time → the ColGrep CLI's own lazy indexing, deliberately left intact.
Advanced filtering such as `--exclude` and `--exclude-dir`, or multi-directory search → `colgrep` invoked through `bash`.

## Prerequisites

- [ColGrep](https://github.com/lightonai/next-plaid#colgrep) installed and available on `PATH`
- Node.js ≥ 22

## Install

```bash
pi install npm:@gotgenes/pi-colgrep
```

Or add it to your Pi settings (`~/.pi/agent/settings.json`):

```json
{
  "packages": ["npm:@gotgenes/pi-colgrep"]
}
```

## Indexing

The extension keeps a semantic index current for the agent:

- On session start it builds the index in the **background** (`colgrep init`), so it never blocks Pi startup.
- After each successful `write`/`edit` it schedules a debounced reindex — but only when an index already exists for the directory, so a directory you never search is never indexed proactively.
- Run `/colgrep-reindex` to build or refresh the index on demand.
  This also re-enables the write/edit auto-reindex for the rest of the session.

If no index exists and startup indexing is disabled, the extension skips the auto-reindex and notifies you once.
A real `colgrep` search still auto-indexes on demand regardless.

## Configuration

Optional configuration is read from a JSON file at two locations, with the project file overriding the global one:

| Scope   | Path                                           |
| ------- | ---------------------------------------------- |
| Global  | `<agentDir>/extensions/pi-colgrep/config.json` |
| Project | `<cwd>/.pi/extensions/pi-colgrep/config.json`  |

| Key              | Type    | Default | Description                                                                                                                                                                               |
| ---------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `indexOnStartup` | boolean | `true`  | Build the index in the background on session start. Set to `false` to skip startup indexing entirely (the index is then built lazily on the first real search or via `/colgrep-reindex`). |

Example — disable startup indexing for a large non-code directory:

```json
{
  "indexOnStartup": false
}
```

A missing config file is fine (defaults apply); a malformed file is ignored with a warning.

## License

MIT
