import { NextRequest, NextResponse } from "next/server";

const MODELS = {
  "tiny-q5_1": {
    file: "ggml-tiny-q5_1.bin",
    bytes: 32152673,
    sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
  },
  "base-q5_1": {
    file: "ggml-base-q5_1.bin",
    bytes: 59707625,
    sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
  },
} as const;

type ModelId = keyof typeof MODELS;

function modelFromRequest(request: NextRequest): ModelId | undefined {
  const raw = request.nextUrl.searchParams.get("model") || "";
  return raw in MODELS ? raw as ModelId : undefined;
}

function upstreams(file: string) {
  return [
    `https://github.com/w3xgroup/taskurio-models/releases/download/whisper-models-v1/${file}`,
    `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${file}`,
  ];
}

function relayHeaders(source: Response, modelId: ModelId, sourceName: string) {
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-AudioTags-Whisper-Source", sourceName);
  headers.set("X-AudioTags-Model", modelId);
  headers.set("X-AudioTags-Model-SHA256", MODELS[modelId].sha256);
  return headers;
}

async function relay(request: NextRequest, headOnly = false) {
  const modelId = modelFromRequest(request);
  if (!modelId) {
    return NextResponse.json(
      { error: "Unknown whisper.cpp model. Use ?model=tiny-q5_1 or ?model=base-q5_1." },
      { status: 400 },
    );
  }

  const spec = MODELS[modelId];
  const range = request.headers.get("range");
  let lastError = "No free model source responded.";

  for (const [index, url] of upstreams(spec.file).entries()) {
    try {
      const upstreamHeaders = new Headers({ Accept: "application/octet-stream,*/*" });
      if (range) upstreamHeaders.set("Range", range);
      const response = await fetch(url, {
        method: headOnly ? "HEAD" : "GET",
        redirect: "follow",
        headers: upstreamHeaders,
      });
      if (!response.ok && response.status !== 206) {
        lastError = `Source ${index + 1} returned HTTP ${response.status}.`;
        continue;
      }
      const headers = relayHeaders(
        response,
        modelId,
        index === 0 ? "GitHub release mirror" : "whisper.cpp official model host",
      );
      if (!range && !headers.has("Content-Length")) headers.set("Content-Length", String(spec.bytes));
      return new NextResponse(headOnly ? null : response.body, {
        status: response.status === 206 ? 206 : 200,
        headers,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json({
    error: `All free whisper.cpp model sources are temporarily unavailable. ${lastError}`,
    manualFile: spec.file,
    expectedBytes: spec.bytes,
  }, { status: 502 });
}

export async function GET(request: NextRequest) {
  return relay(request, false);
}

export async function HEAD(request: NextRequest) {
  return relay(request, true);
}
