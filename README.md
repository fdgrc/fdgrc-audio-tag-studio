# fdgrc Tag Studio — Cloudflare Workers Edition

Privacy-first MP3 metadata and cover-art editor built with Next.js 16 and prepared for **Cloudflare Workers using vinext**.

## What it does

- Import one or many MP3 files in the browser
- Read ID3 metadata and embedded cover art locally
- Edit title, artist, album, album artist, year, track, disc, genre, composer, BPM, comment, lyrics, and ISRC
- Preview audio without uploading the MP3
- Upload, replace, or remove artwork
- Search MusicBrainz + Cover Art Archive for matching covers
- Show artwork suggestions with MusicBrainz match scores
- Embed selected front artwork into exported MP3 files
- Export one modified MP3 or all tracks as a ZIP
- Keep the original files untouched

## Privacy model

The actual audio file never needs to be sent to the server. MP3 parsing, ID3 editing, cover embedding, audio playback, and ZIP creation all happen locally in the browser.

Only artist/album/title text used for artwork matching is sent to the application's API routes.

## Quick start — normal Next.js

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

## Quick start — Cloudflare/vinext

```bash
npm install
npm run check:vinext
npm run dev:vinext
```

Build for Workers:

```bash
npm run build:vinext
```

Deploy:

```bash
npx wrangler login
npm run deploy
```

See **CLOUDFLARE.md** for the full GitHub/Cloudflare dashboard setup.

## Cloudflare-ready additions

- `vite.config.ts` configures vinext and `@cloudflare/vite-plugin`
- `wrangler.jsonc` targets the vinext App Router Worker entry
- API routes use Web-standard request/fetch/stream APIs
- Node-only runtime declarations were removed
- `/api/health` provides a simple post-deploy check
- The artwork proxy validates every redirect before following it

## MusicBrainz setup

Before public deployment, set `MUSICBRAINZ_USER_AGENT` to identify the app with a contact address or project URL. The example files contain a placeholder that you should replace.

## Important V1 limitation

`browser-id3-writer` replaces the existing ID3 tag. V1 reads and writes the common metadata fields supported by the editor, but uncommon/private/unsupported ID3 frames may not be preserved. Keep your original files until a later full-frame preservation layer is added.

## Recommended next upgrade — Smart Fix

- Better filename-to-tag cleanup
- Apply metadata or artwork to multiple selected tracks
- Album grouping
- Auto-pick shared album covers
- Cover resize/compression before embedding
- Review all proposed metadata changes before applying
- Better metadata confidence scoring
- Preserve unknown ID3 frames

## Credits

Developed by Ferdinand Degracia — AI Assisted Engineering
