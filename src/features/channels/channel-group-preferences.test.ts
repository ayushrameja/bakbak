import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  channelGroupPreferencesKey,
  loadCollapsedChannelGroups,
  saveCollapsedChannelGroups,
} from "./channel-group-preferences";

describe("channel group preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults every known group to expanded", () => {
    expect(
      loadCollapsedChannelGroups("server-1", [
        "category-welcome",
        "uncategorized:text",
      ]),
    ).toEqual({
      "category-welcome": false,
      "uncategorized:text": false,
    });
  });

  it("persists state independently per server", () => {
    saveCollapsedChannelGroups("server-1", {
      "category-welcome": true,
    });
    saveCollapsedChannelGroups("server-2", {
      "category-welcome": false,
    });

    expect(
      loadCollapsedChannelGroups("server-1", ["category-welcome"]),
    ).toEqual({
      "category-welcome": true,
    });
    expect(
      loadCollapsedChannelGroups("server-2", ["category-welcome"]),
    ).toEqual({
      "category-welcome": false,
    });
  });

  it("ignores stale IDs and expands newly introduced groups", () => {
    window.localStorage.setItem(
      channelGroupPreferencesKey("server-1"),
      JSON.stringify({
        "category-welcome": true,
        "category-retired": true,
      }),
    );

    expect(
      loadCollapsedChannelGroups("server-1", [
        "category-welcome",
        "category-new",
      ]),
    ).toEqual({
      "category-welcome": true,
      "category-new": false,
    });
  });

  it("falls back safely for malformed or unavailable storage", () => {
    window.localStorage.setItem(
      channelGroupPreferencesKey("server-1"),
      "not-json",
    );
    expect(
      loadCollapsedChannelGroups("server-1", ["category-welcome"]),
    ).toEqual({
      "category-welcome": false,
    });

    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    expect(
      loadCollapsedChannelGroups(
        "server-1",
        ["category-welcome"],
        unavailableStorage,
      ),
    ).toEqual({
      "category-welcome": false,
    });
    expect(() =>
      saveCollapsedChannelGroups(
        "server-1",
        { "category-welcome": true },
        unavailableStorage,
      ),
    ).not.toThrow();
  });
});
