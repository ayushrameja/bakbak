import type {
  MessageAttachmentKind,
  StagedMessageAttachment,
} from "../../lib/types";

export const MAX_MESSAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_GIF_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
export const MAX_VIDEO_DURATION_MS = 60_000;
export const MAX_VIDEO_WIDTH = 1920;
export const MAX_VIDEO_HEIGHT = 1080;
export const MAX_STICKER_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export async function prepareMessageAttachment(
  file: File,
): Promise<StagedMessageAttachment> {
  if (file.type === "video/mp4") return await prepareVideo(file);
  if (file.type === "image/gif") {
    if (file.size > MAX_GIF_BYTES) {
      throw new Error("Choose a GIF smaller than 15 MiB.");
    }
    return await prepareImage(file, "gif");
  }
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
    throw new Error("Choose a PNG, JPEG, WebP, GIF, or MP4 file.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 10 MiB.");
  }
  return await prepareImage(file, "image");
}

export async function prepareStickerUpload(file: File): Promise<{
  poster: Blob;
  animation: File | null;
  width: number;
  height: number;
}> {
  if (
    !["image/png", "image/webp", "image/gif"].includes(file.type) ||
    file.size > MAX_STICKER_BYTES
  ) {
    throw new Error("Choose a PNG, WebP, or GIF sticker smaller than 5 MiB.");
  }
  const source = await decodeImage(file);
  try {
    const width = source.naturalWidth;
    const height = source.naturalHeight;
    if (width < 1 || height < 1 || width > 512 || height > 512) {
      throw new Error("Stickers must fit within 512×512 pixels.");
    }
    return {
      poster: await drawPoster(source, width, height),
      animation: file.type === "image/gif" ? file : null,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(source.src);
  }
}

async function prepareImage(
  file: File,
  kind: Extract<MessageAttachmentKind, "image" | "gif">,
): Promise<StagedMessageAttachment> {
  const source = await decodeImage(file);
  try {
    const width = source.naturalWidth;
    const height = source.naturalHeight;
    validateImageDimensions(width, height);
    const poster = await drawPoster(source, width, height);
    return staged(file, kind, poster, width, height, null);
  } finally {
    URL.revokeObjectURL(source.src);
  }
}

async function prepareVideo(file: File): Promise<StagedMessageAttachment> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Choose an MP4 smaller than 50 MiB.");
  }
  const metadata = await inspectMp4(file);
  validateMp4Metadata(metadata);
  const poster = await createVideoPoster(file, metadata.durationMs);
  return staged(
    file,
    "video",
    poster,
    metadata.width,
    metadata.height,
    metadata.durationMs,
  );
}

export interface Mp4Metadata {
  width: number;
  height: number;
  durationMs: number;
  videoCodec: string;
  audioCodec: string | null;
}

export function validateMp4Metadata(metadata: Mp4Metadata): void {
  if (
    metadata.width < 1 ||
    metadata.height < 1 ||
    metadata.width > MAX_VIDEO_WIDTH ||
    metadata.height > MAX_VIDEO_HEIGHT
  ) {
    throw new Error("Choose a video no larger than 1920×1080.");
  }
  if (metadata.durationMs < 1 || metadata.durationMs > MAX_VIDEO_DURATION_MS) {
    throw new Error("Choose a video no longer than 60 seconds.");
  }
  if (
    !metadata.videoCodec.startsWith("avc1") &&
    !metadata.videoCodec.startsWith("avc3")
  ) {
    throw new Error("Choose an H.264 MP4 video.");
  }
  if (metadata.audioCodec && !metadata.audioCodec.startsWith("mp4a")) {
    throw new Error("MP4 audio must use AAC.");
  }
}

export async function inspectMp4(file: File): Promise<Mp4Metadata> {
  const { createFile } = await import("mp4box/simple");
  const parser = createFile();
  return await new Promise<Mp4Metadata>((resolve, reject) => {
    parser.onError = (_module, message) =>
      reject(new Error(`That MP4 could not be inspected: ${message}`));
    parser.onReady = (movie) => {
      const video = movie.videoTracks[0];
      if (!video) {
        reject(new Error("Choose an MP4 containing one video track."));
        return;
      }
      if (movie.videoTracks.length !== 1 || movie.audioTracks.length > 1) {
        reject(
          new Error(
            "Choose an MP4 with one video and at most one audio track.",
          ),
        );
        return;
      }
      resolve({
        width: Math.round(video.video?.width ?? video.track_width ?? 0),
        height: Math.round(video.video?.height ?? video.track_height ?? 0),
        durationMs: Math.round((movie.duration / movie.timescale) * 1000),
        videoCodec: video.codec,
        audioCodec: movie.audioTracks[0]?.codec ?? null,
      });
    };
    void file
      .arrayBuffer()
      .then((value) => {
        const buffer = value as ArrayBuffer & { fileStart: number };
        buffer.fileStart = 0;
        parser.appendBuffer(buffer);
        parser.flush();
      })
      .catch((error: unknown) =>
        reject(
          error instanceof Error
            ? error
            : new Error("That MP4 could not be inspected."),
        ),
      );
  });
}

function staged(
  file: File,
  kind: MessageAttachmentKind,
  poster: Blob,
  width: number,
  height: number,
  durationMs: number | null,
): StagedMessageAttachment {
  return {
    id: crypto.randomUUID(),
    kind,
    file,
    poster,
    width,
    height,
    durationMs,
    previewUrl: URL.createObjectURL(kind === "video" ? poster : file),
    progress: 0,
    status: "ready",
  };
}

function validateImageDimensions(width: number, height: number): void {
  if (
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error(
      "Choose an image no larger than 8192 px per side or 16 megapixels.",
    );
  }
}

function decodeImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be decoded."));
    };
    image.src = url;
  });
}

async function drawPoster(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device could not prepare that media.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const poster = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.84),
  );
  if (!poster) throw new Error("This device could not prepare that media.");
  return poster;
}

async function createVideoPoster(
  file: File,
  durationMs: number,
): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error("That video could not be decoded."));
      video.src = url;
    });
    video.currentTime = Math.min(1, Math.max(0.05, durationMs / 10_000));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () =>
        reject(new Error("A video poster could not be created."));
    });
    return await drawPoster(video, video.videoWidth, video.videoHeight);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
