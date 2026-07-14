import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { mockSoundboardCategories, mockSoundboardSounds } from "./mock-catalog";
import { Soundboard } from "./Soundboard";

function renderSoundboard(overrides: Record<string, unknown> = {}) {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onVolumeChange = vi.fn();
  const onStopAll = vi.fn().mockResolvedValue(undefined);
  render(
    <Soundboard
      connected
      categories={mockSoundboardCategories}
      sounds={[mockSoundboardSounds[0]!, mockSoundboardSounds[4]!]}
      loading={false}
      error={null}
      volume={0.7}
      activeLocalSoundCount={2}
      maxConcurrentSounds={5}
      onPlay={vi.fn().mockResolvedValue(undefined)}
      onStopAll={onStopAll}
      onVolumeChange={onVolumeChange}
      onRetry={vi.fn().mockResolvedValue(undefined)}
      onUpdate={onUpdate}
      {...overrides}
    />,
  );
  return { onStopAll, onUpdate, onVolumeChange };
}

describe("Soundboard", () => {
  it("exposes the compact drawer controls without the old hero copy", () => {
    renderSoundboard();

    expect(
      screen.getByRole("region", { name: "Soundboard controls" }),
    ).toBeVisible();
    expect(screen.getByPlaceholderText("Find the perfect sound")).toBeVisible();
    expect(screen.getByLabelText("Soundboard connected")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Perfectly timed nonsense" }),
    ).not.toBeInTheDocument();
  });

  it("filters categories and exposes the shared persisted volume", async () => {
    const { onStopAll, onVolumeChange } = renderSoundboard();
    await userEvent.click(screen.getByRole("button", { name: "Dialogue" }));
    expect(
      screen.queryByRole("button", { name: "Aye" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ab Tu Gya Beta" }),
    ).toBeVisible();

    fireEvent.change(
      screen.getByRole("slider", { name: "Soundboard volume" }),
      {
        target: { value: "0.4" },
      },
    );
    expect(onVolumeChange).toHaveBeenCalledWith(0.4);
    await userEvent.click(
      screen.getByRole("button", { name: /Stop my sounds/ }),
    );
    expect(onStopAll).toHaveBeenCalledOnce();
  });

  it("lets a member edit label, emoji, and category metadata", async () => {
    const { onUpdate } = renderSoundboard();
    await userEvent.click(screen.getByRole("button", { name: "Edit Aye" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Name" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Name" }),
      "New Aye",
    );
    await userEvent.clear(screen.getByRole("textbox", { name: "Emoji" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Emoji" }), "🎉");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Category" }),
      mockSoundboardCategories[2]!.id,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onUpdate).toHaveBeenCalledWith(mockSoundboardSounds[0]!.id, {
      label: "New Aye",
      emoji: "🎉",
      categoryId: mockSoundboardCategories[2]!.id,
    });
  });

  it("searches the drawer catalog without changing playback data", async () => {
    renderSoundboard();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search sounds" }),
      "ab tu",
    );
    expect(
      screen.queryByRole("button", { name: "Aye" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ab Tu Gya Beta" }),
    ).toBeVisible();
  });

  it("shows the dedicated stop footer and disables ready sounds at five", () => {
    renderSoundboard({ activeLocalSoundCount: 5 });

    expect(screen.getByText("5/5 playing")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Stop my sounds" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Aye" })).toBeDisabled();
    expect(
      screen.getByText("Stop your stack before adding another sound."),
    ).toBeVisible();
  });

  it("keeps retryable downloads available when the play limit is full", () => {
    renderSoundboard({
      activeLocalSoundCount: 5,
      sounds: [
        {
          ...mockSoundboardSounds[0]!,
          assetStatus: "error",
        },
      ],
    });

    expect(
      screen.getByRole("button", { name: "Aye, retry download" }),
    ).toBeEnabled();
  });

  it("treats stop-all cancellation as intentional instead of an error", async () => {
    renderSoundboard({
      onPlay: vi
        .fn()
        .mockRejectedValue(
          new DOMException("Sound playback was stopped.", "AbortError"),
        ),
    });

    await userEvent.click(screen.getByRole("button", { name: "Aye" }));

    expect(
      screen.queryByText("Sound playback was stopped."),
    ).not.toBeInTheDocument();
  });
});
