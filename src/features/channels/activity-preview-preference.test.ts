import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityPreviewPreferenceKey,
  loadActivityPreviewCollapsed,
  saveActivityPreviewCollapsed,
} from "./activity-preview-preference";

describe("activity preview preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to expanded", () => {
    expect(loadActivityPreviewCollapsed("user-1", "server-1")).toBe(false);
  });

  it("persists collapse independently per account and server", () => {
    saveActivityPreviewCollapsed("user-1", "server-1", true);
    saveActivityPreviewCollapsed("user-1", "server-2", false);
    saveActivityPreviewCollapsed("user-2", "server-1", false);

    expect(loadActivityPreviewCollapsed("user-1", "server-1")).toBe(true);
    expect(loadActivityPreviewCollapsed("user-1", "server-2")).toBe(false);
    expect(loadActivityPreviewCollapsed("user-2", "server-1")).toBe(false);
  });

  it("falls back safely when storage is unavailable", () => {
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(
      loadActivityPreviewCollapsed("user-1", "server-1", unavailableStorage),
    ).toBe(false);
    expect(() =>
      saveActivityPreviewCollapsed(
        "user-1",
        "server-1",
        true,
        unavailableStorage,
      ),
    ).not.toThrow();
  });

  it("uses a versioned account-and-server key", () => {
    expect(activityPreviewPreferenceKey("user-1", "server-1")).toBe(
      "bakbak.activityPreviewCollapsed.v1:user-1:server-1",
    );
  });
});
