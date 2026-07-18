import {
  Track,
  type AudioProcessorOptions,
  type LocalAudioTrack,
  type TrackProcessor,
} from "livekit-client";
import type { MicrophoneProcessingPreferences } from "../settings/microphone-preferences";
import microphoneWorkletUrl from "./microphone-worklet.ts?worker&url";

const PROCESSOR_NAME = "bakbak-microphone-processor";
const REQUIRED_SAMPLE_RATE = 48_000;

export const MICROPHONE_PROCESSING_UNAVAILABLE =
  "Enhanced cleanup is unavailable in this runtime. Bakbak kept the built-in microphone cleanup active.";

const loadedWorklets = new WeakMap<AudioContext, Promise<void>>();

export class BakbakMicrophoneProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  readonly name = PROCESSOR_NAME;
  readonly audioContext: AudioContext;
  processedTrack!: MediaStreamTrack;

  private preferences: MicrophoneProcessingPreferences;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private destroyed = false;

  constructor(preferences: MicrophoneProcessingPreferences) {
    this.preferences = preferences;
    this.audioContext = new AudioContext({
      latencyHint: "interactive",
      sampleRate: REQUIRED_SAMPLE_RATE,
    });
    if (this.audioContext.sampleRate !== REQUIRED_SAMPLE_RATE) {
      void this.audioContext.close();
      throw new Error(
        `Enhanced microphone processing requires ${REQUIRED_SAMPLE_RATE} Hz audio.`,
      );
    }
  }

  async init(options: AudioProcessorOptions): Promise<void> {
    if (this.destroyed) {
      throw new Error("The microphone processor has already been released.");
    }
    await loadMicrophoneWorklet(this.audioContext);
    if (this.destroyed) return;

    this.node = new AudioWorkletNode(this.audioContext, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: this.preferences,
    });
    this.destination = this.audioContext.createMediaStreamDestination();
    this.node.connect(this.destination);
    this.connectSource(options.track);
    const processedTrack = this.destination.stream.getAudioTracks()[0];
    if (!processedTrack) {
      throw new Error(
        "The microphone processor did not create an audio track.",
      );
    }
    this.processedTrack = processedTrack;
    await this.audioContext.resume();
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    if (this.destroyed) return;
    this.connectSource(options.track);
    this.node?.port.postMessage({ type: "reset" });
    await this.audioContext.resume();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.node?.port.postMessage({ type: "destroy" });
    this.source?.disconnect();
    this.node?.disconnect();
    this.destination?.disconnect();
    this.processedTrack?.stop();
    this.source = null;
    this.node = null;
    this.destination = null;
    await this.audioContext.close().catch(() => undefined);
  }

  setPreferences(preferences: MicrophoneProcessingPreferences): void {
    this.preferences = preferences;
    this.node?.port.postMessage({ type: "configure", preferences });
  }

  private connectSource(track: MediaStreamTrack): void {
    this.source?.disconnect();
    this.source = this.audioContext.createMediaStreamSource(
      new MediaStream([track]),
    );
    if (!this.node) {
      throw new Error("The microphone worklet is not ready.");
    }
    this.source.connect(this.node);
  }
}

export function isMicrophoneProcessingSupported(): boolean {
  return (
    typeof AudioContext !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    "audioWorklet" in AudioContext.prototype
  );
}

export function needsMicrophoneProcessor(
  preferences: MicrophoneProcessingPreferences,
): boolean {
  return (
    preferences.enhancedNoiseSuppression || preferences.voiceEffect !== "none"
  );
}

export function microphoneCaptureOptions(deviceId: string) {
  return {
    ...(deviceId === "default" ? {} : { deviceId }),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: REQUIRED_SAMPLE_RATE,
  };
}

export async function attachMicrophoneProcessor(
  track: LocalAudioTrack,
  preferences: MicrophoneProcessingPreferences,
): Promise<BakbakMicrophoneProcessor | null> {
  if (
    !needsMicrophoneProcessor(preferences) ||
    !isMicrophoneProcessingSupported()
  ) {
    return null;
  }
  const processor = new BakbakMicrophoneProcessor(preferences);
  try {
    track.setAudioContext(processor.audioContext);
    await track.setProcessor(processor);
    return processor;
  } catch (error) {
    await processor.destroy();
    throw error;
  }
}

export async function createMicrophonePreview(
  sourceStream: MediaStream,
  preferences: MicrophoneProcessingPreferences,
): Promise<{
  stream: MediaStream;
  cleanup: () => void;
}> {
  if (
    !needsMicrophoneProcessor(preferences) ||
    !isMicrophoneProcessingSupported()
  ) {
    return {
      stream: sourceStream,
      cleanup: () => undefined,
    };
  }

  const track = sourceStream.getAudioTracks()[0];
  if (!track) throw new Error("Microphone preview found no audio track.");
  const processor = new BakbakMicrophoneProcessor(preferences);
  try {
    await processor.init({
      kind: Track.Kind.Audio,
      track,
      audioContext: processor.audioContext,
    });
    if (!processor.processedTrack) {
      throw new Error("The microphone preview did not create an audio track.");
    }
    return {
      stream: new MediaStream([processor.processedTrack]),
      cleanup: () => void processor.destroy(),
    };
  } catch (error) {
    await processor.destroy();
    throw error;
  }
}

export function isBakbakMicrophoneProcessor(
  value: unknown,
): value is BakbakMicrophoneProcessor {
  return value instanceof BakbakMicrophoneProcessor;
}

async function loadMicrophoneWorklet(context: AudioContext): Promise<void> {
  const existing = loadedWorklets.get(context);
  if (existing) return existing;
  const loading = context.audioWorklet.addModule(microphoneWorkletUrl);
  loadedWorklets.set(context, loading);
  try {
    await loading;
  } catch (error) {
    loadedWorklets.delete(context);
    throw error;
  }
}
