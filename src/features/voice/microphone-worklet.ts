import createRNNWasmModuleSync from "@jitsi/rnnoise-wasm/dist/rnnoise-sync.js";
import type { MicrophoneProcessingPreferences } from "../settings/microphone-preferences";

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
}

const PROCESSOR_NAME = "bakbak-microphone-processor";
const RNNOISE_FRAME_SIZE = 480;
const RNNOISE_BUFFER_BYTES =
  RNNOISE_FRAME_SIZE * Float32Array.BYTES_PER_ELEMENT;
const PCM_SCALE = 32_768;
const WORKLET_BLOCK_SIZE = 128;
const CIRCULAR_BUFFER_SIZE = 1_920;

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
  private circularBuffer = new Float32Array(CIRCULAR_BUFFER_SIZE);
  private inputLength = 0;
  private denoisedLength = 0;
  private outputIndex = 0;
  private outputStarted = false;
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
          this.resetBuffers();
        }
      } else if (message.type === "reset") {
        this.resetBuffers();
      } else if (message.type === "destroy") {
        this.running = false;
        this.denoiser.destroy();
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    if (
      input.length !== WORKLET_BLOCK_SIZE ||
      output.length !== WORKLET_BLOCK_SIZE
    ) {
      output.fill(0);
      output.set(input.subarray(0, output.length));
      return true;
    }

    if (this.preferences.enhancedNoiseSuppression) {
      this.readDenoisedBlock(input, output);
    } else {
      output.set(input);
    }
    return true;
  }

  private readDenoisedBlock(input: Float32Array, output: Float32Array): void {
    this.circularBuffer.set(input, this.inputLength);
    this.inputLength += input.length;

    while (this.denoisedLength + RNNOISE_FRAME_SIZE <= this.inputLength) {
      this.denoiser.process(
        this.circularBuffer.subarray(
          this.denoisedLength,
          this.denoisedLength + RNNOISE_FRAME_SIZE,
        ),
      );
      this.denoisedLength += RNNOISE_FRAME_SIZE;
    }

    // RNNoise produces 480 samples at a time while an AudioWorklet consumes
    // 128. Hold one render quantum after the first frame so the bursty frame
    // cadence cannot briefly starve the output between RNNoise calls.
    if (!this.outputStarted) {
      output.fill(0);
      if (this.denoisedLength >= RNNOISE_FRAME_SIZE) {
        this.outputStarted = true;
      }
      return;
    }

    const readySamples =
      this.outputIndex > this.denoisedLength
        ? CIRCULAR_BUFFER_SIZE - this.outputIndex
        : this.denoisedLength - this.outputIndex;
    if (readySamples >= output.length) {
      output.set(
        this.circularBuffer.subarray(
          this.outputIndex,
          this.outputIndex + output.length,
        ),
      );
      this.outputIndex += output.length;
    } else {
      output.fill(0);
    }

    if (this.outputIndex === CIRCULAR_BUFFER_SIZE) {
      this.outputIndex = 0;
    }
    if (this.inputLength === CIRCULAR_BUFFER_SIZE) {
      this.inputLength = 0;
      this.denoisedLength = 0;
    }
  }

  private resetBuffers(): void {
    this.circularBuffer.fill(0);
    this.inputLength = 0;
    this.denoisedLength = 0;
    this.outputIndex = 0;
    this.outputStarted = false;
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
