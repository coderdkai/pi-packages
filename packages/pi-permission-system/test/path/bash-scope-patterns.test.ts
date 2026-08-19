import { describe, expect, it } from "vitest";

import {
  type BashScopeCandidate,
  bashScopeCandidates,
} from "#src/path/bash-scope-patterns";

describe("bashScopeCandidates", () => {
  it("builds layered scopes for a multi-token command, narrowest first", () => {
    expect(bashScopeCandidates("git reset HEAD")).toEqual([
      { text: "git reset HEAD", pattern: "git reset HEAD" },
      { text: "git reset *", pattern: "git reset *" },
      { text: "git *", pattern: "git *" },
    ]);
  });

  it("returns only the exact token for a single-token command", () => {
    expect(bashScopeCandidates("ls")).toEqual([{ text: "ls", pattern: "ls" }]);
  });

  it("returns exact plus one parent for a two-token command", () => {
    expect(bashScopeCandidates("npm run build")).toEqual([
      { text: "npm run build", pattern: "npm run build" },
      { text: "npm run *", pattern: "npm run *" },
      { text: "npm *", pattern: "npm *" },
    ]);
  });

  it("strips a leading comment line before tokenizing", () => {
    const candidates = bashScopeCandidates(
      "# install deps\nnpm install lodash",
    );
    expect(candidates[0]?.pattern).toBe("npm install lodash");
  });

  it("does not include a bare trailing wildcard after the full command", () => {
    const candidates = bashScopeCandidates("git reset HEAD");
    expect(candidates.some((c) => c.pattern === "git reset HEAD *")).toBe(
      false,
    );
  });

  it("returns empty for a blank or comment-only command", () => {
    expect(bashScopeCandidates("")).toEqual([]);
    expect(bashScopeCandidates("# just a comment")).toEqual([]);
  });

  it("deduplicates repeated tokens produced from the enumeration", () => {
    const candidates: BashScopeCandidate[] = bashScopeCandidates("echo echo");
    const patterns = candidates.map((c) => c.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
