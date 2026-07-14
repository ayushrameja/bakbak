import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Channel } from "../../lib/types";
import { SidebarVoicePanel } from "./SidebarVoicePanel";
import type { useVoiceRoom } from "./useVoiceRoom";

const channel: Channel = {
  id: "voice-1",
  serverId: "server-1",
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
    expect(screen.getByText("Good")).toBeVisible();
    expect(
      screen.getByRole("status", {
        name: "Voice quality Good; backend latency Local",
      }),
    ).toBeVisible();
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
});
