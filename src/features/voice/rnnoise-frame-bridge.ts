export const AUDIO_WORKLET_BLOCK_SIZE = 128;
export const RNNOISE_FRAME_SIZE = 480;

const OUTPUT_BUFFER_SIZE = 1_920;

/**
 * Bridges the browser's fixed 128-sample render quantum to RNNoise's
 * 480-sample frame without dropping samples when either ring wraps.
 */
export class RnnoiseFrameBridge {
  private readonly inputFrame = new Float32Array(RNNOISE_FRAME_SIZE);
  private readonly outputBuffer = new Float32Array(OUTPUT_BUFFER_SIZE);
  private inputLength = 0;
  private outputReadIndex = 0;
  private outputWriteIndex = 0;
  private outputLength = 0;
  private outputStarted = false;

  constructor(private readonly processFrame: (frame: Float32Array) => void) {}

  process(input: Float32Array, output: Float32Array): void {
    if (
      input.length !== AUDIO_WORKLET_BLOCK_SIZE ||
      output.length !== AUDIO_WORKLET_BLOCK_SIZE
    ) {
      output.fill(0);
      output.set(input.subarray(0, output.length));
      return;
    }

    this.pushInput(input);
    if (!this.outputStarted) {
      output.fill(0);
      if (this.outputLength >= RNNOISE_FRAME_SIZE) {
        this.outputStarted = true;
      }
      return;
    }

    if (this.outputLength < output.length) {
      output.fill(0);
      return;
    }
    for (let index = 0; index < output.length; index += 1) {
      output[index] = this.outputBuffer[this.outputReadIndex] ?? 0;
      this.outputReadIndex =
        (this.outputReadIndex + 1) % this.outputBuffer.length;
    }
    this.outputLength -= output.length;
  }

  reset(): void {
    this.inputFrame.fill(0);
    this.outputBuffer.fill(0);
    this.inputLength = 0;
    this.outputReadIndex = 0;
    this.outputWriteIndex = 0;
    this.outputLength = 0;
    this.outputStarted = false;
  }

  private pushInput(input: Float32Array): void {
    let sourceIndex = 0;
    while (sourceIndex < input.length) {
      const copied = Math.min(
        RNNOISE_FRAME_SIZE - this.inputLength,
        input.length - sourceIndex,
      );
      this.inputFrame.set(
        input.subarray(sourceIndex, sourceIndex + copied),
        this.inputLength,
      );
      this.inputLength += copied;
      sourceIndex += copied;
      if (this.inputLength === RNNOISE_FRAME_SIZE) {
        this.processFrame(this.inputFrame);
        this.pushOutput(this.inputFrame);
        this.inputLength = 0;
      }
    }
  }

  private pushOutput(frame: Float32Array): void {
    for (const sample of frame) {
      if (this.outputLength === this.outputBuffer.length) {
        // This should be unreachable at equal input/output rates, but dropping
        // the oldest sample is safer than corrupting the ring's indices.
        this.outputReadIndex =
          (this.outputReadIndex + 1) % this.outputBuffer.length;
        this.outputLength -= 1;
      }
      this.outputBuffer[this.outputWriteIndex] = sample;
      this.outputWriteIndex =
        (this.outputWriteIndex + 1) % this.outputBuffer.length;
      this.outputLength += 1;
    }
  }
}
