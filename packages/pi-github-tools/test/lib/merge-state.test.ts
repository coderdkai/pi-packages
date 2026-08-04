import { describe, expect, it } from "vitest";
import {
  classifyMergeState,
  type StatusCheckRollupItem,
} from "#src/lib/merge-state";

function checkRun(
  overrides: Partial<StatusCheckRollupItem> = {},
): StatusCheckRollupItem {
  return {
    __typename: "CheckRun",
    name: "check",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    ...overrides,
  };
}

function statusContext(
  overrides: Partial<StatusCheckRollupItem> = {},
): StatusCheckRollupItem {
  return {
    __typename: "StatusContext",
    context: "ci/legacy",
    state: "SUCCESS",
    ...overrides,
  };
}

describe("classifyMergeState", () => {
  describe("UNKNOWN mergeability", () => {
    it("waits when mergeable is UNKNOWN", () => {
      const decision = classifyMergeState({
        mergeable: "UNKNOWN",
        mergeStateStatus: "UNKNOWN",
        statusCheckRollup: [],
      });
      expect(decision).toEqual({ kind: "waiting-mergeability" });
    });

    it("waits when mergeStateStatus is UNKNOWN even if mergeable resolved", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNKNOWN",
        statusCheckRollup: [],
      });
      expect(decision).toEqual({ kind: "waiting-mergeability" });
    });
  });

  describe("blocked mergeable", () => {
    it("blocks when mergeable is CONFLICTING", () => {
      const decision = classifyMergeState({
        mergeable: "CONFLICTING",
        mergeStateStatus: "DIRTY",
        statusCheckRollup: [],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "mergeable is CONFLICTING",
      });
    });
  });

  describe("ready", () => {
    it("is ready when mergeStateStatus is CLEAN", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        statusCheckRollup: [checkRun()],
      });
      expect(decision).toEqual({ kind: "ready" });
    });

    it("is ready when mergeStateStatus is HAS_HOOKS", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "HAS_HOOKS",
        statusCheckRollup: [checkRun()],
      });
      expect(decision).toEqual({ kind: "ready" });
    });
  });

  describe("UNSTABLE with empty rollup", () => {
    it("blocks with the no-checks-reported reason", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "no checks reported (statusCheckRollup is empty)",
      });
    });
  });

  describe("UNSTABLE with a pending check", () => {
    it("waits for a CheckRun that is IN_PROGRESS", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          checkRun({ status: "IN_PROGRESS", conclusion: null }),
        ],
      });
      expect(decision).toEqual({
        kind: "waiting-checks",
        checks: [{ name: "check", status: "in_progress", conclusion: null }],
      });
    });

    it("waits for a CheckRun that is QUEUED", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [checkRun({ status: "QUEUED", conclusion: null })],
      });
      expect(decision).toEqual({
        kind: "waiting-checks",
        checks: [{ name: "check", status: "queued", conclusion: null }],
      });
    });

    it("waits for a StatusContext that is PENDING", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          statusContext({ context: "legacy-ci", state: "PENDING" }),
        ],
      });
      expect(decision).toEqual({
        kind: "waiting-checks",
        checks: [
          { name: "legacy-ci", status: "in_progress", conclusion: null },
        ],
      });
    });

    it("waits for a StatusContext that is EXPECTED", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          statusContext({ context: "legacy-ci", state: "EXPECTED" }),
        ],
      });
      expect(decision).toEqual({
        kind: "waiting-checks",
        checks: [
          { name: "legacy-ci", status: "in_progress", conclusion: null },
        ],
      });
    });
  });

  describe("UNSTABLE with SKIPPED/NEUTRAL conclusions (not failures)", () => {
    it("does not treat an all-SKIPPED rollup as a failure", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          checkRun({ name: "check", conclusion: "SUCCESS" }),
          checkRun({ name: "release-please", conclusion: "SKIPPED" }),
          checkRun({ name: "publish", conclusion: "SKIPPED" }),
        ],
      });
      expect(decision.kind).not.toBe("blocked");
    });

    it("does not treat a NEUTRAL conclusion as a failure", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [checkRun({ conclusion: "NEUTRAL" })],
      });
      expect(decision.kind).not.toBe("blocked");
    });
  });

  describe("UNSTABLE with a failing check", () => {
    it("blocks and names the failing CheckRun", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [checkRun({ name: "check", conclusion: "FAILURE" })],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "check failed: check",
      });
    });

    it("names multiple failing checks", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          checkRun({ name: "lint", conclusion: "FAILURE" }),
          checkRun({ name: "test", conclusion: "CANCELLED" }),
        ],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "check failed: lint, test",
      });
    });

    it("treats TIMED_OUT as a failure", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          checkRun({ name: "check", conclusion: "TIMED_OUT" }),
        ],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "check failed: check",
      });
    });

    it("treats ACTION_REQUIRED as a failure", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          checkRun({ name: "check", conclusion: "ACTION_REQUIRED" }),
        ],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "check failed: check",
      });
    });

    it("treats STARTUP_FAILURE as a failure", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          checkRun({ name: "check", conclusion: "STARTUP_FAILURE" }),
        ],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "check failed: check",
      });
    });

    it("blocks on a failing StatusContext", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          statusContext({ context: "legacy-ci", state: "FAILURE" }),
        ],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "check failed: legacy-ci",
      });
    });

    it("blocks on an ERROR StatusContext", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [
          statusContext({ context: "legacy-ci", state: "ERROR" }),
        ],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: "check failed: legacy-ci",
      });
    });
  });

  describe("UNSTABLE with all checks complete and none failing", () => {
    it("keeps waiting when GitHub has not yet recomputed mergeStateStatus", () => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus: "UNSTABLE",
        statusCheckRollup: [checkRun({ name: "check", conclusion: "SUCCESS" })],
      });
      expect(decision).toEqual({
        kind: "waiting-checks",
        checks: [{ name: "check", status: "completed", conclusion: "success" }],
      });
    });
  });

  describe("other blocked merge states", () => {
    it.each([
      "DIRTY",
      "BLOCKED",
      "BEHIND",
      "DRAFT",
    ])("blocks when mergeStateStatus is %s", (mergeStateStatus) => {
      const decision = classifyMergeState({
        mergeable: "MERGEABLE",
        mergeStateStatus,
        statusCheckRollup: [],
      });
      expect(decision).toEqual({
        kind: "blocked",
        reason: `merge state is ${mergeStateStatus}`,
      });
    });
  });
});
