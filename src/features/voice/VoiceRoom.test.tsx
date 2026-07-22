import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser, Channel, ServerMember } from "../../lib/types";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import { VoiceRoom } from "./VoiceRoom";
import type { useVoiceRoom } from "./useVoiceRoom";

const tauriWindow = vi.hoisted(() => {
  let fullscreen = false;
  let resized: (() => void) | null = null;
  let focusChanged: (() => void) | null = null;
  return {
    isFullscreen: vi.fn(() => Promise.resolve(fullscreen)),
    setFullscreen: vi.fn((next: boolean) => {
      fullscreen = next;
      return Promise.resolve();
    }),
    onResized: vi.fn((handler: () => void) => {
      resized = handler;
      return Promise.resolve(() => {
        resized = null;
      });
    }),
    onFocusChanged: vi.fn((handler: () => void) => {
      focusChanged = handler;
      return Promise.resolve(() => {
        focusChanged = null;
      });
    }),
    simulateNativeFullscreen(next: boolean) {
      fullscreen = next;
      resized?.();
      focusChanged?.();
    },
    reset() {
      fullscreen = false;
      resized = null;
      focusChanged = null;
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriWindow,
}));

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "online",
};

const channel: Channel = {
  id: "voice-1",
  serverId: "server-1",
  categoryId: null,
  name: "Lounge",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};
const friend: ServerMember = {
  ...user,
  id: "user-2",
  displayName: "Mira",
  email: "mira@example.test",
  role: "member",
};

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
    screenShareAvailable: false,
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

describe("VoiceRoom", () => {
  beforeEach(() => {
    tauriWindow.reset();
    tauriWindow.isFullscreen.mockClear();
    tauriWindow.setFullscreen.mockClear();
    tauriWindow.onResized.mockClear();
    tauriWindow.onFocusChanged.mockClear();
  });

  it("replaces the disconnected blank canvas with a rejoin invitation", async () => {
    const voice = createVoice({ status: "disconnected", channel: null });
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("No voices. Just premium silence.")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: `Rejoin ${channel.name}` }),
    );
    expect(voice.join).toHaveBeenCalledWith(channel);
  });

  it("focuses any share, toggles OS fullscreen, and keeps focus after Escape", async () => {
    const screenShare = {
      id: "share-1",
      ownerId: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: true,
      paused: false,
    };
    const voice = createVoice({ screenShares: [screenShare] });
    const { rerender } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: `Watch ${friend.displayName}'s screen share`,
      }),
    );
    expect(voice.watchScreenShare).toHaveBeenCalledWith(screenShare.id);

    await userEvent.click(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    );
    expect(tauriWindow.setFullscreen).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Exit fullscreen" }),
      ).toBeVisible(),
    );
    await userEvent.keyboard("{Escape}");
    expect(tauriWindow.setFullscreen).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText("Screen share stage")).toBeVisible();

    rerender(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ screenShares: [] })}
        onOpenSettings={vi.fn()}
      />,
    );
    expect(
      screen.queryByText("Source minimized or paused"),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".voice-media-gallery")).toBeVisible();
  });

  it("returns a focused share to the grid without interrupting its playback", async () => {
    const screenShare = {
      id: "share-1",
      ownerId: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: true,
      paused: false,
    };
    const voice = createVoice({
      screenShares: [screenShare],
      watchedScreenShareId: screenShare.id,
    });
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: `Focus ${friend.displayName}'s screen share`,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Back to grid" }));

    expect(voice.stopWatchingScreenShare).not.toHaveBeenCalled();
    expect(document.querySelector(".voice-media-gallery")).toBeVisible();
    expect(container.querySelector(".voice-media-gallery video")).toBeVisible();
    expect(screen.queryByText("Watch stream")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Voice room media targets" }),
    ).not.toBeInTheDocument();
  });

  it("reconciles renderer fullscreen controls with the actual native window", async () => {
    const screenShare = {
      id: "share-1",
      ownerId: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: false,
      paused: false,
    };
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ screenShares: [screenShare] })}
        onOpenSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: `Watch ${friend.displayName}'s screen share`,
      }),
    );
    await act(async () => {
      tauriWindow.simulateNativeFullscreen(true);
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: "Exit fullscreen" }),
    ).toBeVisible();

    await act(async () => {
      tauriWindow.simulateNativeFullscreen(false);
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    ).toBeVisible();
  });

  it("keeps the actual window state and reports a fullscreen request failure", async () => {
    const screenShare = {
      id: "share-1",
      ownerId: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: false,
      paused: false,
    };
    tauriWindow.setFullscreen.mockRejectedValueOnce(new Error("native nope"));
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ screenShares: [screenShare] })}
        onOpenSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: `Watch ${friend.displayName}'s screen share`,
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    );

    expect(
      await screen.findByText("Bakbak could not enter fullscreen."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    ).toBeVisible();
  });

  it("returns a focused participant to the grid when its media is activated", async () => {
    const participant = {
      id: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      isSpeaking: false,
      isMuted: false,
      volume: 1,
      joinedAt: null,
      cameraEnabled: false,
      cameraTrack: null,
      activeSounds: [],
    };
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ participants: [participant] })}
        onOpenSettings={vi.fn()}
      />,
    );

    const card = container.querySelector<HTMLElement>(".participant-card");
    expect(card).not.toBeNull();
    card?.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      screen.getByLabelText(`${friend.displayName} focused`),
    ).toBeVisible();

    const focusedCard = container.querySelector<HTMLElement>(
      ".voice-participant-stage .participant-card",
    );
    expect(focusedCard).not.toBeNull();
    focusedCard?.focus();
    await userEvent.keyboard("{Enter}");
    expect(container.querySelector(".voice-media-gallery")).toBeVisible();
  });

  it("retains the last share frame under a paused-source label", () => {
    const screenShare = {
      id: "share-1",
      ownerId: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: false,
      paused: true,
    };
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({
          screenShares: [screenShare],
          watchedScreenShareId: screenShare.id,
        })}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      screen.getAllByLabelText(`${friend.displayName} screen`)[0],
    ).toBeVisible();
    expect(screen.getByText("Source minimized or paused")).toBeVisible();
  });

  it("does not render a manual pre-join or initial connection surface", () => {
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ status: "connecting" })}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Join voice" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Joining quietly…")).not.toBeInTheDocument();
    expect(container.querySelector(".prejoin-voice-card")).toBeNull();
  });

  it("shows a compact accessible loader with the current join stage", () => {
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({
          status: "connecting",
          joinStage: "soundboard",
        })}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Connecting to Lounge…",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing room audio…",
    );
  });

  it("offers an Enable audio action when autoplay is blocked", async () => {
    const resumeAudio = vi.fn().mockResolvedValue(undefined);
    const voice = createVoice({ audioPlaybackBlocked: true, resumeAudio });

    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByText("Room audio needs one click")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Enable audio" }));
    expect(resumeAudio).toHaveBeenCalledOnce();
  });

  it("lets the user review or dismiss a temporary output warning", async () => {
    const onOpenSettings = vi.fn();
    const dismissOutputDeviceError = vi.fn();
    const voice = createVoice({
      outputDeviceError:
        "Bakbak joined using system output because the selected speaker was unavailable.",
      dismissOutputDeviceError,
    });

    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={onOpenSettings}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bakbak joined using system output",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Review output" }),
    );
    expect(onOpenSettings).toHaveBeenCalledOnce();

    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss output warning" }),
    );
    expect(dismissOutputDeviceError).toHaveBeenCalledOnce();
  });

  it("removes pre-join metadata after joining and switches to a share layout", () => {
    const screenShare = {
      id: "share-1",
      ownerId: user.id,
      displayName: user.displayName,
      isLocal: true,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: false,
      paused: false,
    };
    const voice = createVoice({
      screenShares: [screenShare],
      watchedScreenShareId: screenShare.id,
    });
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Join voice" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".voice-room-view")).toHaveClass(
      "is-connected",
      "has-screen-share",
    );
    expect(container.querySelector(".voice-media-gallery")).toBeVisible();
  });

  it("waits for the persistent control bar to undeafen before audio recovery", () => {
    const resumeAudio = vi.fn().mockResolvedValue(undefined);
    const voice = createVoice({
      audioPlaybackBlocked: true,
      deafened: true,
      resumeAudio,
    });

    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Room audio stays paused while Deafen is on. Undeafen to retry.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Enable audio" }),
    ).not.toBeInTheDocument();

    expect(resumeAudio).not.toHaveBeenCalled();
  });

  it("uses compact occupancy layouts without local labels or personal call timers", () => {
    const participant = {
      id: user.id,
      displayName: user.displayName,
      isLocal: true,
      isSpeaking: false,
      isMuted: false,
      volume: 1,
      joinedAt: "2026-07-20T12:00:00.000Z",
      cameraEnabled: false,
      cameraTrack: null,
      activeSounds: [
        {
          eventId: "sound-1",
          soundId: "first",
          label: "First",
          emoji: "🙂",
          startedAt: 1,
        },
        {
          eventId: "sound-2",
          soundId: "latest",
          label: "Latest",
          emoji: "🔥",
          startedAt: 2,
        },
      ],
    };
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ participants: [participant] })}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(container.querySelector(".voice-media-gallery")).toBeVisible();
    expect(container.querySelector(".participant-card .avatar")).toBeNull();
    expect(
      screen.getByRole("img", { name: "Ayu is playing Latest" }),
    ).toHaveTextContent("🔥2/5");
    expect(screen.getByText("Ayu")).toBeVisible();
    expect(screen.queryByText("Ayu (you)")).not.toBeInTheDocument();
    expect(container.querySelector(".participant-card__identity time")).toBe(
      null,
    );
  });

  it.each([
    [1, "solo"],
    [2, "pair"],
    [3, "quad"],
    [4, "quad"],
    [6, "six"],
    [8, "many"],
  ])("uses the %s-target compact gallery layout", (count, layout) => {
    const participants = Array.from({ length: count }, (_, index) =>
      participant(`participant-${index}`),
    );
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ participants })}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(container.querySelector(".voice-media-gallery")).toHaveAttribute(
      "data-layout",
      layout,
    );
  });

  it("keeps camera video visible and overlays the active sound emoji", () => {
    const mediaElement = document.createElement("video");
    const track = {
      attach: vi.fn(() => mediaElement),
      detach: vi.fn(() => mediaElement),
    };
    const participant = {
      id: user.id,
      displayName: user.displayName,
      isLocal: true,
      isSpeaking: false,
      isMuted: false,
      volume: 1,
      joinedAt: null,
      cameraEnabled: true,
      cameraTrack: track,
      activeSounds: [
        {
          eventId: "sound-camera",
          soundId: "camera-sound",
          label: "Camera sound",
          emoji: "🎉",
          startedAt: 1,
        },
      ],
    };
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ participants: [participant] })}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(container.querySelector("video.participant-video")).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Ayu is playing Camera sound" }),
    ).toHaveClass("is-overlay");
  });

  it("opens a participant profile from the voice grid", async () => {
    const onOpenProfile = vi.fn();
    const participant = {
      id: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      isSpeaking: false,
      isMuted: false,
      volume: 1,
      joinedAt: null,
      cameraEnabled: false,
      cameraTrack: null,
      activeSounds: [],
    };
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        members={[friend]}
        voice={createVoice({ participants: [participant] })}
        onOpenSettings={vi.fn()}
        onOpenProfile={onOpenProfile}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "View Mira's profile",
    });
    await userEvent.click(trigger);
    expect(onOpenProfile).toHaveBeenCalledWith(friend, trigger);
  });
});

function participant(id: string) {
  return {
    id,
    displayName: `Person with a deliberately long display name ${id}`,
    isLocal: false,
    isSpeaking: false,
    isMuted: false,
    volume: 1,
    joinedAt: null,
    cameraEnabled: false,
    cameraTrack: null,
    activeSounds: [],
  };
}
