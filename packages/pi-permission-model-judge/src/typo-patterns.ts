/**
 * The cost gate: compile the operator's `typoPatterns` to regexes and test a
 * candidate path against them.
 *
 * Only a path that matches a configured pattern reaches the model — an empty or
 * absent pattern list matches nothing, so the reviewer defers everything
 * without a model call.
 */

/** Result of compiling a pattern list: usable regexes plus any that failed. */
export interface CompiledTypoPatterns {
  regexes: RegExp[];
  invalidPatterns: string[];
}

/**
 * Compile each pattern string to a `RegExp`, skipping any that `RegExp` rejects
 * (recorded in `invalidPatterns` so the caller can warn). Patterns compile
 * without flags, so `test` is stateless across calls.
 */
export function compileTypoPatterns(
  patterns: readonly string[],
): CompiledTypoPatterns {
  const regexes: RegExp[] = [];
  const invalidPatterns: string[] = [];
  for (const pattern of patterns) {
    try {
      regexes.push(new RegExp(pattern));
    } catch {
      invalidPatterns.push(pattern);
    }
  }
  return { regexes, invalidPatterns };
}

/** Whether any compiled pattern matches `path`. */
export function matchesAnyTypoPattern(
  path: string,
  compiled: CompiledTypoPatterns,
): boolean {
  return compiled.regexes.some((regex) => regex.test(path));
}
