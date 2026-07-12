import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, Channel } from "../../lib/types";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import { VoiceRoom } from "./VoiceRoom";
import type { useVoiceRoom } from "./useVoiceRoom";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
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

describe("VoiceRoom audio recovery", () => {
  it("shows active occupants before joining", () => {
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ status: "disconnected", channel: null })}
        occupants={[
          {
            userId: "friend-1",
            displayName: "Mira",
            avatarUrl: null,
            channelId: channel.id,
            joinedAt: new Date().toISOString(),
          },
        ]}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
      />,
    );

    expect(screen.getByText("Already in Lounge")).toBeVisible();
    expect(screen.getByText("Mira")).toBeVisible();
  });

  it("turns camera on from the connected call controls", async () => {
    const toggleCamera = vi.fn().mockResolvedValue(undefined);
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ toggleCamera })}
        occupants={[]}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Start video/i }));
    expect(toggleCamera).toHaveBeenCalledOnce();
  });

  it("opens the native-share confirmation from call controls", async () => {
    const onOpenScreenShare = vi.fn();
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ screenShareAvailable: true })}
        occupants={[]}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={onOpenScreenShare}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Share screen" }));
    expect(onOpenScreenShare).toHaveBeenCalledOnce();
  });

  it("stops an active share without coupling it to camera state", async () => {
    const stopScreenShare = vi.fn().mockResolvedValue(undefined);
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({
          cameraEnabled: true,
          screenShareAvailable: true,
          screenShareEnabled: true,
          screenShareState: "sharing",
          stopScreenShare,
        })}
        occupants={[]}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Stop share" }));
    expect(stopScreenShare).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Stop video/i })).toBeEnabled();
  });

  it("offers an Enable audio action when autoplay is blocked", async () => {
    const resumeAudio = vi.fn().mockResolvedValue(undefined);
    const voice = createVoice({ audioPlaybackBlocked: true, resumeAudio });

    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        occupants={[]}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
      />,
    );

    expect(screen.getByText("Room audio needs one click")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Enable audio" }));
    expect(resumeAudio).toHaveBeenCalledOnce();
  });

  it("still sends soundboard events while the local listener is deafened", async () => {
    const dispatchSound = vi.fn().mockResolvedValue(undefined);
    const voice = createVoice({ deafened: true, dispatchSound });

    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        occupants={[]}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
      />,
    );

    expect(screen.getByText("Sending silently")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Aye" }));
    expect(dispatchSound).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000002001",
    );
  });

  it("waits for undeafen before offering blocked-audio recovery", async () => {
    const toggleDeafen = vi.fn().mockResolvedValue(undefined);
    const resumeAudio = vi.fn().mockResolvedValue(undefined);
    const voice = createVoice({
      audioPlaybackBlocked: true,
      deafened: true,
      resumeAudio,
      toggleDeafen,
    });

    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        occupants={[]}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
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

    await userEvent.click(screen.getByRole("button", { name: "Undeafen" }));
    expect(toggleDeafen).toHaveBeenCalledOnce();
    expect(resumeAudio).not.toHaveBeenCalled();
  });
});
