# fdgrc Tag Studio V1.6.5.1 — No-Payment Edition

AudioTags is a privacy-first MP3 metadata, lyrics, caption and cover-art editor designed for **Cloudflare Workers + vinext**. MP3 reading/writing remains local in the browser.

AudioTags V1.6.5.1 does **not** require an OpenAI API key or paid AI subscription.

## Highlights

- Local MP3 ID3 read/edit/write and batch ZIP export.
- Smart Fix metadata lookup with MusicBrainz plus Apple Search fallback.
- Official cover lookup through MusicBrainz/Cover Art Archive plus Apple artwork fallback.
- LRCLIB lyrics lookup.
- **On-device whisper.cpp WebAssembly transcription** for phones, tablets and desktop browsers.
- Quantized multilingual Tiny Q5 (31 MB) and Base Q5 (57 MB) model choices.
- Timed TXT/LRC/SRT/VTT output and synchronized ID3 lyrics.
- Optional desktop WhisperHallu + WhisperTimeSync helper for higher-powered local transcription.
- Art Director 2: local song/lyrics theme analysis, six visual directions, and local 1024×1024 cover rendering.
- PWA install support, light/system/dark themes, library cleanup and batch tools.
- **Playback-safe export:** detects fake/mislabeled `.mp3` files, locally converts non-MP3 audio to genuine MP3, validates MPEG frames, and previews the exact updated export.

## V1.6.5.1 playback safety

AudioTags no longer trusts the filename extension. If a file is called `.mp3` but is actually WebM/Opus or another browser-decodable format, the app converts it locally to a genuine 192 kbps MP3 before writing ID3. Generated files are scanned for valid MPEG Layer III frames before download, and the player can switch between the imported source and the exact validated updated file.

See `PLAYBACK-SAFETY.md` for the save pipeline and failure behavior.

## V1.6.4 mobile transcription repair

V1.6.4 removes the earlier Transformers.js/ONNX pipeline entirely. The browser now runs whisper.cpp itself. The WebAssembly engine is a normal project dependency, while the Cloudflare build prepares Tiny Q5 into small static model chunks served from your own AudioTags origin.

On first use, AudioTags checks those same-origin static chunks first, then a free same-origin Worker relay, then offers **Import model .bin** as a manual/offline fallback. Successful models are cached in IndexedDB when possible. The transcription panel also has **Check model delivery** so a non-developer can see which path is ready before starting a song.

See `MOBILE-WHISPER.md` for details.

## Cloudflare

Build:

```bash
npm run build:vinext
```

Deploy an already-built output:

```bash
npm run deploy:built
```

No AI secret is required. Recommended optional environment value:

```text
MUSICBRAINZ_USER_AGENT="AudioTags/1.6.5.1 (you@example.com)"
```

See `CLOUDFLARE.md` for deployment notes.

## Privacy

- Imported MP3 audio is not uploaded for normal tag editing.
- On-device whisper.cpp receives the decoded 16 kHz waveform in browser memory only.
- Metadata lookup sends text fields such as artist/title/album to public metadata services.
- Cover and metadata proxy routes run through your Cloudflare Worker.
- Original MP3 files are never overwritten automatically.

## Important limitations

- Browser ID3 writing still cannot guarantee preservation of every unknown/private ID3 frame. Keep original files.
- Music transcription is harder than ordinary speech; vocal-heavy mixes may need Base Q5 or the desktop WhisperHallu helper.
- whisper.cpp WASM uses significant RAM. Older mobile browsers may only handle Tiny Q5 reliably.
