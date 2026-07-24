import { inspectStickerImage } from "../../sticker-manage/image.ts";

Deno.test("sticker inspection accepts PNG, GIF, and lossy VP8 bounds", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47]);
  new DataView(png.buffer).setUint32(16, 128);
  new DataView(png.buffer).setUint32(20, 96);
  assertEquals(inspectStickerImage(png, "image/png"), {
    width: 128,
    height: 96,
  });

  const gif = new Uint8Array(10);
  gif.set(new TextEncoder().encode("GIF89a"));
  new DataView(gif.buffer).setUint16(6, 256, true);
  new DataView(gif.buffer).setUint16(8, 128, true);
  assertEquals(inspectStickerImage(gif, "image/gif"), {
    width: 256,
    height: 128,
  });

  const vp8 = webp("VP8 ");
  vp8.set([0x9d, 0x01, 0x2a], 23);
  new DataView(vp8.buffer).setUint16(26, 320, true);
  new DataView(vp8.buffer).setUint16(28, 240, true);
  assertEquals(inspectStickerImage(vp8, "image/webp"), {
    width: 320,
    height: 240,
  });
});

Deno.test("sticker inspection rejects oversized and malformed images", () => {
  const gif = new Uint8Array(10);
  gif.set(new TextEncoder().encode("GIF89a"));
  new DataView(gif.buffer).setUint16(6, 513, true);
  new DataView(gif.buffer).setUint16(8, 10, true);
  assertThrows(
    () => inspectStickerImage(gif, "image/gif"),
    "sticker_dimensions_invalid",
  );
  assertThrows(
    () => inspectStickerImage(new Uint8Array(3), "image/png"),
    "invalid_sticker_image",
  );
});

function webp(kind: string): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode(kind), 12);
  return bytes;
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

function assertThrows(action: () => unknown, message: string): void {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message === message) return;
    throw error;
  }
  throw new Error(`Expected ${message}.`);
}
