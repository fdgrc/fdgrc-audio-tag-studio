# V1.6.5.1 — Playback Safety Fix

## Fixed: files named `.mp3` that are not actually MP3

AudioTags now inspects the real audio container and MPEG frames instead of trusting the filename extension.

If a file is named `.mp3` but is actually WebM/Opus, Ogg, FLAC, WAV, MP4/AAC, or another browser-decodable audio source, AudioTags will **not** prepend an ID3 tag to the non-MP3 stream. It converts the audio locally to a genuine MP3 first, then writes ID3 metadata.

This directly fixes the reproduced case where a WebM/Opus file named `august_131kbps.mp3` became an invalid hybrid file after ID3 was prepended.

## New safeguards

- Source format detection from file signatures plus metadata hints.
- Clear warning when the `.mp3` extension does not match the real audio stream.
- Local browser conversion to genuine 192 kbps MP3 using a bundled WebAssembly LAME encoder.
- No paid API and no audio upload for conversion.
- MPEG Layer III frame validation before a file is offered for download.
- If synchronized `SYLT` lyrics ever cause a compatibility validation failure, AudioTags retries without `SYLT` while retaining plain `USLT` lyrics.
- Batch export validates every generated track before adding it to the ZIP.
- The player can switch between **Original** and the exact **Updated** validated export.
- The source playback Blob uses the detected MIME type, which improves playback of mislabeled source files.

## Packaging

- Version bumped to V1.6.5.1.
- PWA cache bumped so phones do not keep the older save logic.
- Added `wasm-media-encoders` 0.7.0 for local MP3 encoding.
