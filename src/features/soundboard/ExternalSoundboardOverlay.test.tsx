import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BakbakDesktopBridge } from "../../lib/desktop-runtime";
import type {
  ExternalAudioDesktopApi,
  ExternalAudioSessionState,
} from "../../lib/external-audio-types";
import { ExternalSoundboardOverlay } from "./ExternalSoundboardOverlay";

const liveState: ExternalAudioSessionState = {
  status: "live",
  config: {
    microphoneDeviceId: "mic",
    cableOutputDeviceId: "cable",
    monitorOutputDeviceId: "headphones",
    microphoneGain: 1,
    soundboardGain: 0.7,
  },
  microphoneMuted: false,
  activeSoundId: null,
  errorCode: null,
  message: null,
};

describe("ExternalSoundboardOverlay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "bakbakDesktop");
    FakeBroadcastChannel.instances.length = 0;
  });

  it("routes Stop through the main controller while a play request is pending", async () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const api = apiDouble();
    window.bakbakDesktop = {
      platform: "macos",
      externalAudio: api,
    } as unknown as BakbakDesktopBridge;
    const user = userEvent.setup();
    render(<ExternalSoundboardOverlay />);
    expect(await screen.findByText("LIVE")).toBeVisible();

    const catalogChannel = FakeBroadcastChannel.instances[0];
    act(() => {
      catalogChannel?.onmessage?.({
        data: {
          type: "catalog",
          sounds: [
            {
              id: "airhorn",
              label: "Airhorn",
              emoji: "📣",
              favorite: true,
              assetStatus: "ready",
            },
          ],
          recentSoundIds: [],
        },
      } as MessageEvent);
    });

    await user.click(screen.getAllByRole("button", { name: /airhorn/i })[0]!);
    const stop = screen.getByRole("button", { name: /stop sound/i });
    expect(stop).toBeEnabled();
    await user.click(stop);

    expect(postedMessages()).toContainEqual({
      type: "play",
      soundId: "airhorn",
    });
    expect(postedMessages()).toContainEqual({ type: "stop-sound" });
    expect(api.stopSound).not.toHaveBeenCalled();
  });
});

class FakeBroadcastChannel {
  static readonly instances: FakeBroadcastChannel[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly postMessage = vi.fn<(message: unknown) => void>();
  readonly close = vi.fn<() => void>();

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
}

function postedMessages(): unknown[] {
  return FakeBroadcastChannel.instances.flatMap((channel) =>
    channel.postMessage.mock.calls.map(([message]) => message),
  );
}

function apiDouble() {
  return {
    listDevices: vi.fn(),
    getState: vi.fn().mockResolvedValue(liveState),
    startSetupTest: vi.fn(),
    clearSetupRecording: vi.fn(),
    captureSetupRecording: vi.fn(),
    playSetupTone: vi.fn(),
    playSetupRecording: vi.fn(),
    stopSetupTest: vi.fn(),
    start: vi.fn(),
    update: vi.fn().mockResolvedValue(liveState),
    stop: vi.fn(),
    play: vi.fn(),
    stopSound: vi.fn(),
    showOverlay: vi.fn(),
    hideOverlay: vi.fn(),
    onState: vi.fn(() => () => undefined),
    onLevels: vi.fn(() => () => undefined),
    onFailure: vi.fn(() => () => undefined),
    onCloseExplanation: vi.fn(() => () => undefined),
  } satisfies ExternalAudioDesktopApi;
}
