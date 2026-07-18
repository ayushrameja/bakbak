# syntax=docker/dockerfile:1.7

FROM emscripten/emsdk:3.1.40 AS builder

ARG FFMPEG_WASM_REF=f876f907c7e9b9bf51d4ed0b913a855a63ae63fc
ARG FFMPEG_REF=4729204c17f756e186d622060088371d10b34f7e

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git init /ffmpeg-wasm \
    && git -C /ffmpeg-wasm remote add origin https://github.com/ffmpegwasm/ffmpeg.wasm.git \
    && git -C /ffmpeg-wasm fetch --depth 1 origin "$FFMPEG_WASM_REF" \
    && git -C /ffmpeg-wasm checkout --detach FETCH_HEAD \
    && git init /src \
    && git -C /src remote add origin https://github.com/FFmpeg/FFmpeg.git \
    && git -C /src fetch --depth 1 origin "$FFMPEG_REF" \
    && git -C /src checkout --detach FETCH_HEAD \
    && sed -i \
      -e '/-sUSE_SDL=2/d' \
      -e '/-lpostproc/d' \
      /ffmpeg-wasm/build/ffmpeg-wasm.sh

ENV INSTALL_DIR=/opt
ENV FFMPEG_ST=yes
ENV CFLAGS="-I/opt/include -O3 -msimd128"
ENV CXXFLAGS="-I/opt/include -O3 -msimd128"
ENV LDFLAGS="-L/opt/lib -O3 -msimd128"

WORKDIR /src

RUN bash /ffmpeg-wasm/build/ffmpeg.sh \
    --disable-gpl \
    --disable-nonfree \
    --enable-small \
    --disable-network \
    --disable-everything \
    --enable-protocol=file \
    --enable-demuxer=aac \
    --enable-demuxer=ac3 \
    --enable-demuxer=avi \
    --enable-demuxer=flac \
    --enable-demuxer=flv \
    --enable-demuxer=matroska \
    --enable-demuxer=mov \
    --enable-demuxer=mp3 \
    --enable-demuxer=mpegps \
    --enable-demuxer=mpegts \
    --enable-demuxer=ogg \
    --enable-demuxer=wav \
    --enable-decoder=aac \
    --enable-decoder=ac3 \
    --enable-decoder=eac3 \
    --enable-decoder=alac \
    --enable-decoder=flac \
    --enable-decoder=mp3 \
    --enable-decoder=mp3float \
    --enable-decoder=opus \
    --enable-decoder=pcm_s8 \
    --enable-decoder=pcm_u8 \
    --enable-decoder=pcm_s16be \
    --enable-decoder=pcm_s16le \
    --enable-decoder=pcm_s24be \
    --enable-decoder=pcm_s24le \
    --enable-decoder=pcm_s32be \
    --enable-decoder=pcm_s32le \
    --enable-decoder=pcm_f32be \
    --enable-decoder=pcm_f32le \
    --enable-decoder=pcm_f64be \
    --enable-decoder=pcm_f64le \
    --enable-decoder=vorbis \
    --enable-decoder=wmav1 \
    --enable-decoder=wmav2 \
    --enable-parser=aac \
    --enable-parser=aac_latm \
    --enable-parser=ac3 \
    --enable-parser=flac \
    --enable-parser=mpegaudio \
    --enable-parser=opus \
    --enable-parser=vorbis \
    --enable-filter=aformat \
    --enable-filter=anull \
    --enable-filter=aresample \
    --enable-filter=atrim \
    --enable-encoder=pcm_s16le \
    --enable-muxer=wav

RUN mkdir -p /src/src /dist \
    && cp -R /ffmpeg-wasm/src/bind /src/src/bind \
    && cp -R /ffmpeg-wasm/src/fftools /src/src/fftools \
    && bash /ffmpeg-wasm/build/ffmpeg-wasm.sh \
      -O3 \
      -msimd128 \
      -sEXPORT_ES6 \
      -o /dist/ffmpeg-core.js

FROM scratch AS export
COPY --from=builder /dist/ /
COPY --from=builder /src/COPYING.LGPLv2.1 /COPYING.LGPLv2.1
