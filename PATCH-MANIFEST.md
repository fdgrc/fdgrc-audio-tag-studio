# V1.6.2.3 changes-only patch

Overlay these files on V1.6.2.2:

- `public/whisper-mobile-worker.js`
- `public/sw.js`
- `lib/audio/browserWhisper.ts`
- `components/TagStudio.tsx`
- `app/api/health/route.ts`
- `package.json`
- `BUILD-FIX-V1.6.2.3.md`

This patch fixes mobile/on-device Whisper `Failed to fetch` and forces a fresh PWA cache.
