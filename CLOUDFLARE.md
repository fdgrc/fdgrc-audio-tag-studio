# Cloudflare Workers deployment — V1.6.2

V1.6.2 keeps **Cloudflare Workers + vinext**, but paid AI APIs are no longer part of the hosted Worker.

## Build settings

- **Build command:** `npm run build:vinext`
- **Deploy command:** `npm run deploy:built`
- **Root directory:** `/`

The Worker name remains `audiotags` in `wrangler.jsonc`. If your Cloudflare Worker has a different name, make them match.

## No OpenAI secret

You do **not** need `OPENAI_API_KEY` or any OpenAI model variables.

The only optional environment variable is:

```env
MUSICBRAINZ_USER_AGENT="AudioTags/1.6.2 (you@example.com)"
```

## Request flow

```text
Cloudflare-hosted browser app
  ├─ MP3 parsing / playback / ID3 / ZIP          → browser only
  ├─ metadata and official covers                → MusicBrainz / Cover Art Archive
  ├─ lyrics lookup                               → LRCLIB
  ├─ lyrics-aware theme/art concepts             → browser only
  ├─ procedural 1024×1024 cover rendering        → browser only
  └─ Transcribe audio
       └─ http://127.0.0.1:8765 on user's PC
            ├─ WhisperHallu
            └─ WhisperTimeSync
```

Modern browsers can ask the user for permission before an HTTPS site accesses a loopback/local service. Allow that permission for AudioTags when prompted; the local helper is bound only to `127.0.0.1` and additionally requires its pairing token.

## Useful hosted routes

- `/`
- `/api/health`
- `/api/artwork/search`
- `/api/artwork/image`
- `/api/metadata/search`
- `/api/lyrics/search`

The legacy `/api/transcribe`, `/api/song/analyze`, and `/api/artwork/generate` paths remain only as disabled `410 Gone` stubs so a V1.6 changes-only overlay cannot accidentally leave paid endpoints active.
