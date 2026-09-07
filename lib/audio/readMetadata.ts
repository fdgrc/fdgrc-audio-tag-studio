import { parseBlob } from "music-metadata";
import type { CoverAsset, EditableTags, TrackItem } from "@/types/audio";
import { emptyTags, guessTagsFromFileName } from "./guessTags";

function toText(value: string | number | undefined | null) {
  return value == null ? "" : String(value);
}

function firstComment(common: Awaited<ReturnType<typeof parseBlob>>["common"]) {
  const comments = common.comment;
  if (!comments?.length) return "";
  const first = comments[0];
  return typeof first === "string" ? first : first.text ?? "";
}

function pictureToCover(picture: NonNullable<Awaited<ReturnType<typeof parseBlob>>["common"]["picture"]>[number]): CoverAsset {
  const copy = new Uint8Array(picture.data.length);
  copy.set(picture.data);
  const data = copy.buffer;
  const blob = new Blob([data], { type: picture.format || "image/jpeg" });
  return {
    data,
    url: URL.createObjectURL(blob),
    mimeType: picture.format || "image/jpeg",
    source: "embedded",
    label: "Embedded artwork",
    bytes: picture.data.length,
  };
}

export async function readTrack(file: File): Promise<TrackItem> {
  const metadata = await parseBlob(file, { duration: true });
  const common = metadata.common;
  const guessed = guessTagsFromFileName(file.name);
  const base = emptyTags();

  const tags: EditableTags = {
    ...base,
    title: common.title || guessed.title || "",
    artist: common.artist || guessed.artist || "",
    album: common.album || "",
    albumArtist: common.albumartist || "",
    year: toText(common.year),
    track: toText(common.track?.no),
    disc: toText(common.disk?.no),
    genre: common.genre?.join(", ") || "",
    composer: common.composer?.join(", ") || "",
    bpm: toText(common.bpm),
    comment: firstComment(common),
    lyrics: common.lyrics?.[0]?.text || "",
    isrc: common.isrc?.[0] || "",
  };

  const picture = common.picture?.[0];
  const cover = picture ? pictureToCover(picture) : undefined;
  const originalCover = picture ? pictureToCover(picture) : undefined;

  return {
    id: crypto.randomUUID(),
    file,
    fileName: file.name,
    duration: metadata.format.duration || 0,
    bitrate: metadata.format.bitrate,
    sampleRate: metadata.format.sampleRate,
    tags,
    originalTags: { ...tags },
    cover,
    originalCover,
    audioUrl: URL.createObjectURL(file),
    dirty: false,
  };
}
