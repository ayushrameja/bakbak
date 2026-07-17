import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileMediaCache } from "./profile-media-cache";

const state = vi.hoisted(() => ({
  download: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("./profile-service", () => ({
  AVATAR_BUCKET: "avatars",
  COVER_BUCKET: "profile-covers",
  downloadProfileMediaObjectUrl: state.download,
}));

describe("ProfileMediaCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: state.revoke,
    });
  });

  it("deduplicates authenticated downloads and revokes cached media", async () => {
    state.download.mockResolvedValue("blob:avatar");
    const cache = new ProfileMediaCache();

    const first = cache.load("avatars", "user/avatar");
    const second = cache.load("avatars", "user/avatar");
    await expect(first).resolves.toBe("blob:avatar");
    await expect(second).resolves.toBe("blob:avatar");
    expect(state.download).toHaveBeenCalledOnce();

    cache.evict("avatars", "user/avatar");
    expect(state.revoke).toHaveBeenCalledWith("blob:avatar");
  });

  it("discards a stale download that resolves after eviction", async () => {
    let finish: ((url: string) => void) | undefined;
    state.download.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    const cache = new ProfileMediaCache();
    const request = cache.load("profile-covers", "user/old-cover");
    cache.evict("profile-covers", "user/old-cover");
    finish?.("blob:stale-cover");

    await expect(request).resolves.toBeNull();
    expect(state.revoke).toHaveBeenCalledWith("blob:stale-cover");
  });
});
