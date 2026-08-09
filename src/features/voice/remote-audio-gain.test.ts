import { describe, expect, it, vi } from "vitest";
import {
  createRemoteAudioLimiterCurve,
  limitRemoteAudioSample,
  MAX_REMOTE_PARTICIPANT_GAIN,
  REMOTE_AUDIO_OUTPUT_CEILING,
  RemoteAudioGainGraph,
  type RemoteAudioContextConstructor,
} from "./remote-audio-gain";

describe("remote listener gain safety", () => {
  it("keeps unity linear and bounds boosted samples at the output ceiling", () => {
    expect(limitRemoteAudioSample(0)).toBe(0);
    expect(limitRemoteAudioSample(0.5)).toBe(0.5);
    expect(limitRemoteAudioSample(-0.5)).toBe(-0.5);
    expect(limitRemoteAudioSample(2)).toBeCloseTo(REMOTE_AUDIO_OUTPUT_CEILING);
    expect(limitRemoteAudioSample(-2)).toBeCloseTo(
      -REMOTE_AUDIO_OUTPUT_CEILING,
    );

    const curve = createRemoteAudioLimiterCurve();
    expect(Math.max(...curve)).toBeCloseTo(REMOTE_AUDIO_OUTPUT_CEILING, 6);
    expect(Math.min(...curve)).toBeCloseTo(-REMOTE_AUDIO_OUTPUT_CEILING, 6);
  });

  it("routes every source through an independent 0–200% gain and one final limiter", () => {
    const audio = createGraphDouble();
    const graph = new RemoteAudioGainGraph(audio.options);
    const first = graph.attach(document.createElement("audio"));
    const second = graph.attach(document.createElement("audio"));

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    for (const gain of [0, 0.5, 1, 1.5, MAX_REMOTE_PARTICIPANT_GAIN]) {
      first?.setGain(gain);
      expect(first?.gain).toBe(gain);
      expect(audio.gains[0]?.gain.value).toBe(gain);
    }
    expect(audio.createWaveShaper).toHaveBeenCalledOnce();
    expect(audio.limiter.connect).toHaveBeenCalledOnce();
    expect(audio.limiter.oversample).toBe("4x");
    expect(audio.sources).toHaveLength(2);
    expect(audio.gains).toHaveLength(2);
  });

  it("prefers the attached remote MediaStream over an unbound media element", () => {
    const audio = createGraphDouble();
    const graph = new RemoteAudioGainGraph(audio.options);
    const element = document.createElement("audio");
    const stream = {
      getAudioTracks: () => [{ kind: "audio" }],
    } as unknown as MediaStream;
    element.srcObject = stream;

    const stage = graph.attach(element);

    expect(audio.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(audio.createMediaElementSource).not.toHaveBeenCalled();
    expect(stage?.isolatesElementPlayback).toBe(true);
  });

  it("keeps the limited element route when an embedded engine rejects the stream source", () => {
    const audio = createGraphDouble();
    audio.createMediaStreamSource.mockImplementationOnce(() => {
      throw new DOMException("unsupported stream", "NotSupportedError");
    });
    const graph = new RemoteAudioGainGraph(audio.options);
    const element = document.createElement("audio");
    element.srcObject = {
      getAudioTracks: () => [{ kind: "audio" }],
    } as unknown as MediaStream;

    const stage = graph.attach(element);

    expect(stage).not.toBeNull();
    expect(audio.createMediaElementSource).toHaveBeenCalledWith(element);
    expect(stage?.isolatesElementPlayback).toBe(false);
  });

  it("routes the mixed call to the selected output and releases every graph resource", async () => {
    const audio = createGraphDouble();
    const graph = new RemoteAudioGainGraph(audio.options);
    const stage = graph.attach(document.createElement("audio"))!;

    await graph.setDevice("speaker-2");
    expect(audio.setSinkId).toHaveBeenCalledWith("speaker-2");
    expect(audio.play).toHaveBeenCalled();

    stage.disconnect();
    stage.disconnect();
    graph.cleanup();

    expect(audio.sources[0]?.disconnect).toHaveBeenCalledOnce();
    expect(audio.gains[0]?.disconnect).toHaveBeenCalledOnce();
    expect(audio.limiter.disconnect).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.output.srcObject).toBeNull();
    expect(audio.remove).toHaveBeenCalledOnce();
    expect(audio.track.stop).toHaveBeenCalledOnce();
    expect(audio.close).toHaveBeenCalledOnce();
  });

  it("hard-mutes the final mixed output for current and future sources", () => {
    const currentAudio = createGraphDouble();
    const currentGraph = new RemoteAudioGainGraph(currentAudio.options);
    currentGraph.attach(document.createElement("audio"));
    currentGraph.setMuted(true);
    expect(currentAudio.output.muted).toBe(true);
    currentGraph.setMuted(false);
    expect(currentAudio.output.muted).toBe(false);

    const futureAudio = createGraphDouble();
    const futureGraph = new RemoteAudioGainGraph(futureAudio.options);
    futureGraph.setMuted(true);
    futureGraph.attach(document.createElement("audio"));
    expect(futureAudio.output.muted).toBe(true);
  });

  it("falls back safely when the browser cannot create the gain graph", async () => {
    class BrokenAudioContext {
      constructor() {
        throw new Error("Web Audio unavailable");
      }
    }

    const graph = new RemoteAudioGainGraph({
      contextConstructor:
        BrokenAudioContext as unknown as RemoteAudioContextConstructor,
    });

    expect(graph.attach(document.createElement("audio"))).toBeNull();
    await expect(graph.start()).resolves.toBe(true);
    await expect(graph.setDevice("default")).resolves.toBe(false);
  });
});

function createGraphDouble() {
  const sources: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const gains: Array<{
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const limiter = {
    curve: null,
    oversample: "none",
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;
  const destination = { stream } as MediaStreamAudioDestinationNode;
  const createWaveShaper = vi.fn(() => limiter);
  const createMediaElementSource = vi.fn(() => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    sources.push(source);
    return source;
  });
  const createMediaStreamSource = vi.fn(() => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    sources.push(source);
    return source;
  });
  const close = vi.fn().mockResolvedValue(undefined);
  const context = {
    state: "running",
    createMediaElementSource,
    createMediaStreamSource,
    createGain: vi.fn(() => {
      const gain = {
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
    createWaveShaper,
    createMediaStreamDestination: vi.fn(() => destination),
    resume: vi.fn().mockResolvedValue(undefined),
    close,
  } as unknown as AudioContext;
  const Context = vi.fn(function () {
    return context;
  }) as unknown as RemoteAudioContextConstructor;
  const output = document.createElement("audio");
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();
  const remove = vi.fn();
  const setSinkId = vi.fn().mockResolvedValue(undefined);
  Object.defineProperties(output, {
    play: { configurable: true, value: play },
    pause: { configurable: true, value: pause },
    remove: { configurable: true, value: remove },
    setSinkId: { configurable: true, value: setSinkId },
  });
  const append = vi.fn();
  return {
    close,
    context,
    createMediaElementSource,
    createMediaStreamSource,
    createWaveShaper,
    gains,
    limiter,
    output,
    pause,
    play,
    remove,
    setSinkId,
    sources,
    track,
    options: {
      contextConstructor: Context,
      createOutputElement: () => output,
      getHost: () => ({ append }) as unknown as HTMLElement,
    },
  };
}
