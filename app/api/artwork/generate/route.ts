import { NextRequest, NextResponse } from "next/server";
import { openAIFetch, upstreamError } from "@/lib/server/openai";

type ImageResponse = {
  data?: Array<{ b64_json?: string }>;
  output_format?: string;
  size?: string;
  quality?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      prompt?: string;
      artist?: string;
      title?: string;
      album?: string;
      includeText?: boolean;
      direction?: string;
    };
    const concept = String(body.prompt || "").trim().slice(0, 12000);
    if (!concept) return NextResponse.json({ error: "Choose an art concept first." }, { status: 400 });

    const artist = String(body.artist || "").trim();
    const title = String(body.title || "").trim();
    const album = String(body.album || "").trim();
    const direction = String(body.direction || "").trim().slice(0, 2000);
    const includeText = Boolean(body.includeText);
    const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

    const typography = includeText
      ? `Include clean, legible cover typography with the exact song title “${title || "Untitled"}”${artist ? ` and artist name “${artist}”` : ""}. Keep typography secondary to the image.`
      : "No typography, logos, watermarks, labels, or written text.";

    const prompt = [
      "Create an original square song/album cover image. It must not reproduce or closely mimic any existing release artwork or branded visual identity.",
      concept,
      direction ? `Additional direction: ${direction}` : "",
      `Metadata context only: artist ${artist || "unknown"}; title ${title || "untitled"}; album ${album || "unknown"}.`,
      typography,
      "Strong central composition, production-ready cover art, visually distinct at thumbnail size, no border or mockup frame.",
    ].filter(Boolean).join("\n");

    const response = await openAIFetch("/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
        background: "opaque",
        output_format: "jpeg",
        output_compression: 88,
      }),
    });
    if (!response.ok) return NextResponse.json({ error: await upstreamError(response) }, { status: response.status >= 500 ? 502 : response.status });

    const data = await response.json() as ImageResponse;
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generation completed without image data.");
    return NextResponse.json({
      image: { b64, mimeType: "image/jpeg", label: "AI-generated original cover", size: data.size || "1024x1024", quality: data.quality || "medium" },
      model,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Artwork generation failed.";
    return NextResponse.json({ error: message }, { status: message.includes("OPENAI_API_KEY") ? 503 : 502 });
  }
}
