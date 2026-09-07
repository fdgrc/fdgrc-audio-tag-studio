import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MODELS = [
  {
    id: "tiny-q5_1",
    file: "ggml-tiny-q5_1.bin",
    bytes: 32152673,
    sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
    sources: [
      "https://github.com/w3xgroup/taskurio-models/releases/download/whisper-models-v1/ggml-tiny-q5_1.bin",
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
      "https://ggml.ggerganov.com/ggml-model-whisper-tiny-q5_1.bin",
    ],
  },
];

if (process.env.AUDIOTAGS_BUNDLE_BASE_WHISPER === "1") {
  MODELS.push({
    id: "base-q5_1",
    file: "ggml-base-q5_1.bin",
    bytes: 59707625,
    sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    sources: [
      "https://github.com/w3xgroup/taskurio-models/releases/download/whisper-models-v1/ggml-base-q5_1.bin",
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
      "https://ggml.ggerganov.com/ggml-model-whisper-base-q5_1.bin",
    ],
  });
}

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, "public", "whisper-models");
const CHUNK_BYTES = 8 * 1024 * 1024; // Cloudflare static assets cap each file at 25 MiB.

async function existingIsValid(model, outDir) {
  try {
    const manifest = JSON.parse(await readFile(path.join(outDir, "manifest.json"), "utf8"));
    if (manifest.sha256 !== model.sha256 || manifest.bytes !== model.bytes || !Array.isArray(manifest.parts)) return false;
    let total = 0;
    for (const part of manifest.parts) total += (await stat(path.join(outDir, part))).size;
    return total === model.bytes;
  } catch {
    return false;
  }
}

async function downloadModel(model) {
  let lastError;
  for (const source of model.sources) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      console.log(`[AudioTags] Downloading ${model.id} from ${new URL(source).hostname}...`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      const response = await fetch(source, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "AudioTags-build/1.6.5" },
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== model.bytes) throw new Error(`size mismatch: ${bytes.byteLength} != ${model.bytes}`);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== model.sha256) throw new Error(`SHA-256 mismatch: ${digest}`);
      return { bytes, source };
    } catch (error) {
      lastError = error;
      console.warn(`[AudioTags] ${model.id} source failed (attempt ${attempt}/2): ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    }
  }
  throw lastError || new Error("all model sources failed");
}

async function prepareModel(model) {
  const outDir = path.join(OUT_ROOT, model.id);
  if (await existingIsValid(model, outDir)) {
    console.log(`[AudioTags] ${model.id} static model chunks already prepared.`);
    return;
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const { bytes, source } = await downloadModel(model);
  const parts = [];
  for (let offset = 0, index = 0; offset < bytes.byteLength; offset += CHUNK_BYTES, index += 1) {
    const name = `part-${String(index).padStart(3, "0")}.bin`;
    const part = bytes.subarray(offset, Math.min(bytes.byteLength, offset + CHUNK_BYTES));
    await writeFile(path.join(outDir, name), part);
    parts.push(name);
  }
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
    version: 1,
    model: model.id,
    file: model.file,
    bytes: model.bytes,
    sha256: model.sha256,
    chunkBytes: CHUNK_BYTES,
    parts,
    source,
    preparedAt: new Date().toISOString(),
  }, null, 2) + "\n");
  console.log(`[AudioTags] Prepared ${model.id}: ${parts.length} static chunks (${Math.round(model.bytes / 1048576)} MB).`);
}

await mkdir(OUT_ROOT, { recursive: true });
for (const model of MODELS) {
  try {
    await prepareModel(model);
  } catch (error) {
    // Do not make the whole web app undeployable if all free model hosts are temporarily down.
    // Runtime relay + manual .bin import remain available as fallbacks.
    console.warn(`[AudioTags] WARNING: could not prebundle ${model.id}: ${error instanceof Error ? error.message : String(error)}`);
    console.warn("[AudioTags] Build will continue; AudioTags will use its runtime model relay/manual import fallback.");
  }
}
