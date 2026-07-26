import { describe, expect, it, vi } from "vitest";
import {
  enqueueFullscreenTransition,
  isMacosVoiceFullscreen,
  setMacosMediaFullscreen,
} from "./voice-fullscreen";

function createWindow() {
  return {
    setSimpleFullscreen: vi.fn().mockResolvedValue(undefined),
    clearEffects: vi.fn().mockResolvedValue(undefined),
    setEffects: vi.fn().mockResolvedValue(undefined),
  };
}

describe("voice fullscreen", () => {
  it("uses simple fullscreen on macOS and restores glass on exit", async () => {
    const window = createWindow();
    const root = document.documentElement;
    const effects = { effects: ["underWindowBackground"] };

    await setMacosMediaFullscreen(window, root, true, effects);
    expect(window.clearEffects).toHaveBeenCalledOnce();
    expect(window.setSimpleFullscreen).toHaveBeenCalledWith(true);
    expect(root.dataset.voiceMediaStage).toBe("opaque");

    await setMacosMediaFullscreen(window, root, false, effects);
    expect(window.setSimpleFullscreen).toHaveBeenLastCalledWith(false);
    expect(window.setEffects).toHaveBeenCalledWith(effects);
    expect(root).not.toHaveAttribute("data-voice-media-stage");
  });

  it("rolls back a failed entry and restores effects", async () => {
    const window = createWindow();
    window.setSimpleFullscreen.mockRejectedValueOnce(new Error("nope"));

    await expect(
      setMacosMediaFullscreen(window, document.documentElement, true, {
        effects: [],
      }),
    ).rejects.toThrow("nope");

    expect(window.setSimpleFullscreen).toHaveBeenLastCalledWith(false);
    expect(window.setEffects).toHaveBeenCalledOnce();
    expect(document.documentElement).not.toHaveAttribute(
      "data-voice-media-stage",
    );
  });

  it("times out a stuck transition and restores the window", async () => {
    vi.useFakeTimers();
    let finishEntry!: () => void;
    const stuckEntry = new Promise<void>((resolve) => {
      finishEntry = resolve;
    });
    const window = createWindow();
    window.setSimpleFullscreen.mockImplementationOnce(() => stuckEntry);

    const transition = setMacosMediaFullscreen(
      window,
      document.documentElement,
      true,
      { effects: [] },
      10,
    );
    const rejection = expect(transition).rejects.toThrow(
      "Fullscreen transition timed out.",
    );

    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(window.setSimpleFullscreen).toHaveBeenCalledWith(false);
    expect(window.setEffects).toHaveBeenCalledOnce();
    expect(document.documentElement).not.toHaveAttribute(
      "data-voice-media-stage",
    );

    finishEntry();
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  it("serializes repeated transitions", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const queue = { current: Promise.resolve() };
    const one = enqueueFullscreenTransition(queue, async () => {
      order.push("enter-start");
      await first;
      order.push("enter-end");
    });
    const two = enqueueFullscreenTransition(queue, () => {
      order.push("exit");
      return Promise.resolve();
    });

    await vi.waitFor(() => expect(order).toEqual(["enter-start"]));
    release();
    await Promise.all([one, two]);
    expect(order).toEqual(["enter-start", "enter-end", "exit"]);
  });

  it("detects only macOS user agents", () => {
    expect(isMacosVoiceFullscreen("Macintosh; Intel Mac OS X")).toBe(true);
    expect(isMacosVoiceFullscreen("Windows NT 10.0")).toBe(false);
  });
});
