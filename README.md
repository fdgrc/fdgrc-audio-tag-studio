# fdgrc Tag Studio V1.5 — Cloudflare Workers Edition

Privacy-first MP3 metadata, cover-art, Smart Fix, and batch editor built with Next.js 16 and prepared for **Cloudflare Workers using vinext**.

## V1.5 highlights

### Smart Fix
- Search MusicBrainz for likely recording/release metadata
- Confidence scoring using title, artist, album, and duration signals
- Before/after field review with individual checkboxes
- Multiple match candidates when MusicBrainz finds alternatives
- Optional matched release artwork
- Batch Smart Fix scanning with a 90%+ apply action
- MusicBrainz calls are paced client-side during batch scans to respect public-service usage guidance

### Batch editing
- Multi-select tracks with checkboxes
- Apply the current track's album fields to selected tracks
- Apply the current cover to selected tracks
- Auto-number selected tracks in list order
- Clean capitalization, spacing, and common filename junk
- Reset selected tracks to their imported metadata/artwork
- Batch ZIP export with filenames generated from tags

### Library tools
- Metadata quality score per track
- Filters for missing core tags, missing covers, duplicates, and edited tracks
- Album grouping/filtering
- Heuristic duplicate detection using artist/title/duration
- Folder import in browsers that support directory file selection
- Improved filename intelligence

### Cover tools
- Upload, remove, and search artwork
- MusicBrainz + Cover Art Archive suggestions
- Center-square crop + JPEG compression
- 500, 1000, or 1500 pixel output presets
- Apply one cover across selected tracks

### Lyrics + PWA
- Reviewable lyrics lookup through LRCLIB
- Installable PWA manifest and icons
- Basic service-worker caching of the app shell/static assets
- Light / System / Dark theme with saved preference

## Privacy model

The actual audio file never needs to be sent to the server. MP3 parsing, ID3 editing, cover editing/embedding, playback, duplicate analysis, and ZIP creation happen locally in the browser.

Only text/duration used for MusicBrainz, Cover Art Archive, or LRCLIB matching is sent through the application's API routes.

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

See **CLOUDFLARE.md** for dashboard/CI setup.

## Public service identification

Before public deployment, configure:

```env
MUSICBRAINZ_USER_AGENT="fdgrc-tag-studio/1.5 (you@example.com)"
LRCLIB_USER_AGENT="fdgrc-tag-studio/1.5 (you@example.com)"
```

They are identification strings, not API secrets.

## Important ID3 limitation

`browser-id3-writer` replaces the existing ID3 tag. V1.5 reads and rewrites the fields exposed by this editor, but uncommon/private/unsupported ID3 frames may still be lost. Keep original files. Full unknown-frame preservation remains a future hardening item.

## Credits

Developed by Ferdinand Degracia — AI Assisted Engineering
