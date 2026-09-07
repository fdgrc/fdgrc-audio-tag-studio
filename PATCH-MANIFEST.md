# AudioTags V1.6.5.1 — Changes Only

Overlay this package on top of V1.6.5 and replace existing files when prompted.

## Playback safety fix

This patch prevents AudioTags from prepending MP3 ID3 tags to files that only *look* like MP3 by filename. It detects the real audio stream, locally converts non-MP3 browser-decodable audio to genuine 192 kbps MP3, validates MPEG Layer III frames, and only then downloads/exports it.

The exact reproduced case (`.mp3` filename containing WebM/Opus audio) is now detected as a format mismatch.

## Changed / required files

- `components/TagStudio.tsx` — source warning, conversion progress, Original/Updated playback toggle, validated export flow.
- `lib/audio/audioFormat.ts` — real container/MPEG frame detection and MP3 validation.
- `lib/audio/transcodeToMp3.ts` — local Web Audio + WASM MP3 conversion.
- `lib/audio/writeId3.ts` — convert-before-ID3 and validate-after-ID3 pipeline.
- `lib/audio/readMetadata.ts` — format detection, correct playback MIME, old hybrid-file rescue.
- `types/audio.ts` — source/updated-preview state.
- `package.json` — adds the free local `wasm-media-encoders` dependency.
- `public/sw.js` — cache bump.
- `app/api/health/route.ts` — V1.6.5.1 health version.
- `README.md`, `PLAYBACK-SAFETY.md`, `CHANGELOG-V1.6.5.1.md` — documentation.

## GitHub web uploader

This patch contains no square-bracket route directories and is safe to overlay through GitHub's web uploader. Upload the extracted contents, not the ZIP file itself.
