# V1.6.5 — GitHub Web Upload Safe

## Fixed

- Replaced the actively used dynamic Whisper relay route `/api/whisper-ggml/[model]` with the normal route `/api/whisper-ggml?model=<model>`.
- The V1.6.5 changes-only `app/` folder contains no square-bracket directory names, avoiding GitHub's browser folder-upload failure seen with Next.js dynamic route folders.
- Kept the update overlay-only: existing older dynamic route files may remain in the repository without affecting V1.6.5.
- Bumped the PWA cache and visible app version to V1.6.5.

## No-cost transcription architecture

V1.6.5 keeps the V1.6.4 whisper.cpp WASM design: model cache first, same-origin static model chunks second, free same-origin relay third, and manual GGML `.bin` import as the offline fallback.
