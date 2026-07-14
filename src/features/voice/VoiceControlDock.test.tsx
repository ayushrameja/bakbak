import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Channel } from "../../lib/types";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import { VOICE_DOCK_HIDE_DELAY_MS, VoiceControlDock } from "./VoiceControlDock";
import type { useVoiceRoom } from "./useVoiceRoom";

const channel: Channel = {
  id: "voice-1",
  serverId: "server-1",
  name: "Chai Corner",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};

afterEach(() => vi.useRealTimers());

describe("VoiceControlDock", () => {
  it("hides after 2.5 seconds and reveals for keyboard focus", () => {
    vi.useFakeTimers();
    renderDock(createVoice());
    const dock = screen.getByRole("region", { name: "Voice controls" });
    expect(dock).toHaveAttribute("data-visible", "true");

    act(() => {
      vi.advanceTimersByTime(VOICE_DOCK_HIDE_DELAY_MS);
    });
    expect(dock).toHaveAttribute("data-visible", "false");

    fireEvent.focus(screen.getByRole("button", { name: "Mute" }));
    expect(dock).toHaveAttribute("data-visible", "true");
  });

  it("provides direct call actions and keeps deafen in More", async () => {
    const toggleMute = vi.fn().mockResolvedValue(undefined);
    const toggleCamera = vi.fn().mockResolvedValue(undefined);
    const leave = vi.fn().mockResolvedValue(undefined);
    const toggleDeafen = vi.fn().mockResolvedValue(undefined);
    const onOpenScreenShare = vi.fn();
    const onToggleSoundboard = vi.fn();
    renderDock(createVoice({ toggleMute, toggleCamera, leave, toggleDeafen }), {
      onOpenScreenShare,
      onToggleSoundboard,
    });

    await userEvent.click(screen.getByRole("button", { name: "Mute" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Turn camera on" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Share screen" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Open soundboard" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "More voice controls" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Deafen" }));
    await userEvent.click(screen.getByRole("button", { name: "Leave voice" }));

    expect(toggleMute).toHaveBeenCalledOnce();
    expect(toggleCamera).toHaveBeenCalledOnce();
    expect(onOpenScreenShare).toHaveBeenCalledOnce();
    expect(onToggleSoundboard).toHaveBeenCalledOnce();
    expect(toggleDeafen).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledOnce();
  });

  it("pins itself while soundboard is open and clears text-channel space", () => {
    vi.useFakeTimers();
    const { rerender } = renderDock(createVoice(), {
      soundboardOpen: true,
      overTextChannel: true,
    });
    const dock = screen.getByRole("region", { name: "Voice controls" });
    expect(dock.parentElement).toHaveClass("is-over-text");

    act(() => {
      vi.advanceTimersByTime(VOICE_DOCK_HIDE_DELAY_MS * 2);
    });
    expect(dock).toHaveAttribute("data-visible", "true");

    rerender(
      <VoiceControlDock
        voice={createVoice()}
        soundboardOpen={false}
        overTextChannel
        onToggleSoundboard={vi.fn()}
        onOpenDevices={vi.fn()}
        onOpenScreenShare={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(VOICE_DOCK_HIDE_DELAY_MS);
    });
    expect(dock).toHaveAttribute("data-visible", "false");
  });
});

function renderDock(
  voice: ReturnType<typeof useVoiceRoom>,
  overrides: Partial<React.ComponentProps<typeof VoiceControlDock>> = {},
) {
  const props: React.ComponentProps<typeof VoiceControlDock> = {
    voice,
    soundboardOpen: false,
    overTextChannel: false,
    onToggleSoundboard: vi.fn(),
    onOpenDevices: vi.fn(),
    onOpenScreenShare: vi.fn(),
    ...overrides,
  };
  return render(<VoiceControlDock {...props} />);
}

function createVoice(
  overrides: Partial<ReturnType<typeof useVoiceRoom>> = {},
): ReturnType<typeof useVoiceRoom> {
  return {
    status: "connected",
    connectionQuality: "excellent",
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
    screenShareAvailable: true,
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
