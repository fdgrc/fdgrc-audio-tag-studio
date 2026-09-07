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
  source: "embedded" | "upload" | "suggestion";
  label?: string;
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
