export type Mp3TranscodeProgress = {
  stage: string;
  fraction?: number;
  detail?: string;
};

type ProgressCallback = (progress: Mp3TranscodeProgress) => void;

type AudioContextConstructor = typeof AudioContext;
type OfflineAudioContextConstructor = typeof OfflineAudioContext;

function audioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const browserWindow = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext || browserWindow.webkitAudioContext;
}

function offlineAudioContextConstructor(): OfflineAudioContextConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const browserWindow = window as typeof window & { webkitOfflineAudioContext?: OfflineAudioContextConstructor };
  return window.OfflineAudioContext || browserWindow.webkitOfflineAudioContext;
}

const MP3_SAMPLE_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);

async function normalizeBuffer(input: AudioBuffer) {
  const channels = Math.min(2, Math.max(1, input.numberOfChannels));
  const sampleRate = MP3_SAMPLE_RATES.has(input.sampleRate) ? input.sampleRate : 44100;
  if (channels === input.numberOfChannels && sampleRate === input.sampleRate) return input;

  const OfflineContext = offlineAudioContextConstructor();
  if (!OfflineContext) throw new Error("This browser cannot resample audio locally.");

  const frames = Math.max(1, Math.ceil(input.duration * sampleRate));
  const offline = new OfflineContext(channels, frames, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = input;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

function copyBytes(value: Uint8Array) {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

export async function transcodeBrowserAudioToMp3(
  file: File,
  onProgress?: ProgressCallback,
  bitrate = 192,
  skipLeadingBytes = 0,
) {
  const Context = audioContextConstructor();
  if (!Context) throw new Error("This browser does not provide Web Audio decoding, so it cannot convert this source to MP3 locally.");

  onProgress?.({ stage: "Decoding source audio", fraction: 0.04, detail: "Local browser only" });
  const context = new Context();
  let sourceBytes: ArrayBuffer | undefined = await file.slice(Math.max(0, skipLeadingBytes)).arrayBuffer();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(sourceBytes.slice(0));
  } catch {
    throw new Error("This browser cannot decode the source audio container. The app stopped before writing a broken MP3.");
  } finally {
    sourceBytes = undefined;
    await context.close().catch(() => undefined);
  }

  onProgress?.({ stage: "Preparing PCM audio", fraction: 0.12, detail: `${decoded.sampleRate} Hz · ${decoded.numberOfChannels} ch` });
  const normalized = await normalizeBuffer(decoded);
  const channels = Math.min(2, Math.max(1, normalized.numberOfChannels));

  onProgress?.({ stage: "Loading local MP3 encoder", fraction: 0.16, detail: "No upload · no paid API" });
  const { createMp3Encoder } = await import("wasm-media-encoders");
  const encoder = await createMp3Encoder();
  encoder.configure({
    sampleRate: normalized.sampleRate,
    channels,
    bitrate,
  });

  const channelData = Array.from({ length: channels }, (_, index) => normalized.getChannelData(index));
  const totalFrames = normalized.length;
  const blockSize = 16384;
  const parts: Uint8Array[] = [];

  for (let offset = 0; offset < totalFrames; offset += blockSize) {
    const end = Math.min(totalFrames, offset + blockSize);
    const chunk = encoder.encode(channelData.map((channel) => channel.subarray(offset, end)));
    if (chunk.byteLength) parts.push(copyBytes(chunk));

    if ((offset / blockSize) % 24 === 0) {
      const fraction = 0.18 + 0.75 * (end / totalFrames);
      onProgress?.({ stage: "Converting to real MP3", fraction, detail: `${Math.round(bitrate)} kbps · ${(end / normalized.sampleRate).toFixed(0)}s / ${normalized.duration.toFixed(0)}s` });
      await yieldToBrowser();
    }
  }

  const tail = encoder.finalize();
  if (tail.byteLength) parts.push(copyBytes(tail));
  onProgress?.({ stage: "MP3 conversion complete", fraction: 0.94, detail: `${Math.round(bitrate)} kbps` });
  return new Blob(parts, { type: "audio/mpeg" });
}
