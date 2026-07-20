import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScreenShareStage } from "./ScreenShareStage";
import type { VoiceScreenShare } from "./useVoiceRoom";

const first = share("share-1", "Mira", "2026-07-12T10:00:00.000Z");
describe("ScreenShareStage", () => {
  it("renders media-first share controls over the focused video", async () => {
    const onBack = vi.fn();
    const { container } = render(
      <ScreenShareStage
        share={first}
        settings={{ resolution: 1080, frameRate: 60 }}
        settingsPending={false}
        fullscreen={false}
        fullscreenError={null}
        onBack={onBack}
        onActivateMedia={vi.fn()}
        onToggleFullscreen={vi.fn()}
        onUpdateSettings={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Mira screen")).toBeVisible();
    expect(
      container.querySelector(".screen-share-stage__controls"),
    ).toBeVisible();
    expect(screen.queryByText("Mira")).not.toBeInTheDocument();
    expect(screen.queryByText("Video only")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to grid" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("keeps fullscreen available without a metadata header", async () => {
    const onToggleFullscreen = vi.fn();
    render(
      <ScreenShareStage
        share={first}
        settings={{ resolution: 1080, frameRate: 60 }}
        settingsPending={false}
        fullscreen={false}
        fullscreenError={null}
        onBack={vi.fn()}
        onActivateMedia={vi.fn()}
        onToggleFullscreen={onToggleFullscreen}
        onUpdateSettings={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    );
    expect(onToggleFullscreen).toHaveBeenCalledOnce();
    expect(document.querySelector(".screen-share-stage > header")).toBeNull();
  });

  it("returns to the grid when the focused media is activated", async () => {
    const onActivateMedia = vi.fn();
    render(
      <ScreenShareStage
        share={first}
        settings={{ resolution: 1080, frameRate: 60 }}
        settingsPending={false}
        fullscreen={false}
        fullscreenError={null}
        onBack={vi.fn()}
        onActivateMedia={onActivateMedia}
        onToggleFullscreen={vi.fn()}
        onUpdateSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Return focused screen share to grid",
      }),
    );
    expect(onActivateMedia).toHaveBeenCalledOnce();
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
