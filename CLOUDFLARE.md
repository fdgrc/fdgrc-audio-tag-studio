# Cloudflare Workers deployment

This project is prepared for **Cloudflare Workers + vinext**. It keeps the normal Next.js scripts for local compatibility and adds vinext scripts for the Worker runtime.

## 1. Install

```bash
npm install
```

## 2. Local development

Normal Next.js development remains available:

```bash
npm run dev
```

To run through vinext / Vite instead:

```bash
npm run dev:vinext
```

Open `http://localhost:3000` (or the port printed by vinext).

## 3. Configure MusicBrainz identification

MusicBrainz asks API clients to identify themselves with a useful contact.

For local development, copy `.env.example` to `.env.local` and replace the placeholder:

```env
MUSICBRAINZ_USER_AGENT="fdgrc-tag-studio/1.0 (you@example.com)"
```

For Cloudflare production, add a Worker environment variable named `MUSICBRAINZ_USER_AGENT` in the Cloudflare dashboard under your Worker settings. You can also configure it through Wrangler/CI.

This value is not an API key or password; it is simply the application identification sent to MusicBrainz.

## 4. Compatibility check

```bash
npm run check:vinext
```

## 5. Production build

```bash
npm run build:vinext
```

## 6. Preview using the Workers runtime

```bash
npm run preview:worker
```

After the server starts, check:

- `/` — Tag Studio
- `/api/health` — Worker/API health response
- `/api/artwork/search?artist=Daft%20Punk&album=Discovery&title=One%20More%20Time` — metadata/artwork search test

## 7. Deploy from your computer

Authenticate once:

```bash
npx wrangler login
```

Then deploy:

```bash
npm run deploy
```

The vinext deploy command builds the application and deploys it to Cloudflare Workers.

If Wrangler asks for an account, either add `account_id` to `wrangler.jsonc` or set `CLOUDFLARE_ACCOUNT_ID` in your shell/CI environment.

## 8. Deploy from a Git repository with Workers Builds

In Cloudflare Dashboard:

1. Go to **Workers & Pages**.
2. Choose **Create application** / **Import a repository**.
3. Select the repository containing this project.
4. Use the project root as the root directory.
5. Recommended production settings:
   - **Build command:** `npm run build:vinext`
   - **Deploy command:** `npm run deploy:built`
6. Add the `MUSICBRAINZ_USER_AGENT` environment variable.
7. Save and deploy.

Alternatively, leave the build command empty and use `npm run deploy` as the deploy command. The deploy helper will perform the build itself.

## Included Cloudflare files

- `vite.config.ts` — vinext + Cloudflare Vite plugin
- `wrangler.jsonc` — Worker configuration
- `.dev.vars.example` — example Worker-local environment values
- `CLOUDFLARE.md` — this guide

## Why there is no custom Worker file

vinext provides the App Router Worker entry point (`vinext/server/app-router-entry`). The Next.js `app/api/**/route.ts` handlers are compiled into the Worker automatically.

## Current architecture

The MP3 itself stays in the browser. The Worker handles only lightweight public metadata/artwork requests:

```text
Browser
  ├─ MP3 parsing
  ├─ ID3 editing
  ├─ artwork embedding
  ├─ audio preview
  └─ ZIP export
        │
        └─ text metadata only
             ▼
Cloudflare Worker
  ├─ /api/artwork/search
  └─ /api/artwork/image
             │
             ▼
MusicBrainz + Cover Art Archive
```
