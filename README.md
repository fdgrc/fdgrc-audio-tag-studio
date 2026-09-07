# fdgrc Tag Studio V1.6 — Cloudflare Workers Edition

Privacy-first MP3 metadata, cover-art, Smart Fix, lyrics/caption, and batch editor built with Next.js 16 for **Cloudflare Workers using vinext**.

## V1.6 highlights

### Audio → Lyrics & Captions
- Explicit cloud transcription button for the selected audio file
- OpenAI `gpt-transcribe` by default
- Artist/title/album context is supplied to improve song transcription
- Optional language hint
- Review transcript before copying it into the Lyrics tag
- Download TXT, LRC, SRT, or VTT
- Saving an MP3 with a timed AI transcript embeds synchronized ID3 `SYLT` lyrics in addition to normal `USLT` lyrics

### AI Art Director
- Analyze artist, title, album, and approved lyrics/transcript
- Returns mood, energy, themes, imagery, palette, and 3–4 original cover concepts
- Lyrics are analyzed into visual themes before image generation; the image endpoint does not need the verbatim lyrics
- Pick a concept, add custom visual direction, and optionally request title/artist typography
- Generate an original 1024×1024 cover using `gpt-image-2` by default
- Generated art stays a preview until **Use as cover** is clicked

### Everything from V1.5
- Smart Fix via MusicBrainz with confidence review
- batch editing and ZIP export
- metadata quality, album grouping, duplicates, folder import
- MusicBrainz + Cover Art Archive artwork suggestions
- crop/resize/compress cover utilities
- LRCLIB lyrics lookup
- installable PWA
- Light / System / Dark theme

## Privacy model

By default MP3 parsing, ID3 editing/writing, cover editing/embedding, playback, library analysis, and ZIP generation remain local in the browser.

Cloud calls happen only when you invoke them:

- MusicBrainz / Cover Art Archive: metadata text and duration
- LRCLIB: metadata text and duration
- **Transcribe audio:** selected audio file is sent through your Worker to your configured OpenAI project
- **Analyze song:** artist/title/album plus approved lyrics or transcript are sent to OpenAI
- **Generate cover:** only the derived art concept, metadata context, and your custom visual direction are sent to image generation

`OPENAI_API_KEY` must remain server-side and should be configured as a Cloudflare secret/environment variable, never exposed through a `NEXT_PUBLIC_` variable.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Cloudflare/vinext:

```bash
npm install
npm run check:vinext
npm run dev:vinext
npm run build:vinext
```

## Environment variables

```env
MUSICBRAINZ_USER_AGENT="fdgrc-tag-studio/1.6 (you@example.com)"
LRCLIB_USER_AGENT="fdgrc-tag-studio/1.6 (you@example.com)"
OPENAI_API_KEY="sk-..."
OPENAI_TRANSCRIBE_MODEL="gpt-transcribe"
OPENAI_TEXT_MODEL="gpt-5.6-luna"
OPENAI_IMAGE_MODEL="gpt-image-2"
```

Only `OPENAI_API_KEY` is secret.

## Important ID3 limitation

`browser-id3-writer` replaces the existing ID3 tag. V1.6 reads and rewrites the fields exposed by this editor and now supports both `USLT` and AI-generated `SYLT`, but uncommon/private/unsupported ID3 frames may still be lost. Keep original files.

## Credits

Developed by Ferdinand Degracia — AI Assisted Engineering
