export interface ImageSize {
  width: number;
  height: number;
}

export function inspectStickerImage(
  bytes: Uint8Array,
  mimeType: string,
): ImageSize {
  let size: ImageSize;
  if (mimeType === "image/png") size = inspectPng(bytes);
  else if (mimeType === "image/gif") size = inspectGif(bytes);
  else if (mimeType === "image/webp") size = inspectWebp(bytes);
  else throw new Error("unsupported_sticker_type");
  if (
    size.width < 1 ||
    size.height < 1 ||
    size.width > 512 ||
    size.height > 512
  ) {
    throw new Error("sticker_dimensions_invalid");
  }
  return size;
}

function inspectPng(bytes: Uint8Array): ImageSize {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    String.fromCharCode(...bytes.slice(1, 4)) !== "PNG"
  ) {
    throw new Error("invalid_sticker_image");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function inspectGif(bytes: Uint8Array): ImageSize {
  const signature = String.fromCharCode(...bytes.slice(0, 6));
  if (bytes.length < 10 || !["GIF87a", "GIF89a"].includes(signature)) {
    throw new Error("invalid_sticker_image");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function inspectWebp(bytes: Uint8Array): ImageSize {
  if (
    bytes.length < 30 ||
    String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    throw new Error("invalid_sticker_image");
  }
  const kind = String.fromCharCode(...bytes.slice(12, 16));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (kind === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (kind === "VP8L") {
    if (bytes[20] !== 0x2f) throw new Error("invalid_sticker_image");
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (
    kind === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  throw new Error("unsupported_sticker_webp");
}
