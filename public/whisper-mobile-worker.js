let transcriber;
let loading;
let transformersModule;
let transformersLoading;

const TRANSFORMERS_SOURCES = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1",
  "https://esm.sh/@huggingface/transformers@3.8.1?bundle",
];

const WHISPER_MODELS = [
  "onnx-community/whisper-base",
  "Xenova/whisper-base",
];

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

async function loadTransformers(id) {
  if (transformersModule) return transformersModule;
  if (!transformersLoading) {
    transformersLoading = (async () => {
      let lastError;
      for (let index = 0; index < TRANSFORMERS_SOURCES.length; index += 1) {
        const source = TRANSFORMERS_SOURCES[index];
        try {
          post(id, "Loading on-device Whisper engine", undefined, index === 0 ? "Loading Transformers.js" : "Primary CDN unavailable; trying backup CDN");
          const module = await import(source);
          if (typeof module.pipeline !== "function") throw new Error("Transformers.js pipeline export was not found.");
          if (module.env) {
            module.env.allowLocalModels = false;
            module.env.useBrowserCache = true;
          }
          transformersModule = module;
          return module;
        } catch (error) {
          lastError = error;
        }
      }
      const detail = lastError instanceof Error ? lastError.message : String(lastError || "unknown error");
      throw new Error(`Could not load the free on-device Whisper engine (${detail}). First use needs internet access.`);
    })().finally(() => { transformersLoading = undefined; });
  }
  return transformersLoading;
}

async function createPipeline(id) {
  const { pipeline } = await loadTransformers(id);
  const hasWebGpu = Boolean(self.navigator && "gpu" in self.navigator);
  const attempts = [];
  if (hasWebGpu) attempts.push({ device: "webgpu", dtype: "q4", label: "WebGPU" });
  attempts.push({ device: undefined, dtype: "q8", label: "WASM/CPU" });

  let lastError;
  for (const attempt of attempts) {
    for (const model of WHISPER_MODELS) {
      try {
        post(id, "Downloading / loading Whisper Base", undefined, `${attempt.label} · ${model} · one-time model setup; cached by your browser`);
        const options = {
          dtype: attempt.dtype,
          progress_callback(info) {
            const fraction = typeof info.progress === "number" ? info.progress / 100 : undefined;
            post(id, "Downloading / loading Whisper Base", fraction, info.file || info.status || `${attempt.label} · model files are cached after first use`);
          },
        };
        if (attempt.device) options.device = attempt.device;
        const value = await pipeline("automatic-speech-recognition", model, options);
        return { value, engine: attempt.label, model };
      } catch (error) {
        lastError = error;
        post(id, "Whisper engine fallback", undefined, `${attempt.label} could not start with ${model}; trying another local configuration`);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError || "unknown error");
  throw new Error(`Whisper Base could not be loaded (${detail}). Check internet access for the first model download, then retry.`);
}

async function load(id) {
  if (transcriber) return transcriber;
  if (!loading) {
    loading = createPipeline(id).then((loaded) => {
      transcriber = loaded;
      return loaded;
    }).finally(() => { loading = undefined; });
  }
  return loading;
}

async function run(id, audio, language, retry = false) {
  const loaded = await load(id);
  const model = loaded.value;
  post(id, retry ? "Refining a weak transcription" : "Transcribing vocals on device", undefined,
    retry ? "Retrying with shorter chunks and automatic language detection" : `${loaded.engine} acceleration active`);
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
  return { text, segments, duration, quality, engine: loaded.engine, modelId: loaded.model };
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
        model: `Whisper Base · multilingual · on-device browser · ${best.modelId}`,
        qualityScore: best.quality,
        qualityLabel: best.quality < 0.55 ? "low" : "standard",
        engine: best.engine,
      },
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const friendly = /failed to fetch|networkerror|load failed/i.test(raw)
      ? "Whisper model download failed. First use needs internet access to the Transformers.js CDN and Hugging Face model files. Check your connection or private-DNS/ad-blocker settings, then retry."
      : raw;
    self.postMessage({ id, type: "error", error: friendly });
  }
});
