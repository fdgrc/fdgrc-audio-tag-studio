import { NextRequest, NextResponse } from "next/server";
import type { LyricsLookupResult } from "@/types/audio";

const USER_AGENT =
  process.env.LRCLIB_USER_AGENT ||
  process.env.MUSICBRAINZ_USER_AGENT ||
  "fdgrc-tag-studio/1.5 (set LRCLIB_USER_AGENT before public deployment)";

type LrcLibResponse = {
  id: number;
  trackName?: string;
  name?: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

function toResult(data: LrcLibResponse, title: string, artist: string): LyricsLookupResult {
  return {
    id: data.id,
    trackName: data.trackName || data.name || title,
    artistName: data.artistName || artist,
    albumName: data.albumName,
    duration: data.duration,
    instrumental: Boolean(data.instrumental),
    plainLyrics: data.plainLyrics || undefined,
    syncedLyrics: data.syncedLyrics || undefined,
    source: "LRCLIB",
  };
}

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title")?.trim() || "";
  const artist = request.nextUrl.searchParams.get("artist")?.trim() || "";
  const album = request.nextUrl.searchParams.get("album")?.trim() || "";
  const duration = Math.round(Number(request.nextUrl.searchParams.get("duration") || 0));

  if (!title || !artist) {
    return NextResponse.json({ result: null, error: "Title and Artist are required for lyrics lookup." }, { status: 400 });
  }

  const params = new URLSearchParams({ track_name: title, artist_name: artist });
  if (album) params.set("album_name", album);
  if (duration >= 1 && duration <= 3600) params.set("duration", String(duration));

  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };

  try {
    const exact = await fetch(`https://lrclib.net/api/get?${params}`, { headers, cache: "no-store" });
    if (exact.ok) {
      const data = await exact.json() as LrcLibResponse;
      return NextResponse.json({ result: toResult(data, title, artist) });
    }
    if (exact.status !== 404) throw new Error(`LRCLIB returned ${exact.status}`);

    const searchParams = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) searchParams.set("album_name", album);
    const fallback = await fetch(`https://lrclib.net/api/search?${searchParams}`, { headers, cache: "no-store" });
    if (!fallback.ok) throw new Error(`LRCLIB returned ${fallback.status}`);
    const matches = await fallback.json() as LrcLibResponse[];
    if (!matches.length) return NextResponse.json({ result: null });

    const best = [...matches].sort((a, b) => {
      if (!duration) return 0;
      return Math.abs((a.duration || duration) - duration) - Math.abs((b.duration || duration) - duration);
    })[0];
    return NextResponse.json({ result: toResult(best, title, artist) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ result: null, error: "Lyrics lookup is temporarily unavailable." }, { status: 502 });
  }
}
