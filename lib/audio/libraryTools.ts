import type { EditableTags, TrackItem } from "@/types/audio";
import { cleanEditableTags } from "./guessTags";

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function metadataQuality(track: TrackItem) {
  const weights: Array<[keyof EditableTags, number]> = [
    ["title", 24],
    ["artist", 24],
    ["album", 15],
    ["albumArtist", 8],
    ["year", 7],
    ["track", 7],
    ["genre", 5],
    ["isrc", 4],
  ];
  let score = track.cover ? 6 : 0;
  for (const [key, weight] of weights) if (track.tags[key].trim()) score += weight;
  return Math.min(100, score);
}

export function missingCoreMetadata(track: TrackItem) {
  return !track.tags.title.trim() || !track.tags.artist.trim() || !track.tags.album.trim();
}

export function albumKey(track: TrackItem) {
  const album = normalize(track.tags.album);
  const artist = normalize(track.tags.albumArtist || track.tags.artist);
  return album ? `${artist || "unknown"}::${album}` : "";
}

export function albumLabel(track: TrackItem) {
  const album = track.tags.album.trim() || "No album";
  const artist = (track.tags.albumArtist || track.tags.artist).trim();
  return artist ? `${artist} — ${album}` : album;
}

export function duplicateGroups(tracks: TrackItem[]) {
  const groups = new Map<string, TrackItem[]>();
  for (const track of tracks) {
    const title = normalize(track.tags.title || track.fileName.replace(/\.mp3$/i, ""));
    const artist = normalize(track.tags.artist);
    if (!title) continue;
    const durationBucket = Math.round(track.duration / 2);
    const key = `${artist}::${title}::${durationBucket}`;
    const current = groups.get(key) || [];
    current.push(track);
    groups.set(key, current);
  }
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

export function duplicateIdSet(tracks: TrackItem[]) {
  return new Set(duplicateGroups(tracks).flatMap((group) => group.map((track) => track.id)));
}

export function applyBatchClean(track: TrackItem): TrackItem {
  const nextTags = cleanEditableTags(track.tags);
  const dirty = JSON.stringify(nextTags) !== JSON.stringify(track.originalTags) || track.dirty;
  return { ...track, tags: nextTags, dirty };
}
