import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteAudioRenderer, type RemoteAudioTrackLike } from "./remote-audio";
import type { RemoteAudioContextConstructor } from "./remote-audio-gain";

function createTrack(kind = "audio") {
  const attach = vi.fn((element: HTMLMediaElement) => element);
  const detach = vi.fn((element: HTMLMediaElement) => element);
  const track: RemoteAudioTrackLike = { kind, attach, detach };
  return { attach, detach, track };
}

describe("RemoteAudioRenderer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("attaches each subscribed audio track to one hidden element", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const { attach, track } = createTrack();

    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "speech",
    });

    expect(element).toBeInstanceOf(HTMLAudioElement);
    expect(element).toHaveAttribute("data-bakbak-remote-audio");
    expect(element).toHaveProperty("autoplay", true);
    expect(element).toHaveProperty("hidden", true);
    expect(host).toContainElement(element);
    expect(attach).toHaveBeenCalledOnce();
    expect(
      renderer.attach(track, { ownerId: "mira", sourceKind: "speech" }),
    ).toBe(element);
    expect(attach).toHaveBeenCalledOnce();
  });

  it("mutes current and future tracks while deafened", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    });

    renderer.setMuted(true);
    const second = renderer.attach(createTrack().track, {
      ownerId: "theo",
      sourceKind: "speech",
    });

    expect(first).toHaveProperty("muted", true);
    expect(second).toHaveProperty("muted", true);

    renderer.setMuted(false);
    expect(first).toHaveProperty("muted", false);
    expect(second).toHaveProperty("muted", false);
  });

  it("hard-mutes LiveKit's track volume as a soundboard safety boundary", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const base = createTrack().track;
    const setVolume = vi.fn();
    const track = { ...base, setVolume };
    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    });

    renderer.setMuted(true);
    expect(setVolume).toHaveBeenLastCalledWith(0);
    expect(element).toHaveProperty("muted", true);

    renderer.setMuted(false);
    expect(setVolume).toHaveBeenLastCalledWith(1);
    expect(element).toHaveProperty("muted", false);
  });

  it("keeps an idle soundboard track muted independently of deafen", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const { track } = createTrack();
    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    })!;

    renderer.setTrackMuted(track, true);
    expect(element).toHaveProperty("muted", true);

    renderer.setMuted(true);
    renderer.setTrackMuted(track, false);
    expect(element).toHaveProperty("muted", true);

    renderer.setMuted(false);
    expect(element).toHaveProperty("muted", false);
  });

  it("detaches on unsubscribe and cleans every element on room teardown", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = createTrack();
    const second = createTrack();
    const firstElement = renderer.attach(first.track, {
      ownerId: "mira",
      sourceKind: "speech",
    });
    renderer.attach(second.track, {
      ownerId: "theo",
      sourceKind: "speech",
    });

    renderer.detach(first.track);

    expect(first.detach).toHaveBeenCalledWith(firstElement);
    expect(host).not.toContainElement(firstElement);
    expect(host.childElementCount).toBe(1);

    renderer.cleanup();
    expect(second.detach).toHaveBeenCalledOnce();
    expect(host).toBeEmptyDOMElement();
  });

  it("starts the next room audible after cleaning up a deafened room", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    renderer.setMuted(true);
    renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    });

    renderer.cleanup();
    const nextRoomElement = renderer.attach(createTrack().track, {
      ownerId: "theo",
      sourceKind: "speech",
    });

    expect(nextRoomElement).toHaveProperty("muted", false);
  });

  it("ignores non-audio tracks", () => {
    const { attach, track } = createTrack("video");
    const renderer = new RemoteAudioRenderer();

    expect(
      renderer.attach(track, { ownerId: "mira", sourceKind: "speech" }),
    ).toBeNull();
    expect(attach).not.toHaveBeenCalled();
  });

  it("applies real element gain to current speech, screen, and soundboard tracks", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const speech = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
    const screen = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "screen-share",
    })!;
    const soundboard = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    })!;

    renderer.setGlobalGain("soundboard", 0.7);
    renderer.setParticipantGain("mira", 0.5);

    expect(speech.volume).toBe(0.5);
    expect(screen.volume).toBe(0.5);
    expect(soundboard.volume).toBe(0.35);

    renderer.setParticipantGain("mira", 0);
    expect(speech.volume).toBe(0);
    expect(screen.volume).toBe(0);
    expect(soundboard.volume).toBe(0);
  });

  it("applies listener gain to tracks attached after the slider changes", () => {
    const renderer = new RemoteAudioRenderer();
    renderer.setParticipantGain("mira", 0.5);
    renderer.setGlobalGain("soundboard", 0.4);

    const speech = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
    const soundboard = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    })!;

    expect(speech.volume).toBe(0.5);
    expect(soundboard.volume).toBe(0.2);
  });

  it("applies 0–200% listener gain once across speech, soundboard, and watched share", () => {
    const host = document.createElement("div");
    const graph = createGainGraphDouble();
    const renderer = new RemoteAudioRenderer(() => host, graph.options);
    renderer.setParticipantGain("mira", 1.5);
    renderer.setGlobalGain("soundboard", 0.5);

    const speechTrack = createTrack().track;
    const speech = renderer.attach(speechTrack, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
    const soundboard = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "soundboard",
    })!;
    const share = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "screen-share",
    })!;
    renderer.attach(speechTrack, {
      ownerId: "mira",
      sourceKind: "speech",
    });

    expect(speech.volume).toBe(1);
    expect(soundboard.volume).toBe(1);
    expect(share.volume).toBe(1);
    expect(graph.gains.map((gain) => gain.gain.value)).toEqual([
      1.5, 0.75, 1.5,
    ]);
    expect(renderer.diagnostics()).toEqual([
      expect.objectContaining({ sourceKind: "speech", listenerGain: 1.5 }),
      expect.objectContaining({
        sourceKind: "soundboard",
        listenerGain: 0.75,
      }),
      expect.objectContaining({
        sourceKind: "screen-share",
        listenerGain: 1.5,
      }),
    ]);
    expect(graph.createGain).toHaveBeenCalledTimes(3);

    renderer.setParticipantGain("mira", 2);
    expect(graph.gains.map((gain) => gain.gain.value)).toEqual([2, 1, 2]);
    renderer.setMuted(true);
    expect(graph.gains.map((gain) => gain.gain.value)).toEqual([0, 0, 0]);
    renderer.setMuted(false);
    expect(graph.gains.map((gain) => gain.gain.value)).toEqual([2, 1, 2]);
  });

  it("waits for LiveKit's stream and changes its audible gain below and above unity", () => {
    const host = document.createElement("div");
    const graph = createGainGraphDouble();
    const stream = {
      getAudioTracks: () => [{ kind: "audio" }],
    } as unknown as MediaStream;
    const attach = vi.fn((element: HTMLMediaElement) => {
      element.srcObject = stream;
      return element;
    });
    const track: RemoteAudioTrackLike = {
      kind: "audio",
      attach,
      detach: vi.fn((element: HTMLMediaElement) => element),
    };
    const renderer = new RemoteAudioRenderer(() => host, graph.options);
    renderer.setParticipantGain("mira", 0.4);

    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;

    expect(graph.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(graph.createMediaElementSource).not.toHaveBeenCalled();
    expect(attach.mock.invocationCallOrder[0]).toBeLessThan(
      graph.createMediaStreamSource.mock.invocationCallOrder[0]!,
    );
    expect(element).toHaveProperty("muted", true);
    expect(element).toHaveProperty("volume", 0);
    expect(graph.gains[0]?.gain.value).toBe(0.4);

    renderer.setParticipantGain("mira", 1.75);
    expect(graph.gains[0]?.gain.value).toBe(1.75);
    renderer.setMuted(true);
    expect(graph.gains[0]?.gain.value).toBe(0);
    renderer.setMuted(false);
    expect(graph.gains[0]?.gain.value).toBe(1.75);
  });

  it("routes a boosted graph to the selected speaker instead of the source element", async () => {
    const graph = createGainGraphDouble();
    const renderer = new RemoteAudioRenderer(
      () => document.body,
      graph.options,
    );
    const source = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
    const sourceSetSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(source, "setSinkId", {
      configurable: true,
      value: sourceSetSinkId,
    });

    await renderer.setDevice("speaker-2");

    expect(graph.setSinkId).toHaveBeenCalledWith("speaker-2");
    expect(sourceSetSinkId).not.toHaveBeenCalled();
  });

  it("surfaces and recovers shared output autoplay blocking through the existing bounded path", async () => {
    const graph = createGainGraphDouble();
    graph.play.mockRejectedValueOnce(
      new DOMException("gesture required", "NotAllowedError"),
    );
    const health = vi.fn();
    const renderer = new RemoteAudioRenderer(
      () => document.body,
      graph.options,
    );
    renderer.setHealthListener(health);
    const sourcePlay = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const { track } = createTrack();

    renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "speech",
      publicationSid: "TR_speech",
    });
    await vi.waitFor(() =>
      expect(health).toHaveBeenCalledWith(
        expect.objectContaining({ code: "playback-blocked" }),
      ),
    );

    await expect(renderer.recover(track, "user-gesture")).resolves.toBe(true);
    expect(sourcePlay).toHaveBeenCalledOnce();
    expect(renderer.diagnostics()[0]?.playbackState).toBe("playing");
  });

  it("routes current and future remote tracks to the selected speaker", async () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const first = renderer.attach(createTrack().track, {
      ownerId: "mira",
      sourceKind: "speech",
    })!;
    const firstSetSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(first, "setSinkId", {
      configurable: true,
      value: firstSetSinkId,
    });

    await renderer.setDevice("speaker-2");
    expect(firstSetSinkId).toHaveBeenCalledWith("speaker-2");

    const original = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "setSinkId",
    );
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: setSinkId,
    });
    try {
      renderer.attach(createTrack().track, {
        ownerId: "theo",
        sourceKind: "speech",
      });
      expect(setSinkId).toHaveBeenCalledWith("speaker-2");
    } finally {
      if (original) {
        Object.defineProperty(
          HTMLMediaElement.prototype,
          "setSinkId",
          original,
        );
      } else {
        Reflect.deleteProperty(HTMLMediaElement.prototype, "setSinkId");
      }
    }
  });

  it("recovers a stalled element without attaching a duplicate", async () => {
    const host = document.createElement("div");
    const health = vi.fn();
    const renderer = new RemoteAudioRenderer(() => host);
    renderer.setHealthListener(health);
    const { attach, track } = createTrack();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "speech",
      participantSid: "PA_mira",
      publicationSid: "TR_speech",
    })!;

    element.dispatchEvent(new Event("stalled"));
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(renderer.diagnostics()[0]?.playbackState).toBe("playing"),
    );

    expect(attach).toHaveBeenCalledOnce();
    expect(host.childElementCount).toBe(1);
    expect(renderer.diagnostics()).toEqual([
      expect.objectContaining({
        publicationSid: "TR_speech",
        playbackState: "playing",
        recoveryAttempts: 0,
      }),
    ]);
    expect(health).toHaveBeenCalledWith(
      expect.objectContaining({ code: "playback-restored", terminal: false }),
    );
  });

  it("stops after two failed playback recovery attempts", async () => {
    vi.useFakeTimers();
    const health = vi.fn();
    const renderer = new RemoteAudioRenderer();
    renderer.setHealthListener(health);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValue(new Error("output unavailable"));
    const { track } = createTrack();
    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "speech",
      participantSid: "PA_mira",
      publicationSid: "TR_speech",
    })!;

    element.dispatchEvent(new Event("error"));
    await vi.runAllTimersAsync();

    expect(play).toHaveBeenCalledTimes(2);
    expect(renderer.diagnostics()[0]).toEqual(
      expect.objectContaining({
        playbackState: "failed",
        recoveryAttempts: 2,
      }),
    );
    expect(health).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "playback-failed",
        attempt: 2,
        terminal: true,
      }),
    );
  });

  it("reports autoplay blocking without entering a retry loop", async () => {
    vi.useFakeTimers();
    const health = vi.fn();
    const renderer = new RemoteAudioRenderer();
    renderer.setHealthListener(health);
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValue(
        new DOMException("gesture required", "NotAllowedError"),
      );
    const { track } = createTrack();
    const element = renderer.attach(track, {
      ownerId: "mira",
      sourceKind: "speech",
      publicationSid: "TR_speech",
    })!;

    element.dispatchEvent(new Event("pause"));
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(play).toHaveBeenCalledOnce();
    expect(renderer.diagnostics()[0]?.playbackState).toBe("blocked");
    expect(health).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "playback-blocked",
        terminal: false,
      }),
    );
  });

  it("detaches tracks that are no longer present during reconciliation", () => {
    const host = document.createElement("div");
    const renderer = new RemoteAudioRenderer(() => host);
    const retained = createTrack();
    const stale = createTrack();
    renderer.attach(retained.track, {
      ownerId: "mira",
      sourceKind: "speech",
    });
    renderer.attach(stale.track, {
      ownerId: "theo",
      sourceKind: "speech",
    });

    renderer.detachExcept(new Set([retained.track]));

    expect(retained.detach).not.toHaveBeenCalled();
    expect(stale.detach).toHaveBeenCalledOnce();
    expect(host.childElementCount).toBe(1);
  });
});

function createGainGraphDouble() {
  const gains: Array<{
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const createGain = vi.fn(() => {
    const gain = {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    gains.push(gain);
    return gain;
  });
  const limiter = {
    curve: null,
    oversample: "none",
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const track = { stop: vi.fn() };
  const destination = {
    stream: {
      getTracks: () => [track],
    },
  } as unknown as MediaStreamAudioDestinationNode;
  const createMediaElementSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const context = {
    state: "running",
    createMediaElementSource,
    createMediaStreamSource,
    createGain,
    createWaveShaper: vi.fn(() => limiter),
    createMediaStreamDestination: vi.fn(() => destination),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
  const Context = vi.fn(function () {
    return context;
  }) as unknown as RemoteAudioContextConstructor;
  const output = document.createElement("audio");
  const play = vi.fn().mockResolvedValue(undefined);
  const setSinkId = vi.fn().mockResolvedValue(undefined);
  Object.defineProperties(output, {
    play: {
      configurable: true,
      value: play,
    },
    pause: { configurable: true, value: vi.fn() },
    setSinkId: { configurable: true, value: setSinkId },
  });
  return {
    createGain,
    createMediaElementSource,
    createMediaStreamSource,
    gains,
    play,
    setSinkId,
    options: {
      contextConstructor: Context,
      createOutputElement: () => output,
    },
  };
}
