#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/third_party/ffmpeg-soundboard"
OUTPUT_DIR="$ROOT_DIR/public/vendor/ffmpeg"
IMAGE="bakbak-ffmpeg-core:0.12.10-lgpl"
CONTAINER="bakbak-ffmpeg-export-$$"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker build --target export -t "$IMAGE" "$BUILD_DIR"
docker create --name "$CONTAINER" "$IMAGE" >/dev/null
mkdir -p "$OUTPUT_DIR"
docker cp "$CONTAINER:/." "$OUTPUT_DIR"

test -s "$OUTPUT_DIR/ffmpeg-core.js"
test -s "$OUTPUT_DIR/ffmpeg-core.wasm"
test -s "$OUTPUT_DIR/COPYING.LGPLv2.1"

shasum -a 256 \
  "$OUTPUT_DIR/ffmpeg-core.js" \
  "$OUTPUT_DIR/ffmpeg-core.wasm"
wc -c \
  "$OUTPUT_DIR/ffmpeg-core.js" \
  "$OUTPUT_DIR/ffmpeg-core.wasm"
