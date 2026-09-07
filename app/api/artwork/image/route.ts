import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set([
  "coverartarchive.org",
  "archive.org",
  "ia800000.us.archive.org",
  "ia800001.us.archive.org",
  "ia800002.us.archive.org",
  "ia800003.us.archive.org",
  "ia800004.us.archive.org",
  "ia800005.us.archive.org",
  "ia800006.us.archive.org",
  "ia800007.us.archive.org",
  "ia800008.us.archive.org",
  "ia800009.us.archive.org",
]);

function isAllowed(url: URL) {
  return url.protocol === "https:" && (ALLOWED_HOSTS.has(url.hostname) || url.hostname.endsWith(".archive.org"));
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Missing image URL" }, { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
  }

  if (!isAllowed(url)) {
    return NextResponse.json({ error: "Image host is not allowed" }, { status: 403 });
  }

  const response = await fetch(url, { redirect: "follow", cache: "force-cache" });
  if (!response.ok) return NextResponse.json({ error: "Image unavailable" }, { status: response.status });

  const finalUrl = new URL(response.url);
  if (!isAllowed(finalUrl)) {
    return NextResponse.json({ error: "Unexpected image redirect" }, { status: 403 });
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Unexpected response type" }, { status: 415 });
  }

  const body = await response.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
    },
  });
}
