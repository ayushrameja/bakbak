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
  it("shows voice quality, accurately labelled backend latency, and actions", async () => {
    const leave = vi.fn().mockResolvedValue(undefined);
    const toggleCamera = vi.fn().mockResolvedValue(undefined);
    const stopScreenShare = vi.fn().mockResolvedValue(undefined);
    const onToggleSoundboard = vi.fn();
    render(
      <SidebarVoicePanel
        voice={
          {
            status: "connected",
            connectionQuality: "good",
            channel,
            cameraEnabled: false,
            cameraPending: false,
            screenShareEnabled: true,
            screenSharePending: false,
            screenShareAvailable: true,
            leave,
            toggleCamera,
            stopScreenShare,
          } as unknown as ReturnType<typeof useVoiceRoom>
        }
        mode="mock"
        soundboardOpen={false}
        onToggleSoundboard={onToggleSoundboard}
        onOpenScreenShare={vi.fn()}
      />,
    );

    expect(screen.getByText("Voice connected")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Current voice call" }),
    ).toHaveAttribute("data-state", "connected");
    expect(screen.getByText("Good")).toBeVisible();
    expect(
      screen.getByRole("status", {
        name: "Voice quality Good; backend latency Local",
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop sharing" })).toHaveClass(
      "is-selected",
    );
    expect(screen.getByRole("button", { name: "Leave voice" })).toHaveClass(
      "sidebar-voice-panel__leave",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Turn camera on" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open soundboard" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Leave voice" }));

    expect(toggleCamera).toHaveBeenCalledOnce();
    expect(stopScreenShare).toHaveBeenCalledOnce();
    expect(onToggleSoundboard).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();
  });

  it("labels reconnecting and disables connection-dependent actions", () => {
    render(
      <SidebarVoicePanel
        voice={
          {
            status: "reconnecting",
            connectionQuality: "poor",
            channel,
            cameraEnabled: false,
            cameraPending: false,
            screenShareEnabled: false,
            screenSharePending: false,
            screenShareAvailable: true,
            leave: vi.fn().mockResolvedValue(undefined),
          } as unknown as ReturnType<typeof useVoiceRoom>
        }
        mode="mock"
        soundboardOpen={false}
        onToggleSoundboard={vi.fn()}
        onOpenScreenShare={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Reconnecting")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Turn camera on" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share screen" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Open soundboard" }),
    ).toBeDisabled();
  });
});
