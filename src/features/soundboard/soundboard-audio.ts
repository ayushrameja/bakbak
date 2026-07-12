import { Track, type LocalParticipant } from "livekit-client";
import type { SoundboardSound } from "./types";

export const SOUNDBOARD_TRACK_NAME = "bakbak-soundboard";

export interface SoundAudioTarget {
  context: AudioContext;
  destination: AudioNode;
}

interface ActiveSoundSource {
  source: AudioBufferSourceNode;
  localGain: GainNode;
  localSuppressed: boolean;
}

export interface SoundboardPlayback {
  finished: Promise<void>;
  stop: () => void;
}

type SoundboardParticipant = Pick<
  LocalParticipant,
  "publishTrack" | "unpublishTrack"
>;

export class SoundboardAudioPublisher {
  private participant: SoundboardParticipant | null = null;
  private outbound: MediaStreamAudioDestinationNode | null = null;
  private outboundTrack: MediaStreamTrack | null = null;
  private publishPromise: Promise<void> | null = null;
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly active = new Map<string, ActiveSoundSource>();
  private volume = 0.7;
  private deafened = false;

  constructor(private readonly getTarget: () => SoundAudioTarget | null) {}

  async ensurePublished(participant: SoundboardParticipant): Promise<void> {
    if (this.participant === participant && this.outboundTrack) return;
    if (this.publishPromise) return await this.publishPromise;

    const target = this.requireTarget();
    this.participant = participant;
    this.outbound = target.context.createMediaStreamDestination();
    const track = this.outbound.stream.getAudioTracks()[0];
    if (!track)
      throw new Error("Bakbak could not create a soundboard audio track.");
    this.outboundTrack = track;
    this.publishPromise = participant
      .publishTrack(track, {
        name: SOUNDBOARD_TRACK_NAME,
        source: Track.Source.Microphone,
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        this.outbound = null;
        this.outboundTrack?.stop();
        this.outboundTrack = null;
        this.participant = null;
        throw error;
      })
      .finally(() => {
        this.publishPromise = null;
      });
    await this.publishPromise;
  }

  async play(
    participant: SoundboardParticipant,
    eventId: string,
    sound: SoundboardSound,
    blob: Blob,
  ): Promise<SoundboardPlayback> {
    await this.ensurePublished(participant);
    const target = this.requireTarget();
    if (!this.outbound) throw new Error("Soundboard audio is not connected.");
    if (target.context.state === "suspended") await target.context.resume();

    const cacheKey = `${sound.id}:${sound.audioRevision}`;
    let buffer = this.decoded.get(cacheKey);
    if (!buffer) {
      buffer = await target.context.decodeAudioData(await blob.arrayBuffer());
      this.decoded.set(cacheKey, buffer);
    }

    const source = target.context.createBufferSource();
    const localGain = target.context.createGain();
    const localSuppressed = this.deafened;
    source.buffer = buffer;
    localGain.gain.value = localSuppressed ? 0 : this.volume;
    source.connect(this.outbound);
    source.connect(localGain);
    localGain.connect(target.destination);

    let resolveFinished: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      stopped = true;
      this.active.delete(eventId);
      source.disconnect();
      localGain.disconnect();
      resolveFinished();
    };
    source.onended = finish;
    this.active.set(eventId, { source, localGain, localSuppressed });
    source.start();

    return {
      finished,
      stop: () => {
        try {
          source.stop();
        } catch {
          finish();
        }
      },
    };
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.active.forEach((active) => {
      if (!active.localSuppressed) active.localGain.gain.value = this.volume;
    });
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (!deafened) return;
    this.active.forEach((active) => {
      active.localSuppressed = true;
      active.localGain.gain.value = 0;
    });
  }

  stopAll(): void {
    [...this.active.values()].forEach(({ source }) => {
      try {
        source.stop();
      } catch {
        // Already-ended sources are removed by their onended callback.
      }
    });
  }

  cleanup(): void {
    this.stopAll();
    if (this.participant && this.outboundTrack) {
      void this.participant
        .unpublishTrack(this.outboundTrack)
        .catch(() => undefined);
    }
    this.outboundTrack?.stop();
    this.outboundTrack = null;
    this.outbound = null;
    this.participant = null;
    this.publishPromise = null;
    this.decoded.clear();
    this.deafened = false;
  }

  private requireTarget(): SoundAudioTarget {
    const target = this.getTarget();
    if (!target) throw new Error("Soundboard audio output is unavailable.");
    return target;
  }
}
