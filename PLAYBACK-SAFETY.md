# AudioTags playback safety

AudioTags V1.6.5.1 does not trust `.mp3` by filename alone.

## Why this was needed

Some downloaders save WebM/Opus audio with an `.mp3` extension. A browser may still play that source by sniffing its bytes, but ID3 metadata belongs in an actual MPEG Layer III file. Adding ID3 directly in front of WebM creates a non-standard hybrid that many music players reject.

## V1.6.5.1 save pipeline

1. Inspect the actual source bytes.
2. If MPEG Layer III is present, preserve the original MP3 audio stream.
3. If the source is not MP3, decode it locally with Web Audio.
4. Encode genuine MP3 locally at 192 kbps using the bundled WASM encoder.
5. Write ID3v2.3 metadata, artwork, lyrics, and compatible timed lyrics.
6. Re-scan the output after the ID3 tag and require valid MPEG Layer III frames.
7. Only then enable/download the result.
8. Load that exact validated Blob into the **Updated** side of the player.

Nothing in this conversion path requires an AI API, subscription, or server-side audio upload.

## If conversion cannot run

If the browser cannot decode the source codec, AudioTags stops and shows an error instead of producing a broken `.mp3`. Keep the original file and convert it with a desktop audio tool before trying again.
