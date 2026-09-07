# Cloudflare Workers deployment — V1.6.4

V1.6.4 keeps **Cloudflare Workers + vinext** and requires no paid AI API.

## Build settings

```text
Build command:  npm run build:vinext
Deploy command: npm run deploy:built
Root:           /
```

`wrangler.jsonc` intentionally keeps its compatibility date pinned so Cloudflare never sees a future UTC date during deployment.

## Optional environment variable

```text
MUSICBRAINZ_USER_AGENT="AudioTags/1.6.4 (you@example.com)"
```

There is no `OPENAI_API_KEY` requirement.

## V1.6.4 whisper.cpp architecture

The browser/PWA receives the whisper.cpp JavaScript/WebAssembly runtime from the normal application bundle. No Transformers.js runtime is fetched at runtime.

`npm run build:vinext` first runs `npm run prepare:whisper`. That script downloads and SHA-256 verifies Tiny Q5 from free public sources, splits it into ~8 MB files, and places them under `public/whisper-models/` so Cloudflare can serve them as normal static assets.

Preferred first-use path:

```text
Browser
  -> /whisper-models/tiny-q5_1/manifest.json
  -> /whisper-models/tiny-q5_1/part-000.bin ...
```

If model preparation could not complete during the build, the browser falls back to `/api/whisper-ggml?model=<model>`, which streams from free public sources without buffering the entire model in Worker memory. The phone caches the reconstructed model in IndexedDB when possible. Base Q5 uses the fallback route unless you set `AUDIOTAGS_BUNDLE_BASE_WHISPER=1` during the build.

V1.6.4 also adds these response headers through `next.config.ts` because the official whisper.cpp WASM build uses pthreads/SharedArrayBuffer:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

After the first V1.6.4 deployment, fully close and reopen an installed PWA once so the top-level page is loaded with those headers.

## Manual no-cost fallback

The AudioTags transcription panel includes **Import model .bin**. This lets a device use a locally obtained `ggml-tiny-q5_1.bin` or `ggml-base-q5_1.bin` even if every automatic model host is blocked. The model is then cached locally by AudioTags.

## Smart Fix

Smart Fix uses MusicBrainz first and Apple Search as a no-key fallback. MusicBrainz calls remain client-paced at about one request per second during batch scans.
