# Cloudflare Workers deployment — V1.6

This project targets **Cloudflare Workers + vinext** and keeps normal Next.js scripts for local development.

> The Worker name remains `audiotags` in `wrangler.jsonc`. If your Worker uses another name, make those names match.

> The compatibility date remains pinned to `2026-09-06` to avoid the future-date deployment rejection encountered earlier.

## Install and build

```bash
npm install
npm run check:vinext
npm run build:vinext
```

## Workers Builds

Keep the existing settings:

- **Build command:** `npm run build:vinext`
- **Deploy command:** `npm run deploy:built`
- **Root directory:** `/`

## Environment variables

Add the public service identification strings:

```env
MUSICBRAINZ_USER_AGENT="fdgrc-tag-studio/1.6 (you@example.com)"
LRCLIB_USER_AGENT="fdgrc-tag-studio/1.6 (you@example.com)"
```

For V1.6 AI features, add:

```env
OPENAI_TRANSCRIBE_MODEL="gpt-transcribe"
OPENAI_TEXT_MODEL="gpt-5.6-luna"
OPENAI_IMAGE_MODEL="gpt-image-2"
```

And add **`OPENAI_API_KEY` as a secret** in Cloudflare. Do not place it in client-side code or any `NEXT_PUBLIC_*` variable.

For local Wrangler development you can copy `.dev.vars.example` to `.dev.vars` and put your development key there. Do not commit `.dev.vars`.

## Useful routes

- `/` — Tag Studio V1.6
- `/api/health`
- `/api/artwork/search`
- `/api/metadata/search`
- `/api/lyrics/search`
- `POST /api/transcribe` — multipart audio transcription
- `POST /api/song/analyze` — lyrics-aware art direction
- `POST /api/artwork/generate` — original cover generation

## V1.6 request flow

```text
Browser
  ├─ MP3 parsing / playback / ID3 writing / ZIP export (local)
  ├─ Transcribe audio button
  │      └─ selected audio ──────────────► Cloudflare Worker ─► OpenAI transcription
  ├─ Analyze song button
  │      └─ metadata + approved lyrics ─► Cloudflare Worker ─► OpenAI text model
  └─ Generate cover button
         └─ derived art concept ─────────► Cloudflare Worker ─► OpenAI image generation
```

The user must explicitly trigger each OpenAI operation.
