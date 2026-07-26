import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "./types";
import {
  hydrateGiphyAvatarPosters,
  resolveGiphyProfileMedia,
} from "./profile-giphy-media";

const giphyState = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("./giphy-service", () => ({
  resolveGiphyAssets: giphyState.resolve,
}));

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  avatarGiphyId: "avatar-gif",
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverGiphyId: "cover-gif",
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "online",
};

const asset = (id: string) => ({
  id,
  kind: "gif" as const,
  title: id,
  altText: id,
  width: 640,
  height: 360,
  previewUrl: `https://media.giphy.com/${id}-preview.mp4`,
  previewImageUrl: `https://media.giphy.com/${id}-preview.webp`,
  stillUrl: `https://media.giphy.com/${id}-still.webp`,
  originalUrl: `https://media.giphy.com/${id}.mp4`,
  originalImageUrl: `https://media.giphy.com/${id}.webp`,
  originalStillUrl: `https://media.giphy.com/${id}-original-still.webp`,
  analytics: {},
});

describe("GIPHY profile media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    giphyState.resolve.mockImplementation((ids: readonly string[]) =>
      Promise.resolve(ids.map(asset)),
    );
  });

  it("selects compact avatar and full cover renditions without persisting them", async () => {
    await expect(
      resolveGiphyProfileMedia(user, {
        includeAvatarAnimation: true,
        includeCover: true,
        includeCoverAnimation: true,
      }),
    ).resolves.toEqual({
      avatarPosterUrl: "https://media.giphy.com/avatar-gif-still.webp",
      avatarAnimationUrl: "https://media.giphy.com/avatar-gif-preview.webp",
      coverPosterUrl: "https://media.giphy.com/cover-gif-original-still.webp",
      coverAnimationUrl: "https://media.giphy.com/cover-gif.webp",
    });
    expect(giphyState.resolve).toHaveBeenCalledWith([
      "avatar-gif",
      "cover-gif",
    ]);
  });

  it("hydrates only static avatar posters and preserves missing assets as fallbacks", async () => {
    giphyState.resolve.mockResolvedValue([asset("avatar-gif")]);
    const missing = {
      ...user,
      id: "user-2",
      avatarGiphyId: "missing-gif",
      avatarUrl: "https://media.giphy.com/stale.webp",
    };

    const hydrated = await hydrateGiphyAvatarPosters([user, missing]);

    expect(hydrated[0]).toMatchObject({
      avatarUrl: "https://media.giphy.com/avatar-gif-still.webp",
      avatarAnimationUrl: null,
    });
    expect(hydrated[1]).toMatchObject({
      avatarUrl: null,
      avatarAnimationUrl: null,
    });
  });
});
