/**
 * worktree.ts — Git worktree isolation for subagents.
 *
 * Creates a temporary git worktree so an agent works on an isolated copy of the repo.
 * On completion, if no changes were made, the worktree is cleaned up.
 * If changes exist, a branch is created and returned in the result.
 *
 * Lifted from the pi-subagents core (Phase 16 Step 3, ADR 0002): git plumbing is
 * a workspace strategy, not core behavior, and now lives behind the
 * WorkspaceProvider seam in this package.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { debugLog } from "#src/debug";

export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string;
  /** Branch name created for this worktree (if changes exist). */
  branch: string;
}

export interface WorktreeCleanupResult {
  /** Whether changes were found in the worktree. */
  hasChanges: boolean;
  /** Branch name if changes were committed. */
  branch?: string;
  /** Worktree path if it was kept. */
  path?: string;
}

/**
 * Create a temporary git worktree for an agent.
 * Returns the worktree path, or undefined if not in a git repo.
 */
export function createWorktree(
  cwd: string,
  agentId: string,
): WorktreeInfo | undefined {
  // Verify we're in a git repo with at least one commit (HEAD must exist)
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd,
      stdio: "pipe",
      timeout: 5000,
    });
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      stdio: "pipe",
      timeout: 5000,
    });
  } catch (err) {
    debugLog("createWorktree git rev-parse", err);
    return undefined;
  }

  const branch = `pi-agent-${agentId}`;
  const suffix = randomUUID().slice(0, 8);
  const worktreePath = join(tmpdir(), `pi-agent-${agentId}-${suffix}`);

  try {
    // Create detached worktree at HEAD
    execFileSync("git", ["worktree", "add", "--detach", worktreePath, "HEAD"], {
      cwd,
      stdio: "pipe",
      timeout: 30000,
    });
    return { path: worktreePath, branch };
  } catch (err) {
    debugLog("git worktree add", err);
    return undefined;
  }
}

/**
 * Clean up a worktree after agent completion.
 * - If no changes: remove worktree entirely.
 * - If changes exist: create a branch, commit changes, return branch info.
 */
export function cleanupWorktree(
  cwd: string,
  worktree: WorktreeInfo,
  agentDescription: string,
): WorktreeCleanupResult {
  if (!existsSync(worktree.path)) {
    return { hasChanges: false };
  }

  try {
    if (!statusPorcelain(worktree.path)) {
      // No changes — remove worktree
      removeWorktree(cwd, worktree.path);
      return { hasChanges: false };
    }

    // Changes exist — stage, commit, and create a branch
    stageAll(worktree.path);
    // Truncate description for commit message (no shell sanitization needed — execFileSync uses argv)
    const safeDesc = agentDescription.slice(0, 200);
    commitStaged(worktree.path, `pi-agent: ${safeDesc}`);
    const branch = createBranch(worktree.path, worktree.branch);

    // Remove the worktree (branch persists in main repo)
    removeWorktree(cwd, worktree.path);

    return {
      hasChanges: true,
      branch,
      path: worktree.path,
    };
  } catch (err) {
    debugLog("cleanupWorktree", err);
    try {
      removeWorktree(cwd, worktree.path);
    } catch (removeErr) {
      debugLog("removeWorktree on cleanup error", removeErr);
    }
    return { hasChanges: false };
  }
}

/** Porcelain status of a worktree, trimmed. An empty string means a clean tree. */
function statusPorcelain(worktreePath: string): string {
  return runGit(worktreePath, ["status", "--porcelain"]).trim();
}

/** Stage every change in the worktree, including untracked files. */
function stageAll(worktreePath: string): void {
  runGit(worktreePath, ["add", "-A"]);
}

/** Commit the staged snapshot. */
function commitStaged(worktreePath: string, message: string): void {
  runGit(worktreePath, ["commit", "-m", message]);
}

/**
 * Create a branch at the worktree's HEAD, returning the name actually used.
 * If the preferred name is taken, a timestamp suffix avoids overwriting previous work.
 */
function createBranch(worktreePath: string, preferred: string): string {
  try {
    runGit(worktreePath, ["branch", preferred], 5000);
    return preferred;
  } catch (err) {
    debugLog("git branch", err);
    const fallback = `${preferred}-${Date.now()}`;
    runGit(worktreePath, ["branch", fallback], 5000);
    return fallback;
  }
}

/** Run a git command, returning its captured stdout. */
function runGit(cwd: string, args: string[], timeout = 10000): string {
  return execFileSync("git", args, { cwd, stdio: "pipe", timeout }).toString();
}

/**
 * Force-remove a worktree.
 */
function removeWorktree(cwd: string, worktreePath: string): void {
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
      cwd,
      stdio: "pipe",
      timeout: 10000,
    });
  } catch (err) {
    debugLog("git worktree remove", err);
    try {
      execFileSync("git", ["worktree", "prune"], {
        cwd,
        stdio: "pipe",
        timeout: 5000,
      });
    } catch (pruneErr) {
      debugLog("git worktree prune", pruneErr);
    }
  }
}

/**
 * Prune any orphaned worktrees (crash recovery).
 */
export function pruneWorktrees(cwd: string): void {
  try {
    execFileSync("git", ["worktree", "prune"], {
      cwd,
      stdio: "pipe",
      timeout: 5000,
    });
  } catch (err) {
    debugLog("pruneWorktrees", err);
  }
}
