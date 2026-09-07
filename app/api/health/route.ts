import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "fdgrc Tag Studio",
    version: "1.5.0",
    runtime: "Cloudflare Workers compatible via vinext",
  });
}
