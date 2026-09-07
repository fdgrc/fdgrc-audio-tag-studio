# AudioTags V1.6.2 — On-device mobile Whisper

AudioTags can now transcribe directly in a supported mobile browser/PWA with no paid API and no desktop helper.

## How it works

The implementation adapts the behavior proven in the supplied SynthIQ Hybrid Music Auto Lyrics engine:

- multilingual Whisper Base by default
- one-time model download, then browser caching
- audio converted locally to 16 kHz mono
- lightweight high-pass + peak normalization before transcription
- timed segments
- duplicate/non-lyric cue cleanup
- automatic retry when the first pass scores poorly
- a quality score before the result is offered for use

The web edition uses Transformers.js + ONNX Runtime in a Web Worker because an Android AAR cannot execute inside a normal Cloudflare-hosted web page. WebGPU is used when available; otherwise it falls back to WASM/CPU.

## Mobile steps

1. Open the deployed AudioTags site on Android or iPhone/iPad.
2. Install it as a PWA if desired.
3. Import an MP3.
4. Open `Audio → Lyrics & Captions`.
5. Choose `On this device`.
6. Tap `Transcribe audio`.
7. The first transcription downloads Whisper Base. Later uses reuse the browser cache where the browser permits it.
8. Keep the page open while transcription runs.
9. Review the result, then choose `Use as lyrics` or download LRC/SRT/VTT.

## Performance

- WebGPU-capable phones/tablets are strongly preferred.
- WASM/CPU mode is supported as a fallback but is slower.
- AudioTags currently limits browser transcription to 15-minute files to protect mobile memory.
- The source MP3 and decoded waveform stay on the device. Model files are downloaded from Hugging Face.

## Desktop

The original V1.6.1 WhisperHallu + WhisperTimeSync local helper remains available as the `Desktop helper` engine and can be preferred for higher-end desktop hardware.


## V1.6.2.4 network reliability fix

The phone no longer imports Transformers.js or downloads Whisper model files directly from third-party domains. AudioTags uses same-origin endpoints under `/api/whisper-runtime/` and `/api/whisper-model/` which relay only the allow-listed public runtime/model files. This avoids many mobile private-DNS, tracking protection, ad-blocker, and cross-origin failures while keeping transcription on-device.
