# V1.6.2 — Native-style mobile Whisper for the PWA

- Added on-device browser Whisper transcription for mobile/PWA use.
- Adapted the proven SynthIQ Auto Lyrics workflow: multilingual Whisper Base, 16 kHz mono preprocessing, vocal-focused normalization, timed segments, duplicate/non-lyric cleanup, quality scoring, and weak-result retry.
- Uses WebGPU when available and WASM/CPU as fallback.
- First model load is downloaded from Hugging Face and cached by the browser when possible.
- Added engine selector: **On this device** or **Desktop helper**.
- Desktop WhisperHallu + WhisperTimeSync support remains intact.
- No paid transcription API is required.
