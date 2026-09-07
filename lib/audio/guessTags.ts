import type { EditableTags } from "@/types/audio";
import { titleCase } from "@/lib/format";

const junkPatterns = [
  /\[(?:320|256|192|160|128)\s*kbps\]/gi,
  /\[(?:official\s*)?(?:audio|video|music video|lyrics?|lyric video)\]/gi,
  /\((?:official\s*)?(?:audio|video|music video|lyrics?|lyric video)\)/gi,
  /\b(?:official\s*)?(?:audio|video|music video|lyric video)\b/gi,
  /\b(?:hq|hd|remastered(?:\s+\d{4})?|explicit|clean)\b/gi,
  /\b(?:final|mastered?|new)\s*(?:mix|version|ver)?\b/gi,
  /\s+-\s+youtube\b/gi,
];

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

export function cleanTagText(value: string) {
  let clean = value.replace(/_/g, " ");
  for (const pattern of junkPatterns) clean = clean.replace(pattern, " ");
  return clean
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/^[\s._-]+|[\s._-]+$/g, "")
    .trim();
}

export function cleanTitle(value: string) {
  return cleanTagText(value)
    .replace(/^\d{1,3}[.\s_-]+/, "")
    .replace(/\s*\((?:feat\.?|ft\.?)\s+([^)]*)\)\s*$/i, " (feat. $1)")
    .trim();
}

export function normalizeTagCase(value: string) {
  const trimmed = cleanTagText(value);
  if (!trimmed) return "";
  if (trimmed === trimmed.toUpperCase() && trimmed.length <= 5) return trimmed;
  return titleCase(trimmed);
}

export function cleanEditableTags(tags: EditableTags): EditableTags {
  return {
    ...tags,
    title: normalizeTagCase(cleanTitle(tags.title)),
    artist: cleanTagText(tags.artist),
    album: normalizeTagCase(tags.album),
    albumArtist: cleanTagText(tags.albumArtist),
    genre: tags.genre
      .split(/[,;]/)
      .map((item) => normalizeTagCase(item))
      .filter(Boolean)
      .join(", "),
    composer: cleanTagText(tags.composer),
    comment: tags.comment.trim(),
    lyrics: tags.lyrics.trim(),
    isrc: tags.isrc.trim().toUpperCase(),
  };
}

export function guessTagsFromFileName(fileName: string): Partial<EditableTags> {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const clean = cleanTagText(stem);

  const trackMatch = clean.match(/^\s*(\d{1,3})(?:\s*[-._)]\s*|\s+)(.+)$/);
  const track = trackMatch?.[1] ?? "";
  const withoutTrack = cleanTagText(trackMatch?.[2] ?? clean);

  const separators = [" - ", " – ", " — "];
  let parts: string[] = [];
  for (const separator of separators) {
    if (withoutTrack.includes(separator)) {
      parts = withoutTrack.split(separator).map((part) => cleanTagText(part)).filter(Boolean);
      break;
    }
  }

  if (parts.length >= 3 && /^\d{1,3}$/.test(parts[0])) {
    return {
      track: parts[0],
      artist: cleanTagText(parts[1]),
      title: normalizeTagCase(parts.slice(2).join(" - ")),
    };
  }

  if (parts.length >= 2) {
    return {
      track,
      artist: cleanTagText(parts[0]),
      title: normalizeTagCase(parts.slice(1).join(" - ")),
    };
  }

  return { track, title: normalizeTagCase(withoutTrack) };
}
