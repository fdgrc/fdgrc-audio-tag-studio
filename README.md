# fdgrc Tag Studio V1.6.2.4 — No-Payment Edition

Privacy-first MP3 metadata, cover-art, Smart Fix, lyrics/caption, batch, and local transcription editor built with Next.js 16 for **Cloudflare Workers using vinext**.

## The important change

**No OpenAI API key and no paid AI API are required.**

V1.6.2 uses:

- **Whisper Base in the browser/PWA** for no-payment on-device mobile transcription
- optional **WhisperHallu** for desktop music-oriented preprocessing and transcription
- optional **WhisperTimeSync** for desktop timestamp alignment
- **MusicBrainz + Cover Art Archive** for official metadata/artwork suggestions
- **LRCLIB** for lyrics lookup
- local browser heuristics for lyrics-aware mood/theme/art concepts
- local Canvas rendering for original 1024×1024 concept covers

The hosted Cloudflare Worker never receives the MP3 for transcription. On mobile/PWA, transcription runs directly in the browser; desktop users can optionally use the local helper.

## Audio → Lyrics & Captions

**Mobile/PWA:** import a track, choose **On this device**, and press **Transcribe audio**. The first run downloads Whisper Base through AudioTags' same-origin Cloudflare relay and later runs reuse the browser cache when available. The phone no longer needs direct access to jsDelivr, UNPKG, or Hugging Face.

**Desktop helper (optional):** install/start `LOCAL-TRANSCRIBER.md`, choose **Desktop helper**, then pair it with AudioTags.

Outputs include TXT, LRC, SRT and VTT. Saving the MP3 can embed ordinary `USLT` lyrics and synchronized `SYLT` lyrics when timed segments are available.

## Lyrics-aware Art Director

Song analysis now runs locally in the browser. It turns artist/title/lyrics into mood, themes, palette and three cover concepts without sending lyrics to an LLM. The selected concept can be rendered as an original square cover locally in Canvas, or you can continue using official artwork search.

## Cloudflare deployment

Your existing settings stay the same:

```text
Build command:  npm run build:vinext
Deploy command: npm run deploy:built
Root directory: /
```

No AI secret is needed in Cloudflare.

### V1.6.2.4 mobile download relay

To avoid mobile private-DNS/ad-blocker/CDN failures, the browser now requests the Transformers.js runtime, ONNX WASM files, and allowed Whisper Base model files from the **same AudioTags origin**. Cloudflare relays those public files server-side. This remains free and the MP3 itself is never uploaded to Cloudflare for transcription.

Optional MusicBrainz identification:

```env
MUSICBRAINZ_USER_AGENT="AudioTags/1.6.2 (you@example.com)"
```

## Local development

```bash
npm install
npm run dev:vinext
```

## Local transcriber

See [`LOCAL-TRANSCRIBER.md`](./LOCAL-TRANSCRIBER.md).

The project intentionally does not vendor the WhisperHallu or WhisperTimeSync repositories. Their current GitHub repository metadata does not declare a license. The setup helper clones those upstream repositories directly for local use so their source is not repackaged inside AudioTags.

## Important ID3 limitation

`browser-id3-writer` replaces the existing ID3 tag. AudioTags reads and rewrites the fields exposed by this editor and supports `USLT` and `SYLT`, but uncommon/private/unsupported ID3 frames may still be lost. Keep original files.

## Credits

Developed by Ferdinand Degracia — AI Assisted Engineering

Local transcription integrations reference:
- https://github.com/EtienneAb3d/WhisperHallu
- https://github.com/EtienneAb3d/WhisperTimeSync


## V1.6.2 mobile Whisper

AudioTags can now transcribe directly on supported phones/tablets in the browser/PWA with Whisper Base. No paid API and no desktop computer are required for this mode. WebGPU is preferred; WASM/CPU is the fallback. The existing WhisperHallu + WhisperTimeSync desktop helper remains available as an optional engine. See `MOBILE-WHISPER.md`.
