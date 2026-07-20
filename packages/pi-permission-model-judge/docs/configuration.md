# Configuration

`@gotgenes/pi-permission-model-judge` reads one config file per scope, following the standard `@gotgenes/pi-*` convention.

- Global: `~/.pi/agent/extensions/pi-permission-model-judge/config.json` (respects `PI_CODING_AGENT_DIR`).
- Project: `<cwd>/.pi/extensions/pi-permission-model-judge/config.json`.

The project file overrides the global one field-by-field; array fields (`typoPatterns`) replace wholesale rather than merging.
Point your editor at the bundled [JSON Schema](../schemas/model-judge.schema.json) via `$schema` for completion and validation.

## Two config files, one link name

This extension owns only the *model mechanism*.
The *chain policy* — whether the link runs at all, and its order — lives in `@gotgenes/pi-permission-system`.
The two files are joined only by the link name `model-judge`:

```jsonc
// pi-permission-system config.json — the safety policy
{ "authorizerChain": ["model-judge"] }
```

```jsonc
// pi-permission-model-judge config.json — the model mechanism
{
  "provider": "anthropic",
  "model": "claude-haiku-4-5",
  "instructions": "…",
  "typoPatterns": ["…"]
}
```

The link decides nothing until you name it in `authorizerChain` (opt-in activation), and pi-permission-system caps any link's authority, so this extension can only ever deny or defer an `external_directory` ask — never widen access.

## Fields

| Field          | Type       | Default  | Description                                                                                      |
| -------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------ |
| `provider`     | `string`   | required | Model provider, resolved against Pi's model registry (must have credentials configured in Pi).   |
| `model`        | `string`   | required | Model id within that provider.                                                                   |
| `instructions` | `string`   | required | The model's system prompt: describe what a typo path is and the correct-location reason to give. |
| `typoPatterns` | `string[]` | `[]`     | Regular expressions matched against the candidate path; only a match reaches the model.          |
| `timeoutMs`    | `integer`  | `5000`   | Per-review model-call budget in milliseconds. A timeout defers.                                  |

### `provider` and `model`

The reviewer resolves `provider` / `model` against the session's model registry at review time.
If the model does not resolve (wrong id, no credentials), the reviewer logs a warning and defers — it never blocks an ask because the judge is misconfigured.

### `instructions`

This is the model's system prompt.
Describe the typo shape you care about and instruct the model to reply with the wrong segment and the correct location, so the invoking agent can self-correct.
The reviewer expects the model to answer with strict JSON — `{"verdict":"deny","reason":"…"}` to reject, `{"verdict":"defer"}` otherwise — and any other reply defers.

### `typoPatterns`

Each string is compiled with `new RegExp(pattern)` (no flags) and tested against the candidate path.
Only a path that matches at least one pattern is sent to the model — this is the cost gate that keeps the reviewer from calling the model on every ask.
An invalid regular expression is skipped with a warning.
An empty list (the default) matches nothing, so the reviewer defers everything.

The canonical typo is a **doubled package segment** — a package name repeated around `packages/`, e.g. `pi-permission-system/packages/pi-permission-system/…`.
A backreference matches this for *any* package name in one pattern:

```json
"typoPatterns": ["([^/]+)/packages/\\1(/|$)"]
```

The `\1` backreference requires the segment before and after `packages/` to be identical, so it catches `<name>/packages/<name>` for every `<name>` while leaving a correct `packages/<name>/…` path untouched. (In JSON the backslash is doubled — `\\1` — so the parsed string is the regex `\1`.)

### `timeoutMs`

The model call is aborted after this many milliseconds, and an aborted call defers.
Keep it short — the reviewer sits in front of an interactive prompt.

## Fail-safe behavior

Every uncertain outcome defers, which sends the ask to the normal permission prompt:

- no config, or an invalid config;
- a surface other than `external_directory`;
- a path matching no `typoPatterns`;
- an unresolved model, a timeout, an unparseable reply, or an unsure verdict.

Deferring never grants access — this extension emits no `allow` verdict.
