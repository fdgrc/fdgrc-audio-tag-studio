# V1.6.5 changes-only overlay

Overlay this package on V1.6.4. It is GitHub-web-upload-safe: no path in this ZIP contains `[` or `]`.

Files included:

- `CHANGELOG-V1.6.5.md`
- `CLOUDFLARE.md`
- `GITHUB-WEB-UPLOAD.md`
- `MOBILE-WHISPER.md`
- `app/api/health/route.ts`
- `app/api/whisper-ggml/route.ts`
- `components/TagStudio.tsx`
- `lib/audio/browserWhisper.ts`
- `package.json`
- `public/MOBILE-WHISPER.md`
- `public/sw.js`
- `scripts/prepare-whisper-model.mjs`

Older dynamic Whisper route files may remain in your repository; V1.6.5 does not call them.
