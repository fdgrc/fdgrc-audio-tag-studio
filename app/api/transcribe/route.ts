import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "Cloud transcription is disabled in V1.6.2. Start the free local WhisperHallu + WhisperTimeSync helper and use the Local transcription panel.",
  }, { status: 410 });
}
