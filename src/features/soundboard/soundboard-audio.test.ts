import { describe, expect, it, vi } from "vitest";
import { mockSoundboardSounds } from "./mock-catalog";
import {
  SOUNDBOARD_TRACK_NAME,
  SoundboardAudioPublisher,
} from "./soundboard-audio";

describe("SoundboardAudioPublisher", () => {
  it("reuses its persistent track while replacing the current sound", async () => {
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
    const second = await publisher.play(
      participant,
      "event-2",
      mockSoundboardSounds[1]!,
      blob,
    );

    await first.finished;
    expect(participant.publishTrack).toHaveBeenCalledOnce();
    expect(participant.publishTrack).toHaveBeenCalledWith(track, {
      name: SOUNDBOARD_TRACK_NAME,
      source: "microphone",
    });
    expect(publication.mute).toHaveBeenCalledOnce();
    expect(publication.unmute).toHaveBeenCalledTimes(2);
    expect(track.enabled).toBe(true);
    expect(createBufferSource).toHaveBeenCalledTimes(2);
    expect(sourceDoubles[0]?.stop).toHaveBeenCalledOnce();
    expect(sourceDoubles[0]?.stop).toHaveBeenCalledWith(0.02);
    expect(sourceDoubles[0]?.disconnect).toHaveBeenCalledOnce();
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
    expect(gainDoubles[3]?.node.gain.value).toBe(0.25);
    publisher.setDeafened(true);
    expect(gainDoubles[3]?.node.gain.value).toBe(0);
    publisher.setDeafened(false);
    publisher.setVolume(0.5);
    expect(gainDoubles[3]?.node.gain.value).toBe(0);

    sourceDoubles[1]?.node.onended?.(new Event("ended"));
    await second.finished;
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

    publisher.stopCurrent();
    expect(sourceDoubles[2]?.stop).toHaveBeenCalledOnce();
    expect(sourceDoubles[2]?.stop).toHaveBeenCalledWith(0.02);
    await third.finished;
    expect(gainDoubles[4]?.disconnect).toHaveBeenCalledOnce();
    expect(track.enabled).toBe(false);
    expect(gainDoubles[4]?.cancelScheduledValues).toHaveBeenCalledWith(0);
    expect(gainDoubles[4]?.setValueAtTime).toHaveBeenLastCalledWith(1, 0);
    expect(gainDoubles[4]?.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      0,
      0.02,
    );
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

  it("waits for an in-flight publication before starting playback", async () => {
    sourceDoubles.length = 0;
    gainDoubles.length = 0;
    const publicationReady = deferred<{
      mute: ReturnType<typeof vi.fn>;
      unmute: ReturnType<typeof vi.fn>;
    }>();
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const outbound = {
      stream: { getAudioTracks: () => [track] },
    } as unknown as MediaStreamAudioDestinationNode;
    const source = createSource();
    const gains = [createGain(), createGain()];
    const createBufferSource = vi.fn(() => source);
    const context = {
      currentTime: 0,
      state: "running",
      createMediaStreamDestination: vi.fn(() => outbound),
      createBufferSource,
      createGain: vi.fn(() => gains.shift()),
      decodeAudioData: vi.fn(() =>
        Promise.resolve({ duration: 1 } as AudioBuffer),
      ),
    } as unknown as AudioContext;
    const publishTrack = vi.fn(() => publicationReady.promise);
    const participant = {
      publishTrack,
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<SoundboardAudioPublisher["ensurePublished"]>[0];
    const publisher = new SoundboardAudioPublisher(() => ({
      context,
      destination: {} as AudioNode,
    }));

    const publishing = publisher.ensurePublished(participant);
    const playing = publisher.play(
      participant,
      "event-1",
      mockSoundboardSounds[0]!,
      new Blob(["mp3"], { type: "audio/mpeg" }),
    );
    await Promise.resolve();
    expect(createBufferSource).not.toHaveBeenCalled();

    const publication = {
      mute: vi.fn().mockResolvedValue(undefined),
      unmute: vi.fn().mockResolvedValue(undefined),
    };
    publicationReady.resolve(publication);
    await publishing;
    await playing;

    expect(publishTrack).toHaveBeenCalledOnce();
    expect(createBufferSource).toHaveBeenCalledOnce();
    expect(sourceDoubles[0]?.start).toHaveBeenCalledOnce();
  });

  it("mutes when the latest sound ends even if an older decode is stale", async () => {
    sourceDoubles.length = 0;
    gainDoubles.length = 0;
    const staleDecode = deferred<AudioBuffer>();
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const publication = {
      mute: vi.fn().mockResolvedValue(undefined),
      unmute: vi.fn().mockResolvedValue(undefined),
    };
    const outbound = {
      stream: { getAudioTracks: () => [track] },
    } as unknown as MediaStreamAudioDestinationNode;
    const latestSource = createSource();
    const gains = [createGain(), createGain()];
    const createBufferSource = vi.fn(() => latestSource);
    const decodeAudioData = vi
      .fn()
      .mockImplementationOnce(() => staleDecode.promise)
      .mockResolvedValueOnce({ duration: 1 });
    const context = {
      currentTime: 0,
      state: "running",
      createMediaStreamDestination: vi.fn(() => outbound),
      createBufferSource,
      createGain: vi.fn(() => gains.shift()),
      decodeAudioData,
    } as unknown as AudioContext;
    const participant = {
      publishTrack: vi.fn().mockResolvedValue(publication),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
    };
    const onIdle = vi.fn();
    const publisher = new SoundboardAudioPublisher(
      () => ({ context, destination: {} as AudioNode }),
      onIdle,
    );
    await publisher.ensurePublished(participant);

    const staleResult = publisher
      .play(
        participant,
        "event-stale",
        mockSoundboardSounds[0]!,
        new Blob(["stale"], { type: "audio/mpeg" }),
      )
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(decodeAudioData).toHaveBeenCalledOnce());

    const latest = await publisher.play(
      participant,
      "event-latest",
      mockSoundboardSounds[1]!,
      new Blob(["latest"], { type: "audio/mpeg" }),
    );
    latestSource.onended?.(new Event("ended"));
    await latest.finished;

    expect(track.enabled).toBe(false);
    expect(publication.mute).toHaveBeenCalledTimes(2);
    expect(onIdle).toHaveBeenCalledOnce();

    staleDecode.resolve({ duration: 1 } as AudioBuffer);
    expect(await staleResult).toMatchObject({ name: "AbortError" });
    expect(createBufferSource).toHaveBeenCalledOnce();
  });
});

const sourceDoubles: Array<{
  node: AudioBufferSourceNode;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}> = [];

function createSource() {
  const connect = vi.fn();
  const disconnect = vi.fn();
  const start = vi.fn();
  const stop = vi.fn();
  const node = {
    buffer: null,
    connect,
    disconnect,
    start,
    stop,
    onended: null as (() => void) | null,
  } as unknown as AudioBufferSourceNode;
  sourceDoubles.push({ node, connect, disconnect, start, stop });
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
