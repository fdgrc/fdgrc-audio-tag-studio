# fdgrc Tag Studio — V1

Privacy-first MP3 metadata and cover-art editor built with Next.js.

## What V1 does

- Import one or many MP3 files in the browser
- Read ID3 metadata and embedded cover art locally
- Edit title, artist, album, album artist, year, track, disc, genre, composer, BPM, comment, lyrics, and ISRC
- Preview the audio without uploading it
- Upload/replace/remove artwork
- Automatically search MusicBrainz + Cover Art Archive for matching artwork
- Embed the selected front cover into the exported MP3
- Export one updated MP3 or all tracks as a ZIP
- Keep original MP3 files unchanged

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Recommended first-time setup

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholder `MUSICBRAINZ_USER_AGENT` contact URL with your real GitHub repo URL or email.
3. Restart `npm run dev`.

MusicBrainz asks client applications to identify themselves and to stay at or below one API request per second. This app performs a single MusicBrainz lookup per artwork search and caches server results.

## Privacy model

The actual MP3 is parsed and rewritten in the browser. Artwork search sends only the text fields needed for matching (artist, album, title) to this app's API route. The route talks to MusicBrainz and Cover Art Archive.

## Important V1 limitation

`browser-id3-writer` replaces the existing ID3 tag. V1 first reads the common fields listed above and writes those fields back, but uncommon/private/unsupported ID3 frames may not be preserved. Keep originals until a later full-frame preservation layer is added.

## Suggested next versions

### V1.1
- Better filename-to-tag cleanup
- Apply one field or cover to selected tracks
- Cover crop/resize/compression before embedding
- Better error handling for artwork sources

### V2 — Smart Fix
- Compare filename, existing tags, duration, album and track number
- Suggest corrected metadata with confidence scores
- Album grouping and automatic shared cover assignment
- Review all changes before applying them

### V3
- Preserve unknown ID3 frames
- Rename files from tags
- Undo/redo and edit history
- PWA/offline shell
- Optional additional artwork/metadata providers

## Production build

```bash
npm run build
npm start
```

## Credits

Developed by Ferdinand Degracia — AI Assisted Engineering
