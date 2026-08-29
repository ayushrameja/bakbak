import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ExternalAudioSessionState } from "../../lib/external-audio-types";
import { ExternalAudioSettings } from "./ExternalAudioSettings";

const idle: ExternalAudioSessionState = {
  status: "idle",
  config: null,
  microphoneMuted: false,
  activeSoundId: null,
  errorCode: null,
  message: null,
};

describe("ExternalAudioSettings", () => {
  it("requires an explicit voice-mode switch before starting", async () => {
    const user = userEvent.setup();
    const onLeaveVoice = vi.fn().mockResolvedValue(undefined);
    const onStart = vi.fn().mockResolvedValue(undefined);
    renderSettings({ voiceConnected: true, onLeaveVoice, onStart });

    await user.click(
      screen.getByRole("checkbox", { name: /using headphones/i }),
    );
    await user.click(screen.getByRole("button", { name: /start external/i }));
    expect(
      screen.getByRole("dialog", { name: /switch audio modes/i }),
    ).toBeVisible();
    expect(onStart).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /leave voice and start/i }),
    );
    expect(onLeaveVoice).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        microphoneDeviceId: "mic",
        cableOutputDeviceId: "cable",
      }),
    );
  });

  it("shows live controls without exposing microphone monitoring", () => {
    renderSettings({
      state: {
        ...idle,
        status: "live",
        config: {
          microphoneDeviceId: "mic",
          cableOutputDeviceId: "cable",
          monitorOutputDeviceId: "headphones",
          microphoneGain: 1,
          soundboardGain: 0.7,
        },
      },
    });
    expect(screen.getByText("LIVE")).toBeVisible();
    expect(screen.getByRole("button", { name: /mute mic/i })).toBeVisible();
    expect(screen.queryByText(/monitor microphone/i)).not.toBeInTheDocument();
  });

  it("guides the call app to the paired cable input and rejects cable microphones", async () => {
    const user = userEvent.setup();
    const onStartSetupTest = vi.fn().mockResolvedValue(undefined);
    renderSettings({ onStartSetupTest });

    expect(
      screen.getByText(/call-app microphone: blackhole input/i),
    ).toBeVisible();
    const microphone = screen.getByRole("combobox", {
      name: /physical microphone/i,
    });
    expect(microphone).toHaveValue("mic");
    expect(
      screen.queryByRole("option", { name: /blackhole input/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: /using headphones/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /test mic and headphones/i }),
    );
    expect(onStartSetupTest).toHaveBeenCalledWith({
      microphoneDeviceId: "mic",
      monitorOutputDeviceId: "headphones",
    });
  });

  it("requires an explicit voice-mode switch before testing devices", async () => {
    const user = userEvent.setup();
    const onLeaveVoice = vi.fn().mockResolvedValue(undefined);
    const onStartSetupTest = vi.fn().mockResolvedValue(undefined);
    renderSettings({ voiceConnected: true, onLeaveVoice, onStartSetupTest });

    await user.click(
      screen.getByRole("checkbox", { name: /using headphones/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /test mic and headphones/i }),
    );
    expect(
      screen.getByRole("dialog", { name: /switch audio modes/i }),
    ).toBeVisible();
    expect(onStartSetupTest).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /leave voice and test/i }),
    );
    expect(onLeaveVoice).toHaveBeenCalledOnce();
    expect(onStartSetupTest).toHaveBeenCalledWith({
      microphoneDeviceId: "mic",
      monitorOutputDeviceId: "headphones",
    });
  });

  it("offers metering, sound test, and memory-only recording during setup", async () => {
    const user = userEvent.setup();
    const onPlaySetupTone = vi.fn().mockResolvedValue(undefined);
    const onRecordSetupSample = vi.fn().mockResolvedValue(undefined);
    const onPlaySetupRecording = vi.fn().mockResolvedValue(undefined);
    renderSettings({
      state: { ...idle, status: "testing" },
      setupRecordingStatus: "ready",
      onPlaySetupTone,
      onRecordSetupSample,
      onPlaySetupRecording,
    });

    expect(screen.getByLabelText(/setup microphone input/i)).toBeVisible();
    expect(screen.getByLabelText(/setup headphone output/i)).toBeVisible();
    expect(
      screen.getByText(/never stored, uploaded, or logged/i),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /play sound test/i }));
    await user.click(
      screen.getByRole("button", { name: /record 2-second mic test/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /play local recording/i }),
    );
    expect(onPlaySetupTone).toHaveBeenCalledOnce();
    expect(onRecordSetupSample).toHaveBeenCalledOnce();
    expect(onPlaySetupRecording).toHaveBeenCalledOnce();
  });

  it("stops setup capture when the wizard closes", () => {
    const onStopSetupTest = vi.fn().mockResolvedValue(undefined);
    const view = renderSettings({
      state: { ...idle, status: "testing" },
      onStopSetupTest,
    });

    view.unmount();
    expect(onStopSetupTest).toHaveBeenCalledOnce();
  });

  it("stops a setup request that is still starting when the wizard closes", async () => {
    const user = userEvent.setup();
    let finishStart!: () => void;
    const onStartSetupTest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve;
        }),
    );
    const onStopSetupTest = vi.fn().mockResolvedValue(undefined);
    const view = renderSettings({ onStartSetupTest, onStopSetupTest });

    await user.click(
      screen.getByRole("checkbox", { name: /using headphones/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /test mic and headphones/i }),
    );
    expect(onStartSetupTest).toHaveBeenCalledOnce();

    view.unmount();
    expect(onStopSetupTest).toHaveBeenCalledOnce();
    finishStart();
  });
});

function renderSettings(
  overrides: Partial<React.ComponentProps<typeof ExternalAudioSettings>> = {},
) {
  return render(
    <ExternalAudioSettings
      platform="macos"
      devices={{
        inputs: [
          {
            id: "mic",
            label: "Studio mic",
            kind: "input",
            isDefault: true,
            cableKind: null,
          },
          {
            id: "cable-in",
            label: "BlackHole input",
            kind: "input",
            isDefault: false,
            cableKind: "blackhole-2ch",
          },
        ],
        outputs: [
          {
            id: "cable",
            label: "BlackHole output",
            kind: "output",
            isDefault: false,
            cableKind: "blackhole-2ch",
          },
          {
            id: "headphones",
            label: "Headphones",
            kind: "output",
            isDefault: true,
            cableKind: null,
          },
        ],
        recommendedCableInputId: "cable-in",
        recommendedCableOutputId: "cable",
      }}
      state={idle}
      levels={{ microphone: 0.2, output: 0.3, clipping: false }}
      loading={false}
      error={null}
      setupRecordingStatus="idle"
      voiceConnected={false}
      onRefresh={vi.fn().mockResolvedValue(undefined)}
      onStartSetupTest={vi.fn().mockResolvedValue(undefined)}
      onPlaySetupTone={vi.fn().mockResolvedValue(undefined)}
      onRecordSetupSample={vi.fn().mockResolvedValue(undefined)}
      onPlaySetupRecording={vi.fn().mockResolvedValue(undefined)}
      onStopSetupTest={vi.fn().mockResolvedValue(undefined)}
      onLeaveVoice={vi.fn().mockResolvedValue(undefined)}
      onStart={vi.fn().mockResolvedValue(undefined)}
      onUpdate={vi.fn().mockResolvedValue(undefined)}
      onStop={vi.fn().mockResolvedValue(undefined)}
      onShowOverlay={vi.fn().mockResolvedValue(undefined)}
      onOpenExternal={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  );
}
