import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_AVATAR_BYTES,
  saveLiveProfile,
  type ProfileRow,
  validateAvatarFile,
  validateDisplayName,
} from "./profile-service";

const profileState = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  tableFrom: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  updateUser: vi.fn(),
  channelFactory: vi.fn(),
  realtimeChannel: { on: vi.fn(), subscribe: vi.fn() },
  removeChannel: vi.fn(),
  snapshotSelect: vi.fn(),
  snapshotReturns: vi.fn(),
}));

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    storage: { from: profileState.storageFrom },
    from: profileState.tableFrom,
    auth: { updateUser: profileState.updateUser },
    channel: profileState.channelFactory,
    removeChannel: profileState.removeChannel,
  }),
}));

describe("profile validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileState.storageFrom.mockReturnValue({
      upload: profileState.upload,
      remove: profileState.remove,
      download: profileState.download,
    });
    profileState.tableFrom.mockReturnValue({ update: profileState.update });
    profileState.update.mockReturnValue({ eq: profileState.eq });
    profileState.eq.mockReturnValue({ select: profileState.select });
    profileState.select.mockReturnValue({ single: profileState.single });
    profileState.upload.mockResolvedValue({ error: null });
    profileState.remove.mockResolvedValue({ error: null });
    profileState.updateUser.mockResolvedValue({ error: null });
    profileState.realtimeChannel.on.mockReturnValue(
      profileState.realtimeChannel,
    );
    profileState.realtimeChannel.subscribe.mockReturnValue(
      profileState.realtimeChannel,
    );
    profileState.channelFactory.mockReturnValue(profileState.realtimeChannel);
    profileState.snapshotSelect.mockReturnValue({
      returns: profileState.snapshotReturns,
    });
  });

  it("trims a valid display name and rejects empty or oversized names", () => {
    expect(validateDisplayName("  Mira  ")).toBe("Mira");
    expect(() => validateDisplayName("   ")).toThrow(/between 1 and 50/);
    expect(() => validateDisplayName("x".repeat(51))).toThrow(
      /between 1 and 50/,
    );
  });

  it("accepts supported private avatar files and rejects unsafe inputs", () => {
    expect(() =>
      validateAvatarFile(
        new File(["image"], "mira.webp", { type: "image/webp" }),
      ),
    ).not.toThrow();
    expect(() =>
      validateAvatarFile(new File(["gif"], "mira.gif", { type: "image/gif" })),
    ).toThrow(/PNG, JPEG, or WebP/);
    expect(() =>
      validateAvatarFile(
        new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "large.png", {
          type: "image/png",
        }),
      ),
    ).toThrow(/smaller than 2 MiB/);
  });

  it("removes a new avatar upload when the canonical profile update fails", async () => {
    profileState.single.mockResolvedValue({
      data: null,
      error: new Error("profile update failed"),
    });
    const avatar = new File(["image"], "mira.webp", { type: "image/webp" });

    await expect(
      saveLiveProfile({
        userId: "50000000-0000-4000-8000-000000000002",
        displayName: "Mira",
        currentAvatarPath: null,
        avatarFile: avatar,
      }),
    ).rejects.toThrow("profile update failed");

    const uploadedPath = profileState.upload.mock.calls[0]?.[0] as string;
    expect(uploadedPath).toMatch(
      /^50000000-0000-4000-8000-000000000002\/[0-9a-f-]{36}$/,
    );
    expect(profileState.remove).toHaveBeenCalledWith([uploadedPath]);
    expect(profileState.updateUser).not.toHaveBeenCalled();
  });

  it("clears the legacy URL and removes the old private object on removal", async () => {
    profileState.single.mockResolvedValue({
      data: {
        id: "50000000-0000-4000-8000-000000000002",
        display_name: "Mira",
        avatar_url: null,
        avatar_path: null,
      },
      error: null,
    });

    await expect(
      saveLiveProfile({
        userId: "50000000-0000-4000-8000-000000000002",
        displayName: "Mira",
        currentAvatarPath:
          "50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001",
        currentAvatarUrl: "https://legacy.example/avatar.png",
        removeAvatar: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ avatarPath: null, avatarUrl: null }),
    );

    expect(profileState.update).toHaveBeenCalledWith({
      display_name: "Mira",
      avatar_path: null,
      avatar_url: null,
    });
    expect(profileState.remove).toHaveBeenCalledWith([
      "50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001",
    ]);
  });

  it("subscribes before snapshot catch-up and replays a newer profile last", async () => {
    let resolveSnapshot:
      | ((value: {
          data: Array<{
            id: string;
            display_name: string;
            avatar_url: null;
            avatar_path: null;
          }>;
          error: null;
        }) => void)
      | undefined;
    profileState.tableFrom.mockReturnValueOnce({
      select: profileState.snapshotSelect,
    });
    profileState.snapshotReturns.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const onProfile = vi.fn<(profile: ProfileRow) => void>();
    const { subscribeToProfileChanges } = await import("./profile-service");
    const unsubscribe = subscribeToProfileChanges(onProfile);
    const statusHandler = profileState.realtimeChannel.subscribe.mock
      .calls[0]?.[0] as ((status: string) => void) | undefined;
    const updateHandler = profileState.realtimeChannel.on.mock.calls[0]?.[2] as
      | ((payload: {
          new: {
            id: string;
            display_name: string;
            avatar_url: null;
            avatar_path: null;
          };
        }) => void)
      | undefined;
    const stale = {
      id: "50000000-0000-4000-8000-000000000002",
      display_name: "Old Mira",
      avatar_url: null,
      avatar_path: null,
    };
    statusHandler?.("SUBSCRIBED");
    updateHandler?.({ new: { ...stale, display_name: "New Mira" } });
    resolveSnapshot?.({ data: [stale], error: null });

    await vi.waitFor(() => expect(onProfile).toHaveBeenCalledTimes(2));
    expect(
      onProfile.mock.calls.map(([profile]) => profile.display_name),
    ).toEqual(["Old Mira", "New Mira"]);
    unsubscribe();
    expect(profileState.removeChannel).toHaveBeenCalledWith(
      profileState.realtimeChannel,
    );
  });
});
