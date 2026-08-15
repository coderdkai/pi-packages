/**
 * Wrapper interpretation for a bash command unit: what kind of wrapper it is,
 * and — where it can be established — what it actually runs.
 *
 * Pure and word-based; the AST walk that produces the words lives in
 * `command-enumeration.ts`. Both questions live here together deliberately: the
 * shape that floors a unit to `ask` and the shape that names its inner command
 * must agree, and two classifiers over the same vocabulary would drift.
 */

/** One word of a command unit: its text, and its offset into the unit's text. */
export interface CommandWord {
  readonly text: string;
  readonly offset: number;
}

/**
 * Why a command unit's decision is floored to at least `ask`.
 * `"opaque-payload"` — an inline-shell payload (`bash -c`/`eval`) whose inner
 * program is not re-parsed (#481).
 * `"indirection"` — a prefix/exec wrapper (`sudo`/`env`/`xargs`/`find -exec`/…)
 * whose inner command is a visible argument but is not gated on its own (#490).
 * The kind selects the audit sentinel; both floor identically.
 */
export type WrapperKind = "opaque-payload" | "indirection";

/**
 * Classify a command unit's words as a floored wrapper, or `undefined` for an
 * ordinary command. `words[0]` is the command name; a leading
 * `variable_assignment` prefix is already stripped by the caller. The command
 * name is matched on its basename, so `/bin/bash -c …` counts.
 *
 * `"opaque-payload"`: `eval`, or a shell (`bash`/`sh`/`dash`/`zsh`/`ksh`) with a
 * `-c` short-flag cluster (`-c`, `-ec`, `-xc`) — the inner program is a quoted
 * argument the enumerator does not re-parse (#481).
 *
 * `"indirection"`: an always-invoking prefix/exec wrapper
 * ({@link INDIRECTION_WRAPPER_NAMES}), or a search tool
 * ({@link EXEC_CONDITIONAL_WRAPPERS}, `find`/`fd`) carrying a per-result exec
 * flag — the inner command is a visible argument that a `<cmd> *` rule would
 * otherwise never match (#490). A bare `find`/`fd` search runs no subcommand and
 * is not flagged.
 */
export function classifyWrapperWords(
  words: readonly CommandWord[],
): WrapperKind | undefined {
  const commandName = wrapperName(words);
  if (commandName === undefined) return undefined;
  const args = words.slice(1).map((word) => word.text);
  if (commandName === "eval") return "opaque-payload";
  if (SHELL_WRAPPER_NAMES.has(commandName) && hasShortFlagC(args)) {
    return "opaque-payload";
  }
  if (INDIRECTION_WRAPPER_NAMES.has(commandName)) return "indirection";
  if (execFlagIndex(commandName, args) !== -1) return "indirection";
  return undefined;
}

// ── Wrapper vocabulary ───────────────────────────────────────────────────────

/**
 * Shell command names whose `-c` flag introduces an opaque inline program.
 */
const SHELL_WRAPPER_NAMES = new Set(["bash", "sh", "dash", "zsh", "ksh"]);

/**
 * Indirection wrappers that always invoke a following command, so the wrapper
 * (not the inner command) is what a bash rule matches. Floored by command-name
 * basename alone. Extend this set to cover another always-invoking wrapper.
 */
const INDIRECTION_WRAPPER_NAMES = new Set([
  "sudo",
  "env",
  "xargs",
  "time",
  "nohup",
  "timeout",
  "nice",
  // Exec-capable rewrites and prefix wrappers surveyed in #575: parallelizers
  // (parallel/rust-parallel/rush), a sudo rewrite (doas), and prefix wrappers
  // (setsid/stdbuf/watch/flock) that all always invoke a following command.
  "parallel",
  "rust-parallel",
  "rush",
  "doas",
  "setsid",
  "stdbuf",
  "watch",
  "flock",
]);

/**
 * Search tools that invoke a command per result only when an exec flag is
 * present; a bare search runs no subcommand. Floored only when an argument
 * exactly matches one of the tool's exec flags. Extend by adding a tool with
 * its exec-flag set.
 */
const EXEC_CONDITIONAL_WRAPPERS = new Map<string, ReadonlySet<string>>([
  ["find", new Set(["-exec", "-execdir", "-ok", "-okdir"])],
  ["fd", new Set(["-x", "--exec", "-X", "--exec-batch"])],
]);

// ── Shared helpers ───────────────────────────────────────────────────────────

/** The wrapper's command-name basename, or `undefined` for an empty unit. */
function wrapperName(words: readonly CommandWord[]): string | undefined {
  return words.length === 0 ? undefined : basename(words[0].text);
}

/**
 * True when an argument list has a short-flag cluster containing `c` before any
 * `--` end-of-options marker (`-c`, `-ec`, `-xc`) — the inline-shell payload
 * flag for `bash`/`sh`/`dash`/`zsh`/`ksh`.
 */
function hasShortFlagC(args: readonly string[]): boolean {
  return shortFlagCIndex(args) !== -1;
}

/** Index within `args` of the `-c` short-flag cluster, or `-1`. */
function shortFlagCIndex(args: readonly string[]): number {
  for (const [index, arg] of args.entries()) {
    if (arg === "--") return -1;
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.includes("c")) {
      return index;
    }
  }
  return -1;
}

/** Index within `args` of a matched per-result exec flag, or `-1`. */
function execFlagIndex(commandName: string, args: readonly string[]): number {
  const execFlags = EXEC_CONDITIONAL_WRAPPERS.get(commandName);
  if (!execFlags) return -1;
  return args.findIndex((arg) => execFlags.has(arg));
}

/** The final path segment of a command name (`/bin/bash` → `bash`). */
function basename(name: string): string {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}
