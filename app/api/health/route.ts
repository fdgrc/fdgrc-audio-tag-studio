import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "fdgrc Tag Studio",
    runtime: "Cloudflare Workers compatible via vinext",
  });
}
