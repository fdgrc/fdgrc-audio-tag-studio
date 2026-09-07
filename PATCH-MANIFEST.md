# AudioTags V1.6.2.4 changes-only patch

Overlay this ZIP on top of V1.6.2.3 (or the V1.6.2.3 build-fixed project).

Changed/new files:

- `package.json` — version bump to 1.6.2.4
- `public/sw.js` — PWA cache bump
- `public/whisper-mobile-worker.js` — removes direct third-party browser downloads and uses AudioTags same-origin relay endpoints
- `app/api/health/route.ts` — version bump
- `app/api/whisper-runtime/[...path]/route.ts` — allow-listed server-side relay for Transformers.js + ONNX WASM runtime
- `app/api/whisper-model/[...path]/route.ts` — allow-listed server-side relay for Whisper Base model files
- `README.md` — updated mobile setup/relay notes
- `MOBILE-WHISPER.md` — network reliability notes
- `BUILD-FIX-V1.6.2.4.md` — fix summary

No files need to be deleted for this patch.
