import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser, Channel, Server } from "../../lib/types";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import type { useVoiceRoom } from "../voice/useVoiceRoom";
import { ChannelSidebar } from "./ChannelSidebar";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  status: "online",
};

const server: Server = {
  id: "server-1",
  name: "Bakbak",
  description: "Friends only",
};

const channel: Channel = {
  id: "voice-1",
  serverId: server.id,
  name: "Lounge",
  kind: "voice",
  position: 1,
  topic: "Talk here",
};

describe("ChannelSidebar voice controls", () => {
  it("disables mute and deafen while a voice room is connecting", () => {
    render(
      <ChannelSidebar
        server={server}
        channels={[channel]}
        selectedChannelId={channel.id}
        user={user}
        voice={createVoice()}
        voiceOccupants={[]}
        unreadChannelIds={new Set()}
        onSelect={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Mute" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deafen" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Voice settings" }),
    ).toBeEnabled();
  });

  it("emphasizes unread text channels", () => {
    const textChannel: Channel = {
      ...channel,
      id: "text-1",
      name: "random",
      kind: "text",
    };
    render(
      <ChannelSidebar
        server={server}
        channels={[textChannel]}
        selectedChannelId="different-channel"
        user={user}
        voice={createVoice()}
        voiceOccupants={[]}
        unreadChannelIds={new Set([textChannel.id])}
        onSelect={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /random/i })).toHaveClass(
      "channel-row--unread",
    );
  });

  it("shows voice occupants without joining the room", () => {
    render(
      <ChannelSidebar
        server={server}
        channels={[channel]}
        selectedChannelId="text-1"
        user={user}
        voice={createVoice()}
        voiceOccupants={[
          {
            userId: "friend-1",
            displayName: "Mira",
            avatarUrl: null,
            channelId: channel.id,
            joinedAt: new Date().toISOString(),
          },
        ]}
        unreadChannelIds={new Set()}
        onSelect={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByText("Mira")).toBeVisible();
  });

  it("keeps screen sharing available in the persistent voice dock", async () => {
    const onOpenScreenShare = vi.fn();
    render(
      <ChannelSidebar
        server={server}
        channels={[channel]}
        selectedChannelId={channel.id}
        user={user}
        voice={createVoice({
          status: "connected",
          screenShareAvailable: true,
        })}
        voiceOccupants={[]}
        unreadChannelIds={new Set()}
        onSelect={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenScreenShare={onOpenScreenShare}
        onSignOut={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Share screen" }));
    expect(onOpenScreenShare).toHaveBeenCalledOnce();
  });
});

function createVoice(
  overrides: Partial<ReturnType<typeof useVoiceRoom>> = {},
): ReturnType<typeof useVoiceRoom> {
  return {
    status: "connecting",
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
