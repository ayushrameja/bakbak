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
const WORKLET_HANDSHAKE_TIMEOUT_MS = 3_000;
let workletRequestId = 0;

export const MICROPHONE_PROCESSING_UNAVAILABLE =
  "Enhanced cleanup is unavailable in this runtime. Bakbak kept the built-in microphone cleanup active.";

const loadedWorklets = new WeakMap<AudioContext, Promise<void>>();
const verifiedWorklets = new WeakMap<AudioContext, Promise<void>>();
let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext {
  if (sharedAudioContext && sharedAudioContext.state !== "closed") {
    return sharedAudioContext;
  }
  const context = new AudioContext({
    latencyHint: "interactive",
    sampleRate: REQUIRED_SAMPLE_RATE,
  });
  if (context.sampleRate !== REQUIRED_SAMPLE_RATE) {
    void context.close();
    throw new Error(
      `Enhanced microphone processing requires ${REQUIRED_SAMPLE_RATE} Hz audio.`,
    );
  }
  sharedAudioContext = context;
  return context;
}

export async function prewarmMicrophoneProcessing(): Promise<boolean> {
  if (!isMicrophoneProcessingSupported()) return false;
  try {
    const context = getSharedAudioContext();
    await context.resume();
    await loadMicrophoneWorklet(context);
    await verifyMicrophoneWorklet(context);
    return true;
  } catch {
    return false;
  }
}

export async function releaseMicrophoneProcessing(): Promise<void> {
  const context = sharedAudioContext;
  sharedAudioContext = null;
  await context?.close().catch(() => undefined);
}

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
  private processorErrorHandler: (() => void) | null = null;

  constructor(preferences: MicrophoneProcessingPreferences) {
    this.preferences = preferences;
    this.audioContext = getSharedAudioContext();
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
    this.node.onprocessorerror = () => {
      this.processorErrorHandler?.();
    };
    await initializeMicrophoneWorklet(this.node, this.preferences);
    if (this.destroyed) return;
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
    await this.setPreferences(this.preferences);
    await this.audioContext.resume();
  }

  destroy(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.destroyed = true;
    this.node?.port.postMessage({ type: "destroy" });
    this.source?.disconnect();
    this.node?.disconnect();
    this.destination?.disconnect();
    this.processedTrack?.stop();
    this.source = null;
    this.node = null;
    this.destination = null;
    return Promise.resolve();
  }

  setProcessorErrorHandler(handler: (() => void) | null): void {
    this.processorErrorHandler = handler;
  }

  async setPreferences(
    preferences: MicrophoneProcessingPreferences,
  ): Promise<void> {
    this.preferences = preferences;
    const node = this.node;
    if (!node) throw new Error("The microphone worklet is not ready.");
    await configureMicrophoneWorklet(node, preferences);
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
  return preferences.enhancedNoiseSuppression;
}

export function microphoneCaptureOptions(
  deviceId: string,
  echoCancellation = true,
) {
  return {
    ...(deviceId === "default" ? {} : { deviceId: { exact: deviceId } }),
    echoCancellation,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: REQUIRED_SAMPLE_RATE,
  };
}

export async function attachMicrophoneProcessor(
  track: LocalAudioTrack,
  preferences: MicrophoneProcessingPreferences,
  onProcessorError?: () => void,
): Promise<BakbakMicrophoneProcessor | null> {
  if (
    !needsMicrophoneProcessor(preferences) ||
    !isMicrophoneProcessingSupported()
  ) {
    return null;
  }
  const processor = new BakbakMicrophoneProcessor(preferences);
  processor.setProcessorErrorHandler(onProcessorError ?? null);
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
  processingError: string | null;
  setEnhancedNoiseSuppression: (enabled: boolean) => Promise<boolean>;
}> {
  if (!isMicrophoneProcessingSupported()) {
    return {
      stream: sourceStream,
      cleanup: () => undefined,
      processingError: preferences.enhancedNoiseSuppression
        ? MICROPHONE_PROCESSING_UNAVAILABLE
        : null,
      setEnhancedNoiseSuppression: () => Promise.resolve(false),
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
      processingError: null,
      setEnhancedNoiseSuppression: async (enabled) => {
        await processor.setPreferences({
          enhancedNoiseSuppression: enabled,
        });
        return true;
      },
    };
  } catch {
    await processor.destroy();
    return {
      stream: sourceStream,
      cleanup: () => undefined,
      processingError: preferences.enhancedNoiseSuppression
        ? MICROPHONE_PROCESSING_UNAVAILABLE
        : null,
      setEnhancedNoiseSuppression: () => Promise.resolve(false),
    };
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

async function verifyMicrophoneWorklet(context: AudioContext): Promise<void> {
  const existing = verifiedWorklets.get(context);
  if (existing) return existing;
  const verification = (async () => {
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      processorOptions: { enhancedNoiseSuppression: true },
    });
    try {
      await initializeMicrophoneWorklet(node, {
        enhancedNoiseSuppression: true,
      });
    } finally {
      node.port.postMessage({ type: "destroy" });
      node.disconnect();
    }
  })();
  verifiedWorklets.set(context, verification);
  try {
    await verification;
  } catch (error) {
    verifiedWorklets.delete(context);
    throw error;
  }
}

interface MicrophoneWorkletResponse {
  type: "ready" | "configured";
  requestId?: number;
}

export async function initializeMicrophoneWorklet(
  node: AudioWorkletNode,
  preferences: MicrophoneProcessingPreferences,
  timeoutMs = WORKLET_HANDSHAKE_TIMEOUT_MS,
): Promise<void> {
  node.port.start();
  await waitForWorkletResponse(
    node,
    (response) => response.type === "ready",
    undefined,
    timeoutMs,
  );
  await configureMicrophoneWorklet(node, preferences, timeoutMs);
}

async function configureMicrophoneWorklet(
  node: AudioWorkletNode,
  preferences: MicrophoneProcessingPreferences,
  timeoutMs = WORKLET_HANDSHAKE_TIMEOUT_MS,
): Promise<void> {
  const requestId = (workletRequestId += 1);
  await waitForWorkletResponse(
    node,
    (response) =>
      response.type === "configured" && response.requestId === requestId,
    () =>
      node.port.postMessage({
        type: "configure",
        preferences,
        requestId,
      }),
    timeoutMs,
  );
}

function waitForWorkletResponse(
  node: AudioWorkletNode,
  matches: (response: MicrophoneWorkletResponse) => boolean,
  send: (() => void) | undefined,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      node.port.removeEventListener("message", onMessage);
      node.removeEventListener("processorerror", onProcessorError);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const response = readWorkletResponse(event.data);
      if (!response || !matches(response)) return;
      cleanup();
      resolve();
    };
    const onProcessorError = () => {
      cleanup();
      reject(new Error("The RNNoise audio processor stopped unexpectedly."));
    };
    const timer = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error("The RNNoise audio processor did not become ready."));
    }, timeoutMs);
    node.port.addEventListener("message", onMessage);
    node.addEventListener("processorerror", onProcessorError);
    send?.();
  });
}

function readWorkletResponse(value: unknown): MicrophoneWorkletResponse | null {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return null;
  }
  const type = value.type;
  if (type !== "ready" && type !== "configured") return null;
  return {
    type,
    ...("requestId" in value && typeof value.requestId === "number"
      ? { requestId: value.requestId }
      : {}),
  };
}
