import type { TranscriptionResult, TranscriptSegment } from "@/types/audio";

export type BrowserWhisperProgress = {
  stage: string;
  fraction?: number;
  detail?: string;
};

export type BrowserWhisperModel = "tiny-q5_1" | "base-q5_1";

export const BROWSER_WHISPER_MODELS: Array<{
  id: BrowserWhisperModel;
  label: string;
  sizeMb: number;
  bytes: number;
  description: string;
}> = [
  {
    id: "tiny-q5_1",
    label: "Tiny Q5 · 31 MB",
    sizeMb: 31,
    bytes: 32152673,
    description: "Fastest and safest for phones",
  },
  {
    id: "base-q5_1",
    label: "Base Q5 · 57 MB",
    sizeMb: 57,
    bytes: 59707625,
    description: "Better lyrics quality on newer phones",
  },
];

const SAMPLE_RATE = 16_000;
const DB_NAME = "AudioTagsWhisperCpp";
const DB_VERSION = 1;
const MODEL_STORE = "models";
const CACHE_VERSION = "whispercpp-v164";
const DEFAULT_MODEL: BrowserWhisperModel = "tiny-q5_1";

interface CachedModelRecord {
  key: string;
  modelId: BrowserWhisperModel;
  blob: Blob;
  bytes: number;
  source: "relay" | "manual";
  updatedAt: number;
}

interface WhisperSegment {
  timeStart: number;
  timeEnd: number;
  text: string;
  raw?: string;
}

interface WhisperServiceLike {
  checkWasmSupport(): Promise<boolean>;
  initModel(model: Uint8Array): Promise<void>;
  transcribe(
    audioData: Float32Array,
    callback?: (segment: WhisperSegment) => void,
    options?: { language?: string; threads?: number; translate?: boolean },
  ): Promise<{ segments?: WhisperSegment[]; transcribeDurationMs?: number }>;
}

let activeService: WhisperServiceLike | undefined;
let activeModel: BrowserWhisperModel | undefined;
let activeServiceLoading: Promise<{ service: WhisperServiceLike; model: BrowserWhisperModel }> | undefined;

function yieldToUi() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function modelKey(modelId: BrowserWhisperModel) {
  return `${CACHE_VERSION}:${modelId}`;
}

function openModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Could not open the Whisper model cache."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) db.createObjectStore(MODEL_STORE, { keyPath: "key" });
    };
  });
}

async function readCachedModel(modelId: BrowserWhisperModel): Promise<CachedModelRecord | undefined> {
  try {
    const db = await openModelDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, "readonly");
      const request = tx.objectStore(MODEL_STORE).get(modelKey(modelId));
      request.onsuccess = () => resolve(request.result as CachedModelRecord | undefined);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
  }
}

async function writeCachedModel(modelId: BrowserWhisperModel, blob: Blob, source: "relay" | "manual") {
  try {
    const db = await openModelDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, "readwrite");
      tx.objectStore(MODEL_STORE).put({
        key: modelKey(modelId),
        modelId,
        blob,
        bytes: blob.size,
        source,
        updatedAt: Date.now(),
      } satisfies CachedModelRecord);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Model caching is an optimization. Transcription can still continue in-memory.
  }
}

export async function isBrowserWhisperModelCached(modelId: BrowserWhisperModel = DEFAULT_MODEL) {
  return Boolean(await readCachedModel(modelId));
}

export async function probeBrowserWhisperModelDelivery(modelId: BrowserWhisperModel = DEFAULT_MODEL) {
  const cached = await readCachedModel(modelId);
  if (cached?.blob?.size) {
    return { ok: true, source: "device-cache", detail: `${modelId} · ${Math.round(cached.blob.size / 1048576)} MB cached on this device` };
  }

  const expected = BROWSER_WHISPER_MODELS.find((item) => item.id === modelId);
  if (!expected) return { ok: false, source: "unknown", detail: `Unknown model ${modelId}` };

  try {
    const response = await fetch(`/whisper-models/${encodeURIComponent(modelId)}/manifest.json`, { cache: "no-cache" });
    if (response.ok) {
      const manifest = await response.json() as { model?: string; bytes?: number; parts?: string[] };
      if (manifest.model === modelId && manifest.bytes === expected.bytes && Array.isArray(manifest.parts) && manifest.parts.length) {
        return { ok: true, source: "bundled-static", detail: `${modelId} · ${manifest.parts.length} same-origin model chunks ready` };
      }
    }
  } catch {}

  try {
    const response = await fetch(`/api/whisper-ggml?model=${encodeURIComponent(modelId)}`, {
      method: "HEAD",
      headers: { Accept: "application/octet-stream" },
      cache: "no-store",
    });
    if (response.ok) {
      return { ok: true, source: "free-relay", detail: `${modelId} · AudioTags fallback relay reachable` };
    }
    return { ok: false, source: "free-relay", detail: `${modelId} · relay returned HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, source: "free-relay", detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function clearBrowserWhisperModel(modelId?: BrowserWhisperModel) {
  try {
    const db = await openModelDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, "readwrite");
      const store = tx.objectStore(MODEL_STORE);
      if (modelId) store.delete(modelKey(modelId));
      else store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore cache cleanup errors.
  }
  if (!modelId || activeModel === modelId) {
    activeService = undefined;
    activeModel = undefined;
    activeServiceLoading = undefined;
  }
}

export async function installBrowserWhisperModelFile(
  file: File,
  modelId: BrowserWhisperModel = DEFAULT_MODEL,
  onProgress?: (progress: BrowserWhisperProgress) => void,
) {
  if (!/\.bin$/i.test(file.name)) throw new Error("Choose a whisper.cpp GGML .bin model file.");
  if (file.size < 20 * 1024 * 1024 || file.size > 90 * 1024 * 1024) {
    throw new Error("That model file size does not look like the supported Tiny/Base Q5 whisper.cpp model.");
  }
  onProgress?.({ stage: "Installing local Whisper model", fraction: 0, detail: file.name });
  const blob = file.slice(0, file.size, "application/octet-stream");
  await writeCachedModel(modelId, blob, "manual");
  activeService = undefined;
  activeModel = undefined;
  activeServiceLoading = undefined;
  onProgress?.({ stage: "Local Whisper model installed", fraction: 1, detail: `${Math.round(file.size / 1048576)} MB cached on this device` });
}

/** Decode a browser-supported audio file and produce the 16 kHz mono Float32 waveform whisper.cpp expects. */
export async function decodeForBrowserWhisper(file: File, onProgress?: (progress: BrowserWhisperProgress) => void) {
  onProgress?.({ stage: "Preparing track audio", fraction: 0, detail: "Decoding a temporary copy on this device" });
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error("This browser does not provide the Web Audio API required for on-device transcription.");

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > 15 * 60) throw new Error("On-device transcription currently supports tracks up to 15 minutes.");
    const outputLength = Math.max(1, Math.floor(decoded.duration * SAMPLE_RATE));
    const output = new Float32Array(outputLength);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    const ratio = decoded.sampleRate / SAMPLE_RATE;
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

    // Lightweight vocal-focused normalization adapted from the native SynthIQ Auto Lyrics flow.
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
  const isolated = typeof window !== "undefined" && window.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined";
  return {
    supported: typeof window !== "undefined" && Boolean(AudioContextClass) && typeof WebAssembly !== "undefined" && isolated,
    isolated,
    webgpu: false,
  };
}

async function fetchStaticBundledModel(
  modelId: BrowserWhisperModel,
  expectedBytes: number,
  onProgress?: (progress: BrowserWhisperProgress) => void,
): Promise<Blob | undefined> {
  const manifestUrl = `/whisper-models/${encodeURIComponent(modelId)}/manifest.json`;
  let manifestResponse: Response;
  try {
    manifestResponse = await fetch(manifestUrl, { cache: "no-cache" });
  } catch {
    return undefined;
  }
  if (!manifestResponse.ok) return undefined;

  let manifest: { model?: string; bytes?: number; parts?: string[] };
  try {
    manifest = await manifestResponse.json() as { model?: string; bytes?: number; parts?: string[] };
  } catch {
    return undefined;
  }
  if (manifest.model !== modelId || manifest.bytes !== expectedBytes || !Array.isArray(manifest.parts) || !manifest.parts.length) {
    return undefined;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (let index = 0; index < manifest.parts.length; index += 1) {
    const part = manifest.parts[index];
    if (!/^part-\d{3}\.bin$/.test(part)) return undefined;
    const response = await fetch(`/whisper-models/${encodeURIComponent(modelId)}/${part}`, { cache: "force-cache" });
    if (!response.ok) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    chunks.push(bytes);
    loaded += bytes.byteLength;
    onProgress?.({
      stage: "Loading bundled whisper.cpp model",
      fraction: Math.min(0.995, loaded / expectedBytes),
      detail: `${modelId} · ${Math.round(loaded / 1048576)}/${Math.round(expectedBytes / 1048576)} MB · from this AudioTags site`,
    });
    await yieldToUi();
  }

  if (loaded !== expectedBytes) return undefined;
  return new Blob(chunks, { type: "application/octet-stream" });
}

async function fetchRelayModel(
  modelId: BrowserWhisperModel,
  expectedBytes: number,
  onProgress?: (progress: BrowserWhisperProgress) => void,
) {
  const response = await fetch(`/api/whisper-ggml?model=${encodeURIComponent(modelId)}`, {
    headers: { Accept: "application/octet-stream" },
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) detail = body.error;
    } catch {}
    throw new Error(detail);
  }

  const totalHeader = Number(response.headers.get("content-length") || 0);
  const total = totalHeader > 0 ? totalHeader : expectedBytes;
  const reader = response.body?.getReader();
  if (!reader) return response.blob();

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({
      stage: "Downloading free whisper.cpp model",
      fraction: total > 0 ? Math.min(0.995, loaded / total) : undefined,
      detail: `${modelId} · ${Math.round(loaded / 1048576)}/${Math.round(total / 1048576)} MB · free fallback relay`,
    });
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

async function fetchModelBlob(modelId: BrowserWhisperModel, onProgress?: (progress: BrowserWhisperProgress) => void) {
  const cached = await readCachedModel(modelId);
  if (cached?.blob?.size) {
    onProgress?.({ stage: "Loading whisper.cpp model", fraction: 1, detail: `${modelId} · cached on this device` });
    return cached.blob;
  }

  const expected = BROWSER_WHISPER_MODELS.find((item) => item.id === modelId);
  if (!expected) throw new Error(`Unknown on-device Whisper model: ${modelId}`);

  // Preferred path: Cloudflare serves build-prepared chunks as normal same-origin static assets.
  // This avoids a large Worker response and avoids all third-party requests from the phone.
  onProgress?.({ stage: "Checking bundled whisper.cpp model", detail: `${modelId} · your AudioTags site` });
  const bundled = await fetchStaticBundledModel(modelId, expected.bytes, onProgress);
  if (bundled?.size === expected.bytes) {
    await writeCachedModel(modelId, bundled, "relay");
    onProgress?.({ stage: "Whisper model ready", fraction: 1, detail: `${modelId} · bundled with this AudioTags deploy` });
    return bundled;
  }

  // Fallback: same-origin Worker relay to public/free whisper.cpp mirrors.
  // The browser still talks only to the AudioTags origin.
  onProgress?.({ stage: "Bundled model unavailable", detail: "Trying the free AudioTags model relay" });
  try {
    const blob = await fetchRelayModel(modelId, expected.bytes, onProgress);
    if (blob.size !== expected.bytes) {
      throw new Error(`incomplete model (${Math.round(blob.size / 1048576)} MB received, expected ${Math.round(expected.bytes / 1048576)} MB)`);
    }
    await writeCachedModel(modelId, blob, "relay");
    onProgress?.({ stage: "Whisper model downloaded", fraction: 1, detail: `${Math.round(blob.size / 1048576)} MB cached on this device` });
    return blob;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`AudioTags could not obtain the free ${modelId} whisper.cpp model (${detail}). Use “Import model .bin” once as the completely offline fallback.`);
  }
}

async function ensureService(modelId: BrowserWhisperModel, onProgress?: (progress: BrowserWhisperProgress) => void) {
  if (activeService && activeModel === modelId) return { service: activeService, model: modelId };
  if (activeServiceLoading && activeModel === modelId) return activeServiceLoading;

  activeModel = modelId;
  activeServiceLoading = (async () => {
    onProgress?.({ stage: "Starting whisper.cpp", detail: "Loading the browser WebAssembly engine bundled with AudioTags" });
    const whisperLib = await import("@timur00kh/whisper.wasm");
    const service = new whisperLib.WhisperWasmService({ logLevel: 3 }) as unknown as WhisperServiceLike;
    const wasmSupported = await service.checkWasmSupport();
    if (!wasmSupported) throw new Error("This browser does not support the WASM SIMD instructions required by whisper.cpp.");
    const blob = await fetchModelBlob(modelId, onProgress);
    onProgress?.({ stage: "Initializing whisper.cpp", detail: `${modelId} · local WebAssembly inference` });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await service.initModel(bytes);
    activeService = service;
    activeModel = modelId;
    onProgress?.({ stage: "whisper.cpp ready", fraction: 1, detail: `${modelId} · no paid API` });
    return { service, model: modelId };
  })().finally(() => {
    activeServiceLoading = undefined;
  });
  return activeServiceLoading;
}

function cleanText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function nonLyricCue(value: string) {
  const normalized = cleanText(value).toLowerCase().replace(/^[\[\(♪\s]+|[\]\)♪\s]+$/g, "");
  return new Set([
    "music", "instrumental", "applause", "silence", "background music", "music playing",
    "foreign language", "foreign", "singing", "vocalizing", "humming",
  ]).has(normalized);
}

function cleanSegments(segments: TranscriptSegment[]) {
  const seen = new Map<string, number>();
  const output: TranscriptSegment[] = [];
  for (const segment of segments) {
    const text = cleanText(segment.text);
    if (!text || nonLyricCue(text)) continue;
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key) continue;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    if (count >= 3) continue;
    if (output.length && output[output.length - 1].text.toLowerCase() === text.toLowerCase()) continue;
    output.push({
      start: Math.max(0, Number(segment.start) || 0),
      end: Math.max(Number(segment.start) || 0, Number(segment.end) || Number(segment.start) || 0),
      text,
    });
  }
  return output;
}

function qualityScore(text: string, segments: TranscriptSegment[], durationSeconds: number) {
  const words = String(text || "").match(/[\p{L}\p{N}']+/gu) || [];
  const lines = segments.map((item) => item.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()).filter(Boolean);
  const uniqueRatio = lines.length ? new Set(lines).size / lines.length : 0;
  const visible = Math.max(1, [...text].filter((char) => !/\s/.test(char)).length);
  const lexical = [...text].filter((char) => /[\p{L}\p{N}]/u.test(char)).length / visible;
  const activeSeconds = segments.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
  const coverage = durationSeconds > 0 ? Math.min(1, activeSeconds / durationSeconds) : 0;
  let quality = 0.15;
  quality += Math.min(words.length, 80) / 80 * 0.30;
  quality += uniqueRatio * 0.22;
  quality += Math.max(0, Math.min(1, lexical)) * 0.20;
  quality += Math.min(coverage, 0.65) / 0.65 * 0.13;
  if (words.length < 6) quality -= 0.18;
  if (uniqueRatio < 0.45 && lines.length >= 4) quality -= 0.15;
  if (lexical < 0.55) quality -= 0.12;
  return Math.max(0, Math.min(1, quality));
}

async function runWhisperCpp(
  service: WhisperServiceLike,
  audio: Float32Array,
  language: string,
  modelId: BrowserWhisperModel,
  onProgress?: (progress: BrowserWhisperProgress) => void,
  chunkSeconds = 45,
) {
  const duration = audio.length / SAMPLE_RATE;
  const chunkSamples = SAMPLE_RATE * chunkSeconds;
  const segments: TranscriptSegment[] = [];
  const chunks = Math.max(1, Math.ceil(audio.length / chunkSamples));
  const threads = Math.max(1, Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 1)));

  for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex += 1) {
    const startSample = chunkIndex * chunkSamples;
    const endSample = Math.min(audio.length, startSample + chunkSamples);
    const chunk = audio.subarray(startSample, endSample);
    const offsetSeconds = startSample / SAMPLE_RATE;
    onProgress?.({
      stage: "Transcribing locally with whisper.cpp",
      fraction: chunkIndex / chunks,
      detail: `Part ${chunkIndex + 1}/${chunks} · ${modelId} · ${threads} CPU threads`,
    });

    await service.transcribe(chunk, (item) => {
      const start = offsetSeconds + Math.max(0, Number(item.timeStart) || 0) / 1000;
      const end = offsetSeconds + Math.max(Number(item.timeStart) || 0, Number(item.timeEnd) || 0) / 1000;
      const text = cleanText(item.text);
      if (text) segments.push({ start, end, text });
      onProgress?.({
        stage: "Transcribing locally with whisper.cpp",
        fraction: Math.min(0.995, (offsetSeconds + Math.max(0, Number(item.timeEnd) || 0) / 1000) / Math.max(duration, 1)),
        detail: `Part ${chunkIndex + 1}/${chunks} · audio never uploaded`,
      });
    }, {
      language: language || "auto",
      threads,
      translate: false,
    });
    await yieldToUi();
  }

  const cleaned = cleanSegments(segments);
  const text = cleaned.map((item) => item.text).join("\n");
  const quality = qualityScore(text, cleaned, duration);
  return { text, segments: cleaned, duration, quality };
}

export async function transcribeInBrowser(
  file: File,
  language = "auto",
  modelId: BrowserWhisperModel = DEFAULT_MODEL,
  onProgress?: (progress: BrowserWhisperProgress) => void,
): Promise<TranscriptionResult & { qualityScore?: number; qualityLabel?: string; engine?: string }> {
  const support = browserWhisperSupport();
  if (!support.supported) {
    if (!support.isolated) throw new Error("On-device whisper.cpp needs cross-origin isolation. V1.6.4 adds the required Cloudflare headers; fully close/reopen the app after deployment and retry.");
    throw new Error("On-device whisper.cpp is not supported by this browser.");
  }

  const audio = await decodeForBrowserWhisper(file, onProgress);
  let loaded;
  try {
    loaded = await ensureService(modelId, onProgress);
  } catch (error) {
    // Base uses more memory. If it cannot initialize, automatically fall back to Tiny.
    if (modelId === "base-q5_1") {
      onProgress?.({ stage: "Using mobile-safe fallback", detail: "Base Q5 could not start; trying Tiny Q5" });
      loaded = await ensureService("tiny-q5_1", onProgress);
      modelId = "tiny-q5_1";
    } else {
      throw error;
    }
  }

  let best = await runWhisperCpp(loaded.service, audio, language, modelId, onProgress, 45);
  if (best.quality < 0.34 && best.text.split(/\s+/).filter(Boolean).length < 18) {
    onProgress?.({ stage: "Refining a weak transcription", detail: "Retrying with shorter chunks and automatic language detection" });
    const retry = await runWhisperCpp(loaded.service, audio, "auto", modelId, onProgress, 30);
    if (retry.quality > best.quality + 0.02 || retry.text.split(/\s+/).length > best.text.split(/\s+/).length + 8) best = retry;
  }

  if (!best.text || best.text.split(/\s+/).filter(Boolean).length < 3 || best.quality < 0.20) {
    throw new Error("No reliable vocal transcription was detected. Try Base Q5 for better quality, or use the desktop WhisperHallu helper for difficult mixes.");
  }

  onProgress?.({ stage: "Transcription ready", fraction: 1, detail: `${modelId} · local whisper.cpp` });
  return {
    text: best.text,
    language: language || "auto",
    duration: best.duration,
    segments: best.segments,
    model: `whisper.cpp · ${modelId} · on-device`,
    qualityScore: best.quality,
    qualityLabel: best.quality < 0.55 ? "low" : "standard",
    engine: "whisper.cpp WASM",
  };
}
