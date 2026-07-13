import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Channel } from "../../lib/types";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import { VoiceControlBar } from "./VoiceControlBar";
import type { useVoiceRoom } from "./useVoiceRoom";

const channel: Channel = {
  id: "voice-1",
  serverId: "server-1",
  name: "Chai Corner",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};

describe("VoiceControlBar", () => {
  it("stays visible while connecting and protects connected-only actions", () => {
    renderBar(createVoice({ status: "connecting" }));

    expect(screen.getByText("Joining voice…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Mute" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deafen" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Open soundboard" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Leave voice" })).toBeEnabled();
  });

  it("provides mute, deafen, soundboard, and leave as direct actions", async () => {
    const toggleMute = vi.fn().mockResolvedValue(undefined);
    const toggleDeafen = vi.fn().mockResolvedValue(undefined);
    const leave = vi.fn().mockResolvedValue(undefined);
    const onToggleSoundboard = vi.fn();
    renderBar(
      createVoice({ toggleMute, toggleDeafen, leave }),
      onToggleSoundboard,
    );

    await userEvent.click(screen.getByRole("button", { name: "Mute" }));
    await userEvent.click(screen.getByRole("button", { name: "Deafen" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open soundboard" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Leave voice" }));

    expect(toggleMute).toHaveBeenCalledOnce();
    expect(toggleDeafen).toHaveBeenCalledOnce();
    expect(onToggleSoundboard).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();
  });

  it("keeps camera, screen sharing, and devices in the More menu", async () => {
    const toggleCamera = vi.fn().mockResolvedValue(undefined);
    const onOpenScreenShare = vi.fn();
    const onOpenDevices = vi.fn();
    renderBar(
      createVoice({ toggleCamera, screenShareAvailable: true }),
      vi.fn(),
      onOpenDevices,
      onOpenScreenShare,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "More voice controls" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Turn camera on" }),
    );
    expect(toggleCamera).toHaveBeenCalledOnce();

    await userEvent.click(
      screen.getByRole("button", { name: "More voice controls" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Share screen" }),
    );
    expect(onOpenScreenShare).toHaveBeenCalledOnce();

    await userEvent.click(
      screen.getByRole("button", { name: "More voice controls" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Audio & video settings" }),
    );
    expect(onOpenDevices).toHaveBeenCalledOnce();
  });

  it("closes the More menu with Escape and restores trigger focus", async () => {
    renderBar(createVoice());
    const more = screen.getByRole("button", { name: "More voice controls" });

    await userEvent.click(more);
    expect(screen.getByRole("menu")).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Turn camera on" }),
    ).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("dismisses the soundboard with Escape and restores trigger focus", async () => {
    const onToggleSoundboard = vi.fn();
    renderBar(createVoice(), onToggleSoundboard, vi.fn(), vi.fn(), true);
    const soundboard = screen.getByRole("button", {
      name: "Close soundboard",
    });

    soundboard.focus();
    await userEvent.keyboard("{Escape}");

    expect(onToggleSoundboard).toHaveBeenCalledOnce();
    expect(soundboard).toHaveFocus();
  });

  it("stops an active share without toggling the camera", async () => {
    const stopScreenShare = vi.fn().mockResolvedValue(undefined);
    const toggleCamera = vi.fn().mockResolvedValue(undefined);
    renderBar(
      createVoice({
        cameraEnabled: true,
        screenShareAvailable: true,
        screenShareEnabled: true,
        screenShareState: "sharing",
        stopScreenShare,
        toggleCamera,
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "More voice controls" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Stop sharing" }),
    );
    expect(stopScreenShare).toHaveBeenCalledOnce();
    expect(toggleCamera).not.toHaveBeenCalled();
  });
});

function renderBar(
  voice: ReturnType<typeof useVoiceRoom>,
  onToggleSoundboard = vi.fn(),
  onOpenDevices = vi.fn(),
  onOpenScreenShare = vi.fn(),
  soundboardOpen = false,
) {
  return render(
    <VoiceControlBar
      voice={voice}
      soundboardOpen={soundboardOpen}
      onToggleSoundboard={onToggleSoundboard}
      onOpenDevices={onOpenDevices}
      onOpenScreenShare={onOpenScreenShare}
    />,
  );
}

function createVoice(
  overrides: Partial<ReturnType<typeof useVoiceRoom>> = {},
): ReturnType<typeof useVoiceRoom> {
  return {
    status: "connected",
    channel,
    participants: [],
    muted: false,
    deafened: false,
    audioPlaybackBlocked: false,
    error: null,
    inputDeviceError: null,
    outputDeviceError: null,
    cameraDeviceError: null,
    inputDevices: [],
    outputDevices: [],
    cameraDevices: [],
    selectedInputId: "default",
    selectedOutputId: "default",
    selectedCameraId: "default",
    outputSelectionSupported: false,
    cameraEnabled: false,
    cameraPending: false,
    screenShares: [],
    selectedScreenShareId: null,
    screenShareAvailable: false,
    screenShareAudioAvailable: false,
    screenShareUnavailableReason: null,
    screenShareState: "idle",
    screenShareEnabled: false,
    screenSharePending: false,
    screenShareAudioPublished: false,
    screenShareSourceLabel: null,
    screenShareError: null,
    soundboard: mockSoundboardController,
    soundboardVolume: 0.7,
    activeLocalSoundCount: 0,
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    toggleMute: vi.fn().mockResolvedValue(undefined),
    toggleDeafen: vi.fn().mockResolvedValue(undefined),
    resumeAudio: vi.fn().mockResolvedValue(undefined),
    setParticipantVolume: vi.fn(),
    setInputDevice: vi.fn().mockResolvedValue(undefined),
    setOutputDevice: vi.fn().mockResolvedValue(undefined),
    setCameraDevice: vi.fn().mockResolvedValue(undefined),
    toggleCamera: vi.fn().mockResolvedValue(undefined),
    startScreenShare: vi.fn().mockResolvedValue(undefined),
    stopScreenShare: vi.fn().mockResolvedValue(undefined),
    selectScreenShare: vi.fn(),
    dispatchSound: vi.fn().mockResolvedValue(undefined),
    stopLocalSounds: vi.fn().mockResolvedValue(undefined),
    setSoundboardVolume: vi.fn(),
    updateSoundMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
