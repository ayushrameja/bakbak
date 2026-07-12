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
});
