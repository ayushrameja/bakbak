import { describe, expect, it, vi } from "vitest";
import {
  AudioOutputRouter,
  type AudioContextConstructor,
} from "./audio-output-router";

describe("AudioOutputRouter", () => {
  it("reports unsupported runtimes without pretending a switch worked", async () => {
    const router = new AudioOutputRouter();
    if (router.supported) return;
    await expect(router.setDevice("speaker-1")).rejects.toThrow(
      "not supported",
    );
    expect(router.deviceId).toBe("default");
  });

  it("cleans up without requiring an active audio context", () => {
    const router = new AudioOutputRouter();
    expect(() => router.cleanup()).not.toThrow();
    vi.restoreAllMocks();
  });

  it("fully releases a routed stream and restores its selected speaker", async () => {
    const firstContext = createContextDouble();
    const secondContext = createContextDouble();
    const contexts = [firstContext.context, secondContext.context];
    const Context = vi.fn(function () {
      return contexts.shift();
    }) as unknown as AudioContextConstructor;
    const firstElement = createElementDouble();
    const secondElement = createElementDouble();
    const elements = [firstElement, secondElement];
    const append = vi.fn();
    const router = new AudioOutputRouter({
      contextConstructor: Context,
      outputSelectionSupported: true,
      createAudioElement: () => elements.shift()!.element,
      getHost: () => ({ append }) as unknown as HTMLElement,
    });

    await router.setDevice("speaker-1");
    expect(firstElement.setSinkId).toHaveBeenCalledWith("speaker-1");
    expect(firstElement.play).toHaveBeenCalledOnce();
    expect(firstElement.element.srcObject).toBe(firstContext.stream);

    router.cleanup();
    expect(firstElement.element.muted).toBe(true);
    expect(firstElement.element.volume).toBe(0);
    expect(firstElement.pause).toHaveBeenCalledOnce();
    expect(firstElement.element.srcObject).toBeNull();
    expect(firstContext.track.stop).toHaveBeenCalledOnce();
    expect(firstElement.remove).toHaveBeenCalledOnce();
    expect(firstContext.close).toHaveBeenCalledOnce();

    await router.start();
    expect(secondElement.setSinkId).toHaveBeenCalledWith("speaker-1");
    expect(secondElement.play).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledTimes(2);
    router.cleanup();
  });

  it("flushes a completed monitor without closing its shared audio context", async () => {
    const contextDouble = createContextDouble(2);
    const Context = vi.fn(function () {
      return contextDouble.context;
    }) as unknown as AudioContextConstructor;
    const firstElement = createElementDouble();
    const secondElement = createElementDouble();
    const elements = [firstElement, secondElement];
    const router = new AudioOutputRouter({
      contextConstructor: Context,
      outputSelectionSupported: true,
      createAudioElement: () => elements.shift()!.element,
      getHost: () => ({ append: vi.fn() }) as unknown as HTMLElement,
    });

    await router.setDevice("speaker-1");
    router.resetMonitor();
    expect(firstElement.element.muted).toBe(true);
    expect(firstElement.element.volume).toBe(0);
    expect(firstElement.pause).toHaveBeenCalledOnce();
    expect(firstElement.element.srcObject).toBeNull();
    expect(contextDouble.routes[0]?.track.stop).toHaveBeenCalledOnce();
    expect(contextDouble.close).not.toHaveBeenCalled();

    await router.start();
    expect(Context).toHaveBeenCalledOnce();
    expect(contextDouble.createMediaStreamDestination).toHaveBeenCalledTimes(2);
    expect(secondElement.setSinkId).toHaveBeenCalledWith("speaker-1");
    expect(secondElement.play).toHaveBeenCalledOnce();
    router.cleanup();
    expect(contextDouble.routes[1]?.track.stop).toHaveBeenCalledOnce();
    expect(contextDouble.close).toHaveBeenCalledOnce();
  });
});

function createContextDouble(routeCount = 1) {
  const routes = Array.from({ length: routeCount }, createRouteDouble);
  const destinations = routes.map(({ destination }) => destination);
  const close = vi.fn().mockResolvedValue(undefined);
  const createMediaStreamDestination = vi.fn(() => destinations.shift()!);
  const context = {
    state: "running",
    destination: {} as AudioDestinationNode,
    createMediaStreamDestination,
    close,
    resume: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
  return {
    close,
    context,
    createMediaStreamDestination,
    routes,
    stream: routes[0]!.stream,
    track: routes[0]!.track,
  };
}

function createRouteDouble() {
  const track = { stop: vi.fn() };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  const destination = { stream } as MediaStreamAudioDestinationNode;
  return { destination, stream, track };
}

function createElementDouble() {
  let sinkId = "default";
  const pause = vi.fn();
  const play = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn();
  const setSinkId = vi.fn((deviceId: string) => {
    sinkId = deviceId;
    return Promise.resolve();
  });
  const element = {
    autoplay: false,
    hidden: false,
    muted: false,
    volume: 1,
    srcObject: null,
    dataset: {},
    get sinkId() {
      return sinkId;
    },
    pause,
    play,
    remove,
    setSinkId,
  } as unknown as HTMLAudioElement;
  return { element, pause, play, remove, setSinkId };
}
