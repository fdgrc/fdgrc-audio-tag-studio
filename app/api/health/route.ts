import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "fdgrc Tag Studio",
    version: "1.6.5.1",
    runtime: "Cloudflare Workers compatible via vinext",
    transcription: "On-device whisper.cpp WASM + desktop WhisperHallu/WhisperTimeSync",
  });
}
