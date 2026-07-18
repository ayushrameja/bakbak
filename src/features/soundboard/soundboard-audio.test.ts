import { describe, expect, it, vi } from "vitest";
import { mockSoundboardSounds } from "./mock-catalog";
import {
  SOUNDBOARD_TRACK_NAME,
  SoundboardAudioPublisher,
} from "./soundboard-audio";

describe("SoundboardAudioPublisher", () => {
  it("mutes the persistent track while idle and keeps overlaps audible", async () => {
    sourceDoubles.length = 0;
    gainDoubles.length = 0;
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const publication = {
      mute: vi.fn().mockResolvedValue(undefined),
      unmute: vi.fn().mockResolvedValue(undefined),
    };
    const outbound = {
      stream: { getAudioTracks: () => [track] },
    } as unknown as MediaStreamAudioDestinationNode;
    const sources = [
      createSource(),
      createSource(),
      createSource(),
      createSource(),
    ];
    const gains = Array.from({ length: 8 }, createGain);
    const createBufferSource = vi.fn(() => sources.shift());
    const context = {
      currentTime: 0,
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
      publishTrack: vi.fn().mockResolvedValue(publication),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
    };
    const onIdle = vi.fn();
    const publisher = new SoundboardAudioPublisher(
      () => ({
        context,
        destination,
      }),
      onIdle,
    );
    const blob = new Blob(["mp3"], { type: "audio/mpeg" });

    await publisher.ensurePublished(participant);
    expect(track.enabled).toBe(false);
    expect(publication.mute).toHaveBeenCalledOnce();

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
    expect(publication.mute).toHaveBeenCalledOnce();
    expect(publication.unmute).toHaveBeenCalledTimes(2);
    expect(track.enabled).toBe(true);
    expect(createBufferSource).toHaveBeenCalledTimes(2);
    expect(sourceDoubles[0]?.connect).toHaveBeenCalledWith(
      gainDoubles[0]?.node,
    );
    expect(gainDoubles[0]?.connect).toHaveBeenNthCalledWith(1, outbound);
    expect(gainDoubles[0]?.connect).toHaveBeenNthCalledWith(
      2,
      gainDoubles[1]?.node,
    );
    expect(gainDoubles[0]?.setValueAtTime).toHaveBeenNthCalledWith(1, 1, 0);
    expect(gainDoubles[0]?.setValueAtTime).toHaveBeenNthCalledWith(2, 1, 0.98);
    expect(gainDoubles[0]?.linearRampToValueAtTime).toHaveBeenCalledWith(0, 1);
    expect(gainDoubles[1]?.connect).toHaveBeenCalledWith(destination);

    publisher.setVolume(0.25);
    expect(gainDoubles[1]?.node.gain.value).toBe(0.25);
    publisher.setDeafened(true);
    expect(gainDoubles[1]?.node.gain.value).toBe(0);
    publisher.setDeafened(false);
    publisher.setVolume(0.5);
    expect(gainDoubles[1]?.node.gain.value).toBe(0);

    sourceDoubles[0]?.node.onended?.(new Event("ended"));
    await first.finished;
    expect(publication.mute).toHaveBeenCalledOnce();
    expect(track.enabled).toBe(true);
    expect(onIdle).not.toHaveBeenCalled();

    sourceDoubles[1]?.node.onended?.(new Event("ended"));
    expect(publication.mute).toHaveBeenCalledTimes(2);
    expect(track.enabled).toBe(false);
    expect(onIdle).toHaveBeenCalledOnce();

    const third = await publisher.play(
      participant,
      "event-3",
      mockSoundboardSounds[2]!,
      blob,
    );
    expect(participant.publishTrack).toHaveBeenCalledOnce();
    expect(publication.unmute).toHaveBeenCalledTimes(3);
    expect(track.enabled).toBe(true);

    third.stop();
    expect(sourceDoubles[2]?.stop).toHaveBeenCalledOnce();
    await third.finished;
    expect(gainDoubles[4]?.disconnect).toHaveBeenCalledOnce();
    publisher.stopAll();
    expect(track.enabled).toBe(false);
    expect(gainDoubles[4]?.cancelScheduledValues).toHaveBeenCalledWith(0);
    expect(gainDoubles[4]?.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
    publisher.cleanup();
    expect(participant.unpublishTrack).toHaveBeenCalledWith(track);

    const idleCallsAfterCleanup = onIdle.mock.calls.length;
    const fourth = await publisher.play(
      participant,
      "event-4",
      mockSoundboardSounds[0]!,
      blob,
    );
    sourceDoubles[3]?.node.onended?.(new Event("ended"));
    await fourth.finished;
    expect(onIdle).toHaveBeenCalledTimes(idleCallsAfterCleanup + 1);
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
  disconnect: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  setValueAtTime: ReturnType<typeof vi.fn>;
}> = [];

function createGain() {
  const connect = vi.fn();
  const cancelScheduledValues = vi.fn();
  const disconnect = vi.fn();
  const linearRampToValueAtTime = vi.fn();
  const setValueAtTime = vi.fn();
  const node = {
    context: { currentTime: 0 },
    gain: {
      value: 0,
      cancelScheduledValues,
      linearRampToValueAtTime,
      setValueAtTime,
    },
    connect,
    disconnect,
  } as unknown as GainNode;
  gainDoubles.push({
    node,
    connect,
    disconnect,
    cancelScheduledValues,
    linearRampToValueAtTime,
    setValueAtTime,
  });
  return node;
}
