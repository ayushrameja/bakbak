import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockSoundboardCategories, mockSoundboardSounds } from "./mock-catalog";
import { Soundboard } from "./Soundboard";

const serverId = "00000000-0000-4000-8000-000000000001";
const currentUserId = "10000000-0000-4000-8000-000000000001";
const systemSound = mockSoundboardSounds[0]!;
const bakbakSound = mockSoundboardSounds[23]!;

function renderSoundboard(overrides: Record<string, unknown> = {}) {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onVolumeChange = vi.fn();
  const onStopAll = vi.fn().mockResolvedValue(undefined);
  const onToggleFavorite = vi.fn().mockResolvedValue(undefined);
  const onUpload = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(
    <Soundboard
      serverId={serverId}
      currentUserId={currentUserId}
      currentUserRole="admin"
      connected
      categories={mockSoundboardCategories}
      sounds={[systemSound, bakbakSound]}
      favoriteSoundIds={new Set([systemSound.id])}
      loading={false}
      error={null}
      volume={0.7}
      activeLocalSoundCount={2}
      maxConcurrentSounds={5}
      onPlay={vi.fn().mockResolvedValue(undefined)}
      onStopAll={onStopAll}
      onVolumeChange={onVolumeChange}
      onRetry={vi.fn().mockResolvedValue(undefined)}
      onToggleFavorite={onToggleFavorite}
      onUpload={onUpload}
      onDelete={onDelete}
      onUpdate={onUpdate}
      {...overrides}
    />,
  );
  return {
    onDelete,
    onStopAll,
    onToggleFavorite,
    onUpdate,
    onUpload,
    onVolumeChange,
  };
}

describe("Soundboard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders Favorites, System, and Bakbak as persisted collapsible sections", async () => {
    renderSoundboard();

    const sectionButtons = screen.getAllByRole("button", {
      name: /Favorites|System|Bakbak/,
    });
    expect(sectionButtons.map((button) => button.textContent)).toEqual([
      "Favorites1",
      "System1",
      "Bakbak1",
    ]);
    expect(screen.getByRole("button", { name: /Favorites/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /System/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: /Bakbak/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: /System/ }));
    expect(
      JSON.parse(
        localStorage.getItem(`bakbak.soundboardSections.v1:${serverId}`) ??
          "{}",
      ),
    ).toMatchObject({ [mockSoundboardCategories[0]!.id]: false });
  });

  it("temporarily reveals matching sounds without overwriting collapse state", async () => {
    renderSoundboard({ favoriteSoundIds: new Set() });

    expect(
      screen.queryByRole("button", { name: systemSound.label }),
    ).toBeNull();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search sounds" }),
      systemSound.label,
    );
    expect(
      screen.getByRole("button", { name: systemSound.label }),
    ).toBeVisible();
    expect(
      localStorage.getItem(`bakbak.soundboardSections.v1:${serverId}`),
    ).toBeNull();
  });

  it("toggles account favorites from every sound card", async () => {
    const { onToggleFavorite } = renderSoundboard();
    const bakbakSection = screen
      .getByRole("button", { name: /Bakbak/ })
      .closest("section")!;

    await userEvent.click(
      within(bakbakSection).getByRole("button", {
        name: `Add ${bakbakSound.label} to favorites`,
      }),
    );
    expect(onToggleFavorite).toHaveBeenCalledWith(bakbakSound.id);
  });

  it("lets an uploader or admin edit metadata without moving categories", async () => {
    const { onUpdate } = renderSoundboard();
    const systemSection = screen
      .getByRole("button", { name: /System/ })
      .closest("section")!;
    await userEvent.click(screen.getByRole("button", { name: /System/ }));
    await userEvent.click(
      within(systemSection).getByRole("button", {
        name: `Edit ${systemSound.label}`,
      }),
    );
    await userEvent.clear(screen.getByRole("textbox", { name: "Name" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Name" }),
      "New Aye",
    );
    await userEvent.clear(screen.getByRole("textbox", { name: "Emoji" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Emoji" }), "🎉");
    expect(
      screen.queryByRole("combobox", { name: "Category" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onUpdate).toHaveBeenCalledWith(systemSound.id, {
      label: "New Aye",
      emoji: "🎉",
    });
  });

  it("hides management controls from non-owners while keeping favorites", () => {
    renderSoundboard({
      currentUserRole: "member",
      favoriteSoundIds: new Set(),
    });

    expect(
      screen.queryByRole("button", { name: `Edit ${bakbakSound.label}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Add ${bakbakSound.label} to favorites`,
      }),
    ).toBeVisible();
  });

  it("opens the member upload workflow from the drawer", async () => {
    renderSoundboard();
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));

    expect(
      screen.getByRole("dialog", { name: "Upload a sound" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Choose sound file")).toHaveAttribute(
      "accept",
      "audio/*,video/*",
    );
    expect(
      screen.getByText(/Video is welcome; Bakbak keeps only its audio/),
    ).toBeVisible();
  });

  it("exposes volume and the dedicated stop footer", async () => {
    const { onStopAll, onVolumeChange } = renderSoundboard();
    fireEvent.change(
      screen.getByRole("slider", { name: "Soundboard volume" }),
      { target: { value: "0.4" } },
    );
    expect(onVolumeChange).toHaveBeenCalledWith(0.4);
    expect(screen.getByText("2/5")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Stop my sounds (2/5 playing)" }),
    );
    expect(onStopAll).toHaveBeenCalledOnce();
  });

  it("disables ready sounds at five but keeps retryable downloads available", () => {
    renderSoundboard({
      activeLocalSoundCount: 5,
      favoriteSoundIds: new Set(),
      sounds: [{ ...bakbakSound, assetStatus: "error" }],
    });

    expect(screen.getByText("5/5")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: `${bakbakSound.label}, retry download`,
      }),
    ).toBeEnabled();
  });

  it("treats stop-all cancellation as intentional instead of an error", async () => {
    renderSoundboard({
      favoriteSoundIds: new Set(),
      onPlay: vi
        .fn()
        .mockRejectedValue(
          new DOMException("Sound playback was stopped.", "AbortError"),
        ),
    });

    await userEvent.click(
      screen.getByRole("button", { name: bakbakSound.label }),
    );
    expect(
      screen.queryByText("Sound playback was stopped."),
    ).not.toBeInTheDocument();
  });
});
