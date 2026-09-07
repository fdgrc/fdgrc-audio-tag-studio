import type { EditableTags } from "@/types/audio";
import { titleCase } from "@/lib/format";

export function emptyTags(): EditableTags {
  return {
    title: "",
    artist: "",
    album: "",
    albumArtist: "",
    year: "",
    track: "",
    disc: "",
    genre: "",
    composer: "",
    bpm: "",
    comment: "",
    lyrics: "",
    isrc: "",
  };
}

export function guessTagsFromFileName(fileName: string): Partial<EditableTags> {
  const clean = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .replace(/\[(?:320|256|192|128)\s*kbps\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const trackMatch = clean.match(/^(\d{1,3})[.\s_-]+(.+)$/);
  const track = trackMatch?.[1] ?? "";
  const withoutTrack = trackMatch?.[2] ?? clean;
  const parts = withoutTrack.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2) {
    return {
      track,
      artist: titleCase(parts[0]),
      title: titleCase(parts.slice(1).join(" - ")),
    };
  }

  return { track, title: titleCase(withoutTrack) };
}
