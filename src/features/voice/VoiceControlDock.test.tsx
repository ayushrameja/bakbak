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
  categoryId: null,
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

  it("marks muted and disconnect controls with destructive states", () => {
    renderDock(createVoice({ muted: true }));

    expect(screen.getByRole("button", { name: "Unmute" })).toHaveClass(
      "is-active",
    );
    expect(screen.getByRole("button", { name: "Unmute" })).not.toHaveClass(
      "is-danger",
    );
    expect(screen.getByRole("button", { name: "Leave voice" })).toHaveClass(
      "voice-control-dock__leave",
    );
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

  it("pins a prominent stop action while local sounds are active", async () => {
    vi.useFakeTimers();
    const stopLocalSounds = vi.fn().mockResolvedValue(undefined);
    renderDock(
      createVoice({
        activeLocalSoundCount: 3,
        stopLocalSounds,
      }),
    );
    const dock = screen.getByRole("region", { name: "Voice controls" });

    act(() => {
      vi.advanceTimersByTime(VOICE_DOCK_HIDE_DELAY_MS * 2);
    });
    expect(dock).toHaveAttribute("data-visible", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Stop my sounds (3 playing)" }),
    );
    await act(async () => Promise.resolve());
    expect(stopLocalSounds).toHaveBeenCalledOnce();
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
    joinStage: null,
    connectionQuality: "excellent",
    channel,
    participants: [],
    muted: false,
    deafened: false,
    audioPlaybackBlocked: false,
    error: null,
    inputDeviceError: null,
    microphoneProcessingError: null,
    outputDeviceError: null,
    cameraDeviceError: null,
    inputDevices: [],
    outputDevices: [],
    cameraDevices: [],
    selectedInputId: "default",
    selectedOutputId: "default",
    selectedCameraId: "default",
    enhancedNoiseSuppression: true,
    voiceEffect: "none",
    microphoneProcessingSupported: true,
    outputSelectionSupported: false,
    cameraEnabled: false,
    cameraPending: false,
    screenShares: [],
    watchedScreenShareId: null,
    screenShareAvailable: true,
    screenShareAudioAvailable: false,
    screenShareCustomPicker: false,
    screenShareUnavailableReason: null,
    screenShareState: "idle",
    screenShareEnabled: false,
    screenSharePending: false,
    screenShareAudioPublished: false,
    screenShareSourceLabel: null,
    screenShareSourceKind: null,
    screenShareSettings: { resolution: 1080, frameRate: 60 },
    screenShareSettingsPending: false,
    screenShareError: null,
    soundboard: mockSoundboardController,
    soundboardVolume: 0.7,
    activeLocalSoundCount: 0,
    maxConcurrentSounds: 5,
    prepareVoiceChannel: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    toggleMute: vi.fn().mockResolvedValue(undefined),
    toggleDeafen: vi.fn().mockResolvedValue(undefined),
    resumeAudio: vi.fn().mockResolvedValue(undefined),
    setParticipantVolume: vi.fn(),
    refreshDevices: vi.fn().mockResolvedValue(undefined),
    setInputDevice: vi.fn().mockResolvedValue(undefined),
    setEnhancedNoiseSuppression: vi.fn().mockResolvedValue(undefined),
    setVoiceEffect: vi.fn().mockResolvedValue(undefined),
    setOutputDevice: vi.fn().mockResolvedValue(undefined),
    dismissOutputDeviceError: vi.fn(),
    setCameraDevice: vi.fn().mockResolvedValue(undefined),
    toggleCamera: vi.fn().mockResolvedValue(undefined),
    startScreenShare: vi.fn().mockResolvedValue(undefined),
    updateScreenShareSettings: vi.fn().mockResolvedValue(undefined),
    stopScreenShare: vi.fn().mockResolvedValue(undefined),
    watchScreenShare: vi.fn(),
    stopWatchingScreenShare: vi.fn(),
    dispatchSound: vi.fn().mockResolvedValue(undefined),
    stopLocalSounds: vi.fn().mockResolvedValue(undefined),
    setSoundboardVolume: vi.fn(),
    updateSoundMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
