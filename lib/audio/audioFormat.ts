export type AudioSourceKind =
  | "mp3"
  | "webm"
  | "ogg"
  | "flac"
  | "wav"
  | "mp4"
  | "aac"
  | "unknown";

export type AudioSourceInfo = {
  kind: AudioSourceKind;
  label: string;
  mimeType: string;
  isMp3: boolean;
  needsTranscode: boolean;
  extensionMismatch: boolean;
  id3Bytes: number;
  firstFrameOffset?: number;
  containerHint?: string;
  codecHint?: string;
};

export type Mp3Validation = {
  valid: boolean;
  id3Bytes: number;
  firstFrameOffset?: number;
  reason?: string;
};

const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];

function hasAscii(bytes: Uint8Array, offset: number, text: string) {
  if (offset + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}


function containsAscii(bytes: Uint8Array, text: string) {
  if (!text || text.length > bytes.length) return false;
  for (let offset = 0; offset <= bytes.length - text.length; offset += 1) {
    if (hasAscii(bytes, offset, text)) return true;
  }
  return false;
}

function synchsafeToNumber(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] & 0x7f) << 21)
    | ((bytes[offset + 1] & 0x7f) << 14)
    | ((bytes[offset + 2] & 0x7f) << 7)
    | (bytes[offset + 3] & 0x7f);
}

export function id3v2ByteLength(header: Uint8Array) {
  if (header.length < 10 || !hasAscii(header, 0, "ID3")) return 0;
  const payload = synchsafeToNumber(header, 6);
  const footer = (header[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + payload + footer;
}

type MpegHeader = { frameLength: number; sampleRate: number; bitrate: number };

function parseLayer3Header(bytes: Uint8Array, offset: number): MpegHeader | undefined {
  if (offset + 4 > bytes.length) return undefined;
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];

  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return undefined;

  const versionBits = (b1 >> 3) & 0x03;
  const layerBits = (b1 >> 1) & 0x03;
  if (versionBits === 1 || layerBits !== 1) return undefined; // Layer III only.

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return undefined;

  const mpeg1 = versionBits === 3;
  const bitrate = (mpeg1 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex];
  let sampleRate = MPEG1_SAMPLE_RATES[sampleRateIndex];
  if (versionBits === 2) sampleRate /= 2;
  if (versionBits === 0) sampleRate /= 4;
  if (!bitrate || !sampleRate) return undefined;

  const coefficient = mpeg1 ? 144 : 72;
  const frameLength = Math.floor((coefficient * bitrate * 1000) / sampleRate) + padding;
  if (frameLength < 24) return undefined;
  return { frameLength, sampleRate, bitrate };
}

function findLayer3Frame(bytes: Uint8Array, absoluteStart: number) {
  for (let offset = 0; offset + 4 < bytes.length; offset += 1) {
    const header = parseLayer3Header(bytes, offset);
    if (!header) continue;

    const next = offset + header.frameLength;
    const second = parseLayer3Header(bytes, next);
    if (second) return absoluteStart + offset;

    // A valid first frame near the end of the probe is still useful when we
    // simply did not read far enough to include the next complete frame.
    if (next + 4 >= bytes.length && offset < 4096) return absoluteStart + offset;
  }
  return undefined;
}

function magicKind(bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm" as const;
  if (hasAscii(bytes, 0, "OggS")) return "ogg" as const;
  if (hasAscii(bytes, 0, "fLaC")) return "flac" as const;
  if (hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WAVE")) return "wav" as const;
  if (bytes.length >= 12 && hasAscii(bytes, 4, "ftyp")) return "mp4" as const;
  // ADTS AAC sync word. Keep it separate from MPEG Layer III.
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "aac" as const;
  return undefined;
}

function infoForKind(
  kind: AudioSourceKind,
  fileName: string,
  id3Bytes: number,
  frameOffset: number | undefined,
  containerHint?: string,
  codecHint?: string,
): AudioSourceInfo {
  const codec = codecHint?.trim();
  const container = containerHint?.trim();
  const labels: Record<AudioSourceKind, string> = {
    mp3: "MP3 / MPEG Layer III",
    webm: codec?.toLowerCase().includes("opus") ? "WebM / Opus" : "WebM / Matroska",
    ogg: codec ? `Ogg / ${codec}` : "Ogg audio",
    flac: "FLAC",
    wav: "WAV / PCM",
    mp4: codec ? `MP4 / ${codec}` : "MP4 audio",
    aac: "AAC / ADTS",
    unknown: container || codec || "Unknown audio container",
  };
  const mimeTypes: Record<AudioSourceKind, string> = {
    mp3: "audio/mpeg",
    webm: "audio/webm",
    ogg: "audio/ogg",
    flac: "audio/flac",
    wav: "audio/wav",
    mp4: "audio/mp4",
    aac: "audio/aac",
    unknown: "application/octet-stream",
  };
  const isMp3 = kind === "mp3";
  return {
    kind,
    label: labels[kind],
    mimeType: mimeTypes[kind],
    isMp3,
    needsTranscode: !isMp3,
    extensionMismatch: /\.mp3$/i.test(fileName) && !isMp3,
    id3Bytes,
    firstFrameOffset: frameOffset,
    containerHint: container,
    codecHint: codec,
  };
}

function kindFromHints(containerHint?: string, codecHint?: string): AudioSourceKind | undefined {
  const container = containerHint?.toLowerCase() || "";
  const codec = codecHint?.toLowerCase() || "";
  if (codec.includes("mpeg") && (codec.includes("layer 3") || codec.includes("mp3"))) return "mp3";
  if (codec === "mp3") return "mp3";
  if (container.includes("mpeg") && codec.includes("layer iii")) return "mp3";
  if (container.includes("webm") || container.includes("matroska") || container.includes("ebml")) return "webm";
  if (container.includes("ogg")) return "ogg";
  if (container.includes("flac") || codec.includes("flac")) return "flac";
  if (container.includes("wave") || container.includes("wav") || codec.includes("pcm")) return "wav";
  if (container.includes("mp4") || container.includes("m4a") || container.includes("quicktime")) return "mp4";
  if (codec.includes("aac")) return "aac";
  return undefined;
}

export async function inspectAudioFile(
  file: Blob & { name?: string },
  hints?: { container?: string; codec?: string },
): Promise<AudioSourceInfo> {
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const id3Bytes = id3v2ByteLength(header);
  const probeStart = Math.min(id3Bytes, file.size);
  const probe = new Uint8Array(await file.slice(probeStart, Math.min(file.size, probeStart + 128 * 1024)).arrayBuffer());
  const frameOffset = findLayer3Frame(probe, probeStart);
  const fileName = file.name || "audio";

  if (frameOffset != null) return infoForKind("mp3", fileName, id3Bytes, frameOffset, hints?.container, hints?.codec);

  const magic = magicKind(probe);
  if (magic) {
    const detectedCodec = hints?.codec || ((magic === "webm" || magic === "ogg") && containsAscii(probe, "OpusHead") ? "Opus" : undefined);
    return infoForKind(magic, fileName, id3Bytes, undefined, hints?.container, detectedCodec);
  }

  const hinted = kindFromHints(hints?.container, hints?.codec) || "unknown";
  return infoForKind(hinted, fileName, id3Bytes, undefined, hints?.container, hints?.codec);
}

export async function validatePlayableMp3(blob: Blob): Promise<Mp3Validation> {
  const info = await inspectAudioFile(blob);
  if (!info.isMp3 || info.firstFrameOffset == null) {
    return {
      valid: false,
      id3Bytes: info.id3Bytes,
      reason: `No valid MPEG Layer III audio frames were found after the ID3 tag (${info.label}).`,
    };
  }
  if (info.id3Bytes >= blob.size) {
    return { valid: false, id3Bytes: info.id3Bytes, reason: "The ID3 tag consumes the entire output file." };
  }
  if (info.firstFrameOffset < info.id3Bytes) {
    return { valid: false, id3Bytes: info.id3Bytes, firstFrameOffset: info.firstFrameOffset, reason: "The MPEG audio stream overlaps the ID3 tag." };
  }
  return { valid: true, id3Bytes: info.id3Bytes, firstFrameOffset: info.firstFrameOffset };
}

export function playbackBlob(file: File, info: AudioSourceInfo) {
  if (!info.mimeType || info.mimeType === "application/octet-stream") return file;
  return file.slice(0, file.size, info.mimeType);
}
