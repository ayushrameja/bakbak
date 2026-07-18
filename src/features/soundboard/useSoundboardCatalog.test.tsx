import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSoundboardCategories } from "./mock-catalog";
import { useSoundboardCatalog } from "./useSoundboardCatalog";

const soundboardService = vi.hoisted(() => ({
  deleteSoundboardSound: vi.fn(),
  downloadSoundboardObject: vi.fn(),
  loadSoundboardCatalog: vi.fn(),
  setSoundboardFavorite: vi.fn(),
  subscribeToSoundboardCatalog: vi.fn(),
  updateSoundboardMetadata: vi.fn(),
  uploadSoundboardClip: vi.fn(),
}));

vi.mock("../../lib/soundboard-service", () => soundboardService);

describe("useSoundboardCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    soundboardService.loadSoundboardCatalog.mockResolvedValue({
      categories: mockSoundboardCategories,
      sounds: [],
      favoriteSoundIds: new Set<string>(),
    });
    soundboardService.subscribeToSoundboardCatalog.mockReturnValue(vi.fn());
  });

  it("rolls back an optimistic favorite when account sync fails", async () => {
    let rejectFavorite!: (reason: Error) => void;
    soundboardService.setSoundboardFavorite.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectFavorite = reject;
      }),
    );
    const { result } = renderHook(() =>
      useSoundboardCatalog("server-1", "user-1", "live"),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let request!: Promise<void>;
    act(() => {
      request = result.current.toggleFavorite("sound-1");
    });
    expect(result.current.favoriteSoundIds.has("sound-1")).toBe(true);

    await act(async () => {
      rejectFavorite(new Error("sync failed"));
      await expect(request).rejects.toThrow("sync failed");
    });
    expect(result.current.favoriteSoundIds.has("sound-1")).toBe(false);
  });

  it("puts mock uploads into Bakbak and defaults an empty emoji", async () => {
    const { result } = renderHook(() =>
      useSoundboardCatalog("server-1", "user-1", "mock"),
    );
    const uploadCategory = mockSoundboardCategories.find(
      (category) => category.acceptsUploads,
    );

    await act(() =>
      result.current.uploadSound({
        label: "Tiny anthem",
        emoji: "",
        clip: new Blob(["wave"], { type: "audio/wav" }),
      }),
    );

    expect(result.current.sounds.at(-1)).toMatchObject({
      categoryId: uploadCategory?.id,
      label: "Tiny anthem",
      emoji: "🔊",
      createdBy: "user-1",
    });
  });
});
