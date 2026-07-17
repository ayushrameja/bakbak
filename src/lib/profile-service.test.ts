import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_AVATAR_BYTES,
  saveLiveProfile,
  type ProfileRow,
  validateAvatarFile,
  validateDescription,
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
    vi.restoreAllMocks();
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
    profileState.download.mockResolvedValue({
      data: new Blob(["poster"], { type: "image/webp" }),
      error: null,
    });
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

  afterEach(() => vi.unstubAllGlobals());

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
    ).not.toThrow();
    expect(() =>
      validateAvatarFile(
        new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "large.png", {
          type: "image/png",
        }),
      ),
    ).toThrow(/smaller than 5 MiB/);
    expect(validateDescription("  tea and tiny experiments  ")).toBe(
      "tea and tiny experiments",
    );
    expect(() => validateDescription("x".repeat(191))).toThrow(
      /190 characters/,
    );
  });

  it("removes a new avatar upload when the canonical profile update fails", async () => {
    installImagePreparationMocks();
    profileState.single.mockResolvedValue({
      data: null,
      error: new Error("profile update failed"),
    });
    const avatar = new File(["image"], "mira.webp", { type: "image/webp" });

    await expect(
      saveLiveProfile({
        userId: "50000000-0000-4000-8000-000000000002",
        displayName: "Mira",
        description: "",
        currentAvatarPath: null,
        currentAvatarAnimationPath: null,
        currentCoverPath: null,
        currentCoverAnimationPath: null,
        coverPositionX: 50,
        coverPositionY: 50,
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
        avatar_animation_path: null,
        cover_path: null,
        cover_animation_path: null,
        cover_position_x: 50,
        cover_position_y: 50,
        description: "",
      },
      error: null,
    });

    await expect(
      saveLiveProfile({
        userId: "50000000-0000-4000-8000-000000000002",
        displayName: "Mira",
        description: "",
        currentAvatarPath:
          "50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001",
        currentAvatarAnimationPath: null,
        currentAvatarUrl: "https://legacy.example/avatar.png",
        currentCoverPath: null,
        currentCoverAnimationPath: null,
        coverPositionX: 50,
        coverPositionY: 50,
        removeAvatar: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ avatarPath: null, avatarUrl: null }),
    );

    expect(profileState.update).toHaveBeenCalledWith({
      display_name: "Mira",
      description: "",
      avatar_path: null,
      avatar_animation_path: null,
      cover_path: null,
      cover_animation_path: null,
      cover_position_x: 50,
      cover_position_y: 50,
      avatar_url: null,
    });
    expect(profileState.remove).toHaveBeenCalledWith([
      "50000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-00000000a001",
    ]);
  });

  it("stores static posters beside original GIF avatar and cover animations", async () => {
    installImagePreparationMocks();
    profileState.single.mockImplementation(() => {
      const update = profileState.update.mock.calls.at(-1)?.[0] as Omit<
        ProfileRow,
        "id"
      >;
      return Promise.resolve({
        data: {
          id: "50000000-0000-4000-8000-000000000002",
          ...update,
        },
        error: null,
      });
    });

    const saved = await saveLiveProfile({
      userId: "50000000-0000-4000-8000-000000000002",
      displayName: "Mira",
      description: "Tea and tiny experiments.",
      currentAvatarPath: null,
      currentAvatarAnimationPath: null,
      currentCoverPath: null,
      currentCoverAnimationPath: null,
      avatarFile: new File(["gif"], "avatar.gif", { type: "image/gif" }),
      coverFile: new File(["gif"], "cover.gif", { type: "image/gif" }),
      coverPositionX: 64,
      coverPositionY: 38,
    });

    expect(profileState.upload).toHaveBeenCalledTimes(4);
    expect(
      profileState.upload.mock.calls.map((call) => (call[1] as Blob).type),
    ).toEqual(["image/webp", "image/gif", "image/webp", "image/gif"]);
    expect(saved).toEqual(
      expect.objectContaining({
        description: "Tea and tiny experiments.",
        coverPositionX: 64,
        coverPositionY: 38,
      }),
    );
    expect(saved.avatarAnimationPath).toMatch(
      /^50000000-0000-4000-8000-000000000002\//,
    );
    expect(saved.coverAnimationPath).toMatch(
      /^50000000-0000-4000-8000-000000000002\//,
    );
  });

  it("subscribes before snapshot catch-up and replays a newer profile last", async () => {
    let resolveSnapshot:
      | ((value: {
          data: Array<{
            id: string;
            display_name: string;
            avatar_url: null;
            avatar_path: null;
            avatar_animation_path: null;
            cover_path: null;
            cover_animation_path: null;
            cover_position_x: number;
            cover_position_y: number;
            description: string;
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
            avatar_animation_path: null;
            cover_path: null;
            cover_animation_path: null;
            cover_position_x: number;
            cover_position_y: number;
            description: string;
          };
        }) => void)
      | undefined;
    const stale = {
      id: "50000000-0000-4000-8000-000000000002",
      display_name: "Old Mira",
      avatar_url: null,
      avatar_path: null,
      avatar_animation_path: null,
      cover_path: null,
      cover_animation_path: null,
      cover_position_x: 50,
      cover_position_y: 50,
      description: "",
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

function installImagePreparationMocks() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:profile-test"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  class TestImage {
    naturalWidth = 320;
    naturalHeight = 320;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private value = "";
    set src(value: string) {
      this.value = value;
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this.value;
    }
  }
  vi.stubGlobal("Image", TestImage);
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tagName: string, options?: ElementCreationOptions) => {
      if (tagName !== "canvas") return createElement(tagName, options);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback, type?: string) =>
          callback(new Blob(["poster"], { type: type ?? "image/png" })),
      } as unknown as HTMLCanvasElement;
    },
  );
}
