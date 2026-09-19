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
import type {
  ExternalOverlayInteraction,
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
    vi.restoreAllMocks();
    localStorage.clear();
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
  async function mountWheel() {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const api = apiDouble();
    let receive: (event: ExternalOverlayInteraction) => void = () => undefined;
    api.onOverlayInteraction.mockImplementation((listener) => {
      receive = listener;
      return () => undefined;
    });
    window.bakbakDesktop = {
      platform: "macos",
      externalAudio: api,
    } as unknown as BakbakDesktopBridge;
    const mounted = render(<ExternalSoundboardOverlay />);
    await screen.findByText("LIVE");
    act(() =>
      FakeBroadcastChannel.instances[0]?.onmessage?.({
        data: {
          type: "catalog",
          scopeId: "test-user:test-server",
          categories: [
            { id: "a", name: "Reactions" },
            { id: "b", name: "Music" },
          ],
          recentSoundIds: [],
          sounds: Array.from({ length: 14 }, (_, i) => ({
            id: `sound-${i}`,
            label: `Sound ${i}`,
            emoji: "🎵",
            categoryId: i < 8 ? "a" : "b",
            favorite: false,
            assetStatus: "ready",
          })),
        },
      } as MessageEvent),
    );
    const send = (id: number, phase: ExternalOverlayInteraction["phase"]) =>
      act(() => receive({ id, phase, mode: "hold" }));
    return { api, send, ...mounted };
  }

  it("defaults to the first sound on hold and plays it once on release", async () => {
    const { api, send } = await mountWheel();
    send(2, "open");
    expect(
      screen.getByRole("button", { name: "Play Sound 0" }),
    ).toHaveAttribute("aria-pressed", "true");
    send(2, "released");
    send(2, "released");
    await waitFor(() =>
      expect(postedMessages()).toContainEqual({
        type: "play",
        soundId: "sound-0",
      }),
    );
    expect(api.finishOverlayInteraction).toHaveBeenCalledTimes(1);
  });

  it("hover ticks once, click plays and closes, and release cannot play twice", async () => {
    const { api, send } = await mountWheel();
    send(2, "open");
    const sound = screen.getByRole("button", { name: "Play Sound 3" });
    fireEvent.pointerEnter(sound);
    fireEvent.pointerEnter(sound);
    expect(api.selectionFeedback).toHaveBeenCalledTimes(1);
    fireEvent.click(sound);
    send(2, "released");
    await waitFor(() =>
      expect(postedMessages()).toContainEqual({
        type: "play",
        soundId: "sound-3",
      }),
    );
    expect(api.finishOverlayInteraction).toHaveBeenCalledExactlyOnceWith(
      2,
      true,
    );
    expect(
      postedMessages().filter(
        (message) => (message as { type: string }).type === "play",
      ),
    ).toHaveLength(1);
  });

  it("Escape and close cancel without audio, including subsequent shortcut release", async () => {
    const { api, send } = await mountWheel();
    send(2, "open");
    fireEvent.keyDown(screen.getByRole("main"), { key: "Escape" });
    send(2, "released");
    await waitFor(() =>
      expect(api.finishOverlayInteraction).toHaveBeenCalledWith(2, false),
    );
    send(3, "open");
    fireEvent.click(
      screen.getByRole("button", { name: "Close sound wheel without playing" }),
    );
    send(3, "released");
    await waitFor(() =>
      expect(api.finishOverlayInteraction).toHaveBeenCalledWith(3, false),
    );
    expect(
      postedMessages().filter(
        (message) => (message as { type: string }).type === "play",
      ),
    ).toEqual([]);
  });

  it("scrolls up forward and down backward with wrap, six per page and remembered page", async () => {
    const { send, unmount } = await mountWheel();
    let now = 1000;
    const wheel = (deltaY: number) => {
      const event = new WheelEvent("wheel", { deltaY, bubbles: true });
      Object.defineProperty(event, "timeStamp", { value: now });
      fireEvent(screen.getByRole("main"), event);
    };
    send(2, "open");
    expect(screen.getAllByRole("button", { name: /^Play Sound/ })).toHaveLength(
      6,
    );
    wheel(-60);
    expect(
      screen.getByRole("button", { name: "Play Sound 6" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Play Sound/ })).toHaveLength(
      2,
    );
    now = 1300;
    wheel(60);
    now = 1600;
    wheel(60);
    expect(screen.getByRole("heading", { name: "Music" })).toBeVisible();
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Play Sound 10" }),
    );
    send(2, "closed");
    send(3, "open");
    expect(
      screen.getByRole("button", { name: "Play Sound 8" }),
    ).toHaveAttribute("aria-pressed", "true");
    unmount();
    FakeBroadcastChannel.instances.length = 0;
    await mountWheel();
    expect(screen.getByRole("heading", { name: "Music" })).toBeVisible();
  });

  it.each([
    ["macOS", { metaKey: true, shiftKey: true }],
    ["Windows", { ctrlKey: true, shiftKey: true }],
  ])(
    "navigates sections with a Shift-remapped mouse wheel while holding the %s shortcut",
    async (_platform, modifiers) => {
      const { send } = await mountWheel();
      send(2, "open");
      const scroll = (deltaX: number, timeStamp: number) => {
        const event = new WheelEvent("wheel", {
          ...modifiers,
          deltaX,
          deltaY: 0,
          deltaMode: 1,
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, "timeStamp", { value: timeStamp });
        // Dispatch from a sector, rather than the root: the capture listener must
        // also own input above buttons and suppress the webview's default action.
        fireEvent(
          screen.getAllByRole("button", { name: /^Play Sound/ })[0]!,
          event,
        );
        expect(event.defaultPrevented).toBe(true);
      };
      scroll(-1, 1000);
      expect(
        screen.getByRole("button", { name: "Play Sound 6" }),
      ).toHaveAttribute("aria-pressed", "true");
      scroll(-1, 1300);
      expect(screen.getByRole("heading", { name: "Music" })).toBeVisible();
      scroll(1, 1310);
      expect(
        screen.getByRole("button", { name: "Play Sound 6" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        postedMessages().filter(
          (message) => (message as { type: string }).type === "play",
        ),
      ).toEqual([]);
    },
  );

  it("ignores a stale release after a new hold and never commits after native cancellation", async () => {
    const { api, send } = await mountWheel();
    send(2, "open");
    send(3, "open");
    send(2, "released");
    expect(api.finishOverlayInteraction).not.toHaveBeenCalled();
    api.finishOverlayInteraction.mockResolvedValue(false);
    send(3, "released");
    await waitFor(() =>
      expect(api.finishOverlayInteraction).toHaveBeenCalledWith(3, true),
    );
    expect(
      postedMessages().filter(
        (message) => (message as { type: string }).type === "play",
      ),
    ).toEqual([]);
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
    getOverlayInteraction: vi
      .fn()
      .mockResolvedValue({ id: 1, phase: "open", mode: "browse" }),
    onOverlayInteraction: vi.fn(
      (listener: (event: ExternalOverlayInteraction) => void) => {
        void listener;
        return () => undefined;
      },
    ),
    finishOverlayInteraction: vi.fn().mockResolvedValue(true),
    selectionFeedback: vi.fn().mockResolvedValue(undefined),
    showOverlay: vi.fn(),
    hideOverlay: vi.fn(),
    onState: vi.fn(() => () => undefined),
    onLevels: vi.fn(() => () => undefined),
    onFailure: vi.fn(() => () => undefined),
    onCloseExplanation: vi.fn(() => () => undefined),
  } satisfies ExternalAudioDesktopApi;
}
