import { describe, expect, it } from "vitest";
import {
  soundWheelPages,
  wrapPage,
  loadWheelPage,
  saveWheelPage,
} from "./external-sound-wheel";
import type { ExternalAudioOverlayCatalog } from "./external-audio-overlay-channel";

export const wheelCatalog: ExternalAudioOverlayCatalog = {
  type: "catalog",
  scopeId: "user:server",
  categories: [
    { id: "a", name: "Reactions" },
    { id: "empty", name: "Empty" },
    { id: "b", name: "Music" },
  ],
  recentSoundIds: [],
  sounds: Array.from({ length: 14 }, (_, i) => ({
    id: `sound-${i}`,
    label: `Sound ${i}`,
    emoji: "🎵",
    categoryId: i < 8 ? "a" : "b",
    favorite: false,
    assetStatus: "ready",
  })),
};

describe("sound wheel pages", () => {
  it("keeps category boundaries, six slots per page, catalog order and partial pages", () => {
    const pages = soundWheelPages(wheelCatalog);
    expect(
      pages.map(({ category, number, total, sounds }) => [
        category,
        number,
        total,
        sounds.length,
      ]),
    ).toEqual([
      ["Reactions", 1, 2, 6],
      ["Reactions", 2, 2, 2],
      ["Music", 1, 1, 6],
    ]);
    expect(pages.flatMap(({ sounds }) => sounds.map(({ id }) => id))).toEqual(
      wheelCatalog.sounds.map(({ id }) => id),
    );
  });
  it("wraps in both directions including a one-page or empty catalog", () => {
    expect(wrapPage(2, 1, 3)).toBe(0);
    expect(wrapPage(0, -1, 3)).toBe(2);
    expect(wrapPage(0, -1, 1)).toBe(0);
    expect(wrapPage(0, 1, 0)).toBe(0);
  });
  it("keeps orphaned sounds reachable and skips empty categories", () => {
    expect(soundWheelPages({ ...wheelCatalog, categories: [] })).toHaveLength(
      3,
    );
    expect(soundWheelPages({ ...wheelCatalog, sounds: [] })).toEqual([]);
  });
  it("remembers pages independently per account and server", () => {
    saveWheelPage("alice:one", "b:0");
    saveWheelPage("bob:one", "a:1");
    expect(loadWheelPage("alice:one")).toBe("b:0");
    expect(loadWheelPage("bob:one")).toBe("a:1");
    expect(loadWheelPage("alice:two")).toBeNull();
  });
});
