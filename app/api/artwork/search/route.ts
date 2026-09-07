import { NextRequest, NextResponse } from "next/server";
import type { ArtworkSuggestion } from "@/types/audio";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ||
  "fdgrc-tag-studio/1.0 (set MUSICBRAINZ_USER_AGENT before public deployment)";

type MBRelease = {
  id: string;
  title: string;
  date?: string;
  country?: string;
  score?: number;
  "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>;
};

type MBReleaseResponse = { releases?: MBRelease[] };
type MBRecording = {
  id: string;
  title: string;
  score?: number;
  releases?: MBRelease[];
  "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>;
};
type MBRecordingResponse = { recordings?: MBRecording[] };

function escapeQuery(value: string) {
  return value.replace(/["\\]/g, " ").trim();
}

function artistName(value?: Array<{ name?: string; artist?: { name?: string } }>) {
  return value?.map((item) => item.name || item.artist?.name).filter(Boolean).join(", ") || "Unknown artist";
}

async function hasCover(releaseId: string) {
  try {
    const response = await fetch(`https://coverartarchive.org/release/${releaseId}/front-500`, {
      method: "HEAD",
      redirect: "manual",
      cache: "force-cache",
    });
    return response.status === 200 || response.status === 307;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const artist = request.nextUrl.searchParams.get("artist")?.trim() || "";
  const album = request.nextUrl.searchParams.get("album")?.trim() || "";
  const title = request.nextUrl.searchParams.get("title")?.trim() || "";

  if (!artist || (!album && !title)) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    let releases: Array<MBRelease & { resolvedArtist?: string; resolvedScore?: number }> = [];

    if (album) {
      const query = `artist:"${escapeQuery(artist)}" AND release:"${escapeQuery(album)}"`;
      const url = `${MB_BASE}/release/?query=${encodeURIComponent(query)}&fmt=json&limit=8`;
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        next: { revalidate: 3600 },
      });
      if (!response.ok) throw new Error(`MusicBrainz returned ${response.status}`);
      const data = (await response.json()) as MBReleaseResponse;
      releases = (data.releases || []).map((release) => ({
        ...release,
        resolvedArtist: artistName(release["artist-credit"]),
        resolvedScore: release.score,
      }));
    } else {
      const query = `recording:"${escapeQuery(title)}" AND artist:"${escapeQuery(artist)}"`;
      const url = `${MB_BASE}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        next: { revalidate: 3600 },
      });
      if (!response.ok) throw new Error(`MusicBrainz returned ${response.status}`);
      const data = (await response.json()) as MBRecordingResponse;
      for (const recording of data.recordings || []) {
        for (const release of recording.releases || []) {
          releases.push({
            ...release,
            resolvedArtist: artistName(recording["artist-credit"]),
            resolvedScore: recording.score,
          });
        }
      }
    }

    const unique = Array.from(new Map(releases.map((release) => [release.id, release])).values()).slice(0, 8);
    const coverChecks = await Promise.all(unique.map(async (release) => ({ release, ok: await hasCover(release.id) })));

    const suggestions: ArtworkSuggestion[] = coverChecks
      .filter((item) => item.ok)
      .slice(0, 6)
      .map(({ release }) => ({
        id: release.id,
        releaseId: release.id,
        title: release.title,
        artist: release.resolvedArtist || artist,
        date: release.date,
        country: release.country,
        score: release.resolvedScore || release.score || 0,
        imageUrl: `/api/artwork/image?url=${encodeURIComponent(`https://coverartarchive.org/release/${release.id}/front-1200`)}`,
        source: "MusicBrainz / Cover Art Archive",
      }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { suggestions: [], error: "Artwork search is temporarily unavailable. Try again in a moment." },
      { status: 502 },
    );
  }
}
