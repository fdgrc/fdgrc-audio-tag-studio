import { ID3Writer } from "browser-id3-writer";
import type { CoverAsset, EditableTags, TrackItem, TranscriptSegment } from "@/types/audio";
import { segmentsToSyncedLyrics } from "@/lib/audio/captions";
import { inspectAudioFile, validatePlayableMp3, type AudioSourceInfo, type Mp3Validation } from "@/lib/audio/audioFormat";
import { transcodeBrowserAudioToMp3, type Mp3TranscodeProgress } from "@/lib/audio/transcodeToMp3";
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

function id3Language(language?: string) {
  const map: Record<string, string> = {
    en: "eng", es: "spa", fr: "fra", de: "deu", it: "ita", pt: "por",
    ja: "jpn", ko: "kor", zh: "zho", tl: "tgl", id: "ind", ms: "msa",
  };
  const key = language?.trim().toLowerCase().split(/[-_]/)[0] || "";
  return map[key] || "eng";
}

export type Mp3WriteProgress = Mp3TranscodeProgress;

export type Mp3WriteResult = {
  blob: Blob;
  convertedSource: boolean;
  sourceInfo: AudioSourceInfo;
  validation: Mp3Validation;
  syncedLyricsDropped: boolean;
};

async function buildTaggedBlob(
  source: ArrayBuffer,
  tags: EditableTags,
  cover: CoverAsset | undefined,
  timedLyrics: TranscriptSegment[] | undefined,
  lyricsLanguage: string | undefined,
  includeSyncedLyrics: boolean,
) {
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
      language: id3Language(lyricsLanguage),
    });
  }
  if (includeSyncedLyrics && timedLyrics?.length) {
    const synced = segmentsToSyncedLyrics(timedLyrics);
    if (synced.length) {
      writer.setFrame("SYLT", {
        type: 1,
        text: synced,
        timestampFormat: 2,
        language: id3Language(lyricsLanguage),
        description: "AI transcription",
      });
    }
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

export async function writeMp3(
  file: File,
  tags: EditableTags,
  cover?: CoverAsset,
  timedLyrics?: TranscriptSegment[],
  lyricsLanguage?: string,
  onProgress?: (progress: Mp3WriteProgress) => void,
): Promise<Mp3WriteResult> {
  const sourceInfo = await inspectAudioFile(file);
  let source: ArrayBuffer;
  let convertedSource = false;

  if (sourceInfo.isMp3) {
    onProgress?.({ stage: "Preparing MP3 tags", fraction: 0.1, detail: "Source MPEG audio verified" });
    source = await file.arrayBuffer();
  } else {
    convertedSource = true;
    onProgress?.({ stage: `Source is ${sourceInfo.label}`, fraction: 0.02, detail: "Converting locally before ID3 write" });
    const converted = await transcodeBrowserAudioToMp3(file, onProgress, 192, sourceInfo.id3Bytes);
    const rawValidation = await validatePlayableMp3(converted);
    if (!rawValidation.valid) {
      throw new Error(rawValidation.reason || "The locally converted audio did not contain a valid MP3 stream.");
    }
    source = await converted.arrayBuffer();
  }

  onProgress?.({ stage: "Writing ID3 metadata", fraction: 0.95, detail: "Title · artwork · lyrics" });
  let blob = await buildTaggedBlob(source, tags, cover, timedLyrics, lyricsLanguage, true);
  let validation = await validatePlayableMp3(blob);
  let syncedLyricsDropped = false;

  if (!validation.valid && timedLyrics?.length) {
    onProgress?.({ stage: "Compatibility retry", fraction: 0.97, detail: "Retrying without synchronized SYLT frame" });
    blob = await buildTaggedBlob(source, tags, cover, timedLyrics, lyricsLanguage, false);
    validation = await validatePlayableMp3(blob);
    syncedLyricsDropped = validation.valid;
  }

  if (!validation.valid) {
    throw new Error(validation.reason || "The output failed MP3 playback validation. Nothing was downloaded.");
  }

  onProgress?.({ stage: "Playable MP3 verified", fraction: 1, detail: `Audio starts at byte ${validation.firstFrameOffset ?? "verified"}` });
  return { blob, convertedSource, sourceInfo, validation, syncedLyricsDropped };
}

export function suggestedOutputName(track: TrackItem) {
  const { track: trackNumber, artist, title } = track.tags;
  const prefix = trackNumber ? `${trackNumber.padStart(2, "0")} - ` : "";
  const name = artist && title ? `${prefix}${artist} - ${title}` : title || track.fileName.replace(/\.[^.]+$/i, "");
  return `${safeFileName(name)}.mp3`;
}
