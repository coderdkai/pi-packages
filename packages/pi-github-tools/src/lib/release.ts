/**
 * Platform-independent business logic for release tools.
 *
 * Each function mirrors a single tool entry point:
 *   - findReleasePR   → release_pr_find
 *   - mergeReleasePR  → release_pr_merge
 *   - watchRelease    → release_watch
 */

import { findRetryDelay, formatProgress } from "./ci-helpers";
import type { MergeMethod } from "./config";
import { gh, ghJson, git } from "./github";
import { classifyMergeState, type MergeReadiness } from "./merge-state";
import { sleep } from "./process";

export type { MergeMethod };

interface ReleasePR {
  number: number;
  title: string;
  headRefName: string;
  url: string;
  mergeable: string;
  mergeStateStatus: string;
}

interface PRState extends MergeReadiness {
  number: number;
  title: string;
}

export interface ToolResult {
  content: string;
  isError: boolean;
}

// ---------- findReleasePR ----------

export interface FindReleasePRArgs {
  timeout?: number;
  onProgress?: (line: string) => void;
  signal?: AbortSignal;
}

export async function findReleasePR(args: FindReleasePRArgs): Promise<string> {
  const timeout = args.timeout ?? 120;
  const onProgress = args.onProgress;
  const signal = args.signal;

  let elapsed = 0;
  let attempt = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with explicit return/break
  while (true) {
    attempt++;

    if (signal?.aborted) {
      return [
        "aborted: cancelled by user",
        `  retries: ${attempt}`,
        `  elapsed: ${elapsed}s`,
      ].join("\n");
    }

    const delay = findRetryDelay(attempt);
    if (delay > 0) {
      try {
        await sleep(delay * 1000, signal);
      } catch {
        return [
          "aborted: cancelled by user",
          `  retries: ${attempt}`,
          `  elapsed: ${elapsed}s`,
        ].join("\n");
      }
      elapsed += delay;
    }

    if (attempt > 1 && onProgress) {
      onProgress(
        `awaiting release-please PR... (attempt ${attempt}, ${elapsed}s elapsed)`,
      );
    }

    let prs: ReleasePR[];
    try {
      prs = await ghJson<ReleasePR[]>(
        [
          "pr",
          "list",
          "--label",
          "autorelease: pending",
          "--json",
          "number,title,headRefName,url,mergeable,mergeStateStatus",
          "--limit",
          "5",
        ],
        signal,
      );
    } catch {
      return [
        "aborted: cancelled by user",
        `  retries: ${attempt}`,
        `  elapsed: ${elapsed}s`,
      ].join("\n");
    }

    if (prs.length > 0) {
      const pr = prs[0];
      return [
        `pr_number: ${pr.number}`,
        `title: ${pr.title}`,
        `head_branch: ${pr.headRefName}`,
        `url: ${pr.url}`,
        `mergeable: ${pr.mergeable}`,
        `merge_state: ${pr.mergeStateStatus}`,
      ].join("\n");
    }

    if (elapsed >= timeout) {
      return [
        `timeout: no release-please PR found`,
        `  retries: ${attempt}`,
        `  elapsed: ${elapsed}s`,
      ].join("\n");
    }
  }
}

// ---------- mergeReleasePR ----------

export interface MergeReleasePRArgs {
  prNumber: number;
  method?: MergeMethod;
  timeout?: number;
  onProgress?: (line: string) => void;
  signal?: AbortSignal;
}

export async function mergeReleasePR(
  args: MergeReleasePRArgs,
): Promise<ToolResult> {
  const prNumber = args.prNumber;
  const signal = args.signal;
  const onProgress = args.onProgress;
  const timeout = args.timeout ?? 300;
  const method = args.method ?? "merge";
  const pollInterval = 10;
  let elapsed = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with explicit return/break
  while (true) {
    if (signal?.aborted) {
      return abortedMergeResult(elapsed);
    }

    const pr = await ghJson<PRState>(
      [
        "pr",
        "view",
        String(prNumber),
        "--json",
        "number,title,mergeable,mergeStateStatus,statusCheckRollup",
      ],
      signal,
    );

    const decision = classifyMergeState(pr);
    let progressLine: string | undefined;
    switch (decision.kind) {
      case "ready":
        return performMerge(prNumber, method, pr.title, signal);
      case "blocked":
        return blockedResult(pr, decision.reason);
      case "waiting-checks":
        progressLine = formatProgress(decision.checks, elapsed, "checks: ");
        break;
      case "waiting-mergeability":
        progressLine = `waiting for GitHub to compute mergeability... (${elapsed}s)`;
        break;
    }
    onProgress?.(progressLine);

    if (elapsed >= timeout) {
      return timeoutMergeResult(pr, timeout, progressLine);
    }

    try {
      await sleep(pollInterval * 1000, signal);
    } catch {
      return abortedMergeResult(elapsed);
    }
    elapsed += pollInterval;
  }
}

/**
 * Format the "not mergeable" error result for a blocked PR.
 * An optional `reason` appends a machine-greppable `reason:` line.
 */
function blockedResult(pr: PRState, reason?: string): ToolResult {
  const lines = [
    `PR #${pr.number} is not mergeable`,
    `  mergeable: ${pr.mergeable}`,
    `  merge_state: ${pr.mergeStateStatus}`,
    `  title: ${pr.title}`,
  ];
  if (reason) {
    lines.push(`  reason: ${reason}`);
  }
  return { content: lines.join("\n"), isError: true };
}

/** Format the timeout result when the PR never became mergeable within the bound. */
function timeoutMergeResult(
  pr: PRState,
  timeout: number,
  lastProgressLine: string | undefined,
): ToolResult {
  const lines = [
    `timeout: PR #${pr.number} did not become mergeable within ${timeout}s`,
    `  mergeable: ${pr.mergeable}`,
    `  merge_state: ${pr.mergeStateStatus}`,
    `  title: ${pr.title}`,
  ];
  if (lastProgressLine) {
    lines.push(`  ${lastProgressLine}`);
  }
  return { content: lines.join("\n"), isError: true };
}

/** Format the abort result when the signal fires while waiting for the PR to become mergeable. */
function abortedMergeResult(elapsed: number): ToolResult {
  return {
    content: ["aborted: cancelled by user", `  elapsed: ${elapsed}s`].join(
      "\n",
    ),
    isError: true,
  };
}

/** Merge the PR, pull the result, and report the new HEAD SHA. */
async function performMerge(
  prNumber: number,
  method: MergeMethod,
  title: string,
  signal: AbortSignal | undefined,
): Promise<ToolResult> {
  await gh(["pr", "merge", String(prNumber), `--${method}`], signal);

  await git(["pull", "--ff-only"], signal);

  const headSha = await git(["rev-parse", "HEAD"], signal);

  return {
    content: [
      `Merged PR #${prNumber}: ${title}`,
      `head_sha: ${headSha}`,
      `short_sha: ${headSha.substring(0, 7)}`,
    ].join("\n"),
    isError: false,
  };
}

// ---------- watchRelease ----------

export interface WatchReleaseArgs {
  timeout?: number;
  onProgress?: (line: string) => void;
  signal?: AbortSignal;
}

export async function watchRelease(args: WatchReleaseArgs): Promise<string> {
  const timeout = args.timeout ?? 180;
  const onProgress = args.onProgress;
  const signal = args.signal;

  const pollInterval = 10;
  let elapsed = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional infinite loop with explicit return/break
  while (true) {
    if (signal?.aborted) {
      return ["aborted: cancelled by user", `  elapsed: ${elapsed}s`].join(
        "\n",
      );
    }

    let tagOutput: string;
    try {
      await git(["fetch", "--tags"], signal);
      tagOutput = await git(["tag", "--points-at", "HEAD"], signal);
    } catch {
      return ["aborted: cancelled by user", `  elapsed: ${elapsed}s`].join(
        "\n",
      );
    }
    const tags = tagOutput
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    if (tags.length > 0) {
      const tag = tags[tags.length - 1]; // most recent tag
      let headSha: string;
      try {
        headSha = await git(["rev-parse", "HEAD"], signal);
      } catch {
        return ["aborted: cancelled by user", `  elapsed: ${elapsed}s`].join(
          "\n",
        );
      }
      return [
        `tag: ${tag}`,
        `version: ${tag.replace(/^v/, "")}`,
        `sha: ${headSha}`,
        `short_sha: ${headSha.substring(0, 7)}`,
      ].join("\n");
    }

    if (elapsed >= timeout) {
      return [
        `timeout: no release tag found on HEAD`,
        `  elapsed: ${elapsed}s`,
      ].join("\n");
    }

    if (onProgress) {
      onProgress(`waiting for release tag... (${elapsed}s elapsed)`);
    }

    try {
      await sleep(pollInterval * 1000, signal);
    } catch {
      return ["aborted: cancelled by user", `  elapsed: ${elapsed}s`].join(
        "\n",
      );
    }
    elapsed += pollInterval;
  }
}
