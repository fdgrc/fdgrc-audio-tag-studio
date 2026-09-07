# V1.6 — Lyrics AI + Art Director

## Added

- Cloud audio transcription through `/api/transcribe`
- `gpt-transcribe` default with segment timestamps
- Review-before-apply transcript preview
- TXT, LRC, SRT, and VTT caption downloads
- Synchronized ID3 `SYLT` embedding when an AI transcript has timestamps
- Unsynchronized `USLT` lyrics remain supported
- Song/lyrics analysis through `/api/song/analyze`
- Original visual concepts based on artist, title, album, and approved lyrics/transcript
- Mood, energy, theme, imagery, and palette analysis
- AI Art Director concept picker and custom direction field
- Original cover generation through `/api/artwork/generate`
- `gpt-image-2` default at 1024×1024 medium-quality JPEG
- Generated art is preview-only until the user explicitly chooses **Use as cover**
- Optional title + artist typography request

## Privacy behavior

V1.6 changes the previous all-local audio rule only when the user explicitly presses **Transcribe audio**. At that point, the selected audio file is sent through the Cloudflare Worker to the configured OpenAI project. Metadata, lyrics, and art-generation requests are also sent only when the user explicitly invokes their corresponding AI actions.

The OpenAI API key remains server-side in Worker environment variables/secrets and is never sent to the browser.

## Unchanged

- Existing V1.5 Smart Fix and MusicBrainz workflow
- Cover Art Archive suggestions
- LRCLIB lookup
- batch tools and ZIP export
- light / system / dark mode
- PWA behavior
- Cloudflare Workers + vinext deployment commands
