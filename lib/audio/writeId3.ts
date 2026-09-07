import { ID3Writer } from "browser-id3-writer";
import type { CoverAsset, EditableTags, TrackItem } from "@/types/audio";
import { safeFileName } from "@/lib/format";

function splitList(value: string) {
  return value.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
}

async function coverBuffer(cover?: CoverAsset): Promise<ArrayBuffer | undefined> {
  if (!cover) return undefined;
  if (cover.data) return cover.data.slice(0);
  const response = await fetch(cover.url);
  if (!response.ok) throw new Error("Unable to fetch the selected cover art.");
  return response.arrayBuffer();
}

export async function writeMp3(file: File, tags: EditableTags, cover?: CoverAsset) {
  const source = await file.arrayBuffer();
  const writer = new ID3Writer(source);

  if (tags.title) writer.setFrame("TIT2", tags.title);
  if (tags.artist) writer.setFrame("TPE1", splitList(tags.artist));
  if (tags.albumArtist) writer.setFrame("TPE2", tags.albumArtist);
  if (tags.album) writer.setFrame("TALB", tags.album);
  if (tags.year && /^\d{4}$/.test(tags.year)) writer.setFrame("TYER", Number(tags.year));
  if (tags.track) writer.setFrame("TRCK", tags.track);
  if (tags.disc) writer.setFrame("TPOS", tags.disc);
  if (tags.genre) writer.setFrame("TCON", splitList(tags.genre));
  if (tags.composer) writer.setFrame("TCOM", splitList(tags.composer));
  if (tags.bpm && Number.isFinite(Number(tags.bpm))) writer.setFrame("TBPM", Number(tags.bpm));
  if (tags.isrc) writer.setFrame("TSRC", tags.isrc);
  if (tags.comment) {
    writer.setFrame("COMM", {
      description: "",
      text: tags.comment,
      language: "eng",
    });
  }
  if (tags.lyrics) {
    writer.setFrame("USLT", {
      description: "",
      lyrics: tags.lyrics,
      language: "eng",
    });
  }

  const artwork = await coverBuffer(cover);
  if (artwork) {
    writer.setFrame("APIC", {
      type: 3,
      data: artwork,
      description: "Front cover",
    });
  }

  writer.addTag();
  return writer.getBlob();
}

export function suggestedOutputName(track: TrackItem) {
  const { track: trackNumber, artist, title } = track.tags;
  const prefix = trackNumber ? `${trackNumber.padStart(2, "0")} - ` : "";
  const name = artist && title ? `${prefix}${artist} - ${title}` : title || track.fileName.replace(/\.mp3$/i, "");
  return `${safeFileName(name)}.mp3`;
}
