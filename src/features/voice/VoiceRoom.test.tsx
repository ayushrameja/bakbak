import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BakbakDesktopBridge } from "../../lib/desktop-runtime";
import type { AppUser, Channel, ServerMember } from "../../lib/types";
import { mockSoundboardController } from "../soundboard/mock-catalog";
import { VoiceRoom } from "./VoiceRoom";
import type { useVoiceRoom } from "./useVoiceRoom";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  avatarGiphyId: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverGiphyId: null,
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
    voiceContinuityWarning: null,
    voiceDiagnosticsAvailable: false,
    error: null,
    inputDeviceError: null,
    microphonePermission: null,
    microphoneProcessingError: null,
    microphoneProcessingState: "active",
    outputDeviceError: null,
    cameraDeviceError: null,
    inputDevices: [],
    outputDevices: [],
    cameraDevices: [],
    selectedInputId: "default",
    selectedOutputId: "default",
    selectedCameraId: "default",
    enhancedNoiseSuppression: true,
    inputDevicePending: false,
    outputDevicePending: false,
    macosFullVolumeModeAvailable: false,
    macosKeepOtherAudioFullVolume: false,
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
    screenShareFailure: null,
    soundboard: mockSoundboardController,
    soundboardVolume: 0.7,
    activeLocalSoundCount: 0,
    maxConcurrentSounds: 5,
    prepareVoiceChannel: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined),
    toggleMute: vi.fn().mockResolvedValue(undefined),
    toggleDeafen: vi.fn().mockResolvedValue(undefined),
    beginMicrophoneTest: vi.fn().mockResolvedValue(() => Promise.resolve()),
    resumeAudio: vi.fn().mockResolvedValue(undefined),
    copyVoiceDiagnostics: vi.fn().mockResolvedValue(true),
    setParticipantVolume: vi.fn(),
    toggleParticipantMute: vi.fn(),
    refreshDevices: vi.fn().mockResolvedValue(undefined),
    setInputDevice: vi.fn().mockResolvedValue(undefined),
    setEnhancedNoiseSuppression: vi.fn().mockResolvedValue(undefined),
    setMacosKeepOtherAudioFullVolume: vi.fn().mockResolvedValue(undefined),
    setOutputDevice: vi.fn().mockResolvedValue(undefined),
    dismissOutputDeviceError: vi.fn(),
    setCameraDevice: vi.fn().mockResolvedValue(undefined),
    toggleCamera: vi.fn().mockResolvedValue(undefined),
    startScreenShare: vi.fn().mockResolvedValue(undefined),
    updateScreenShareSettings: vi.fn().mockResolvedValue(undefined),
    stopScreenShare: vi.fn().mockResolvedValue(undefined),
    retryScreenShareWithEntireScreen: vi.fn().mockResolvedValue(undefined),
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
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, "bakbakDesktop");
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

  it("keeps typed microphone recovery available after a failed rejoin", async () => {
    const onOpenSettings = vi.fn();
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({
          status: "error",
          error: "Bakbak could not use that microphone.",
          inputDeviceError: "Bakbak could not use that microphone.",
          microphonePermission: {
            kind: "microphone",
            status: "denied",
            canRequest: false,
            canOpenSettings: true,
            requiresRestart: true,
          },
        })}
        onOpenSettings={onOpenSettings}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Review microphone" }),
    );
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("waits for the requested owner's authoritative share, then watches and focuses it", async () => {
    const request = {
      requestId: 1,
      ownerId: friend.id,
      channelId: channel.id,
    };
    const onStreamWatchHandled = vi.fn();
    const connectingVoice = createVoice({ status: "connecting" });
    const view = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={connectingVoice}
        onOpenSettings={vi.fn()}
        streamWatchRequest={request}
        onStreamWatchHandled={onStreamWatchHandled}
      />,
    );
    expect(connectingVoice.watchScreenShare).not.toHaveBeenCalled();

    const connectedVoice = createVoice({ screenShares: [] });
    view.rerender(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={connectedVoice}
        onOpenSettings={vi.fn()}
        streamWatchRequest={request}
        onStreamWatchHandled={onStreamWatchHandled}
      />,
    );
    expect(connectedVoice.watchScreenShare).not.toHaveBeenCalled();

    const share = {
      id: "share-mira",
      ownerId: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: true,
      paused: false,
    };
    const discoveredVoice = createVoice({ screenShares: [share] });
    view.rerender(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={discoveredVoice}
        onOpenSettings={vi.fn()}
        streamWatchRequest={request}
        onStreamWatchHandled={onStreamWatchHandled}
      />,
    );

    await waitFor(() =>
      expect(discoveredVoice.watchScreenShare).toHaveBeenCalledWith(share.id),
    );
    expect(onStreamWatchHandled).toHaveBeenCalledWith(1, "opened");
    expect(screen.getByLabelText("Screen share stage")).toBeVisible();
  });

  it("times out a pending stream watch without subscribing another share", () => {
    vi.useFakeTimers();
    const otherShare = {
      id: "share-somebody-else",
      ownerId: "user-3",
      displayName: "Jo",
      isLocal: false,
      joinedAt: null,
      track: { attach: vi.fn(), detach: vi.fn() },
      audioPublished: false,
      paused: false,
    };
    const voice = createVoice({ screenShares: [otherShare] });
    const onStreamWatchHandled = vi.fn();
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
        streamWatchRequest={{
          requestId: 2,
          ownerId: friend.id,
          channelId: channel.id,
        }}
        onStreamWatchHandled={onStreamWatchHandled}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(onStreamWatchHandled).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onStreamWatchHandled).toHaveBeenCalledWith(2, "missing");
    expect(voice.watchScreenShare).not.toHaveBeenCalled();
  });

  it("opens a LIVE share without fullscreen or back controls", async () => {
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
    expect(screen.getByLabelText("Screen share stage")).toBeVisible();
    expect(
      screen.getByLabelText("Screen share stage").parentElement,
    ).toHaveClass("voice-focus-layout");
    expect(document.querySelector(".voice-room-view")).toHaveClass(
      "is-focused-share",
    );
    expect(document.querySelector(".voice-room-view")).toHaveAttribute(
      "data-view",
      "focused-share",
    );
    expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /back to people/i }),
    ).toBeNull();

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
    expect(document.querySelector(".voice-people-gallery")).toBeVisible();
  });

  it("returns a focused share through the media without interrupting its subscription", async () => {
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
    await userEvent.click(
      screen.getByRole("button", {
        name: "Return focused screen share to people",
      }),
    );

    expect(voice.stopWatchingScreenShare).not.toHaveBeenCalled();
    expect(container.querySelector(".voice-room-view")).not.toHaveClass(
      "is-focused-share",
    );
    expect(container.querySelector(".voice-room-view")).toHaveAttribute(
      "data-view",
      "people",
    );
    expect(document.querySelector(".voice-people-gallery")).toBeVisible();
    expect(container.querySelector(".voice-people-gallery video")).toBeNull();
    expect(screen.queryByText("Watch stream")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Voice room media targets" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a non-LIVE camera circle passive", () => {
    const mediaElement = document.createElement("video");
    const cameraTrack = {
      attach: vi.fn(() => mediaElement),
      detach: vi.fn(() => mediaElement),
    };
    const participant = {
      id: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      isSpeaking: false,
      isMuted: false,
      volume: 1,
      joinedAt: null,
      cameraEnabled: true,
      cameraTrack,
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

    expect(container.querySelector("video.participant-video")).toBeVisible();
    expect(screen.queryByRole("button", { name: /expand mira/i })).toBeNull();
    expect(screen.queryByLabelText(`${friend.displayName} focused`)).toBeNull();
    expect(container.querySelector(".voice-people-gallery")).toBeVisible();
  });

  it("adjusts participant volume continuously without focusing the card", async () => {
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
    const voice = createVoice({ participants: [participant] });
    const { container, rerender } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Mira volume" });
    expect(slider).toHaveAttribute("max", "2");
    expect(screen.getByText("100%")).toBeVisible();

    fireEvent.input(slider, { target: { value: "1.5" } });
    expect(voice.setParticipantVolume).toHaveBeenLastCalledWith("user-2", 1.5);
    participant.volume = 1.5;
    rerender(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({
          participants: [participant],
          setParticipantVolume: voice.setParticipantVolume,
        })}
        onOpenSettings={vi.fn()}
      />,
    );
    const updatedSlider = screen.getByRole("slider", { name: "Mira volume" });
    updatedSlider.focus();
    await userEvent.keyboard("{ArrowLeft}");

    expect(voice.setParticipantVolume).toHaveBeenLastCalledWith("user-2", 1.45);
    expect(screen.getByText("150%")).toBeVisible();
    expect(container.querySelector(".voice-people-gallery")).toBeVisible();
    expect(
      container.querySelector(".voice-participant-stage"),
    ).not.toBeInTheDocument();
  });

  it("retains the last share frame under a paused-source label", async () => {
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

    await userEvent.click(
      screen.getByRole("button", {
        name: `Focus ${friend.displayName}'s screen share`,
      }),
    );
    expect(screen.getByLabelText(`${friend.displayName} screen`)).toBeVisible();
    expect(screen.getByText("Source minimized or paused")).toBeVisible();
  });

  it("offers one-click Entire screen recovery for black application capture", async () => {
    const retryScreenShareWithEntireScreen = vi
      .fn()
      .mockResolvedValue(undefined);
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({
          screenShareError:
            "Windows is receiving only black or cursor-only application frames.",
          screenShareFailure: {
            code: "capture-black",
            message:
              "Windows is receiving only black or cursor-only application frames.",
            recommendedRetrySource: "display",
            canOpenSettings: false,
            restartRequired: false,
          },
          retryScreenShareWithEntireScreen,
        })}
        onOpenSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Retry Entire screen" }),
    );
    expect(retryScreenShareWithEntireScreen).toHaveBeenCalledOnce();
  });

  it("renders structured screen-permission recovery actions", async () => {
    const openSettings = vi.fn().mockResolvedValue(true);
    const relaunch = vi.fn().mockResolvedValue(undefined);
    window.bakbakDesktop = {
      platform: "macos",
      permissions: { openSettings },
      app: { relaunch },
    } as unknown as BakbakDesktopBridge;
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({
          screenShareError: "Allow Bakbak in Screen Recording.",
          screenShareFailure: {
            code: "permission-denied",
            message: "Allow Bakbak in Screen Recording.",
            recommendedRetrySource: null,
            canOpenSettings: true,
            restartRequired: true,
          },
        })}
        onOpenSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Open Privacy Settings" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Restart Bakbak" }),
    );
    expect(openSettings).toHaveBeenCalledWith("screen");
    expect(relaunch).toHaveBeenCalledOnce();
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

  it("surfaces a continuity warning and copies the sanitized snapshot", async () => {
    const copyVoiceDiagnostics = vi.fn().mockResolvedValue(true);
    const voice = createVoice({
      voiceContinuityWarning:
        "Bakbak could not restore one incoming voice track.",
      voiceDiagnosticsAvailable: true,
      copyVoiceDiagnostics,
    });
    render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Copy diagnostics" }),
    );

    expect(copyVoiceDiagnostics).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
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
    expect(container.querySelector(".voice-people-gallery")).toBeVisible();
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

    expect(container.querySelector(".voice-people-gallery")).toBeVisible();
    expect(
      container.querySelector(".voice-participant-orb .avatar"),
    ).toBeVisible();
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
    [2, "cluster"],
    [3, "cluster"],
    [4, "cluster"],
    [5, "wrap"],
    [10, "wrap"],
    [11, "dense"],
  ])("uses the %s-target circular people layout", (count, layout) => {
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

    expect(container.querySelector(".voice-people-gallery")).toHaveAttribute(
      "data-layout",
      layout,
    );
  });

  it("keeps larger calls in normal document flow without orbit positioning", () => {
    const participants = Array.from({ length: 5 }, (_, index) =>
      participant(`wrap-${index}`),
    );
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        voice={createVoice({ participants })}
        onOpenSettings={vi.fn()}
      />,
    );

    const orbs = container.querySelectorAll<HTMLElement>(
      ".voice-people-gallery[data-layout='wrap'] .voice-participant-orb",
    );
    expect(orbs).toHaveLength(5);
    expect(orbs[0]).not.toHaveAttribute("style");
    expect(orbs[4]).not.toHaveAttribute("style");
  });

  it("shows simultaneous speaking and LIVE rings on the share owner", async () => {
    const participant = {
      id: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      isSpeaking: true,
      isMuted: false,
      volume: 1,
      joinedAt: null,
      cameraEnabled: false,
      cameraTrack: null,
      activeSounds: [],
    };
    const share = {
      id: "share-live",
      ownerId: friend.id,
      displayName: friend.displayName,
      isLocal: false,
      joinedAt: null,
      track: null,
      audioPublished: false,
      paused: false,
    };
    const voice = createVoice({
      participants: [participant],
      screenShares: [share],
    });
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        members={[friend]}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    const orb = container.querySelector(".voice-participant-orb");
    expect(orb).toHaveClass("is-speaking", "is-live");
    expect(
      orb?.querySelector(".voice-participant-orb__ring--speaking"),
    ).not.toBeNull();
    expect(
      orb?.querySelector(".voice-participant-orb__ring--live"),
    ).not.toBeNull();
    expect(container.querySelector(".voice-people-gallery")).toHaveAttribute(
      "data-target-count",
      "1",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Watch Mira's live screen" }),
    );
    expect(voice.watchScreenShare).toHaveBeenCalledWith(share.id);
    expect(screen.getByLabelText("Screen share stage")).toBeVisible();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Return focused screen share to people",
      }),
    );
    expect(container.querySelector(".voice-people-gallery")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Watch Mira's screen share" }),
    ).toHaveAttribute("data-tooltip", "Watch LIVE");
    expect(
      screen.queryByRole("button", { name: "Expand details for Mira" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Watch Mira's screen share" }),
    );
    expect(voice.watchScreenShare).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Screen share stage")).toBeVisible();
  });

  it("autoplays an animated participant avatar and supports keyboard context actions", async () => {
    const animatedFriend = {
      ...friend,
      avatarUrl: "blob:poster",
      avatarAnimationUrl: "blob:animated",
    };
    const onOpenUserContextMenu = vi.fn();
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        members={[animatedFriend]}
        voice={createVoice({ participants: [participant(friend.id)] })}
        onOpenSettings={vi.fn()}
        onOpenUserContextMenu={onOpenUserContextMenu}
      />,
    );

    expect(
      container.querySelector(".voice-participant-orb .avatar__animation"),
    ).toHaveClass("is-visible");
    const orb = container.querySelector<HTMLElement>(".voice-participant-orb")!;
    orb.focus();
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    expect(onOpenUserContextMenu).toHaveBeenCalledWith(
      animatedFriend,
      orb,
      expect.any(Object),
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
    ).toHaveClass("is-blended");
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

    const trigger = screen.getAllByRole("button", {
      name: "View Mira's profile",
    })[0]!;
    await userEvent.click(trigger);
    expect(onOpenProfile).toHaveBeenCalledWith(friend, trigger);
  });

  it("keeps a normal avatar passive while its tooltip controls remain usable", () => {
    const voice = createVoice({ participants: [participant(friend.id)] });
    const { container } = render(
      <VoiceRoom
        channel={channel}
        user={user}
        members={[friend]}
        voice={voice}
        onOpenSettings={vi.fn()}
      />,
    );

    expect(
      container.querySelector(".voice-participant-orb__media")?.tagName,
    ).toBe("SPAN");
    expect(screen.queryByRole("button", { name: "Expand Mira" })).toBeNull();
    expect(screen.getByRole("slider", { name: "Mira volume" })).toBeVisible();
    fireEvent.input(screen.getByRole("slider", { name: "Mira volume" }), {
      target: { value: "0.4" },
    });
    expect(voice.setParticipantVolume).toHaveBeenLastCalledWith("user-2", 0.4);
    expect(container.querySelector(".voice-participant-stage")).toBeNull();
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
