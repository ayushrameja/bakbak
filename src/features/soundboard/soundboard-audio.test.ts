import { describe, expect, it, vi } from "vitest";
import { mockSoundboardSounds } from "./mock-catalog";
import {
  SOUNDBOARD_TRACK_NAME,
  SoundboardAudioPublisher,
} from "./soundboard-audio";

describe("SoundboardAudioPublisher", () => {
  it("publishes one outbound track while overlapping each trigger once locally and remotely", async () => {
    sourceDoubles.length = 0;
    gainDoubles.length = 0;
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const outbound = {
      stream: { getAudioTracks: () => [track] },
    } as unknown as MediaStreamAudioDestinationNode;
    const sources = [createSource(), createSource(), createSource()];
    const gains = [createGain(), createGain(), createGain()];
    const createBufferSource = vi.fn(() => sources.shift());
    const context = {
      state: "running",
      createMediaStreamDestination: vi.fn(() => outbound),
      createBufferSource,
      createGain: vi.fn(() => gains.shift()),
      decodeAudioData: vi.fn(() =>
        Promise.resolve({ duration: 1 } as AudioBuffer),
      ),
      resume: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioContext;
    const destination = {} as AudioNode;
    const participant = {
      publishTrack: vi.fn().mockResolvedValue({}),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
    };
    const publisher = new SoundboardAudioPublisher(() => ({
      context,
      destination,
    }));
    const blob = new Blob(["mp3"], { type: "audio/mpeg" });

    const first = await publisher.play(
      participant,
      "event-1",
      mockSoundboardSounds[0]!,
      blob,
    );
    await publisher.play(
      participant,
      "event-2",
      mockSoundboardSounds[1]!,
      blob,
    );

    expect(participant.publishTrack).toHaveBeenCalledOnce();
    expect(participant.publishTrack).toHaveBeenCalledWith(track, {
      name: SOUNDBOARD_TRACK_NAME,
      source: "microphone",
    });
    expect(createBufferSource).toHaveBeenCalledTimes(2);
    expect(sourceDoubles[0]?.connect).toHaveBeenNthCalledWith(1, outbound);
    expect(sourceDoubles[0]?.connect).toHaveBeenNthCalledWith(
      2,
      gainDoubles[0]?.node,
    );
    expect(gainDoubles[0]?.connect).toHaveBeenCalledWith(destination);

    publisher.setVolume(0.25);
    expect(gainDoubles[0]?.node.gain.value).toBe(0.25);
    publisher.setDeafened(true);
    expect(gainDoubles[0]?.node.gain.value).toBe(0);
    publisher.setDeafened(false);
    publisher.setVolume(0.5);
    expect(gainDoubles[0]?.node.gain.value).toBe(0);

    first.stop();
    expect(sourceDoubles[0]?.stop).toHaveBeenCalledOnce();
    publisher.stopAll();
    expect(sourceDoubles[1]?.stop).toHaveBeenCalledOnce();
    publisher.cleanup();
    expect(participant.unpublishTrack).toHaveBeenCalledWith(track);
  });
});

const sourceDoubles: Array<{
  node: AudioBufferSourceNode;
  connect: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}> = [];

function createSource() {
  const connect = vi.fn();
  const stop = vi.fn();
  const node = {
    buffer: null,
    connect,
    disconnect: vi.fn(),
    start: vi.fn(),
    stop,
    onended: null as (() => void) | null,
  } as unknown as AudioBufferSourceNode;
  sourceDoubles.push({ node, connect, stop });
  return node;
}

const gainDoubles: Array<{
  node: GainNode;
  connect: ReturnType<typeof vi.fn>;
}> = [];

function createGain() {
  const connect = vi.fn();
  const node = {
    gain: { value: 0 },
    connect,
    disconnect: vi.fn(),
  } as unknown as GainNode;
  gainDoubles.push({ node, connect });
  return node;
}
