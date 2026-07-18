import createRNNWasmModuleSync from "@jitsi/rnnoise-wasm/dist/rnnoise-sync.js";
import type {
  MicrophoneProcessingPreferences,
  VoiceEffect,
} from "../settings/microphone-preferences";

declare const sampleRate: number;

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
const CHILD_PITCH_RATIO = 2 ** (4 / 12);

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

  private robotPhase = 0;
  private radioLowPass = 0;
  private radioHighPass = 0;
  private radioPreviousInput = 0;

  private pitchBuffer = new Float32Array(Math.ceil(sampleRate * 0.07) + 8);
  private pitchWriteIndex = 0;
  private pitchPhase = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    this.preferences = readPreferences(options?.processorOptions);
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const message = event.data;
      if (message.type === "configure" && message.preferences) {
        const previousEffect = this.preferences.voiceEffect;
        const previousSuppression = this.preferences.enhancedNoiseSuppression;
        this.preferences = readPreferences(message.preferences);
        if (
          previousEffect !== this.preferences.voiceEffect ||
          previousSuppression !== this.preferences.enhancedNoiseSuppression
        ) {
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
      this.applyVoiceEffect(output, this.preferences.voiceEffect);
      return true;
    }

    if (this.preferences.enhancedNoiseSuppression) {
      this.readDenoisedBlock(input, output);
    } else {
      output.set(input);
    }
    this.applyVoiceEffect(output, this.preferences.voiceEffect);
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

  private applyVoiceEffect(block: Float32Array, effect: VoiceEffect): void {
    if (effect === "none") return;
    for (let index = 0; index < block.length; index += 1) {
      const input = block[index] ?? 0;
      if (effect === "child") {
        block[index] = this.pitchShift(input);
      } else if (effect === "robot") {
        const carrier = Math.sin(this.robotPhase);
        this.robotPhase += (2 * Math.PI * 72) / sampleRate;
        if (this.robotPhase > 2 * Math.PI) this.robotPhase -= 2 * Math.PI;
        block[index] = clamp(input * (0.32 + carrier * 0.92));
      } else {
        block[index] = this.radioFilter(input);
      }
    }
  }

  private pitchShift(input: number): number {
    this.pitchBuffer[this.pitchWriteIndex] = input;
    const grainSamples = Math.round(sampleRate * 0.04);
    const firstPhase = this.pitchPhase;
    const secondPhase = (firstPhase + 0.5) % 1;
    const firstWeight = Math.sin(Math.PI * firstPhase) ** 2;
    const secondWeight = Math.sin(Math.PI * secondPhase) ** 2;
    const firstSample = this.readPitchDelay(
      6 + (1 - firstPhase) * grainSamples,
    );
    const secondSample = this.readPitchDelay(
      6 + (1 - secondPhase) * grainSamples,
    );
    const output =
      (firstSample * firstWeight + secondSample * secondWeight) /
      Math.max(0.001, firstWeight + secondWeight);

    this.pitchPhase += (CHILD_PITCH_RATIO - 1) / grainSamples;
    if (this.pitchPhase >= 1) this.pitchPhase -= 1;
    this.pitchWriteIndex = (this.pitchWriteIndex + 1) % this.pitchBuffer.length;
    return clamp(output * 1.06);
  }

  private readPitchDelay(delay: number): number {
    let position = this.pitchWriteIndex - delay;
    while (position < 0) position += this.pitchBuffer.length;
    const firstIndex = Math.floor(position) % this.pitchBuffer.length;
    const secondIndex = (firstIndex + 1) % this.pitchBuffer.length;
    const fraction = position - Math.floor(position);
    const first = this.pitchBuffer[firstIndex] ?? 0;
    const second = this.pitchBuffer[secondIndex] ?? 0;
    return first + (second - first) * fraction;
  }

  private radioFilter(input: number): number {
    const lowPassAlpha = Math.min(1, (2 * Math.PI * 3_500) / sampleRate);
    this.radioLowPass += lowPassAlpha * (input - this.radioLowPass);

    const timeStep = 1 / sampleRate;
    const highPassTimeConstant = 1 / (2 * Math.PI * 280);
    const highPassAlpha =
      highPassTimeConstant / (highPassTimeConstant + timeStep);
    this.radioHighPass =
      highPassAlpha *
      (this.radioHighPass + this.radioLowPass - this.radioPreviousInput);
    this.radioPreviousInput = this.radioLowPass;
    return clamp(Math.tanh(this.radioHighPass * 3.4) * 0.72);
  }

  private resetBuffers(): void {
    this.circularBuffer.fill(0);
    this.inputLength = 0;
    this.denoisedLength = 0;
    this.outputIndex = 0;
    this.outputStarted = false;
    this.robotPhase = 0;
    this.radioLowPass = 0;
    this.radioHighPass = 0;
    this.radioPreviousInput = 0;
    this.pitchBuffer.fill(0);
    this.pitchWriteIndex = 0;
    this.pitchPhase = 0;
  }
}

function readPreferences(value: unknown): MicrophoneProcessingPreferences {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Partial<MicrophoneProcessingPreferences>)
      : {};
  const voiceEffect =
    candidate.voiceEffect === "child" ||
    candidate.voiceEffect === "robot" ||
    candidate.voiceEffect === "radio"
      ? candidate.voiceEffect
      : "none";
  return {
    enhancedNoiseSuppression: candidate.enhancedNoiseSuppression !== false,
    voiceEffect,
  };
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

registerProcessor(PROCESSOR_NAME, BakbakMicrophoneWorklet);
