import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../lib/types";
import { SettingsPage, type SettingsSection } from "./SettingsPage";

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

function renderSettings(
  section: SettingsSection,
  overrides: Partial<React.ComponentProps<typeof SettingsPage>> = {},
) {
  const props: React.ComponentProps<typeof SettingsPage> = {
    user,
    section,
    themePreference: "system",
    accent: "coral",
    accentIntensity: 100,
    surfaceStyle: "warm",
    inputDevices: [],
    outputDevices: [],
    cameraDevices: [],
    selectedInputId: "default",
    selectedOutputId: "default",
    selectedCameraId: "default",
    soundboardVolume: 0.7,
    inputError: null,
    outputError: null,
    cameraError: null,
    inputDisabled: false,
    outputSelectionSupported: false,
    voiceStatus: "disconnected",
    voiceChannelName: null,
    voiceMuted: false,
    voiceDeafened: false,
    onSectionChange: vi.fn(),
    onThemeChange: vi.fn(),
    onAccentChange: vi.fn(),
    onSurfaceStyleChange: vi.fn(),
    onSaveProfile: vi.fn().mockResolvedValue({}),
    onInputChange: vi.fn(),
    onOutputChange: vi.fn(),
    onCameraChange: vi.fn(),
    onSoundboardVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleDeafen: vi.fn(),
    onLeaveVoice: vi.fn(),
    onSignOut: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<SettingsPage {...props} />);
  return { props, ...view };
}

describe("SettingsPage", () => {
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
      removeAvatar: false,
      removeCover: false,
      coverPositionX: 50,
      coverPositionY: 50,
    });
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
    vi.stubGlobal("AudioContext", MockAudioContext);

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

  it("offers System, Light, and Dark as local appearance choices", async () => {
    const onThemeChange = vi.fn();
    renderSettings("appearance", { onThemeChange });
    expect(screen.getByRole("radio", { name: /System/ })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: /Light/ }));
    expect(onThemeChange).toHaveBeenCalledWith("light");
  });

  it("changes accent colour and intensity", async () => {
    const onAccentChange = vi.fn();
    renderSettings("appearance", { onAccentChange });
    await userEvent.click(screen.getByRole("radio", { name: /Purple/i }));
    expect(onAccentChange).toHaveBeenCalledWith("purple", 100);
    fireEvent.change(
      screen.getByRole("slider", { name: /Accent intensity/i }),
      { target: { value: "60" } },
    );
    expect(onAccentChange).toHaveBeenCalledWith("coral", 60);
  });

  it("switches between Warm and Flat surfaces", async () => {
    const onSurfaceStyleChange = vi.fn();
    renderSettings("appearance", { onSurfaceStyleChange });

    await userEvent.click(screen.getByRole("radio", { name: /Flat/i }));
    expect(onSurfaceStyleChange).toHaveBeenCalledWith("flat");
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
