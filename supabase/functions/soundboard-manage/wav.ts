export const SOUNDBOARD_SAMPLE_RATE = 48_000;
export const SOUNDBOARD_CHANNELS = 1;
export const SOUNDBOARD_BITS_PER_SAMPLE = 16;
export const MIN_SOUNDBOARD_DURATION_MS = 100;
export const MAX_SOUNDBOARD_DURATION_MS = 5_000;
export const MAX_SOUNDBOARD_WAV_BYTES = 600 * 1024;

export class WavValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "WavValidationError";
  }
}

export interface ValidatedWav {
  durationMs: number;
  dataBytes: number;
}

export function validateSoundboardWav(bytes: Uint8Array): ValidatedWav {
  if (bytes.byteLength < 44 || bytes.byteLength > MAX_SOUNDBOARD_WAV_BYTES) {
    throw new WavValidationError(
      bytes.byteLength > MAX_SOUNDBOARD_WAV_BYTES
        ? "clip_too_large"
        : "invalid_wav",
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    throw new WavValidationError("invalid_wav");
  }

  const declaredSize = view.getUint32(4, true) + 8;
  if (declaredSize > bytes.byteLength || declaredSize < 44) {
    throw new WavValidationError("invalid_wav");
  }

  let format:
    | {
        audioFormat: number;
        channels: number;
        sampleRate: number;
        byteRate: number;
        blockAlign: number;
        bitsPerSample: number;
      }
    | undefined;
  let dataBytes: number | undefined;
  let offset = 12;

  while (offset + 8 <= declaredSize) {
    const chunkId = ascii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > declaredSize) throw new WavValidationError("invalid_wav");

    if (chunkId === "fmt " && chunkSize >= 16) {
      format = {
        audioFormat: view.getUint16(chunkStart, true),
        channels: view.getUint16(chunkStart + 2, true),
        sampleRate: view.getUint32(chunkStart + 4, true),
        byteRate: view.getUint32(chunkStart + 8, true),
        blockAlign: view.getUint16(chunkStart + 12, true),
        bitsPerSample: view.getUint16(chunkStart + 14, true),
      };
    } else if (chunkId === "data") {
      dataBytes = chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!format || dataBytes === undefined) {
    throw new WavValidationError("invalid_wav");
  }

  const expectedByteRate =
    (SOUNDBOARD_SAMPLE_RATE *
      SOUNDBOARD_CHANNELS *
      SOUNDBOARD_BITS_PER_SAMPLE) /
    8;
  const expectedBlockAlign =
    (SOUNDBOARD_CHANNELS * SOUNDBOARD_BITS_PER_SAMPLE) / 8;

  if (
    format.audioFormat !== 1 ||
    format.channels !== SOUNDBOARD_CHANNELS ||
    format.sampleRate !== SOUNDBOARD_SAMPLE_RATE ||
    format.bitsPerSample !== SOUNDBOARD_BITS_PER_SAMPLE ||
    format.byteRate !== expectedByteRate ||
    format.blockAlign !== expectedBlockAlign ||
    dataBytes % expectedBlockAlign !== 0
  ) {
    throw new WavValidationError("unsupported_wav_format");
  }

  const durationMs = Math.round((dataBytes / expectedByteRate) * 1000);
  if (
    durationMs < MIN_SOUNDBOARD_DURATION_MS ||
    durationMs > MAX_SOUNDBOARD_DURATION_MS
  ) {
    throw new WavValidationError("clip_duration_out_of_range");
  }

  return { durationMs, dataBytes };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return result;
}
