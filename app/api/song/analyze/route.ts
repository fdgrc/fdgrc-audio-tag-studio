import { NextRequest, NextResponse } from "next/server";
import { openAIFetch, responseOutputText, upstreamError } from "@/lib/server/openai";
import type { SongAnalysis } from "@/types/audio";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    mood: { type: "string" },
    energy: { type: "string", enum: ["low", "medium", "high", "dynamic"] },
    themes: { type: "array", items: { type: "string" }, maxItems: 8 },
    imagery: { type: "array", items: { type: "string" }, maxItems: 8 },
    palette: { type: "array", items: { type: "string" }, maxItems: 6 },
    concepts: {
      type: "array",
      minItems: 3,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["id", "title", "description", "prompt"],
      },
    },
  },
  required: ["summary", "mood", "energy", "themes", "imagery", "palette", "concepts"],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { artist?: string; title?: string; album?: string; lyrics?: string };
    const artist = String(body.artist || "").trim();
    const title = String(body.title || "").trim();
    const album = String(body.album || "").trim();
    const lyrics = String(body.lyrics || "").trim().slice(0, 14000);
    if (!artist && !title && !lyrics) {
      return NextResponse.json({ error: "Add song metadata or lyrics before analyzing the song." }, { status: 400 });
    }

    const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.6-luna";
    const input = [
      `Artist: ${artist || "Unknown"}`,
      `Title: ${title || "Untitled"}`,
      `Album: ${album || "Unknown"}`,
      "Lyrics/transcript follows. Analyze it; do not quote or reproduce lyrics in the result.",
      lyrics || "(No lyrics supplied. Infer only cautiously from the metadata.)",
    ].join("\n\n");

    const response = await openAIFetch("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "low" },
        instructions: [
          "You are an album-art creative director for a music metadata editor.",
          "Analyze the song at a high level: mood, themes, imagery, energy, and visual palette.",
          "Create original visual concepts. Do not imitate a named artist, photographer, designer, existing album cover, logo, or trademarked visual identity.",
          "Do not quote lyrics. Concepts should work as square cover art and remain visually clear at thumbnail size.",
          "Image prompts should describe composition, lighting, atmosphere, medium, and palette. Do not include instructions to copy existing cover artwork.",
        ].join(" "),
        input,
        text: {
          verbosity: "low",
          format: { type: "json_schema", name: "song_art_direction", strict: true, schema },
        },
      }),
    });
    if (!response.ok) return NextResponse.json({ error: await upstreamError(response) }, { status: response.status >= 500 ? 502 : response.status });

    const data = await response.json();
    const output = responseOutputText(data);
    if (!output) throw new Error("The song analysis response did not contain usable text.");
    const analysis = JSON.parse(output) as SongAnalysis;
    return NextResponse.json({ analysis, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Song analysis failed.";
    return NextResponse.json({ error: message }, { status: message.includes("OPENAI_API_KEY") ? 503 : 502 });
  }
}
