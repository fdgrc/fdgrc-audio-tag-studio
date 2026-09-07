import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "Paid cloud image generation is disabled in V1.6.2. Use the local browser cover renderer instead.",
  }, { status: 410 });
}
