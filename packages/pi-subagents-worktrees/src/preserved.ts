/**
 * preserved.ts — find the rescue worktrees a failed cleanup left on disk.
 *
 * `cleanupWorktree` preserves a worktree whenever it cannot finish safely, and
 * reports the path once in the child's result addendum. Nothing surfaces it
 * again: `git worktree prune` only drops entries whose directory is already
 * gone, and `tmpdir()` is cleared on the system's own schedule. This module is
 * how a session finds those worktrees again.
 */

import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, relative } from "node:path";
import type { LiveWorktrees } from "#src/active-worktrees";
import { debugLog } from "#src/debug";
import { AGENT_WORKTREE_PREFIX, listWorktreePaths } from "#src/worktree";

/** What separates a preserved rescue worktree from a live or unrelated one. */
interface Scope {
  /** Resolved temp root that rescue worktrees live under. */
  tmpRoot: string;
  /** Resolved path of the directory the scan runs in. */
  self: string;
  live: LiveWorktrees;
}

/**
 * Rescue worktrees still on disk for this repository, in git's listing order.
 *
 * Never reports a worktree a child of this process is still running in, nor the
 * one the caller is running inside. Returns nothing when git cannot answer.
 */
export function findPreservedWorktrees(
  repoCwd: string,
  live: LiveWorktrees,
): string[] {
  let registered: string[];
  try {
    registered = listWorktreePaths(repoCwd);
  } catch (err) {
    debugLog("git worktree list", err);
    return [];
  }

  const scope: Scope = {
    tmpRoot: realpathSync(tmpdir()),
    self: realpathSync(repoCwd),
    live,
  };
  return registered.filter((path) => isPreserved(path, scope));
}

function isPreserved(path: string, scope: Scope): boolean {
  if (!basename(path).startsWith(AGENT_WORKTREE_PREFIX)) return false;
  if (!contains(scope.tmpRoot, path)) return false;
  // Never offer up the ground the caller is standing on.
  if (contains(path, scope.self)) return false;
  if (!existsSync(path)) return false;
  return !scope.live.contains(path);
}

/** True when `descendant` is `parent` itself or lives beneath it. */
function contains(parent: string, descendant: string): boolean {
  const rel = relative(parent, descendant);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
