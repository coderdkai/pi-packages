/**
 * forwarding-liveness.ts — Is anyone draining a forwarded-permission inbox?
 *
 * The in-process answer already exists: a serving session marks itself in the
 * process-global `ServingSessionRegistry`, and an in-process child abandons a
 * target that has looked unmarked for the grace window instead of waiting out
 * the full forwarding timeout (#719).
 *
 * A child spawned as a separate `pi` process shares no `globalThis` with its
 * parent, so that mark is invisible to it and it keeps waiting the full ten
 * minutes — every `ask` forwarded to a session that has already exited costs
 * the whole timeout and ends in a denial nobody made (#735 scenario 1).
 *
 * The filesystem is the only channel those two processes share, so the serving
 * session publishes a heartbeat there: one record per serving session,
 * refreshed while it polls and withdrawn when it stops.
 */

import { join } from "node:path";
import {
  ensureDirectoryExists,
  logPermissionForwardingError,
  safeDeleteFile,
  writeJsonFileAtomic,
} from "#src/authority/forwarding-io";
import {
  encodeSessionIdForPath,
  PERMISSION_FORWARDING_POLL_INTERVAL_MS,
} from "#src/authority/permission-forwarding";
import type { ServingAnnouncer } from "#src/authority/serving-registry";
import type { DebugReviewLogger } from "#src/session-logger";

/**
 * How often a serving session rewrites its heartbeat — four poll ticks.
 *
 * Longer than the poll interval so `ForwardingManager` can announce on every
 * tick without four filesystem writes a second, and short enough that a record
 * deleted underneath its owner reappears well inside the grace window a
 * forwarding child waits out before abandoning.
 */
export const SERVING_HEARTBEAT_REFRESH_MS =
  4 * PERMISSION_FORWARDING_POLL_INTERVAL_MS;

/**
 * How long a heartbeat may go unrefreshed before its writer is presumed gone —
 * five refreshes.
 *
 * Generous because a delayed Node timer is not a dead session, and because the
 * case this threshold exists for (a process that is alive but no longer
 * polling) is the rare one: an exited session withdraws its record and a killed
 * one is caught by the recorded pid, neither of which waits for staleness.
 */
export const SERVING_HEARTBEAT_STALE_MS = 5 * SERVING_HEARTBEAT_REFRESH_MS;

/** What a serving session publishes while it drains its forwarded-permission inbox. */
export interface ServingHeartbeat {
  sessionId: string;
  /** The serving process, so a killed session is detectable without waiting out staleness. */
  pid: number;
  updatedAt: number;
}

/** Constructor config for {@link ServingHeartbeatStore}. */
export interface ServingHeartbeatStoreDeps {
  forwardingDir: string;
  logger: DebugReviewLogger;
  /** Injected so the refresh throttle and staleness are testable without sleeping. */
  now?: () => number;
  /** The process to record. Injected so a test can publish a pid it controls. */
  pid?: number;
}

const SERVING_HEARTBEAT_DIRECTORY_NAME = "serving";

/**
 * Where serving heartbeats live: beside the `sessions/` tree, never inside it.
 *
 * A heartbeat under `sessions/<id>/` would make that session root permanently
 * non-empty, entangling liveness with the request/response cleanup whose
 * removal ordering already produced an ENOENT write loop (#398). Kept disjoint,
 * that logic stays untouched and "who is serving" is a single directory read.
 */
export function servingHeartbeatDir(forwardingDir: string): string {
  return join(forwardingDir, SERVING_HEARTBEAT_DIRECTORY_NAME);
}

/** The heartbeat record for `sessionId`, under {@link servingHeartbeatDir}. */
export function servingHeartbeatPath(
  forwardingDir: string,
  sessionId: string,
): string {
  return join(
    servingHeartbeatDir(forwardingDir),
    `${encodeSessionIdForPath(sessionId)}.json`,
  );
}

/**
 * Publishes this session's serving heartbeat to the filesystem.
 *
 * Satisfies the same {@link ServingAnnouncer} seam as `ServingSessionRegistry`,
 * so `ForwardingManager` announces to both channels through one collaborator
 * and neither knows the other exists.
 *
 * `markServing` is idempotent by that seam's contract and internally throttled,
 * so the caller may announce on every poll tick. Nothing here throws: it runs
 * from a timer, and a filesystem failure must degrade to the pre-existing
 * timeout rather than break the poll loop.
 */
export class ServingHeartbeatStore implements ServingAnnouncer {
  private readonly forwardingDir: string;
  private readonly logger: DebugReviewLogger;
  private readonly now: () => number;
  private readonly pid: number;
  private published: { sessionId: string; at: number } | null = null;

  constructor(deps: ServingHeartbeatStoreDeps) {
    this.forwardingDir = deps.forwardingDir;
    this.logger = deps.logger;
    this.now = deps.now ?? Date.now;
    this.pid = deps.pid ?? process.pid;
  }

  /** Publish (or refresh) `sessionId`'s heartbeat. Throttled; never throws. */
  markServing(sessionId: string): void {
    const at = this.now();
    if (this.isThrottled(sessionId, at)) {
      return;
    }

    const directory = servingHeartbeatDir(this.forwardingDir);
    if (
      !ensureDirectoryExists(
        this.logger,
        directory,
        "permission forwarding serving heartbeat",
      )
    ) {
      return;
    }

    const heartbeat: ServingHeartbeat = {
      sessionId,
      pid: this.pid,
      updatedAt: at,
    };
    try {
      writeJsonFileAtomic(
        this.logger,
        servingHeartbeatPath(this.forwardingDir, sessionId),
        heartbeat,
      );
    } catch (error) {
      logPermissionForwardingError(
        this.logger,
        `Failed to publish the serving heartbeat for session '${sessionId}'`,
        error,
      );
      return;
    }
    this.published = { sessionId, at };
  }

  /** Withdraw `sessionId`'s heartbeat, leaving the directory for its siblings. */
  clearServing(sessionId: string): void {
    if (this.published?.sessionId === sessionId) {
      this.published = null;
    }
    safeDeleteFile(
      this.logger,
      servingHeartbeatPath(this.forwardingDir, sessionId),
      "permission forwarding serving heartbeat",
    );
  }

  // ── Private methods ────────────────────────────────────────────────

  /**
   * Whether the record on disk is recent enough to leave alone.
   *
   * Time alone, with no existence probe: an existence check would cost a
   * syscall on every poll tick to save at most one refresh window, and a record
   * removed underneath its owner reappears inside the grace window anyway.
   */
  private isThrottled(sessionId: string, at: number): boolean {
    return (
      this.published !== null &&
      this.published.sessionId === sessionId &&
      at - this.published.at < SERVING_HEARTBEAT_REFRESH_MS
    );
  }
}
