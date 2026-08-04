/**
 * Classifies a PR's merge readiness from `gh pr view`'s `mergeable`,
 * `mergeStateStatus`, and `statusCheckRollup` fields.
 * Platform-independent — no Pi SDK imports.
 */
import type { CIJob } from "./ci-helpers";

/** One entry from `gh pr view --json statusCheckRollup` (CheckRun or StatusContext). */
export interface StatusCheckRollupItem {
  __typename?: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  context?: string;
  state?: string;
}

/** The subset of PR fields the readiness decision reads. */
export interface MergeReadiness {
  mergeable: string;
  mergeStateStatus: string;
  statusCheckRollup: StatusCheckRollupItem[];
}

export type MergeDecision =
  | { kind: "ready" }
  | { kind: "waiting-checks"; checks: CIJob[] }
  | { kind: "waiting-mergeability" }
  | { kind: "blocked"; reason: string };

// CheckRun conclusions and (lowercased) StatusContext states share this set
// once normalized to CIJob's `conclusion` field — StatusContext's "error"
// joins CheckRun's "failure" as a hard failure.
const FAILING_CONCLUSIONS = new Set([
  "failure",
  "error",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
]);
const PENDING_STATUS_CONTEXT_STATES = new Set(["pending", "expected"]);

/**
 * Decide what a caller should do next given a PR's merge-readiness fields:
 * merge, wait and re-check, or stop with a reason.
 */
export function classifyMergeState(pr: MergeReadiness): MergeDecision {
  if (pr.mergeable === "UNKNOWN" || pr.mergeStateStatus === "UNKNOWN") {
    return { kind: "waiting-mergeability" };
  }

  if (pr.mergeable !== "MERGEABLE") {
    return { kind: "blocked", reason: `mergeable is ${pr.mergeable}` };
  }

  if (pr.mergeStateStatus === "CLEAN" || pr.mergeStateStatus === "HAS_HOOKS") {
    return { kind: "ready" };
  }

  if (pr.mergeStateStatus === "UNSTABLE") {
    return classifyUnstable(pr.statusCheckRollup);
  }

  return {
    kind: "blocked",
    reason: `merge state is ${pr.mergeStateStatus}`,
  };
}

/** Classify an `UNSTABLE` PR from its check rollup. */
function classifyUnstable(rollup: StatusCheckRollupItem[]): MergeDecision {
  if (rollup.length === 0) {
    return {
      kind: "blocked",
      reason: "no checks reported (statusCheckRollup is empty)",
    };
  }

  const checks = rollup.map(toCIJob);

  const failing = checks.filter(
    (check) =>
      check.status === "completed" &&
      check.conclusion !== null &&
      FAILING_CONCLUSIONS.has(check.conclusion),
  );
  if (failing.length > 0) {
    return {
      kind: "blocked",
      reason: `check failed: ${failing.map((check) => check.name).join(", ")}`,
    };
  }

  return { kind: "waiting-checks", checks };
}

/** Normalize a rollup item (CheckRun or StatusContext) to the CIJob shape. */
function toCIJob(item: StatusCheckRollupItem): CIJob {
  if (item.__typename === "StatusContext") {
    const state = item.state?.toLowerCase() ?? "";
    const pending = PENDING_STATUS_CONTEXT_STATES.has(state);
    return {
      name: item.context ?? "",
      status: pending ? "in_progress" : "completed",
      conclusion: pending ? null : state,
    };
  }

  const status = item.status?.toLowerCase() ?? "";
  return {
    name: item.name ?? "",
    status,
    conclusion:
      status === "completed" ? (item.conclusion?.toLowerCase() ?? null) : null,
  };
}
