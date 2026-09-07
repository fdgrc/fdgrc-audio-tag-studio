# V1.6.2.4 — Mobile Whisper same-origin relay fix

Fixes the mobile error: **Whisper model download failed / Failed to fetch**.

## Root cause

The mobile browser worker depended on direct third-party requests to a JavaScript CDN, ONNX WASM runtime files, and Hugging Face model files. Some mobile browsers, private DNS services, tracking protection, ad blockers, or carrier networks can block one of those requests.

## Fix

- Transformers.js runtime is requested from `/api/whisper-runtime/transformers.web.min.js`.
- ONNX WASM runtime files are requested from the same `/api/whisper-runtime/` origin.
- Whisper Base model files are requested from `/api/whisper-model/` on the AudioTags origin.
- Cloudflare relays the allow-listed public files server-side; it is not an open proxy.
- MP3 audio remains local and is still transcribed in the browser.
- PWA cache bumped to V1.6.2.4.

No OpenAI key or paid AI API is required.
