import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScreenShareStage } from "./ScreenShareStage";
import type { VoiceScreenShare } from "./useVoiceRoom";

const first = share("share-1", "Mira", "2026-07-12T10:00:00.000Z");
const second = share("share-2", "Jo", "2026-07-12T10:01:00.000Z");

describe("ScreenShareStage", () => {
  it("keeps one featured share and lets the viewer switch presenters", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <ScreenShareStage
        shares={[first, second]}
        selectedId={first.id}
        localSourceLabel={null}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByLabelText("Mira screen")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Jo/ }));
    expect(onSelect).toHaveBeenCalledWith(second.id);
    rerender(
      <ScreenShareStage
        shares={[first, second]}
        selectedId={second.id}
        localSourceLabel={null}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByLabelText("Jo screen")).toBeVisible();
  });

  it("labels a share without source audio", () => {
    render(
      <ScreenShareStage
        shares={[first]}
        selectedId={first.id}
        localSourceLabel={null}
        onSelect={vi.fn()}
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
  };
}
