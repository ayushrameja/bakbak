import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScreenShareStage } from "./ScreenShareStage";
import type { VoiceScreenShare } from "./useVoiceRoom";

const first = share("share-1", "Mira", "2026-07-12T10:00:00.000Z");
describe("ScreenShareStage", () => {
  it("renders a control-free remote stage and returns through the media", async () => {
    const onActivateMedia = vi.fn();
    const { container } = render(
      <ScreenShareStage
        share={first}
        settings={{ resolution: 1080, frameRate: 60 }}
        settingsPending={false}
        onActivateMedia={onActivateMedia}
        onUpdateSettings={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Mira screen")).toBeVisible();
    expect(
      container.querySelector(".screen-share-stage__controls"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Mira")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Return focused screen share to people",
      }),
    );
    expect(onActivateMedia).toHaveBeenCalledOnce();
  });

  it("keeps presenter quality controls without restoring navigation chrome", () => {
    render(
      <ScreenShareStage
        share={{ ...first, isLocal: true }}
        settings={{ resolution: 1080, frameRate: 60 }}
        settingsPending={false}
        onActivateMedia={vi.fn()}
        onUpdateSettings={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Live screen share resolution")).toBeVisible();
    expect(screen.getByLabelText("Live screen share frame rate")).toBeVisible();
    expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();
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
