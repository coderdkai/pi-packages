import { describe, expect, it } from "vitest";

import { deriveApprovalPattern } from "#src/path/approval-pattern";
import { posixPathFlavor, win32PathFlavor } from "#src/path/path-flavor";

describe("deriveApprovalPattern", () => {
  describe("posix flavor", () => {
    it.each([
      ["/other/project/src/foo.ts", "/other/project/src/*"],
      ["/other/project/src/", "/other/project/src/*"],
      ["/other/project/src", "/other/project/*"],
      ["/", "/*"],
      ["/foo", "/*"],
      ["/dev/null", "/dev/*"],
      ["C:/foo/bar.ts", "C:/foo/*"],
      ["src/.env", "src/*"],
    ])("derives %s -> %s", (value, expected) => {
      expect(deriveApprovalPattern(value, posixPathFlavor)).toBe(expected);
    });

    it("treats a backslash as an ordinary filename character", () => {
      expect(deriveApprovalPattern("C:\\foo\\bar.ts", posixPathFlavor)).toBe(
        "./*",
      );
    });

    it("falls back to the current directory for a separator-free value", () => {
      expect(deriveApprovalPattern("index.html", posixPathFlavor)).toBe("./*");
      expect(deriveApprovalPattern("", posixPathFlavor)).toBe("./*");
    });
  });

  describe("win32 flavor", () => {
    it.each([
      ["C:\\foo\\bar.ts", "C:\\foo\\*"],
      ["C:\\", "C:\\*"],
      ["C:/foo/bar.ts", "C:/foo/*"],
    ])("derives a native windows path %s -> %s", (value, expected) => {
      expect(deriveApprovalPattern(value, win32PathFlavor)).toBe(expected);
    });

    it.each([
      ["/dev/null", "/dev/*"],
      ["/tmp/logs/", "/tmp/logs/*"],
      ["/tmp/logs", "/tmp/*"],
      ["/foo", "/*"],
      ["/", "/*"],
    ])("keeps a Git Bash token's own separator: %s -> %s", (value, expected) => {
      expect(deriveApprovalPattern(value, win32PathFlavor)).toBe(expected);
    });

    it("falls back to the windows current directory for a separator-free value", () => {
      expect(deriveApprovalPattern("index.html", win32PathFlavor)).toBe(".\\*");
    });
  });
});
