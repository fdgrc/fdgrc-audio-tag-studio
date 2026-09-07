import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

let transcriber;
let loading;

function post(id, stage, fraction, detail) {
  self.postMessage({ id, type: "progress", stage, fraction, detail });
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function nonLyricCue(value) {
  const normalized = cleanText(value).toLowerCase().replace(/^[\[\(♪\s]+|[\]\)♪\s]+$/g, "");
  return new Set(["music", "instrumental", "applause", "silence", "background music", "music playing", "foreign language"]).has(normalized);
}

function cleanChunks(chunks) {
  const seen = new Map();
  const output = [];
  for (const chunk of chunks || []) {
    const text = cleanText(chunk.text);
    if (!text || nonLyricCue(text)) continue;
    const key = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key) continue;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    if (count >= 3) continue;
    if (output.length && output[output.length - 1].text.toLowerCase() === text.toLowerCase()) continue;
    const timestamp = Array.isArray(chunk.timestamp) ? chunk.timestamp : [0, 0];
    output.push({
      start: Math.max(0, Number(timestamp[0]) || 0),
      end: Math.max(0, Number(timestamp[1] ?? timestamp[0]) || 0),
      text,
    });
  }
  return output;
}

function qualityScore(text, segments, durationSeconds) {
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

async function load(id) {
  if (transcriber) return transcriber;
  if (!loading) {
    const options = {
      dtype: "q8",
      progress_callback(info) {
        const fraction = typeof info.progress === "number" ? info.progress / 100 : undefined;
        post(id, "Downloading / loading Whisper Base", fraction, info.file || info.status || "One-time model setup; cached by your browser");
      },
    };
    if (self.navigator && "gpu" in self.navigator) {
      options.device = "webgpu";
      options.dtype = "q4";
    }
    loading = pipeline("automatic-speech-recognition", "Xenova/whisper-base", options).then((value) => {
      transcriber = value;
      return value;
    }).finally(() => { loading = undefined; });
  }
  return loading;
}

async function run(id, audio, language, retry = false) {
  const model = await load(id);
  post(id, retry ? "Refining a weak transcription" : "Transcribing vocals on device", undefined,
    retry ? "Retrying with shorter chunks and automatic language detection" : ((self.navigator && "gpu" in self.navigator) ? "WebGPU acceleration active" : "WASM/CPU mode"));
  const options = {
    return_timestamps: true,
    chunk_length_s: retry ? 20 : 30,
    stride_length_s: retry ? 4 : 5,
    task: "transcribe",
  };
  const normalized = String(language || "auto").toLowerCase();
  if (!retry && normalized && normalized !== "auto") options.language = normalized;
  const output = await model(audio, options);
  const segments = cleanChunks(output.chunks || []);
  const text = segments.length ? segments.map((item) => item.text).join("\n") : cleanText(output.text);
  const duration = audio.length / 16000;
  const quality = qualityScore(text, segments, duration);
  return { text, segments, duration, quality };
}

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type !== "transcribe" || !message.id) return;
  const id = message.id;
  try {
    const audio = message.audio instanceof Float32Array ? message.audio : new Float32Array(message.audio || []);
    if (!audio.length) throw new Error("No decoded audio was provided.");
    let best = await run(id, audio, message.language, false);
    if (best.quality < 0.55) {
      const retry = await run(id, audio, "auto", true);
      if (retry.quality > best.quality + 0.02 || retry.text.split(/\s+/).length > best.text.split(/\s+/).length + 8) best = retry;
    }
    if (!best.text || best.text.split(/\s+/).filter(Boolean).length < 3 || best.quality < 0.27) {
      throw new Error("No reliable vocal transcription was detected in this track.");
    }
    self.postMessage({
      id,
      type: "result",
      result: {
        text: best.text,
        language: message.language || "auto",
        duration: best.duration,
        segments: best.segments,
        model: "Whisper Base · multilingual · on-device browser",
        qualityScore: best.quality,
        qualityLabel: best.quality < 0.55 ? "low" : "standard",
        engine: (self.navigator && "gpu" in self.navigator) ? "WebGPU" : "WASM",
      },
    });
  } catch (error) {
    self.postMessage({ id, type: "error", error: error instanceof Error ? error.message : String(error) });
  }
});
