export type EditableTags = {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string;
  track: string;
  disc: string;
  genre: string;
  composer: string;
  bpm: string;
  comment: string;
  lyrics: string;
  isrc: string;
};

export type CoverAsset = {
  url: string;
  data?: ArrayBuffer;
  mimeType: string;
  source: "embedded" | "upload" | "suggestion" | "optimized" | "generated";
  label?: string;
  width?: number;
  height?: number;
  bytes?: number;
};

export type TrackItem = {
  id: string;
  file: File;
  fileName: string;
  duration: number;
  bitrate?: number;
  sampleRate?: number;
  tags: EditableTags;
  originalTags: EditableTags;
  cover?: CoverAsset;
  originalCover?: CoverAsset;
  audioUrl: string;
  dirty: boolean;
};

export type ArtworkSuggestion = {
  id: string;
  releaseId: string;
  title: string;
  artist: string;
  date?: string;
  country?: string;
  score: number;
  imageUrl: string;
  source: "MusicBrainz / Cover Art Archive";
};

export type MetadataSuggestion = {
  id: string;
  recordingId: string;
  releaseId?: string;
  score: number;
  source: "MusicBrainz";
  tags: Partial<EditableTags>;
  reasons: string[];
  coverUrl?: string;
};

export type LyricsLookupResult = {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
  source: "LRCLIB";
};


export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptionResult = {
  text: string;
  language?: string;
  duration?: number;
  segments: TranscriptSegment[];
  model: string;
};

export type ArtConcept = {
  id: string;
  title: string;
  description: string;
  prompt: string;
};

export type SongAnalysis = {
  summary: string;
  mood: string;
  energy: "low" | "medium" | "high" | "dynamic";
  themes: string[];
  imagery: string[];
  palette: string[];
  concepts: ArtConcept[];
};
