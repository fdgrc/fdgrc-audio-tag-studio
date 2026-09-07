import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "fdgrc Tag Studio",
    version: "1.6.2.2",
    runtime: "Cloudflare Workers compatible via vinext",
    transcription: "On-device browser Whisper Base + desktop WhisperHallu/WhisperTimeSync",
  });
}
