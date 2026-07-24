import { describe, expect, it } from "vitest";
import {
  MAX_GIF_BYTES,
  MAX_IMAGE_BYTES,
  prepareMessageAttachment,
  validateMp4Metadata,
} from "./message-media";

describe("rich message media validation", () => {
  it("rejects unsupported and oversized files before decoding", async () => {
    await expect(
      prepareMessageAttachment(
        new File(["plain"], "notes.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow("PNG, JPEG, WebP, GIF, or MP4");

    await expect(
      prepareMessageAttachment(
        new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow("smaller than 10 MiB");

    await expect(
      prepareMessageAttachment(
        new File([new Uint8Array(MAX_GIF_BYTES + 1)], "large.gif", {
          type: "image/gif",
        }),
      ),
    ).rejects.toThrow("smaller than 15 MiB");
  });

  it("accepts H.264/AAC metadata and rejects incompatible MP4 tracks", () => {
    expect(() =>
      validateMp4Metadata({
        width: 1920,
        height: 1080,
        durationMs: 60_000,
        videoCodec: "avc1.640028",
        audioCodec: "mp4a.40.2",
      }),
    ).not.toThrow();
    expect(() =>
      validateMp4Metadata({
        width: 1280,
        height: 720,
        durationMs: 5_000,
        videoCodec: "hev1.1.6.L93",
        audioCodec: null,
      }),
    ).toThrow("H.264");
    expect(() =>
      validateMp4Metadata({
        width: 1280,
        height: 720,
        durationMs: 5_000,
        videoCodec: "avc1.4d401f",
        audioCodec: "ac-3",
      }),
    ).toThrow("AAC");
  });
});
