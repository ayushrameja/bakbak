import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunicationEffectEvent } from "../../lib/communication-effects";
import {
  DEFAULT_INTERFACE_SOUND_PREFERENCES,
  type InterfaceSoundPreferences,
} from "./interface-sound-preferences";
import { InterfaceSoundController } from "./interface-sounds";

class FakeSource extends EventTarget {
  buffer: AudioBuffer | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
}

function createHarness() {
  const sources: FakeSource[] = [];
  const gains: Array<{
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const context = {
    state: "running",
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 0.2 }),
    createBufferSource: vi.fn(() => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
  };
  let now = 1_000;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
  });
  const controller = new InterfaceSoundController({
    createContext: () => context as unknown as AudioContext,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => now,
  });
  controller.setPreferences(DEFAULT_INTERFACE_SOUND_PREFERENCES);
  return {
    controller,
    context,
    sources,
    gains,
    fetchMock,
    advance(ms: number) {
      now += ms;
    },
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("InterfaceSoundController", () => {
  afterEach(() => vi.useRealTimers());

  it("drops pre-gesture events, decodes lazily, and uses the system destination", async () => {
    const harness = createHarness();
    harness.controller.play({ type: "message-received" });
    await settle();
    expect(harness.sources).toHaveLength(0);

    await harness.controller.activate();
    harness.controller.play({ type: "message-received" });
    await settle();

    expect(harness.context.decodeAudioData).toHaveBeenCalled();
    expect(harness.fetchMock).toHaveBeenCalledTimes(14);
    expect(harness.sources).toHaveLength(1);
    expect(harness.sources[0]?.start).toHaveBeenCalledOnce();
    expect(harness.gains[0]?.gain.value).toBeCloseTo(0.55 * 0.72);
    expect(harness.gains[0]?.connect).toHaveBeenCalledWith(
      harness.context.destination,
    );
  });

  it("maps committed sends and successful microphone changes to their modern cues", async () => {
    const harness = createHarness();
    await harness.controller.activate();

    harness.controller.play({ type: "message-sent" });
    harness.controller.play({ type: "message-sent" });
    await settle();
    expect(harness.sources).toHaveLength(1);
    expect(harness.gains[0]?.gain.value).toBeCloseTo(0.55 * 0.62);

    harness.advance(121);
    harness.controller.play({ type: "message-sent" });
    await settle();
    expect(harness.sources).toHaveLength(2);
    harness.sources.forEach((source) =>
      source.dispatchEvent(new Event("ended")),
    );

    harness.controller.play({ type: "microphone-muted" }, { deafened: true });
    harness.controller.play({ type: "microphone-unmuted" }, { deafened: true });
    await settle();
    expect(harness.sources).toHaveLength(4);
    expect(harness.gains[2]?.gain.value).toBeCloseTo(0.55 * 0.76);
    expect(harness.gains[3]?.gain.value).toBeCloseTo(0.55 * 0.76);
    harness.sources
      .slice(2)
      .forEach((source) => source.dispatchEvent(new Event("ended")));
    harness.controller.play({ type: "deafen-enabled" }, { deafened: true });
    harness.controller.play({ type: "deafen-disabled" });
    await settle();
    expect(harness.sources).toHaveLength(6);
    expect(harness.gains[4]?.gain.value).toBeCloseTo(0.55 * 0.72);
    expect(harness.gains[5]?.gain.value).toBeCloseTo(0.55 * 0.72);
    expect(harness.fetchMock).toHaveBeenCalledWith(
      "/interface-sounds/message-sent.wav",
    );
    expect(harness.fetchMock).toHaveBeenCalledWith(
      "/interface-sounds/microphone-mute.wav",
    );
    expect(harness.fetchMock).toHaveBeenCalledWith(
      "/interface-sounds/microphone-unmute.wav",
    );
    expect(harness.fetchMock).toHaveBeenCalledWith(
      "/interface-sounds/deafen-on.wav",
    );
    expect(harness.fetchMock).toHaveBeenCalledWith(
      "/interface-sounds/deafen-off.wav",
    );
  });

  it("honors master/category controls and message/failure cooldowns", async () => {
    const harness = createHarness();
    await harness.controller.activate();
    const muted: InterfaceSoundPreferences = {
      ...DEFAULT_INTERFACE_SOUND_PREFERENCES,
      enabled: false,
    };
    harness.controller.setPreferences(muted);
    harness.controller.play({ type: "message-received" });
    await settle();
    expect(harness.sources).toHaveLength(0);

    harness.controller.setPreferences(DEFAULT_INTERFACE_SOUND_PREFERENCES);
    harness.controller.play({ type: "message-received" });
    harness.controller.play({ type: "message-received" });
    await settle();
    expect(harness.sources).toHaveLength(1);

    harness.advance(351);
    harness.controller.play({ type: "message-received" });
    harness.controller.play({ type: "signal-interrupted" });
    harness.controller.play({ type: "signal-interrupted" });
    await settle();
    expect(harness.sources).toHaveLength(3);
  });

  it("batches remote roster churn and suppresses remote cues while deafened", async () => {
    vi.useFakeTimers();
    const harness = createHarness();
    await harness.controller.activate();
    const remoteJoin: CommunicationEffectEvent = {
      type: "voice-remote-joined",
      participantId: "mira",
      displayName: "Mira",
    };
    harness.controller.play(remoteJoin, { deafened: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(harness.sources).toHaveLength(0);

    harness.controller.play(remoteJoin);
    harness.controller.play({
      type: "voice-remote-joined",
      participantId: "jo",
      displayName: "Jo",
    });
    await vi.advanceTimersByTimeAsync(250);
    await settle();
    expect(harness.sources).toHaveLength(1);

    harness.controller.play(
      { type: "screen-share-started", actor: "remote", displayName: "Mira" },
      { deafened: true },
    );
    await settle();
    expect(harness.sources).toHaveLength(1);
  });

  it("limits concurrent playback to three sounds", async () => {
    const harness = createHarness();
    await harness.controller.activate();
    const events: CommunicationEffectEvent[] = [
      { type: "message-received" },
      { type: "voice-self-joined", channelName: "Lobby" },
      { type: "screen-share-started", actor: "self" },
      { type: "signal-restored" },
    ];
    events.forEach((event) => harness.controller.play(event));
    await settle();
    expect(harness.sources).toHaveLength(3);
  });

  it("degrades silently when Web Audio cannot be created", async () => {
    const controller = new InterfaceSoundController({
      createContext: () => {
        throw new Error("audio unavailable");
      },
    });
    await expect(controller.activate()).resolves.toBeUndefined();
    expect(() => controller.play({ type: "signal-interrupted" })).not.toThrow();
  });
});
