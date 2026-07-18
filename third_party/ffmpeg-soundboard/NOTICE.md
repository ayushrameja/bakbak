# FFmpeg soundboard notices

Bakbak includes a modified, reduced WebAssembly build of FFmpeg and the
ffmpeg.wasm browser wrapper.

## ffmpeg.wasm

- Project: <https://github.com/ffmpegwasm/ffmpeg.wasm>
- Pinned source:
  `f876f907c7e9b9bf51d4ed0b913a855a63ae63fc`
- License: MIT
- Copyright: 2019 Jerome Wu and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The installed `@ffmpeg/ffmpeg` and `@ffmpeg/util` JavaScript packages use this
MIT license. Bakbak does not ship the standard `@ffmpeg/core` binary.

## FFmpeg

- Project and corresponding source: <https://github.com/FFmpeg/FFmpeg>
- Pinned source:
  `4729204c17f756e186d622060088371d10b34f7e`
- Upstream legal guidance: <https://ffmpeg.org/legal.html>
- License for this configuration: GNU Lesser General Public License version
  2.1 or later

The matching unmodified source revision, Bakbak's complete configure flags, and
the WebAssembly link recipe are identified in this directory. GPL and non-free
components are disabled. The LGPL license text is included as
`COPYING.LGPLv2.1`; recipients may rebuild or replace the core with the provided
Docker recipe.

This notice is an engineering record, not legal advice. Distribution owners
remain responsible for confirming codec patent and imported-sound rights in
the countries where Bakbak is shared.
