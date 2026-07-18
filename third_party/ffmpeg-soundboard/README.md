# Bakbak soundboard FFmpeg core

Bakbak lazily loads a single-thread FFmpeg WebAssembly core only while a member
prepares an upload. The renderer selects a source window and invokes the core
to extract its first audio stream as 48 kHz, mono, signed 16-bit PCM WAV.
Source media never leaves the device.

## Pinned source

- ffmpeg.wasm:
  `f876f907c7e9b9bf51d4ed0b913a855a63ae63fc`
  (`@ffmpeg/ffmpeg` 0.12.15 / core 0.12.10)
- FFmpeg:
  `4729204c17f756e186d622060088371d10b34f7e`
  (the commit referenced by tag `n5.1.4`)
- Emscripten SDK image: `emscripten/emsdk:3.1.40`

`Dockerfile` is the matching source/build recipe. It leaves `--enable-gpl` and
`--enable-nonfree` off (and explicitly disables both), disables automatic
component selection, and enables only the file protocol, common local-media
demuxers, native audio decoders/parsers, audio format/resample filters, the WAV
muxer, and the PCM S16LE encoder. It also removes ffmpeg.wasm's unused SDL link
flag and disabled post-processing link so neither enters the worker.

Run from the repository root:

```sh
pnpm ffmpeg:build
```

The script builds the pinned image, exports `ffmpeg-core.js` and
`ffmpeg-core.wasm` into `public/vendor/ffmpeg`, verifies both exist, and prints
their SHA-256 hashes and byte sizes. Rebuilds must update the recorded sizes and
hashes below only after representative audio/video extraction succeeds.

## Shipped artifact

- `ffmpeg-core.js`: 84,881 bytes,
  SHA-256 `04dee6d5b2ec113d83843d3ae238da11e07612adf82171937892e40ac9aa2a67`
- `ffmpeg-core.wasm`: 1,539,655 bytes,
  SHA-256 `2770ebbf93f43ee00b7607060d9a2b0ed0cd0f57dd6672756677166590edda1b`

The reduced WASM is 30,692,764 bytes smaller than the 32,232,419-byte
`@ffmpeg/core` 0.12.10 prebuilt WASM used for the initial comparison. Browser
acceptance extracted both an MP4/AAC source and an arbitrary MP3 window, then
passed Bakbak's 48 kHz mono 16-bit PCM WAV validator.

On the same macOS ARM64 working tree, the stock-core app was 45,184 KiB and the
reduced-core app was 37,712 KiB, saving 7,472 KiB. The stock-core DMG was
23,139,696 bytes and the reduced-core DMG was 15,491,181 bytes, saving
7,648,515 bytes (33.1%). Compared with the 36,976 KiB app immediately before
member uploads, the final app grows by 736 KiB. These are local ad-hoc-signed
macOS measurements; Developer ID and Windows installer comparison remains part
of release acceptance.

## Supported input surface

The reduced core targets AAC/AC-3/E-AC-3/ALAC/FLAC/MP3/Opus/Vorbis/WMA and
common PCM audio in AAC, AC-3, AVI, FLAC, FLV, Matroska/WebM, MP4/MOV, MP3,
MPEG-PS/TS, Ogg, and WAV containers. Video frames are not decoded because
Bakbak keeps only the source's audio stream.

See `NOTICE.md` for licensing and source-availability details.
