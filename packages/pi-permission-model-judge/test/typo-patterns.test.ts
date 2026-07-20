import { describe, expect, it } from "vitest";

import { compileTypoPatterns, matchesAnyTypoPattern } from "#src/typo-patterns";

describe("compileTypoPatterns", () => {
  it("compiles valid patterns and reports none invalid", () => {
    const compiled = compileTypoPatterns([
      "pi-permission-system/packages/pi-permission-system",
      "\\bnode_modules\\b",
    ]);
    expect(compiled.regexes).toHaveLength(2);
    expect(compiled.invalidPatterns).toEqual([]);
  });

  it("skips an invalid regex and records it", () => {
    const compiled = compileTypoPatterns(["valid", "(unclosed"]);
    expect(compiled.regexes).toHaveLength(1);
    expect(compiled.invalidPatterns).toEqual(["(unclosed"]);
  });

  it("produces no regexes for an empty pattern list", () => {
    const compiled = compileTypoPatterns([]);
    expect(compiled.regexes).toEqual([]);
    expect(compiled.invalidPatterns).toEqual([]);
  });
});

describe("matchesAnyTypoPattern", () => {
  it("matches when a pattern hits the path", () => {
    const compiled = compileTypoPatterns([
      "pi-permission-system/packages/pi-permission-system",
    ]);
    const path =
      "/home/x/pi-permission-system/packages/pi-permission-system/src/a.ts";
    expect(matchesAnyTypoPattern(path, compiled)).toBe(true);
  });

  it("does not match when no pattern hits the path", () => {
    const compiled = compileTypoPatterns(["doubled/doubled"]);
    expect(
      matchesAnyTypoPattern("/home/x/pi-packages/src/a.ts", compiled),
    ).toBe(false);
  });

  it("matches nothing when there are no patterns", () => {
    const compiled = compileTypoPatterns([]);
    expect(matchesAnyTypoPattern("/anything", compiled)).toBe(false);
  });

  it("is stateless across repeated calls", () => {
    const compiled = compileTypoPatterns(["segment"]);
    const path = "/a/segment/b";
    expect(matchesAnyTypoPattern(path, compiled)).toBe(true);
    expect(matchesAnyTypoPattern(path, compiled)).toBe(true);
  });
});
