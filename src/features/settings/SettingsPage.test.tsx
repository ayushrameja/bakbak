import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../lib/types";
import { SettingsPage, type SettingsSection } from "./SettingsPage";

const user: AppUser = {
  id: "user-1",
  displayName: "Ayu",
  email: "ayu@example.test",
  avatarUrl: null,
  avatarPath: null,
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
    onSectionChange: vi.fn(),
    onThemeChange: vi.fn(),
    onSaveProfile: vi.fn().mockResolvedValue({}),
    onInputChange: vi.fn(),
    onOutputChange: vi.fn(),
    onCameraChange: vi.fn(),
    onSoundboardVolumeChange: vi.fn(),
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
      avatarFile: null,
      removeAvatar: false,
    });
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
});
