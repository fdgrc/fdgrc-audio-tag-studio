# AudioTags V1.6.4 — On-device whisper.cpp

V1.6.4 removes the fragile Transformers.js/ONNX mobile path and replaces it with **whisper.cpp WebAssembly + GGML models**, matching the model family used by the SynthIQ mobile Auto Lyrics feature.

## What changed

- No Transformers.js runtime download.
- No ONNX model shards.
- No OpenAI key or paid transcription API.
- The whisper.cpp WebAssembly runtime is installed as a normal project dependency at build time.
- The Cloudflare build prepares the Tiny Q5 GGML model as small same-origin static chunks whenever a public model source is reachable.
- The browser loads those chunks from your own AudioTags site first and caches the reconstructed model in IndexedDB.
- The MP3 itself never needs to be uploaded for transcription.

## Mobile models

- **Tiny Q5 · 31 MB** — recommended default for phones/tablets.
- **Base Q5 · 57 MB** — better lyric recognition on newer devices, but uses more memory and CPU.

The preferred first-run path is static and same-origin:

```text
/whisper-models/tiny-q5_1/manifest.json
/whisper-models/tiny-q5_1/part-000.bin
/whisper-models/tiny-q5_1/part-001.bin
...
```

If those build-prepared chunks are unavailable, AudioTags falls back to `/api/whisper-ggml?model=<model>`, which streams from free public whisper.cpp model sources. Your phone still talks only to the AudioTags origin.

## First run

1. Deploy V1.6.4.
2. Fully close the old installed PWA/browser tab and reopen it once. V1.6.4 adds the COOP/COEP headers required for whisper.cpp pthreads.
3. Import a track.
4. Choose **On this device — no pairing**.
5. Start with **Tiny Q5 · 31 MB**.
6. Tap **Transcribe audio**.

The model is cached on the device after the first successful load when browser storage allows it. Use **Check model delivery** in the transcription panel to verify whether the device sees the bundled static model, the free relay, or an existing device cache.

## Offline/manual model fallback

If a network/provider blocks every automatic source, use **Import model .bin** in AudioTags and select a whisper.cpp GGML file for the model you chose. The selected file is stored in the AudioTags model cache on that device.

Supported filenames are normally:

```text
ggml-tiny-q5_1.bin
ggml-base-q5_1.bin
```

This fallback does not require an API key, subscription, or desktop pairing token.

## Browser requirements

whisper.cpp's browser build uses WebAssembly SIMD and pthreads. AudioTags sends the required:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Older browsers or low-memory devices may still be unable to initialize the model. Tiny Q5 is the safest mobile option. The optional desktop WhisperHallu + WhisperTimeSync helper remains available for difficult songs or older devices.
