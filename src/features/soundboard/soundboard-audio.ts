import {
  Track,
  type LocalParticipant,
  type LocalTrackPublication,
} from "livekit-client";
import type { SoundboardSound } from "./types";

export const SOUNDBOARD_TRACK_NAME = "bakbak-soundboard";

export interface SoundAudioTarget {
  context: AudioContext;
  destination: AudioNode;
}

interface ActiveSoundSource {
  source: AudioBufferSourceNode;
  tailGain: GainNode;
  localGain: GainNode;
  localSuppressed: boolean;
  finish: () => void;
  stopWithFade: () => void;
  stopImmediately: () => void;
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
  private publication: LocalTrackPublication | null = null;
  private publishPromise: Promise<void> | null = null;
  private readonly decoded = new Map<string, AudioBuffer>();
  private active: ActiveSoundSource | null = null;
  private pendingPlayback: symbol | null = null;
  private generation = 0;
  private playOperation = 0;
  private volume = 0.7;
  private deafened = false;

  constructor(
    private readonly getTarget: () => SoundAudioTarget | null,
    private readonly onIdle: () => void = () => {},
  ) {}

  async ensurePublished(participant: SoundboardParticipant): Promise<void> {
    if (this.publishPromise) await this.publishPromise;
    if (
      this.participant === participant &&
      this.outboundTrack &&
      this.publication
    ) {
      return;
    }

    const target = this.requireTarget();
    const generation = this.generation;
    this.participant = participant;
    this.outbound = target.context.createMediaStreamDestination();
    const track = this.outbound.stream.getAudioTracks()[0];
    if (!track)
      throw new Error("Bakbak could not create a soundboard audio track.");
    track.enabled = false;
    this.outboundTrack = track;
    const publishPromise = participant
      .publishTrack(track, {
        name: SOUNDBOARD_TRACK_NAME,
        source: Track.Source.Microphone,
      })
      .then(async (publication) => {
        if (this.generation !== generation || this.outboundTrack !== track) {
          await participant.unpublishTrack(track).catch(() => undefined);
          track.stop();
          throw playbackCancelled();
        }
        this.publication = publication;
        await publication.mute();
      })
      .catch((error: unknown) => {
        if (this.outboundTrack === track) {
          void participant.unpublishTrack(track).catch(() => undefined);
          this.outbound = null;
          this.outboundTrack.stop();
          this.outboundTrack = null;
          this.publication = null;
          this.participant = null;
        }
        throw error;
      })
      .finally(() => {
        if (this.publishPromise === publishPromise) {
          this.publishPromise = null;
        }
      });
    this.publishPromise = publishPromise;
    await this.publishPromise;
  }

  async play(
    participant: SoundboardParticipant,
    eventId: string,
    sound: SoundboardSound,
    blob: Blob,
    signal?: AbortSignal,
  ): Promise<SoundboardPlayback> {
    const generation = this.generation;
    const playOperation = ++this.playOperation;
    const pendingPlayback = Symbol(eventId);
    const ensureCurrent = () => {
      if (
        this.generation !== generation ||
        this.playOperation !== playOperation ||
        signal?.aborted
      ) {
        throw playbackCancelled();
      }
    };
    this.pendingPlayback = pendingPlayback;
    this.stopActive();
    try {
      await this.ensurePublished(participant);
      ensureCurrent();
      const target = this.requireTarget();
      if (!this.outbound) throw new Error("Soundboard audio is not connected.");
      if (target.context.state === "suspended") await target.context.resume();
      ensureCurrent();

      const cacheKey = `${sound.id}:${sound.audioRevision}`;
      let buffer = this.decoded.get(cacheKey);
      if (!buffer) {
        buffer = await target.context.decodeAudioData(await blob.arrayBuffer());
        ensureCurrent();
        this.decoded.set(cacheKey, buffer);
      }

      const source = target.context.createBufferSource();
      const tailGain = target.context.createGain();
      const localGain = target.context.createGain();
      const localSuppressed = this.deafened;
      source.buffer = buffer;
      tailGain.gain.value = 1;
      localGain.gain.value = localSuppressed ? 0 : this.volume;
      source.connect(tailGain);
      tailGain.connect(this.outbound);
      tailGain.connect(localGain);
      localGain.connect(target.destination);

      let resolveFinished: () => void = () => {};
      const finished = new Promise<void>((resolve) => {
        resolveFinished = resolve;
      });
      let stopped = false;
      let stopScheduled = false;
      let stopFallback: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        if (stopFallback !== null) clearTimeout(stopFallback);
        if (this.active?.source === source) this.active = null;
        source.disconnect();
        tailGain.disconnect();
        localGain.disconnect();
        this.settleIfIdle();
        resolveFinished();
      };
      const stopWithFade = () => {
        if (stopped || stopScheduled) return;
        stopScheduled = true;
        const stopAt = scheduleDeClickStop(tailGain);
        try {
          source.stop(stopAt);
          stopFallback = setTimeout(
            finish,
            Math.ceil(ZERO_TAIL_SECONDS * 1_000) + 25,
          );
        } catch {
          silenceImmediately(tailGain);
          finish();
        }
      };
      const stopImmediately = () => {
        if (stopped) return;
        silenceImmediately(tailGain);
        try {
          source.stop();
        } catch {
          // The source may already have ended; finish still owns cleanup.
        }
        finish();
      };
      source.onended = finish;
      this.active = {
        source,
        tailGain,
        localGain,
        localSuppressed,
        finish,
        stopWithFade,
        stopImmediately,
      };
      try {
        await this.unmuteOutbound();
        ensureCurrent();
        scheduleZeroTail(target.context, tailGain, buffer.duration);
        source.start();
      } catch (error) {
        finish();
        throw error;
      }

      return {
        finished,
        stop: stopWithFade,
      };
    } finally {
      if (this.pendingPlayback === pendingPlayback) {
        this.pendingPlayback = null;
      }
      this.settleIfIdle();
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.active && !this.active.localSuppressed) {
      this.active.localGain.gain.value = this.volume;
    }
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (!deafened) return;
    if (!this.active) return;
    this.active.localSuppressed = true;
    this.active.localGain.gain.value = 0;
  }

  stopCurrent(): void {
    this.playOperation += 1;
    this.pendingPlayback = null;
    const hadActiveSound = this.active !== null;
    this.stopActive();
    if (!hadActiveSound) {
      this.muteOutbound();
      this.onIdle();
    }
  }

  cleanup(): void {
    this.generation += 1;
    this.playOperation += 1;
    this.pendingPlayback = null;
    this.stopActiveImmediately();
    this.muteOutbound();
    if (this.participant && this.outboundTrack) {
      void this.participant
        .unpublishTrack(this.outboundTrack)
        .catch(() => undefined);
    }
    this.outboundTrack?.stop();
    this.outboundTrack = null;
    this.publication = null;
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

  private async unmuteOutbound(): Promise<void> {
    if (!this.outboundTrack || !this.publication) {
      throw new Error("Soundboard audio is not connected.");
    }
    this.outboundTrack.enabled = true;
    try {
      await this.publication.unmute();
    } catch (error) {
      this.outboundTrack.enabled = false;
      throw error;
    }
  }

  private muteOutbound(): void {
    if (this.outboundTrack) this.outboundTrack.enabled = false;
    void this.publication?.mute().catch(() => undefined);
  }

  private stopActive(): void {
    this.active?.stopWithFade();
  }

  private stopActiveImmediately(): void {
    this.active?.stopImmediately();
  }

  private settleIfIdle(): void {
    if (this.active || this.pendingPlayback) return;
    this.muteOutbound();
    this.onIdle();
  }
}

const ZERO_TAIL_SECONDS = 0.02;

function scheduleDeClickStop(gain: GainNode): number {
  const now = gain.context.currentTime;
  const stopAt = now + ZERO_TAIL_SECONDS;
  if (typeof gain.gain.cancelScheduledValues === "function") {
    gain.gain.cancelScheduledValues(now);
  }
  if (
    typeof gain.gain.setValueAtTime === "function" &&
    typeof gain.gain.linearRampToValueAtTime === "function"
  ) {
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, stopAt);
  } else {
    gain.gain.value = 0;
  }
  return stopAt;
}

function scheduleZeroTail(
  context: AudioContext,
  gain: GainNode,
  duration: number,
): void {
  if (
    typeof gain.gain.setValueAtTime !== "function" ||
    typeof gain.gain.linearRampToValueAtTime !== "function"
  ) {
    return;
  }
  const start = context.currentTime;
  const end = start + duration;
  const fadeStart = Math.max(start, end - ZERO_TAIL_SECONDS);
  gain.gain.setValueAtTime(1, start);
  gain.gain.setValueAtTime(1, fadeStart);
  gain.gain.linearRampToValueAtTime(0, end);
}

function silenceImmediately(gain: GainNode): void {
  const now = gain.context.currentTime;
  if (typeof gain.gain.cancelScheduledValues === "function") {
    gain.gain.cancelScheduledValues(now);
  }
  if (typeof gain.gain.setValueAtTime === "function") {
    gain.gain.setValueAtTime(0, now);
  } else {
    gain.gain.value = 0;
  }
}

function playbackCancelled(): DOMException {
  return new DOMException("Sound playback was stopped.", "AbortError");
}
