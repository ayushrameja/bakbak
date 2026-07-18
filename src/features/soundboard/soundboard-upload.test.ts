import { beforeEach, describe, expect, it, vi } from "vitest";

const ffmpeg = vi.hoisted(() => ({
  loaded: false,
  load: vi.fn(() => {
    ffmpeg.loaded = true;
    return Promise.resolve(true);
  }),
  writeFile: vi.fn().mockResolvedValue(true),
  exec: vi.fn().mockResolvedValue(0),
  readFile: vi
    .fn()
    .mockResolvedValue(
      new Uint8Array([82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69]),
    ),
  deleteFile: vi.fn().mockResolvedValue(true),
  terminate: vi.fn(),
}));

vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    constructor() {
      return ffmpeg;
    }
  },
}));

vi.mock("@ffmpeg/util", () => ({
  fetchFile: vi.fn(
    async (file: File) => new Uint8Array(await file.arrayBuffer()),
  ),
}));

describe("soundboard upload preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ffmpeg.loaded = true;
    ffmpeg.readFile.mockResolvedValue(normalizedWav(0.1));
  });

  it("rejects non-media and oversized source files before loading FFmpeg", async () => {
    const { MAX_SOUNDBOARD_SOURCE_BYTES, validateSoundboardSource } =
      await import("./soundboard-upload");

    expect(() =>
      validateSoundboardSource(
        new File(["plain"], "notes.txt", { type: "text/plain" }),
      ),
    ).toThrow("audio or video");
    const large = new File(
      [new Uint8Array(MAX_SOUNDBOARD_SOURCE_BYTES + 1)],
      "too-large.mp4",
      { type: "video/mp4" },
    );
    expect(() => validateSoundboardSource(large)).toThrow("25 MiB");
    expect(() =>
      validateSoundboardSource(
        new File(
          [new Uint8Array(MAX_SOUNDBOARD_SOURCE_BYTES)],
          "maximum-size.m4a",
          { type: "audio/mp4" },
        ),
      ),
    ).not.toThrow();
  });

  it("validates arbitrary clip windows up to five seconds", async () => {
    const { validateSoundboardClipWindow } =
      await import("./soundboard-upload");

    expect(() => validateSoundboardClipWindow(12, 3.5, 5)).not.toThrow();
    expect(() => validateSoundboardClipWindow(0.1, 0, 0.1)).not.toThrow();
    expect(() => validateSoundboardClipWindow(12, 8, 5)).toThrow(
      "between 0.1 and 5 seconds",
    );
    expect(() => validateSoundboardClipWindow(12, 0, 5.1)).toThrow(
      "between 0.1 and 5 seconds",
    );
  });

  it("extracts the selected audio window into normalized mono WAV", async () => {
    const { prepareSoundboardClip } = await import("./soundboard-upload");
    const stages: string[] = [];
    const source = new File(["video"], "excellent-timing.mp4", {
      type: "video/mp4",
    });

    const result = await prepareSoundboardClip(source, 7.25, 4.5, (stage) =>
      stages.push(stage),
    );

    expect(result.type).toBe("audio/wav");
    expect(ffmpeg.exec).toHaveBeenCalledOnce();
    const args = ffmpeg.exec.mock.calls[0]?.[0] as string[];
    expect(args).toEqual(
      expect.arrayContaining([
        "-ss",
        "7.250",
        "-t",
        "4.500",
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
      ]),
    );
    expect(stages).toEqual([
      "loading-engine",
      "extracting-audio",
      "finalizing",
    ]);
    expect(ffmpeg.deleteFile).toHaveBeenCalledTimes(2);
  });

  it("verifies the prepared WAV format and exact duration limits", async () => {
    const { validatePreparedSoundboardWav } =
      await import("./soundboard-upload");

    await expect(
      validatePreparedSoundboardWav(
        new Blob([normalizedWav(5)], { type: "audio/wav" }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      validatePreparedSoundboardWav(
        new Blob([normalizedWav(5.02)], { type: "audio/wav" }),
      ),
    ).rejects.toThrow("48 kHz mono PCM");
    await expect(
      validatePreparedSoundboardWav(
        new Blob([normalizedWav(1, { channels: 2 })], {
          type: "audio/wav",
        }),
      ),
    ).rejects.toThrow("48 kHz mono PCM");
  });

  it("reports video files without a usable audio track", async () => {
    const { prepareSoundboardClip } = await import("./soundboard-upload");
    ffmpeg.exec.mockResolvedValueOnce(1);

    await expect(
      prepareSoundboardClip(
        new File(["silent"], "silent.webm", { type: "video/webm" }),
        0,
        1,
      ),
    ).rejects.toThrow("usable audio track");
  });

  it("aborts active processing and cleans temporary worker files", async () => {
    const { cancelSoundboardPreparation, prepareSoundboardClip } =
      await import("./soundboard-upload");
    ffmpeg.exec.mockImplementationOnce(
      (_args: string[], _timeout: number, options: { signal: AbortSignal }) =>
        new Promise<number>((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException(
                  "Sound preparation was canceled.",
                  "AbortError",
                ),
              ),
            { once: true },
          );
        }),
    );

    const request = prepareSoundboardClip(
      new File(["audio"], "cancel-me.mp3", { type: "audio/mpeg" }),
      0,
      1,
    );
    await vi.waitFor(() => expect(ffmpeg.exec).toHaveBeenCalledOnce());
    cancelSoundboardPreparation();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(ffmpeg.deleteFile).toHaveBeenCalledTimes(2);
    expect(ffmpeg.terminate).toHaveBeenCalledOnce();
  });
});

function normalizedWav(
  durationSeconds: number,
  {
    sampleRate = 48_000,
    channels = 1,
    bitsPerSample = 16,
  }: {
    sampleRate?: number;
    channels?: number;
    bitsPerSample?: number;
  } = {},
): Uint8Array {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataLength = Math.round(durationSeconds * byteRate);
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataLength, true);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}
