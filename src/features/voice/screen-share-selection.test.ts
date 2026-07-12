import { describe, expect, it } from "vitest";
import { chooseFeaturedScreenShare } from "./screen-share-selection";

const first = { id: "first", joinedAt: "2026-07-12T10:00:00.000Z" };
const newest = { id: "newest", joinedAt: "2026-07-12T10:02:00.000Z" };
const middle = { id: "middle", joinedAt: "2026-07-12T10:01:00.000Z" };

describe("chooseFeaturedScreenShare", () => {
  it("auto-selects the first presenter", () => {
    expect(chooseFeaturedScreenShare(null, [newest, first, middle])).toBe(
      "first",
    );
  });

  it("preserves a manual selection while it remains active", () => {
    expect(chooseFeaturedScreenShare("middle", [first, middle, newest])).toBe(
      "middle",
    );
  });

  it("selects the newest remaining presenter after the featured share ends", () => {
    expect(chooseFeaturedScreenShare("ended", [first, newest, middle])).toBe(
      "newest",
    );
  });
});
