import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Channel } from "../../lib/types";
import { SidebarVoicePanel } from "./SidebarVoicePanel";
import type { useVoiceRoom } from "./useVoiceRoom";

const channel: Channel = {
  id: "voice-1",
  serverId: "server-1",
  categoryId: null,
  name: "Lounge",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};

describe("SidebarVoicePanel", () => {
  it("shows connection status and restores the three compact call actions", async () => {
    const leave = vi.fn().mockResolvedValue(undefined);
    const toggleCamera = vi.fn().mockResolvedValue(undefined);
    const onOpenScreenShare = vi.fn();
    const onToggleSoundboard = vi.fn();
    render(
      <SidebarVoicePanel
        voice={
          {
            status: "connected",
            channel,
            leave,
            cameraEnabled: false,
            cameraPending: false,
            toggleCamera,
            screenShareEnabled: false,
            screenSharePending: false,
            screenShareAvailable: true,
            stopScreenShare: vi.fn().mockResolvedValue(undefined),
          } as unknown as ReturnType<typeof useVoiceRoom>
        }
        soundboardOpen={false}
        onToggleSoundboard={onToggleSoundboard}
        onOpenScreenShare={onOpenScreenShare}
      />,
    );

    expect(screen.getByText("Voice connected")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Current voice call" }),
    ).toHaveAttribute("data-state", "connected");
    expect(screen.getByRole("button", { name: "Leave voice" })).toHaveClass(
      "sidebar-voice-panel__leave",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Turn camera on" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Share screen" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open soundboard" }),
    );
    expect(toggleCamera).toHaveBeenCalledOnce();
    expect(onOpenScreenShare).toHaveBeenCalledOnce();
    expect(onToggleSoundboard).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Leave voice" }));

    expect(leave).toHaveBeenCalledOnce();
  });

  it.each([
    ["connecting", "Connecting"],
    ["reconnecting", "Reconnecting"],
    ["error", "Needs attention"],
  ] as const)(
    "labels the %s state and keeps disconnect available",
    (status, label) => {
      render(
        <SidebarVoicePanel
          voice={
            {
              status,
              channel,
              leave: vi.fn().mockResolvedValue(undefined),
            } as unknown as ReturnType<typeof useVoiceRoom>
          }
          soundboardOpen={false}
          onToggleSoundboard={vi.fn()}
          onOpenScreenShare={vi.fn()}
        />,
      );

      expect(screen.getByText(label)).toBeVisible();
      expect(screen.getByRole("button", { name: "Leave voice" })).toBeEnabled();
    },
  );
});
