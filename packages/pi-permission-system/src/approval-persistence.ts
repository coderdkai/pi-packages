import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadUnifiedConfig } from "#src/config-loader";
import { getGlobalConfigPath, getProjectConfigPath } from "#src/config-paths";
import type {
  FlatPermissionConfig,
  PatternValue,
  PermissionState,
} from "#src/types";

/**
 * Persist an explicit allow rule to a permission config scope.
 *
 * The `p`/`u` dialog options frame the operator's grant as "allow from now
 * on, in this project" / "…for this user", materialized as a real
 * `permission.<surface>.<pattern> = "allow"` entry in the corresponding
 * config file. This module owns that write: read-modify-write, de-duplicated,
 * atomic, and failure-degraded — it never corrupts the file and never throws
 * out to the dialog.
 *
 * Two scopes, matching the two config files the loader already reads:
 *   project — `<cwd>/.pi/extensions/pi-permission-system/config.json` (checked
 *             into the repo, per-repo policy — Claude Code per-repo analogue);
 *   global  — `~/.pi/agent/extensions/pi-permission-system/config.json`
 *             (personal, outside git — per-user policy).
 *
 * Neither the rule's shape nor the gate's reading of it is invented here:
 * `permission` is the same `FlatPermissionConfig` the config schema and the
 * manager merge, so a persisted rule takes effect through the existing load →
 * merge → compose pipeline the next time permissions resolve.
 */

/** Which config scope a persistent allow lands in. */
export type ApprovalScope = "project" | "global";

/** Inputs a persistence write needs; injectable for tests. */
export interface ApprovalPersistenceDeps {
  /** The pi agent directory, for the global config path. */
  agentDir: string;
  /** The current working directory, for the project config path. */
  cwd: string;
}

export interface ApprovalPersistResult {
  readonly ok: boolean;
  /** Present on failure — a human-readable reason for a degraded warning. */
  readonly error?: string;
}

/** The config path for a scope. */
function configPath(
  deps: ApprovalPersistenceDeps,
  scope: ApprovalScope,
): string {
  return scope === "project"
    ? getProjectConfigPath(deps.cwd)
    : getGlobalConfigPath(deps.agentDir);
}

/**
 * Write `permission[surface][pattern] = "allow"` into the given scope.
 *
 * The existing config is preserved (its other surfaces, patterns, and runtime
 * knobs are read first and merged over), so writing one rule never resets
 * unrelated policy. A rule already `allow` is a no-op success. Everything
 * else — an existing `ask`/`deny` for that pattern, or an absent one — is set
 * to `allow`: the operator just ruled on it.
 *
 * On failure the result carries an error rather than throwing, so the caller
 * degrades to a warning (and, per the dialog contract, a session-scoped grant)
 * instead of an uncaught crash.
 */
export function persistAllowRule(
  deps: ApprovalPersistenceDeps,
  scope: ApprovalScope,
  surface: string,
  pattern: string,
): ApprovalPersistResult {
  const path = configPath(deps, scope);
  if (surface === "" || pattern === "") {
    return { ok: false, error: "Cannot persist an empty surface or pattern." };
  }

  const existing = loadUnifiedConfig(path).config;
  const permission: FlatPermissionConfig | undefined = existing.permission;

  // A surface is either a bare catch-all state ("*") or a pattern→action map.
  // We only persist pattern rules, so read (and preserve) the map form.
  const existingSurface:
    | PermissionState
    | Record<string, PatternValue>
    | undefined = permission?.[surface];
  const surfaceMap: Record<string, PatternValue> = isPatternMap(existingSurface)
    ? existingSurface
    : {};

  // The current value of the exact entry, so an already-allow rule can no-op.
  if (surfaceMap[pattern] === "allow") {
    return { ok: true };
  }

  const nextSurfaceMap: Record<string, PatternValue> = {
    ...surfaceMap,
    [pattern]: "allow",
  };
  const nextPermission: FlatPermissionConfig = {
    ...permission,
    [surface]: nextSurfaceMap,
  };
  const nextConfig = { ...existing, permission: nextPermission };

  const tmpPath = `${path}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmpPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf-8");
    renameSync(tmpPath, path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }

  return { ok: true };
}

/** Narrow a surface's value to a pattern map, when it already is one. */
function isPatternMap(
  value: PermissionState | Record<string, PatternValue> | undefined,
): value is Record<string, PatternValue> {
  return typeof value === "object";
}
