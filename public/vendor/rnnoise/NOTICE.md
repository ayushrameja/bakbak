# RNNoise microphone-processing notices

Bakbak's optional local microphone processor includes the synchronous
WebAssembly build distributed by `@jitsi/rnnoise-wasm` version `0.2.1`.

## Jitsi RNNoise WebAssembly wrapper

- Project: <https://github.com/jitsi/rnnoise-wasm>
- Package: `@jitsi/rnnoise-wasm@0.2.1`
- License: Apache License 2.0, with the package's original MIT contribution
  notice retained
- License text: `LICENSE-APACHE-2.0.txt`

The package's synchronous build embeds the WebAssembly bytes required by an
AudioWorklet. Bakbak bundles that generated module into its microphone worker
and adds its own buffering, lifecycle, and voice-effect code. The complete
package license, including its original ESTOS GmbH and BlueJimp SARL MIT
notice, is reproduced here.

## RNNoise

- Project: <https://github.com/xiph/rnnoise>
- Model/library generation identified by the Jitsi package as RNNoise 0.2
- License: BSD 3-Clause
- Copyright holders and license text:
  `LICENSE-RNNOISE-BSD-3-CLAUSE.txt`

RNNoise processing runs on-device. Bakbak does not upload microphone samples
to Jitsi, Xiph.Org, or another noise-processing service.
