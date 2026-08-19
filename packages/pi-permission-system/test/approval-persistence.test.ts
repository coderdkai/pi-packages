import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  type ApprovalPersistenceDeps,
  persistAllowRule,
} from "#src/approval-persistence";
import { loadUnifiedConfig } from "#src/config-loader";

const tempDirs: string[] = [];

function makeDeps(): ApprovalPersistenceDeps & { root: string } {
  const root = mkdtempSync(join(tmpdir(), "permission-persist-"));
  tempDirs.push(root);
  return { root, agentDir: join(root, "agent"), cwd: join(root, "repo") };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const projectPath = (
  deps: ApprovalPersistenceDeps & { root: string },
): string =>
  join(
    deps.root,
    "repo",
    ".pi",
    "extensions",
    "pi-permission-system",
    "config.json",
  );

const globalPath = (deps: ApprovalPersistenceDeps & { root: string }): string =>
  join(deps.root, "agent", "extensions", "pi-permission-system", "config.json");

function writtenPermission(file: string): unknown {
  return loadUnifiedConfig(file).config.permission;
}

describe("persistAllowRule", () => {
  it("writes an allow rule to the project config and creates parent dirs", () => {
    const deps = makeDeps();
    const result = persistAllowRule(deps, "project", "bash", "git *");
    expect(result.ok).toBe(true);
    expect(existsSync(projectPath(deps))).toBe(true);
    expect(writtenPermission(projectPath(deps))).toEqual({
      bash: { "git *": "allow" },
    });
  });

  it("writes to the global config under the agent dir instead", () => {
    const deps = makeDeps();
    persistAllowRule(deps, "global", "bash", "git reset *");
    expect(existsSync(globalPath(deps))).toBe(true);
    expect(writtenPermission(globalPath(deps))).toEqual({
      bash: { "git reset *": "allow" },
    });
  });

  it("preserves existing surfaces, patterns, and non-permission knobs", () => {
    const deps = makeDeps();
    persistAllowRule(deps, "project", "bash", "git *");
    // Simulate an earlier manual config with multiple entries + a runtime knob.
    const file = projectPath(deps);
    const withMore = {
      ...loadUnifiedConfig(file).config,
      yoloMode: true,
      permission: {
        bash: { "git *": "allow", "rm *": "ask" },
        path: { "*": "deny" },
      },
    };
    writeFileSync(file, `${JSON.stringify(withMore, null, 2)}\n`);

    persistAllowRule(deps, "project", "bash", "git reset *");
    const now = loadUnifiedConfig(file).config;
    expect(now.yoloMode).toBe(true);
    expect(now.permission).toEqual({
      bash: { "git *": "allow", "rm *": "ask", "git reset *": "allow" },
      path: { "*": "deny" },
    });
  });

  it("no-ops (ok) when the exact allow rule already exists", () => {
    const deps = makeDeps();
    expect(persistAllowRule(deps, "project", "bash", "git *").ok).toBe(true);
    expect(persistAllowRule(deps, "project", "bash", "git *").ok).toBe(true);
    // Still exactly one entry.
    expect(writtenPermission(projectPath(deps))).toEqual({
      bash: { "git *": "allow" },
    });
  });

  it("overwrites an existing ask/deny for that pattern with allow", () => {
    const deps = makeDeps();
    const file = projectPath(deps);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify({ permission: { bash: { "git *": "ask" } } }, null, 2)}\n`,
    );
    expect(persistAllowRule(deps, "project", "bash", "git *").ok).toBe(true);
    expect(writtenPermission(file)).toEqual({
      bash: { "git *": "allow" },
    });
  });

  it("fails closed with an error rather than throwing on an empty surface", () => {
    const deps = makeDeps();
    const result = persistAllowRule(deps, "project", "", "git *");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(existsSync(projectPath(deps))).toBe(false);
  });
});
