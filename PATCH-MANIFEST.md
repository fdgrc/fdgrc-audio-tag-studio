# AudioTags V1.6.2 build-fix patch

Copy these files into the repository, preserving the folders:

- `lib/audio/songArtLocal.ts`
- `lib/audio/localArt.ts`

This directly fixes Cloudflare's `UNLOADABLE_DEPENDENCY` errors from `components/TagStudio.tsx`.

No existing file needs to be deleted or edited. After committing/pushing these files, rerun the existing Cloudflare deployment.
