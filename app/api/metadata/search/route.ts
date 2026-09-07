import { NextRequest, NextResponse } from "next/server";
import type { EditableTags, MetadataSuggestion } from "@/types/audio";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT =
  process.env.MUSICBRAINZ_USER_AGENT ||
  "fdgrc-tag-studio/1.5 (set MUSICBRAINZ_USER_AGENT before public deployment)";

type ArtistCredit = Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>;
type MBRelease = {
  id: string;
  title: string;
  date?: string;
  country?: string;
  "artist-credit"?: ArtistCredit;
};
type MBRecording = {
  id: string;
  title: string;
  length?: number;
  score?: number;
  "first-release-date"?: string;
  isrcs?: string[];
  tags?: Array<{ name: string; count?: number }>;
  "artist-credit"?: ArtistCredit;
  releases?: MBRelease[];
};
type MBResponse = { recordings?: MBRecording[] };

function escapeQuery(value: string) {
  return value.replace(/[+\-!(){}\[\]^"~*?:\\/]/g, " ").replace(/\s+/g, " ").trim();
}

function creditName(value?: ArtistCredit) {
  if (!value?.length) return "";
  return value.map((item) => `${item.name || item.artist?.name || ""}${item.joinphrase || ""}`).join("").trim();
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter(Boolean));
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const token of ta) if (tb.has(token)) overlap += 1;
  return (2 * overlap) / (ta.size + tb.size);
}

function bestRelease(releases: MBRelease[] | undefined, album: string) {
  if (!releases?.length) return undefined;
  if (!album) {
    return [...releases].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0];
  }
  return [...releases].sort((a, b) => similarity(b.title, album) - similarity(a.title, album))[0];
}

function confidence(recording: MBRecording, input: { title: string; artist: string; album: string; duration: number }) {
  let score = Math.max(0, Math.min(100, recording.score || 0));
  const foundArtist = creditName(recording["artist-credit"]);
  if (input.title) score = score * 0.65 + similarity(recording.title, input.title) * 25;
  if (input.artist && foundArtist) score += similarity(foundArtist, input.artist) * 10;
  else if (!input.artist) score -= 15;

  const release = bestRelease(recording.releases, input.album);
  if (input.album && release) score += similarity(release.title, input.album) * 6;

  if (input.duration > 0 && recording.length) {
    const diff = Math.abs(recording.length / 1000 - input.duration);
    if (diff <= 2) score += 6;
    else if (diff <= 5) score += 3;
    else if (diff > 15) score -= 8;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function topGenres(recording: MBRecording) {
  return (recording.tags || [])
    .filter((tag) => tag.name)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 3)
    .map((tag) => tag.name)
    .join(", ");
}

export async function GET(request: NextRequest) {
  const title = request.nextUrl.searchParams.get("title")?.trim() || "";
  const artist = request.nextUrl.searchParams.get("artist")?.trim() || "";
  const album = request.nextUrl.searchParams.get("album")?.trim() || "";
  const duration = Number(request.nextUrl.searchParams.get("duration") || 0);

  if (!title) return NextResponse.json({ suggestions: [], error: "Add a title before running Smart Fix." }, { status: 400 });

  const clauses = [`recording:\"${escapeQuery(title)}\"`];
  if (artist) clauses.push(`artist:\"${escapeQuery(artist)}\"`);
  const query = clauses.join(" AND ");

  try {
    const response = await fetch(`${MB_BASE}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=6`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`MusicBrainz returned ${response.status}`);
    const data = await response.json() as MBResponse;

    const suggestions: MetadataSuggestion[] = (data.recordings || []).map((recording) => {
      const release = bestRelease(recording.releases, album);
      const recordingArtist = creditName(recording["artist-credit"]);
      const releaseArtist = creditName(release?.["artist-credit"]);
      const date = release?.date || recording["first-release-date"] || "";
      const score = confidence(recording, { title, artist, album, duration });
      const reasons: string[] = [];
      if (similarity(recording.title, title) > 0.95) reasons.push("Title match");
      if (artist && similarity(recordingArtist, artist) > 0.9) reasons.push("Artist match");
      if (album && release && similarity(release.title, album) > 0.85) reasons.push("Album match");
      if (duration > 0 && recording.length && Math.abs(recording.length / 1000 - duration) <= 3) reasons.push("Duration match");

      const tags: Partial<EditableTags> = {
        title: recording.title || undefined,
        artist: recordingArtist || undefined,
        album: release?.title || undefined,
        albumArtist: releaseArtist || recordingArtist || undefined,
        year: /^\d{4}/.test(date) ? date.slice(0, 4) : undefined,
        genre: topGenres(recording) || undefined,
        isrc: recording.isrcs?.[0] || undefined,
      };

      return {
        id: `${recording.id}:${release?.id || "recording"}`,
        recordingId: recording.id,
        releaseId: release?.id,
        score,
        source: "MusicBrainz" as const,
        tags,
        reasons,
        coverUrl: release?.id
          ? `/api/artwork/image?url=${encodeURIComponent(`https://coverartarchive.org/release/${release.id}/front-1200`)}`
          : undefined,
      };
    }).sort((a, b) => b.score - a.score).slice(0, 5);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { suggestions: [], error: "Smart metadata lookup is temporarily unavailable. Try again shortly." },
      { status: 502 },
    );
  }
}
