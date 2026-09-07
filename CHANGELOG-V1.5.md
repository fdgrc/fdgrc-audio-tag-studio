# V1.5 changes

V1.5 jumps directly from the V1.2 theme build and combines the planned Smart Fix, batch-editing, and library-tools milestones.

## Added

- Smart Fix MusicBrainz metadata matching with confidence scores
- Before/after field review and selectable proposed changes
- Multiple Smart Fix candidates
- Batch Smart Fix scan and 90%+ metadata apply
- Multi-track selection and batch tools
- Apply album fields / current cover to selected tracks
- Auto-number selected tracks
- Metadata cleanup and improved filename parsing
- Metadata quality score
- Missing-tag, missing-cover, duplicate, edited, and album filters
- Heuristic duplicate detection
- Folder chooser/import
- Square cover crop, resize, and JPEG compression presets
- LRCLIB lyrics lookup with exact + fallback search
- PWA manifest, install flow, service worker, and 192/512 icons

## Changed

- Artwork lookup pacing increased to cooperate with Smart Fix lookups
- MusicBrainz application identification updated to V1.5
- Track model now retains imported artwork for reset operations
- Cover model includes optional dimensions/byte size metadata
- README / Cloudflare deployment docs and environment examples updated

## Still intentionally limited

- Unknown/private ID3 frames are not fully preserved because the current writer replaces the ID3 tag.
- Generated AI artwork is not included; automatic artwork suggestions use release artwork sources.
- The service worker caches the app shell/static resources, but online metadata/lyrics searches still require a connection.
