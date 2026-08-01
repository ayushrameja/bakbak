import { describe, expect, it } from "vitest";
import { normalizeBuildRevision } from "./app-version";

describe("build revision", () => {
  it("keeps only an exact normalized public commit revision", () => {
    expect(
      normalizeBuildRevision(" AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "),
    ).toBe("a".repeat(40));
    expect(normalizeBuildRevision("main")).toBe("local");
    expect(normalizeBuildRevision("a".repeat(39))).toBe("local");
    expect(normalizeBuildRevision(undefined)).toBe("local");
  });
});
