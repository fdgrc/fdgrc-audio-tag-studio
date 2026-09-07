# Cloudflare Workers deployment — V1.5

This project targets **Cloudflare Workers + vinext** and keeps normal Next.js scripts for local development.

> The Worker name is currently `audiotags` in `wrangler.jsonc`. If your Cloudflare Worker has a different name, change that field to exactly match it.

> The compatibility date remains pinned to `2026-09-06` to avoid the future-date rejection encountered in the earlier deployment. Update it later only to a date Cloudflare already accepts.

## Install

```bash
npm install
```

## Local development

```bash
npm run dev
```

or through vinext:

```bash
npm run dev:vinext
```

## Configure lookup identification

Copy `.env.example` to `.env.local` for local Next.js development. For production, add these Worker environment variables in Cloudflare:

```env
MUSICBRAINZ_USER_AGENT="fdgrc-tag-studio/1.5 (you@example.com)"
LRCLIB_USER_AGENT="fdgrc-tag-studio/1.5 (you@example.com)"
```

These are not credentials. They identify the application when it calls public metadata/lyrics services.

## Compatibility + build

```bash
npm run check:vinext
npm run build:vinext
```

## Preview Workers runtime

```bash
npm run preview:worker
```

Useful checks:

- `/` — Tag Studio V1.5
- `/api/health` — API health
- `/api/artwork/search?artist=Daft%20Punk&album=Discovery&title=One%20More%20Time`
- `/api/metadata/search?artist=Daft%20Punk&title=One%20More%20Time&album=Discovery&duration=320`
- `/api/lyrics/search?artist=Daft%20Punk&title=One%20More%20Time&album=Discovery&duration=320`

## Deploy locally

```bash
npx wrangler login
npm run deploy
```

## Workers Builds / Git repository

Recommended Cloudflare settings:

- **Build command:** `npm run build:vinext`
- **Deploy command:** `npm run deploy:built`
- **Root directory:** `/`

Add the two User-Agent variables above to your Worker environment settings.

## Architecture

```text
Browser
  ├─ MP3 parse + playback
  ├─ ID3 edit/write
  ├─ filename cleanup
  ├─ duplicate + quality analysis
  ├─ cover crop/resize/compression
  ├─ batch editing
  └─ ZIP export
        │
        └─ lookup text/duration only
             ▼
Cloudflare Worker
  ├─ /api/metadata/search ── MusicBrainz
  ├─ /api/artwork/search  ── MusicBrainz + Cover Art Archive
  ├─ /api/artwork/image   ── validated image proxy
  └─ /api/lyrics/search   ── LRCLIB
```
