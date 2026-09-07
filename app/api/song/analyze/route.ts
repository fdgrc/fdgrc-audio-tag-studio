import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    error: "Cloud song analysis is disabled in V1.6.2. Song themes and art concepts are generated locally in the browser.",
  }, { status: 410 });
}
