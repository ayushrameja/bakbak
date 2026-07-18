export const MAX_SOUNDBOARD_SOURCE_BYTES = 25 * 1024 * 1024;
export const MIN_SOUNDBOARD_CLIP_SECONDS = 0.1;
export const MAX_SOUNDBOARD_CLIP_SECONDS = 5;

export type SoundboardPreparationStage =
  "loading-engine" | "extracting-audio" | "finalizing";

let activeAbortController: AbortController | null = null;
let ffmpegInstance: InstanceType<
  typeof import("@ffmpeg/ffmpeg").FFmpeg
> | null = null;
let ffmpegLoadPromise: Promise<
  InstanceType<typeof import("@ffmpeg/ffmpeg").FFmpeg>
> | null = null;

export function validateSoundboardSource(file: File): void {
  if (file.size < 1) throw new Error("Choose a file that contains audio.");
  if (file.size > MAX_SOUNDBOARD_SOURCE_BYTES) {
    throw new Error("Choose an audio or video file no larger than 25 MiB.");
  }
  if (
    file.type.length > 0 &&
    !file.type.startsWith("audio/") &&
    !file.type.startsWith("video/")
  ) {
    throw new Error("Choose an audio or video file.");
  }
}

export function validateSoundboardClipWindow(
  sourceDurationSeconds: number,
  startSeconds: number,
  durationSeconds: number,
): void {
  if (
    !Number.isFinite(sourceDurationSeconds) ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(durationSeconds) ||
    sourceDurationSeconds < MIN_SOUNDBOARD_CLIP_SECONDS ||
    startSeconds < 0 ||
    durationSeconds < MIN_SOUNDBOARD_CLIP_SECONDS ||
    durationSeconds > MAX_SOUNDBOARD_CLIP_SECONDS ||
    startSeconds + durationSeconds > sourceDurationSeconds + 0.01
  ) {
    throw new Error("Choose a clip between 0.1 and 5 seconds.");
  }
}

export async function prepareSoundboardClip(
  file: File,
  startSeconds: number,
  durationSeconds: number,
  onStage?: (stage: SoundboardPreparationStage) => void,
): Promise<Blob> {
  validateSoundboardSource(file);
  const abortController = new AbortController();
  activeAbortController?.abort();
  activeAbortController = abortController;

  const token = crypto.randomUUID();
  const extension = safeExtension(file.name);
  const inputPath = `input-${token}${extension}`;
  const outputPath = `output-${token}.wav`;
  let ffmpeg: InstanceType<typeof import("@ffmpeg/ffmpeg").FFmpeg> | undefined;

  try {
    onStage?.("loading-engine");
    ffmpeg = await loadFfmpeg(abortController.signal);
    if (abortController.signal.aborted) throw abortError();

    const { fetchFile } = await import("@ffmpeg/util");
    await ffmpeg.writeFile(inputPath, await fetchFile(file), {
      signal: abortController.signal,
    });

    onStage?.("extracting-audio");
    const exitCode = await ffmpeg.exec(
      [
        "-i",
        inputPath,
        "-ss",
        startSeconds.toFixed(3),
        "-t",
        durationSeconds.toFixed(3),
        "-vn",
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        outputPath,
      ],
      60_000,
      { signal: abortController.signal },
    );
    if (exitCode !== 0) {
      throw new Error(
        "Bakbak could not find a usable audio track in that file.",
      );
    }

    onStage?.("finalizing");
    const output = await ffmpeg.readFile(outputPath, undefined, {
      signal: abortController.signal,
    });
    if (!(output instanceof Uint8Array) || output.byteLength < 44) {
      throw new Error("Bakbak could not prepare that audio clip.");
    }
    const clip = new Blob([output], { type: "audio/wav" });
    await validatePreparedSoundboardWav(clip);
    return clip;
  } catch (caught) {
    if (abortController.signal.aborted) throw abortError();
    throw caught instanceof Error
      ? caught
      : new Error("Bakbak could not prepare that audio clip.");
  } finally {
    if (ffmpeg?.loaded) {
      await Promise.allSettled([
        ffmpeg.deleteFile(inputPath),
        ffmpeg.deleteFile(outputPath),
      ]);
    }
    if (activeAbortController === abortController) {
      activeAbortController = null;
    }
  }
}

export function cancelSoundboardPreparation(): void {
  activeAbortController?.abort();
  activeAbortController = null;
  if (ffmpegInstance) {
    ffmpegInstance.terminate();
    ffmpegInstance = null;
    ffmpegLoadPromise = null;
  }
}

async function loadFfmpeg(
  signal: AbortSignal,
): Promise<InstanceType<typeof import("@ffmpeg/ffmpeg").FFmpeg>> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const instance = new FFmpeg();
      await instance.load(
        {
          coreURL: localFfmpegAssetUrl("ffmpeg-core.js"),
          wasmURL: localFfmpegAssetUrl("ffmpeg-core.wasm"),
        },
        { signal },
      );
      ffmpegInstance = instance;
      return instance;
    })().catch((caught) => {
      ffmpegLoadPromise = null;
      ffmpegInstance = null;
      throw caught;
    });
  }
  return await ffmpegLoadPromise;
}

export async function validatePreparedSoundboardWav(clip: Blob): Promise<void> {
  const bytes = new Uint8Array(await clip.arrayBuffer());
  if (
    bytes.byteLength < 44 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WAVE"
  ) {
    throw new Error("Bakbak could not prepare a valid WAV clip.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let formatValid = false;
  let dataBytes = -1;
  while (offset + 8 <= bytes.byteLength) {
    const chunkId = ascii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.byteLength) {
      throw new Error("Bakbak could not prepare a valid WAV clip.");
    }
    if (chunkId === "fmt " && chunkSize >= 16) {
      formatValid =
        view.getUint16(dataOffset, true) === 1 &&
        view.getUint16(dataOffset + 2, true) === 1 &&
        view.getUint32(dataOffset + 4, true) === 48_000 &&
        view.getUint32(dataOffset + 8, true) === 96_000 &&
        view.getUint16(dataOffset + 12, true) === 2 &&
        view.getUint16(dataOffset + 14, true) === 16;
    } else if (chunkId === "data") {
      dataBytes = chunkSize;
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  const durationSeconds = dataBytes / 96_000;
  if (
    !formatValid ||
    dataBytes < 0 ||
    durationSeconds < MIN_SOUNDBOARD_CLIP_SECONDS ||
    durationSeconds > MAX_SOUNDBOARD_CLIP_SECONDS + 0.01
  ) {
    throw new Error("Bakbak could not normalize that clip to 48 kHz mono PCM.");
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function localFfmpegAssetUrl(fileName: string): string {
  return new URL(`/vendor/ffmpeg/${fileName}`, window.location.href).href;
}

function safeExtension(name: string): string {
  const match = /\.[a-z0-9]{1,8}$/i.exec(name.trim());
  return match?.[0].toLowerCase() ?? ".media";
}

function abortError(): DOMException {
  return new DOMException("Sound preparation was canceled.", "AbortError");
}
