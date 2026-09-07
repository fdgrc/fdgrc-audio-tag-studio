import { NextRequest, NextResponse } from "next/server";
import { openAIFetch, upstreamError } from "@/lib/server/openai";
import type { TranscriptionResult, TranscriptSegment } from "@/types/audio";

type OpenAITranscription = {
  text?: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
};

function normalizeSegments(data: OpenAITranscription): TranscriptSegment[] {
  const segments = (data.segments || [])
    .map((segment) => ({
      start: Number(segment.start || 0),
      end: Number(segment.end || segment.start || 0),
      text: String(segment.text || "").trim(),
    }))
    .filter((segment) => segment.text);

  if (segments.length || !data.text?.trim()) return segments;
  return [{ start: 0, end: Math.max(0, Number(data.duration || 0)), text: data.text.trim() }];
}

export async function POST(request: NextRequest) {
  try {
    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach an MP3 or supported audio file to transcribe." }, { status: 400 });
    }

    const artist = String(incoming.get("artist") || "").trim();
    const title = String(incoming.get("title") || "").trim();
    const album = String(incoming.get("album") || "").trim();
    const language = String(incoming.get("language") || "").trim();
    const model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-transcribe";

    const upstream = new FormData();
    upstream.append("file", file, file.name || "audio.mp3");
    upstream.append("model", model);
    upstream.append("response_format", "verbose_json");
    upstream.append("timestamp_granularities[]", "segment");
    if (language) upstream.append("language", language);

    const context = [
      artist && `Artist: ${artist}`,
      title && `Title: ${title}`,
      album && `Album: ${album}`,
      "This audio is a song. Preserve repeated sung words, contractions, and intentional vocal phrases. Do not invent words when vocals are unclear.",
    ].filter(Boolean).join("\n");
    upstream.append("prompt", context);

    const response = await openAIFetch("/audio/transcriptions", { method: "POST", body: upstream });
    if (!response.ok) {
      return NextResponse.json({ error: await upstreamError(response) }, { status: response.status >= 500 ? 502 : response.status });
    }

    const data = await response.json() as OpenAITranscription;
    const result: TranscriptionResult = {
      text: String(data.text || "").trim(),
      language: data.language,
      duration: Number(data.duration || 0) || undefined,
      segments: normalizeSegments(data),
      model,
    };
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: message.includes("OPENAI_API_KEY") ? 503 : 502 });
  }
}
