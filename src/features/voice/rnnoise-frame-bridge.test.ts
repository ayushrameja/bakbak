import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_WORKLET_BLOCK_SIZE,
  RNNOISE_FRAME_SIZE,
  RnnoiseFrameBridge,
} from "./rnnoise-frame-bridge";

describe("RnnoiseFrameBridge", () => {
  it("feeds exact 480-sample frames and preserves sample order across wraps", () => {
    const frames: number[][] = [];
    const bridge = new RnnoiseFrameBridge((frame) => {
      frames.push([...frame]);
      frame.forEach((sample, index) => {
        frame[index] = sample + 1;
      });
    });
    const rendered: number[] = [];
    let nextSample = 0;

    for (let block = 0; block < 50; block += 1) {
      const input = Float32Array.from(
        { length: AUDIO_WORKLET_BLOCK_SIZE },
        () => nextSample++,
      );
      const output = new Float32Array(AUDIO_WORKLET_BLOCK_SIZE);
      bridge.process(input, output);
      rendered.push(...output);
    }

    expect(frames).toHaveLength(
      Math.floor((50 * AUDIO_WORKLET_BLOCK_SIZE) / RNNOISE_FRAME_SIZE),
    );
    expect(frames[0]).toEqual(
      Array.from({ length: RNNOISE_FRAME_SIZE }, (_, index) => index),
    );
    const nonSilent = rendered.slice(
      rendered.findIndex((sample) => sample !== 0),
    );
    expect(nonSilent.slice(0, 1_500)).toEqual(
      Array.from({ length: 1_500 }, (_, index) => index + 1),
    );
  });

  it("resets buffered audio and passes unexpected block sizes through", () => {
    const processFrame = vi.fn();
    const bridge = new RnnoiseFrameBridge(processFrame);
    bridge.process(
      new Float32Array(AUDIO_WORKLET_BLOCK_SIZE).fill(1),
      new Float32Array(AUDIO_WORKLET_BLOCK_SIZE),
    );
    bridge.reset();

    const output = new Float32Array(4);
    bridge.process(Float32Array.from([1, 2, 3, 4]), output);

    expect([...output]).toEqual([1, 2, 3, 4]);
    expect(processFrame).not.toHaveBeenCalled();
  });
});
