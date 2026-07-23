import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BakbakCache } from "./local-cache";
import { ProfileMediaCache } from "./profile-media-cache";

const state = vi.hoisted(() => ({
  download: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("./profile-service", () => ({
  AVATAR_BUCKET: "avatars",
  COVER_BUCKET: "profile-covers",
  downloadProfileMediaBlob: state.download,
}));

describe("ProfileMediaCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: state.revoke,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: state.create,
    });
  });

  it("deduplicates authenticated downloads and revokes cached media", async () => {
    state.download.mockResolvedValue(new Blob(["avatar"]));
    state.create.mockReturnValue("blob:avatar");
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
    let finish: ((blob: Blob) => void) | undefined;
    state.download.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    );
    state.create.mockReturnValue("blob:stale-cover");
    const cache = new ProfileMediaCache();
    const request = cache.load("profile-covers", "user/old-cover");
    cache.evict("profile-covers", "user/old-cover");
    finish?.(new Blob(["stale-cover"]));

    await expect(request).resolves.toBeNull();
    expect(state.revoke).toHaveBeenCalledWith("blob:stale-cover");
  });

  it("reads persistent account media before downloading it again", async () => {
    const readProfileMedia = vi.fn().mockResolvedValue(new Blob(["cached"]));
    const persistent = {
      readProfileMedia,
      writeProfileMedia: vi.fn(),
      evictProfileMedia: vi.fn(),
    } as unknown as BakbakCache;
    state.create.mockReturnValue("blob:persistent-avatar");
    const cache = new ProfileMediaCache(persistent);
    cache.setAccount("user-1");

    await expect(cache.load("avatars", "user/avatar")).resolves.toBe(
      "blob:persistent-avatar",
    );
    expect(readProfileMedia).toHaveBeenCalledWith(
      "user-1",
      "avatars",
      "user/avatar",
    );
    expect(state.download).not.toHaveBeenCalled();
  });

  it("evicts an unreadable cached URL and refreshes its path from Storage", async () => {
    const cachedBlob = new Blob(["cached"]);
    const freshBlob = new Blob(["fresh"]);
    const writeProfileMedia = vi.fn();
    const evictProfileMedia = vi.fn().mockResolvedValue(undefined);
    const persistent = {
      readProfileMedia: vi.fn().mockResolvedValue(cachedBlob),
      writeProfileMedia,
      evictProfileMedia,
    } as unknown as BakbakCache;
    state.create
      .mockReturnValueOnce("blob:cached-cover")
      .mockReturnValueOnce("blob:fresh-cover");
    state.download.mockResolvedValue(freshBlob);
    const cache = new ProfileMediaCache(persistent);
    cache.setAccount("user-1");

    await expect(cache.load("profile-covers", "user/cover")).resolves.toBe(
      "blob:cached-cover",
    );
    await expect(
      cache.load("profile-covers", "user/cover", { refresh: true }),
    ).resolves.toBe("blob:fresh-cover");

    expect(state.revoke).toHaveBeenCalledWith("blob:cached-cover");
    expect(evictProfileMedia).toHaveBeenCalledWith(
      "user-1",
      "profile-covers",
      "user/cover",
    );
    expect(state.download).toHaveBeenCalledWith("profile-covers", "user/cover");
    expect(writeProfileMedia).toHaveBeenCalledWith(
      "user-1",
      "profile-covers",
      "user/cover",
      freshBlob,
    );
  });
});
