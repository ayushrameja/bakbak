import createRNNWasmModuleSync from "@jitsi/rnnoise-wasm/dist/rnnoise-sync.js";
import type { MicrophoneProcessingPreferences } from "../settings/microphone-preferences";
import {
  AUDIO_WORKLET_BLOCK_SIZE,
  RNNOISE_FRAME_SIZE,
  RnnoiseFrameBridge,
} from "./rnnoise-frame-bridge";

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

interface RnnoiseModule {
  HEAPF32: Float32Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _rnnoise_create(): number;
  _rnnoise_destroy(state: number): void;
  _rnnoise_process_frame(state: number, output: number, input: number): number;
}

interface WorkletMessage {
  type: "configure" | "reset" | "destroy";
  preferences?: MicrophoneProcessingPreferences;
  requestId?: number;
}

const PROCESSOR_NAME = "bakbak-microphone-processor";
const RNNOISE_BUFFER_BYTES =
  RNNOISE_FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT;
const PCM_SCALE = 32_768;

const rnnoiseModule = createRNNWasmModuleSync() as RnnoiseModule;

class RnnoiseDenoiser {
  private state = 0;
  private inputPointer = 0;
  private inputIndex = 0;

  constructor() {
    this.inputPointer = rnnoiseModule._malloc(RNNOISE_BUFFER_BYTES);
    if (!this.inputPointer) {
      throw new Error("RNNoise could not allocate its audio buffer.");
    }
    this.inputIndex = this.inputPointer >> 2;
    this.state = rnnoiseModule._rnnoise_create();
    if (!this.state) {
      this.destroy();
      throw new Error("RNNoise could not create its processing state.");
    }
  }

  process(frame: Float32Array): number {
    for (let index = 0; index < RNNOISE_FRAME_SIZE; index += 1) {
      rnnoiseModule.HEAPF32[this.inputIndex + index] =
        (frame[index] ?? 0) * PCM_SCALE;
    }
    const voiceProbability = rnnoiseModule._rnnoise_process_frame(
      this.state,
      this.inputPointer,
      this.inputPointer,
    );
    for (let index = 0; index < RNNOISE_FRAME_SIZE; index += 1) {
      frame[index] =
        (rnnoiseModule.HEAPF32[this.inputIndex + index] ?? 0) / PCM_SCALE;
    }
    return voiceProbability;
  }

  destroy(): void {
    if (this.state) {
      rnnoiseModule._rnnoise_destroy(this.state);
      this.state = 0;
    }
    if (this.inputPointer) {
      rnnoiseModule._free(this.inputPointer);
      this.inputPointer = 0;
    }
  }
}

class BakbakMicrophoneWorklet extends AudioWorkletProcessor {
  private denoiser = new RnnoiseDenoiser();
  private preferences: MicrophoneProcessingPreferences;
  private bridge = new RnnoiseFrameBridge((frame) => {
    this.denoiser.process(frame);
  });
  private running = true;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.preferences = readPreferences(options?.processorOptions);
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const message = event.data;
      if (message.type === "configure" && message.preferences) {
        const previousSuppression = this.preferences.enhancedNoiseSuppression;
        this.preferences = readPreferences(message.preferences);
        if (previousSuppression !== this.preferences.enhancedNoiseSuppression) {
          this.bridge.reset();
        }
        this.port.postMessage({
          type: "configured",
          requestId: message.requestId,
        });
      } else if (message.type === "reset") {
        this.bridge.reset();
      } else if (message.type === "destroy") {
        this.running = false;
        this.denoiser.destroy();
      }
    };
    this.port.postMessage({ type: "ready" });
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    if (
      input.length !== AUDIO_WORKLET_BLOCK_SIZE ||
      output.length !== AUDIO_WORKLET_BLOCK_SIZE
    ) {
      output.fill(0);
      output.set(input.subarray(0, output.length));
      return true;
    }

    if (this.preferences.enhancedNoiseSuppression) {
      this.bridge.process(input, output);
    } else {
      output.set(input);
    }
    return true;
  }
}

function readPreferences(value: unknown): MicrophoneProcessingPreferences {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Partial<MicrophoneProcessingPreferences>)
      : {};
  return {
    enhancedNoiseSuppression: candidate.enhancedNoiseSuppression !== false,
  };
}

registerProcessor(PROCESSOR_NAME, BakbakMicrophoneWorklet);
