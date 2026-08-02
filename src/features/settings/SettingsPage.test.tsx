import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../lib/types";
import { SettingsPage, type SettingsSection } from "./SettingsPage";

const giphyState = vi.hoisted(() => ({
  search: vi.fn(),
  register: vi.fn(),
  resolveProfile: vi.fn(),
}));

vi.mock("../../lib/giphy-service", () => ({
  GiphyRateLimitError: class GiphyRateLimitError extends Error {},
  isGiphyConfigured: () => true,
  registerGiphyAction: giphyState.register,
  searchGiphy: giphyState.search,
}));

vi.mock("../../lib/profile-giphy-media", () => ({
  resolveGiphyProfileMedia: giphyState.resolveProfile,
}));

const giphyAsset = {
  id: "profile-gif",
  kind: "gif" as const,
  title: "Excellent profile",
  altText: "An excellent reaction",
  width: 640,
  height: 360,
  previewUrl: "https://media.giphy.com/profile-preview.mp4",
  previewImageUrl: "https://media.giphy.com/profile-preview.webp",
  stillUrl: "https://media.giphy.com/profile-still.webp",
  originalUrl: "https://media.giphy.com/profile.mp4",
  originalImageUrl: "https://media.giphy.com/profile.webp",
  originalStillUrl: "https://media.giphy.com/profile-original-still.webp",
  analytics: {},
};

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

function mediaDevice(
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
): MediaDeviceInfo {
  return {
    kind,
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({}),
  };
}

function renderSettings(
  section: SettingsSection,
  overrides: Partial<React.ComponentProps<typeof SettingsPage>> = {},
) {
  const props: React.ComponentProps<typeof SettingsPage> = {
    user,
    section,
    inputDevices: [],
    outputDevices: [],
    cameraDevices: [],
    selectedInputId: "default",
    selectedOutputId: "default",
    selectedCameraId: "default",
    soundboardVolume: 0.7,
    enhancedNoiseSuppression: true,
    macosFullVolumeModeAvailable: false,
    macosKeepOtherAudioFullVolume: false,
    microphoneProcessingSupported: true,
    microphoneProcessingError: null,
    microphoneProcessingState: "active",
    interfaceSoundPreferences: {
      enabled: true,
      volume: 0.55,
      categories: {
        messages: true,
        voice: true,
        "screen-share": true,
        status: true,
      },
    },
    appearancePreference: "auto",
    inputError: null,
    outputError: null,
    cameraError: null,
    inputDisabled: false,
    outputSelectionSupported: false,
    voiceStatus: "disconnected",
    voiceChannelName: null,
    voiceMuted: false,
    voiceDeafened: false,
    voiceDiagnosticsAvailable: false,
    onSectionChange: vi.fn(),
    onSaveProfile: vi.fn().mockResolvedValue({}),
    onInputChange: vi.fn(),
    onOutputChange: vi.fn(),
    onCameraChange: vi.fn(),
    onRefreshDevices: vi.fn().mockResolvedValue(undefined),
    onSoundboardVolumeChange: vi.fn(),
    onEnhancedNoiseSuppressionChange: vi.fn(),
    onMacosKeepOtherAudioFullVolumeChange: vi.fn(),
    onInterfaceSoundPreferencesChange: vi.fn(),
    onAppearancePreferenceChange: vi.fn(),
    onPreviewInterfaceSound: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleDeafen: vi.fn(),
    onLeaveVoice: vi.fn(),
    onCopyVoiceDiagnostics: vi.fn().mockResolvedValue(true),
    onSignOut: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<SettingsPage {...props} />);
  return { props, ...view };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    giphyState.search.mockResolvedValue({
      assets: [giphyAsset],
      nextOffset: null,
    });
    giphyState.resolveProfile.mockResolvedValue({
      avatarPosterUrl: null,
      avatarAnimationUrl: null,
      coverPosterUrl: null,
      coverAnimationUrl: null,
    });
  });

  it("reports account cache usage and confirms local clearing", async () => {
    const onClearCachedData = vi.fn().mockResolvedValue(undefined);
    renderSettings("storage", {
      dataFreshness: "offline",
      cacheStats: {
        messageBytes: 2048,
        messageCount: 42,
        profileMediaBytes: 3 * 1024 * 1024,
        profileMediaCount: 7,
        messageMediaBytes: 512 * 1024,
        messageMediaCount: 3,
        totalBytes: 3 * 1024 * 1024 + 512 * 1024 + 2048,
      },
      onClearCachedData,
    });

    expect(screen.getByText("42 recent messages")).toBeVisible();
    expect(screen.getByText("3.0 MiB")).toBeVisible();
    expect(screen.getByText("Offline saved data")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear cached data" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Clear cached data" }),
    );
    await waitFor(() => expect(onClearCachedData).toHaveBeenCalledOnce());
  });

  it("saves a trimmed display name without requiring a unique handle", async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({});
    renderSettings("profile", { onSaveProfile });

    const input = screen.getByRole("textbox", { name: "Display name" });
    await userEvent.clear(input);
    await userEvent.type(input, "  Mira  ");
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(onSaveProfile).toHaveBeenCalledWith({
      displayName: "Mira",
      description: "",
      avatarFile: null,
      coverFile: null,
      avatarGiphyId: null,
      coverGiphyId: null,
      removeAvatar: false,
      removeCover: false,
      coverPositionX: 50,
      coverPositionY: 50,
    });
  });

  it("stages and commits a GIPHY avatar without turning it into an upload", async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({});
    renderSettings("profile", { onSaveProfile });

    await userEvent.click(
      screen.getByRole("button", { name: "Browse GIFs for avatar" }),
    );
    expect(
      screen.getByRole("dialog", { name: "GIPHY avatar picker" }),
    ).toBeVisible();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Use An excellent reaction as avatar",
      }),
    );

    expect(
      document.querySelector(
        'img[src="https://media.giphy.com/profile-preview.webp"]',
      ),
    ).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(onSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarFile: null,
        avatarGiphyId: "profile-gif",
        coverGiphyId: null,
      }),
    );
    expect(giphyState.register).toHaveBeenCalledWith(giphyAsset, "onclick");
    expect(giphyState.register).toHaveBeenCalledWith(giphyAsset, "onsent");
  });

  it("keeps a failed GIPHY cover draft and reports it only after a successful save", async () => {
    const onSaveProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error("Profile save failed."))
      .mockResolvedValueOnce({});
    renderSettings("profile", { onSaveProfile });

    await userEvent.click(
      screen.getByRole("button", { name: "Browse GIFs for cover" }),
    );
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Use An excellent reaction as cover",
      }),
    );
    const save = screen.getByRole("button", { name: "Save profile" });
    await userEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Profile save failed.",
    );
    expect(giphyState.register).not.toHaveBeenCalledWith(giphyAsset, "onsent");
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(onSaveProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        avatarGiphyId: null,
        coverFile: null,
        coverGiphyId: "profile-gif",
        coverPositionX: 50,
        coverPositionY: 50,
      }),
    );
    expect(giphyState.register).toHaveBeenCalledWith(giphyAsset, "onsent");
  });

  it("keeps the display-name field focused across parent rerenders", async () => {
    const { props, rerender } = renderSettings("profile");
    const input = screen.getByRole("textbox", { name: "Display name" });
    input.focus();
    expect(input).toHaveFocus();

    rerender(
      <SettingsPage {...props} onClose={vi.fn()} voiceStatus="connecting" />,
    );
    expect(input).toHaveFocus();
    await userEvent.type(input, " keeps typing");
    expect(input).toHaveValue("Ayu keeps typing");
    expect(input).toHaveFocus();
  });

  it("saves a plain-text description and keyboard-adjusted cover position", async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({});
    renderSettings("profile", {
      user: {
        ...user,
        coverUrl: "data:image/png;base64,cover",
        coverPath: "mock/cover",
      },
      onSaveProfile,
    });

    await userEvent.type(
      screen.getByRole("textbox", { name: /Description/ }),
      "Tea, code, and excellent tangents.",
    );
    const focalPoint = screen.getByLabelText(/Cover focal point/);
    fireEvent.keyDown(focalPoint, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(focalPoint, { key: "ArrowUp" });
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(onSaveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Tea, code, and excellent tangents.",
        coverPositionX: 60,
        coverPositionY: 48,
      }),
    );
  });

  it("keeps a failed draft for retry and reflects dirty state", async () => {
    const onSaveProfile = vi
      .fn()
      .mockRejectedValueOnce(new Error("Profile storage took a tea break."))
      .mockResolvedValueOnce({});
    renderSettings("profile", { onSaveProfile });
    const save = screen.getByRole("button", { name: "Save profile" });
    const description = screen.getByRole("textbox", { name: /Description/ });

    expect(save).toBeDisabled();
    await userEvent.type(description, "Retry this excellent tangent.");
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Profile storage took a tea break.",
    );
    expect(description).toHaveValue("Retry this excellent tangent.");
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(onSaveProfile).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Profile saved/,
    );
  });

  it("stages avatar and cover removals independently", async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({});
    renderSettings("profile", {
      user: {
        ...user,
        avatarUrl: "data:image/png;base64,avatar",
        avatarPath: "mock/avatar",
        coverUrl: "data:image/png;base64,cover",
        coverPath: "mock/cover",
      },
      onSaveProfile,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove avatar" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSaveProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        removeAvatar: true,
        removeCover: false,
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove cover" }));
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSaveProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        removeAvatar: false,
        removeCover: true,
        coverPositionX: 50,
        coverPositionY: 50,
      }),
    );
  });

  it("supports pointer cover framing and resetting to center", async () => {
    renderSettings("profile", {
      user: {
        ...user,
        coverUrl: "data:image/png;base64,cover",
        coverPath: "mock/cover",
      },
    });
    const focalPoint = screen.getByLabelText(/Cover focal point/);
    Object.defineProperty(focalPoint, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(focalPoint, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(focalPoint, {
      pointerId: 1,
      clientX: 160,
      clientY: 45,
    });
    expect(
      screen.getByLabelText("Cover focal point, 75% horizontal, 25% vertical"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Center cover" }));
    expect(
      screen.getByLabelText("Cover focal point, 50% horizontal, 50% vertical"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
  });

  it("revokes decoded and staged preview URLs when settings closes", async () => {
    const media = installProfileImagePreparationMocks();
    try {
      const { unmount } = renderSettings("profile");
      const input = screen.getByLabelText("Choose avatar");
      await userEvent.upload(
        input,
        new File(["avatar"], "avatar.png", { type: "image/png" }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Save profile" }),
        ).toBeEnabled(),
      );
      expect(media.revokeObjectURL).toHaveBeenCalledWith("blob:settings-1");

      unmount();
      expect(media.revokeObjectURL).toHaveBeenCalledWith("blob:settings-2");
    } finally {
      media.restore();
    }
  });

  it("does not request media permission merely by opening audio settings", () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    renderSettings("audio");
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Test microphone" }),
    ).toBeEnabled();
  });

  it("updates and previews universal interface sound categories", async () => {
    const onInterfaceSoundPreferencesChange = vi.fn();
    const onPreviewInterfaceSound = vi.fn();
    renderSettings("audio", {
      onInterfaceSoundPreferencesChange,
      onPreviewInterfaceSound,
    });

    await userEvent.click(screen.getByRole("switch", { name: "Voice" }));
    expect(onInterfaceSoundPreferencesChange).toHaveBeenCalledWith({
      enabled: true,
      volume: 0.55,
      categories: {
        messages: true,
        voice: false,
        "screen-share": true,
        status: true,
      },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Preview Messages sound" }),
    );
    expect(onPreviewInterfaceSound).toHaveBeenCalledWith("messages");
  });

  it("groups audio settings and exposes every discovered output", async () => {
    const onOutputChange = vi.fn();
    const onRefreshDevices = vi.fn().mockResolvedValue(undefined);
    renderSettings("audio", {
      outputSelectionSupported: true,
      outputDevices: [
        mediaDevice("audiooutput", "default", "System default"),
        mediaDevice("audiooutput", "studio", "Studio Display"),
        mediaDevice("audiooutput", "headphones", "USB Headphones"),
      ],
      onOutputChange,
      onRefreshDevices,
    });

    expect(screen.getByRole("heading", { name: "Microphone" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Speakers & headphones" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Camera" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Soundboard & interface cues" }),
    ).toBeVisible();

    const output = screen.getByRole("combobox", { name: "Output device" });
    expect(output).toHaveTextContent("Studio Display");
    expect(output).toHaveTextContent("USB Headphones");
    await userEvent.selectOptions(output, "headphones");
    expect(onOutputChange).toHaveBeenCalledWith("headphones");

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefreshDevices).toHaveBeenCalledOnce();
  });

  it("copies voice diagnostics only after call data is available", async () => {
    const onCopyVoiceDiagnostics = vi.fn().mockResolvedValue(true);
    const { rerender, props } = renderSettings("audio", {
      voiceDiagnosticsAvailable: false,
      onCopyVoiceDiagnostics,
    });
    expect(
      screen.getByRole("button", { name: "Copy diagnostics" }),
    ).toBeDisabled();

    rerender(
      <SettingsPage
        {...props}
        voiceDiagnosticsAvailable
        onCopyVoiceDiagnostics={onCopyVoiceDiagnostics}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Copy diagnostics" }),
    );

    expect(onCopyVoiceDiagnostics).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("keeps one cleanup toggle and exposes the macOS full-volume mode", async () => {
    const onEnhancedNoiseSuppressionChange = vi.fn();
    const onMacosKeepOtherAudioFullVolumeChange = vi.fn();
    renderSettings("audio", {
      onEnhancedNoiseSuppressionChange,
      macosFullVolumeModeAvailable: true,
      onMacosKeepOtherAudioFullVolumeChange,
    });

    await userEvent.click(
      screen.getByRole("switch", { name: /Bakbak noise cleanup/i }),
    );
    expect(onEnhancedNoiseSuppressionChange).toHaveBeenCalledWith(false);

    await userEvent.click(
      screen.getByRole("switch", {
        name: "Keep other audio at full volume",
      }),
    );
    expect(onMacosKeepOtherAudioFullVolumeChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByText(/Turns off macOS echo cancellation/i),
    ).toBeVisible();
    expect(
      screen.queryByRole("radiogroup", { name: "Voice filter" }),
    ).not.toBeInTheDocument();
  });

  it("hides the macOS mode elsewhere and disables unavailable cleanup", () => {
    renderSettings("audio", {
      microphoneProcessingSupported: false,
    });

    expect(
      screen.getByRole("switch", { name: /Bakbak noise cleanup/i }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("switch", {
        name: "Keep other audio at full volume",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/keeps the built-in WebRTC cleanup/i),
    ).toBeInTheDocument();
  });

  it("uses the selected macOS echo mode for microphone tests", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new Error("test capture stopped"));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    renderSettings("audio", {
      selectedInputId: "studio-mic",
      macosFullVolumeModeAvailable: true,
      macosKeepOtherAudioFullVolume: true,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Test microphone" }),
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: "studio-mic",
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48_000,
      },
    });
  });

  it("cancels a pending mic test before changing its input or capture mode", async () => {
    type TestStream = {
      getTracks: () => Array<{ stop: () => void }>;
    };
    const streamResolvers: Array<(stream: TestStream) => void> = [];
    const getUserMedia = vi.fn(
      () =>
        new Promise<TestStream>((resolve) => {
          streamResolvers.push(resolve);
        }),
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const onInputChange = vi.fn();
    const onMacosKeepOtherAudioFullVolumeChange = vi.fn();
    renderSettings("audio", {
      inputDevices: [
        mediaDevice("audioinput", "default", "System default"),
        mediaDevice("audioinput", "studio-mic", "Studio microphone"),
      ],
      macosFullVolumeModeAvailable: true,
      onInputChange,
      onMacosKeepOtherAudioFullVolumeChange,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Test microphone" }),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Input device" }),
      "studio-mic",
    );
    expect(onInputChange).toHaveBeenCalledWith("studio-mic");
    const inputStop = vi.fn();
    streamResolvers[0]?.({ getTracks: () => [{ stop: inputStop }] });
    await waitFor(() => expect(inputStop).toHaveBeenCalledOnce());

    await userEvent.click(
      screen.getByRole("button", { name: "Test microphone" }),
    );
    await userEvent.click(
      screen.getByRole("switch", {
        name: "Keep other audio at full volume",
      }),
    );
    expect(onMacosKeepOtherAudioFullVolumeChange).toHaveBeenCalledWith(true);
    const captureModeStop = vi.fn();
    streamResolvers[1]?.({
      getTracks: () => [{ stop: captureModeStop }],
    });
    await waitFor(() => expect(captureModeStop).toHaveBeenCalledOnce());
  });

  it("releases the temporary microphone stream when settings unmount", async () => {
    const stop = vi.fn();
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    class MockAudioContext {
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 1,
          getByteFrequencyData: vi.fn(),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      close() {
        return close();
      }
    }
    class MockAudio {
      autoplay = false;
      srcObject: MediaProvider | null = null;
      pause = vi.fn();
      play = vi.fn().mockResolvedValue(undefined);
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("Audio", MockAudio);

    const { unmount } = renderSettings("audio");
    await userEvent.click(
      screen.getByRole("button", { name: "Test microphone" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop test" })).toBeEnabled(),
    );

    unmount();
    expect(stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("plays the processed microphone back through the selected output", async () => {
    const onRefreshDevices = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn();
    const pause = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    const originalSetSinkId = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop }],
        }),
      },
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    class MockAudioContext {
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 1,
          getByteFrequencyData: vi.fn(),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      close() {
        return Promise.resolve();
      }
    }
    class MockAudio {
      autoplay = false;
      srcObject: MediaProvider | null = null;
      setSinkId = setSinkId;
      pause = pause;
      play = play;
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("Audio", MockAudio);

    try {
      renderSettings("audio", {
        selectedOutputId: "speaker-2",
        outputSelectionSupported: true,
        onRefreshDevices,
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Test microphone" }),
      );

      await waitFor(() => expect(play).toHaveBeenCalledOnce());
      expect(setSinkId).toHaveBeenCalledWith("speaker-2");
      expect(onRefreshDevices).toHaveBeenCalledOnce();
      expect(screen.getByText(/Live monitor is on/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Stop test" }));
      expect(pause).toHaveBeenCalledOnce();
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      if (originalSetSinkId) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          originalSetSinkId,
        );
      } else {
        Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
      }
    }
  });

  it("stops a microphone stream that resolves after settings unmount", async () => {
    const stop = vi.fn();
    let resolveStream:
      | ((stream: { getTracks: () => Array<{ stop: () => void }> }) => void)
      | undefined;
    const getUserMedia = vi.fn(
      () =>
        new Promise<{ getTracks: () => Array<{ stop: () => void }> }>(
          (resolve) => {
            resolveStream = resolve;
          },
        ),
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { unmount } = renderSettings("audio");
    await userEvent.click(
      screen.getByRole("button", { name: "Test microphone" }),
    );
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    unmount();
    resolveStream?.({ getTracks: () => [{ stop }] });

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it("stops an acquired microphone while a post-permission refresh is pending", async () => {
    const stop = vi.fn();
    let finishRefresh: (() => void) | undefined;
    const onRefreshDevices = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop }],
        }),
      },
    });

    const { unmount } = renderSettings("audio", { onRefreshDevices });
    await userEvent.click(
      screen.getByRole("button", { name: "Test microphone" }),
    );
    await waitFor(() => expect(onRefreshDevices).toHaveBeenCalledOnce());
    unmount();
    finishRefresh?.();

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it("stops an acquired microphone stream when audio analysis setup fails", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop }],
        }),
      },
    });
    class BrokenAudioContext {
      constructor() {
        throw new Error("audio context unavailable");
      }
    }
    vi.stubGlobal("AudioContext", BrokenAudioContext);

    renderSettings("audio");
    await userEvent.click(
      screen.getByRole("button", { name: "Test microphone" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "audio context unavailable",
    );
    expect(stop).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("releases output-test media when playback fails", async () => {
    const stop = vi.fn();
    const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const pause = vi.fn();
    const start = vi.fn();
    const play = vi.fn().mockRejectedValue(new Error("playback blocked"));
    class MockAudioContext {
      currentTime = 0;
      createMediaStreamDestination() {
        return { stream: { getTracks: () => [{ stop }] } };
      }
      createOscillator() {
        return {
          frequency: { value: 0 },
          connect: (node: unknown) => node,
          start,
          stop: vi.fn(),
          addEventListener: vi.fn(),
        };
      }
      createGain() {
        return {
          gain: { value: 0 },
          connect: (node: unknown) => node,
        };
      }
      close() {
        return close();
      }
    }
    class MockAudio {
      srcObject: MediaProvider | null = null;
      pause = pause;
      play = play;
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("Audio", MockAudio);

    renderSettings("audio");
    await userEvent.click(screen.getByRole("button", { name: "Test output" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "playback blocked",
    );
    expect(stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(pause).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("selects Auto, Dark, or Light without typography controls", async () => {
    const onAppearancePreferenceChange = vi.fn();
    renderSettings("appearance", { onAppearancePreferenceChange });

    expect(screen.getByText("Bakbak palette")).toBeVisible();
    expect(screen.getByText("Honey & teal")).toBeVisible();
    expect(screen.getByText("Personal palette")).toBeVisible();
    expect(screen.getByText("Berry & blue")).toBeVisible();
    expect(screen.queryByText("System accent")).toBeNull();
    expect(screen.getByRole("radio", { name: /Auto/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Dark/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Light/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(onAppearancePreferenceChange).toHaveBeenCalledWith("dark");
    expect(screen.queryByText("Typeface")).not.toBeInTheDocument();
    expect(screen.queryByText("Roundo")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("traps focus, closes with Escape, and restores the opener", () => {
    const opener = document.createElement("button");
    opener.textContent = "Open settings";
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = renderSettings("profile", { onClose });
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const closeButton = screen.getByRole("button", {
      name: "Close settings",
    });
    expect(closeButton).toHaveFocus();

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const last = focusable.item(focusable.length - 1);
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("closes when the modal backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = renderSettings("profile", { onClose });
    const backdrop = container.querySelector(".settings-page-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps logout inside settings and confirms an active call exit", async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    renderSettings("profile", {
      voiceStatus: "connected",
      voiceChannelName: "Lounge",
      onSignOut,
    });
    expect(screen.getByText("Lounge")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(screen.getByText(/leave your active voice room/i)).toBeVisible();
    const logoutButtons = screen.getAllByRole("button", { name: /Log out/i });
    await userEvent.click(logoutButtons.at(-1)!);
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("keeps settings open and reports a failed logout inline", async () => {
    const onSignOut = vi.fn().mockRejectedValue(new Error("Session is busy."));
    renderSettings("profile", { onSignOut });
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    const logoutButtons = screen.getAllByRole("button", { name: /Log out/i });
    await userEvent.click(logoutButtons.at(-1)!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session is busy.",
    );
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });
});

function installProfileImagePreparationMocks() {
  const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    "createObjectURL",
  );
  const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(
    URL,
    "revokeObjectURL",
  );
  let urlSequence = 0;
  const createObjectURL = vi.fn(() => `blob:settings-${++urlSequence}`);
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  class TestImage {
    naturalWidth = 320;
    naturalHeight = 320;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private value = "";
    set src(value: string) {
      this.value = value;
      queueMicrotask(() => this.onload?.());
    }
    get src() {
      return this.value;
    }
  }
  vi.stubGlobal("Image", TestImage);
  const createElement = document.createElement.bind(document);
  const createElementSpy = vi
    .spyOn(document, "createElement")
    .mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      if (tagName !== "canvas") return createElement(tagName, options);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback, type?: string) =>
          callback(new Blob(["poster"], { type: type ?? "image/png" })),
      } as unknown as HTMLCanvasElement;
    });

  return {
    revokeObjectURL,
    restore() {
      createElementSpy.mockRestore();
      vi.unstubAllGlobals();
      if (createObjectUrlDescriptor) {
        Object.defineProperty(
          URL,
          "createObjectURL",
          createObjectUrlDescriptor,
        );
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (revokeObjectUrlDescriptor) {
        Object.defineProperty(
          URL,
          "revokeObjectURL",
          revokeObjectUrlDescriptor,
        );
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    },
  };
}
