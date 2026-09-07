import { NextRequest, NextResponse } from "next/server";

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

async function fetchAllowedImage(startUrl: URL) {
  let current = startUrl;

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    if (!isAllowed(current)) throw new Error("Image host is not allowed");

    const response = await fetch(current, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current);
      continue;
    }
    return response;
  }

  throw new Error("Too many image redirects");
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

  try {
    const response = await fetchAllowedImage(url);
    if (!response.ok) {
      return NextResponse.json({ error: "Image unavailable" }, { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Unexpected response type" }, { status: 415 });
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Image proxy request failed" }, { status: 502 });
  }
}
