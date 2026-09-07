# AudioTags V1.6.2.3 — Mobile Whisper fetch fix

Fixes the on-device transcription error `Failed to fetch`.

Changes:
- pins the browser Whisper runtime to the current stable Transformers.js v3.8.1 instead of the invalid `@4.2.0` CDN import
- adds a second CDN fallback for the Transformers.js runtime
- uses `onnx-community/whisper-base` first with `Xenova/whisper-base` as a model fallback
- automatically falls back from WebGPU to WASM/CPU if WebGPU initialization fails
- reports worker/network failures with a useful message instead of a bare `Failed to fetch`
- bumps the PWA cache so phones receive the fixed worker

No paid API or OpenAI key is required.
