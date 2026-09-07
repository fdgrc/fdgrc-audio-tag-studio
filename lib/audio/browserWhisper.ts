import type { TranscriptionResult, TranscriptSegment } from "@/types/audio";

export type BrowserWhisperProgress = {
  stage: string;
  fraction?: number;
  detail?: string;
};

type WorkerResult = {
  id: string;
  type: "result";
  result: TranscriptionResult & { qualityScore?: number; qualityLabel?: string; engine?: string };
};

type WorkerError = { id: string; type: "error"; error: string };
type WorkerProgress = { id: string; type: "progress"; stage: string; fraction?: number; detail?: string };

type WorkerReply = WorkerResult | WorkerError | WorkerProgress;

let worker: Worker | undefined;
let sequence = 0;

function getWorker() {
  if (!worker) worker = new Worker("/whisper-mobile-worker.js", { type: "module" });
  return worker;
}

function yieldToUi() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/** Decode a browser-supported audio file and produce the 16 kHz mono Float32 waveform Whisper expects. */
export async function decodeForBrowserWhisper(file: File, onProgress?: (progress: BrowserWhisperProgress) => void) {
  onProgress?.({ stage: "Preparing track audio", fraction: 0, detail: "Decoding a temporary copy on this device" });
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not provide the Web Audio API required for on-device transcription.");

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > 15 * 60) throw new Error("On-device transcription currently supports tracks up to 15 minutes.");
    const targetRate = 16_000;
    const outputLength = Math.max(1, Math.floor(decoded.duration * targetRate));
    const output = new Float32Array(outputLength);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const ratio = decoded.sampleRate / targetRate;
    const block = 250_000;

    for (let start = 0; start < outputLength; start += block) {
      const end = Math.min(outputLength, start + block);
      for (let i = start; i < end; i += 1) {
        const sourcePos = i * ratio;
        const a = Math.floor(sourcePos);
        const b = Math.min(a + 1, decoded.length - 1);
        const mix = sourcePos - a;
        let sample = 0;
        for (const channel of channels) sample += channel[a] * (1 - mix) + channel[b] * mix;
        output[i] = sample / channels.length;
      }
      onProgress?.({ stage: "Preparing track audio", fraction: end / outputLength, detail: "Converting to 16 kHz mono" });
      await yieldToUi();
    }

    // Adapt the lightweight vocal-focused normalization used by the native SynthIQ engine.
    let peak = 0;
    let previousInput = 0;
    let previousOutput = 0;
    const alpha = 0.9622;
    for (let i = 0; i < output.length; i += 1) {
      const sample = output[i];
      const filtered = alpha * (previousOutput + sample - previousInput);
      previousInput = sample;
      previousOutput = filtered;
      output[i] = filtered;
      peak = Math.max(peak, Math.abs(filtered));
    }
    if (peak > 0.001) {
      const gain = Math.min(5, Math.max(0.55, 0.88 / peak));
      for (let i = 0; i < output.length; i += 1) output[i] = Math.max(-1, Math.min(1, output[i] * gain));
    }
    onProgress?.({ stage: "Track ready", fraction: 1, detail: "Audio stays on this device" });
    return output;
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function browserWhisperSupport() {
  const AudioContextClass = typeof window !== "undefined" && (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return {
    supported: typeof window !== "undefined" && typeof Worker !== "undefined" && Boolean(AudioContextClass) && typeof WebAssembly !== "undefined",
    webgpu: typeof navigator !== "undefined" && "gpu" in navigator,
  };
}

export async function transcribeInBrowser(
  file: File,
  language = "auto",
  onProgress?: (progress: BrowserWhisperProgress) => void,
): Promise<TranscriptionResult & { qualityScore?: number; qualityLabel?: string; engine?: string }> {
  const support = browserWhisperSupport();
  if (!support.supported) throw new Error("On-device Whisper is not supported by this browser.");
  const audio = await decodeForBrowserWhisper(file, onProgress);
  const id = `whisper-${Date.now()}-${sequence += 1}`;
  const currentWorker = getWorker();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      currentWorker.removeEventListener("message", handler);
      currentWorker.removeEventListener("error", workerError);
      currentWorker.removeEventListener("messageerror", workerMessageError);
    };
    const workerError = (event: ErrorEvent) => {
      cleanup();
      const detail = event.message || "The mobile Whisper worker could not start.";
      reject(new Error(/failed to fetch|networkerror|load failed/i.test(detail)
        ? "The on-device Whisper engine could not be downloaded. First use needs internet access; retry after checking your connection."
        : detail));
    };
    const workerMessageError = () => {
      cleanup();
      reject(new Error("The browser could not pass audio to the on-device Whisper worker. Try closing other tabs and retrying."));
    };
    const handler = (event: MessageEvent<WorkerReply>) => {
      const message = event.data;
      if (!message || message.id !== id) return;
      if (message.type === "progress") {
        onProgress?.({ stage: message.stage, fraction: message.fraction, detail: message.detail });
        return;
      }
      cleanup();
      if (message.type === "error") reject(new Error(message.error));
      else resolve({
        ...message.result,
        segments: (message.result.segments || []).map((segment: TranscriptSegment) => ({
          start: Number(segment.start) || 0,
          end: Number(segment.end) || Number(segment.start) || 0,
          text: String(segment.text || "").trim(),
        })).filter((segment: TranscriptSegment) => segment.text),
      });
    };
    currentWorker.addEventListener("message", handler);
    currentWorker.addEventListener("error", workerError);
    currentWorker.addEventListener("messageerror", workerMessageError);
    currentWorker.postMessage({ id, type: "transcribe", audio, language }, [audio.buffer]);
  });
}
