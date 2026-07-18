import {
  validateSoundboardWav,
  WavValidationError,
} from "../../soundboard-manage/wav.ts";
import { makeWav } from "./fixtures.ts";

Deno.test(
  "soundboard WAV validation accepts normalized five-second mono PCM",
  () => {
    const result = validateSoundboardWav(makeWav(5_000));
    assertEquals(result.durationMs, 5_000);
    assertEquals(result.dataBytes, 480_000);
  },
);

Deno.test(
  "soundboard WAV validation rejects clips longer than five seconds",
  () => {
    assertThrowsCode(
      () => validateSoundboardWav(makeWav(5_001)),
      "clip_duration_out_of_range",
    );
  },
);

Deno.test(
  "soundboard WAV validation rejects stereo and unexpected sample rates",
  () => {
    assertThrowsCode(
      () => validateSoundboardWav(makeWav(1_000, { channels: 2 })),
      "unsupported_wav_format",
    );
    assertThrowsCode(
      () => validateSoundboardWav(makeWav(1_000, { sampleRate: 44_100 })),
      "unsupported_wav_format",
    );
  },
);

Deno.test(
  "soundboard WAV validation rejects forged or truncated RIFF data",
  () => {
    const bytes = makeWav(1_000);
    new DataView(bytes.buffer).setUint32(4, bytes.byteLength + 100, true);
    assertThrowsCode(() => validateSoundboardWav(bytes), "invalid_wav");
    assertThrowsCode(
      () => validateSoundboardWav(new TextEncoder().encode("not a wave")),
      "invalid_wav",
    );
  },
);

function assertThrowsCode(callback: () => void, code: string): void {
  try {
    callback();
  } catch (caught) {
    if (caught instanceof WavValidationError && caught.code === code) return;
    throw caught;
  }
  throw new Error(`Expected WavValidationError ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
