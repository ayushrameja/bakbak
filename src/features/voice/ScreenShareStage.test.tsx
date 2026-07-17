import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScreenShareStage } from "./ScreenShareStage";
import type { VoiceScreenShare } from "./useVoiceRoom";

const first = share("share-1", "Mira", "2026-07-12T10:00:00.000Z");
describe("ScreenShareStage", () => {
  it("renders a focused share and returns to the gallery", async () => {
    const onBack = vi.fn();
    render(
      <ScreenShareStage
        share={first}
        localSourceLabel={null}
        settings={{ resolution: 1080, frameRate: 60 }}
        settingsPending={false}
        fullscreen={false}
        onBack={onBack}
        onToggleFullscreen={vi.fn()}
        onUpdateSettings={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Mira screen")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Return to gallery" }),
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("labels a share without source audio", () => {
    render(
      <ScreenShareStage
        share={first}
        localSourceLabel={null}
        settings={{ resolution: 1080, frameRate: 60 }}
        settingsPending={false}
        fullscreen={false}
        onBack={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onUpdateSettings={vi.fn()}
      />,
    );
    expect(screen.getByText("Video only")).toBeVisible();
  });
});

function share(
  id: string,
  displayName: string,
  joinedAt: string,
): VoiceScreenShare {
  return {
    id,
    ownerId: id,
    displayName,
    isLocal: false,
    joinedAt,
    track: { attach: vi.fn(), detach: vi.fn() },
    audioPublished: false,
    paused: false,
  };
}
