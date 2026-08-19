import { stripBashCommentLines } from "#src/bash-arity";

/**
 * Layered allow-scope candidates for a single bash command.
 *
 * When the operator approves persistently (a project or user-level allow), the
 * coarsest sensible grant is the exact command, and the finest is the whole
 * command family. Deciding "how much" of the command to record is the operator's
 * call — so rather than guessing one arity-derived suggestion, the dialog
 * offers every intermediate prefix as a candidate, ordered narrowest first:
 *
 *   git reset HEAD          (the exact command)
 *   git reset *             (the subcommand family)
 *   git *                   (the whole command family)
 *
 * The narrowest grant is listed first so the default (Enter) is the least
 * privilege; widening is a deliberate act of choosing a later entry.
 *
 * Pure and testable: it does not read config or state, only the command text.
 */

/** One selectable allow scope. */
export interface BashScopeCandidate {
  /** The command family described by this scope, joined on spaces. */
  readonly text: string;
  /** The wildcard pattern to persist as an allow rule. */
  readonly pattern: string;
}

/**
 * Build the layered scope candidates for a bash command, narrowest first.
 *
 * Each token prefix of the command yields one scope:
 * - the full command (all tokens verbatim) — exact, no trailing wildcard;
 * - each shorter prefix — `tokens[0..n] *` to cover the trailing arguments.
 *
 * All-prefix enumeration is exhaustive but inexpensive: a real command has a
 * handful of semicolon-free units. Only one candidate is returned for a
 * single-token command (the exact token); a two-token command yields the exact
 * form plus its parent family. A blank command, or one reduced to only comment
 * lines, yields an empty list.
 *
 * @param command The bash command text, as the agent invoked it.
 */
export function bashScopeCandidates(command: string): BashScopeCandidate[] {
  const stripped = stripBashCommentLines(command.trim());
  if (!stripped) return [];

  const tokens = stripped.trim().split(/\s+/);
  if (tokens.length === 0) return [];

  const candidates: BashScopeCandidate[] = [];
  const seen = new Set<string>();

  // Narrowest first: full exact command, then each parent family outward.
  // For "git reset HEAD" the order is: exact, "git reset *", "git *".
  for (let end = tokens.length; end >= 1; end--) {
    const prefix = tokens.slice(0, end).join(" ");
    const pattern = end === tokens.length ? prefix : `${prefix} *`;
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    candidates.push({ text: pattern, pattern });
  }

  return candidates;
}
