import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, Channel, ServerMember } from "../../lib/types";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import { VoiceRoom } from "./VoiceRoom";
import type { useVoiceRoom } from "./useVoiceRoom";

const tauriWindow = vi.hoisted(() => ({
  isFullscreen: vi.fn().mockResolvedValue(false),
  setFullscreen: vi.fn().mockResolvedValue(undefined),
}));

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
    setInputDevice: vi.fn().mockResolvedValue(undefined),
    setOutputDevice: vi.fn().mockResolvedValue(undefined),
    setCameraDevice: vi.fn().mockResolvedValue(undefined),
    toggleCamera: vi.fn().mockResolvedValue(undefined),
    startScreenShare: vi.fn().mockResolvedValue(undefined),
    updateScreenShareSettings: vi.fn().mockResolvedValue(undefined),
    stopScreenShare: vi.fn().mockResolvedValue(undefined),
    selectScreenShare: vi.fn(),
    dispatchSound: vi.fn().mockResolvedValue(undefined),
    stopLocalSounds: vi.fn().mockResolvedValue(undefined),
    setSoundboardVolume: vi.fn(),
    updateSoundMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("VoiceRoom", () => {
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
        name: `Focus ${friend.displayName}'s screen share`,
      }),
    );
    expect(voice.selectScreenShare).toHaveBeenCalledWith(screenShare.id);

    await userEvent.click(
      screen.getByRole("button", { name: "Enter fullscreen" }),
    );
    expect(tauriWindow.setFullscreen).toHaveBeenCalledWith(true);
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
        voice={createVoice({ screenShares: [screenShare] })}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(`${friend.displayName} screen`)).toBeVisible();
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
      selectedScreenShareId: screenShare.id,
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

  it("uses compact occupancy layouts and replaces an idle avatar with the newest sound emoji", () => {
    const participant = {
      id: user.id,
      displayName: user.displayName,
      isLocal: true,
      isSpeaking: false,
      isMuted: false,
      volume: 1,
      joinedAt: null,
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
