"use client";

import Image from "next/image";
import JSZip from "jszip";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { readTrack } from "@/lib/audio/readMetadata";
import { suggestedOutputName, writeMp3 } from "@/lib/audio/writeId3";
import { cleanEditableTags, guessTagsFromFileName } from "@/lib/audio/guessTags";
import { cloneCover, optimizeCover } from "@/lib/audio/coverTools";
import {
  albumKey,
  albumLabel,
  duplicateGroups,
  duplicateIdSet,
  metadataQuality,
  missingCoreMetadata,
} from "@/lib/audio/libraryTools";
import { formatBitrate, formatDuration } from "@/lib/format";
import type {
  ArtworkSuggestion,
  CoverAsset,
  EditableTags,
  LyricsLookupResult,
  MetadataSuggestion,
  TrackItem,
} from "@/types/audio";

const fields: Array<{ key: keyof EditableTags; label: string; placeholder?: string }> = [
  { key: "title", label: "Title", placeholder: "Song title" },
  { key: "artist", label: "Artist", placeholder: "Artist" },
  { key: "album", label: "Album", placeholder: "Album" },
  { key: "albumArtist", label: "Album Artist", placeholder: "Album artist" },
  { key: "year", label: "Year", placeholder: "2026" },
  { key: "track", label: "Track", placeholder: "1" },
  { key: "disc", label: "Disc", placeholder: "1" },
  { key: "genre", label: "Genre", placeholder: "R&B, Pop" },
  { key: "composer", label: "Composer", placeholder: "Composer" },
  { key: "bpm", label: "BPM", placeholder: "120" },
  { key: "isrc", label: "ISRC", placeholder: "Optional" },
];

const smartFieldLabels: Partial<Record<keyof EditableTags, string>> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  albumArtist: "Album Artist",
  year: "Year",
  genre: "Genre",
  isrc: "ISRC",
};

type ThemeMode = "light" | "system" | "dark";
type TrackFilter = "all" | "missing-tags" | "missing-cover" | "duplicates" | "edited";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const themeOptions: Array<{ value: ThemeMode; icon: string; label: string }> = [
  { value: "light", icon: "☀", label: "Light" },
  { value: "system", icon: "◐", label: "System" },
  { value: "dark", icon: "☾", label: "Dark" },
];

const THEME_STORAGE_KEY = "fdgrc-tag-studio-theme";
const MB_MIN_INTERVAL = 1150;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function revokeCover(cover?: CoverAsset) {
  if (cover?.url.startsWith("blob:")) URL.revokeObjectURL(cover.url);
}

function revokeTrackUrls(track: TrackItem) {
  URL.revokeObjectURL(track.audioUrl);
  revokeCover(track.cover);
  if (track.originalCover?.url !== track.cover?.url) revokeCover(track.originalCover);
}

function tagsEqual(a: EditableTags, b: EditableTags) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function candidateFields(track: TrackItem, suggestion?: MetadataSuggestion) {
  if (!suggestion) return [] as Array<keyof EditableTags>;
  return (Object.keys(suggestion.tags) as Array<keyof EditableTags>).filter((key) => {
    const value = suggestion.tags[key];
    return typeof value === "string" && value.trim() && value.trim() !== track.tags[key].trim();
  });
}

function confidenceClass(score: number) {
  if (score >= 90) return "confidence-high";
  if (score >= 75) return "confidence-medium";
  return "confidence-low";
}

function confidenceLabel(score: number) {
  if (score >= 90) return "High confidence";
  if (score >= 75) return "Review";
  return "Low confidence";
}

function coverSizeLabel(cover?: CoverAsset) {
  if (!cover) return "No artwork";
  const dimensions = cover.width && cover.height ? `${cover.width}×${cover.height}` : "Artwork";
  const bytes = cover.bytes ? ` · ${(cover.bytes / 1024).toFixed(0)} KB` : "";
  return `${dimensions}${bytes}`;
}

export default function TagStudio() {
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [albumFilter, setAlbumFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [artwork, setArtwork] = useState<ArtworkSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [lastSearchKey, setLastSearchKey] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [smartSuggestions, setSmartSuggestions] = useState<Record<string, MetadataSuggestion[]>>({});
  const [smartChoice, setSmartChoice] = useState<Record<string, string>>({});
  const [smartFields, setSmartFields] = useState<Array<keyof EditableTags>>([]);
  const [smartLoadingIds, setSmartLoadingIds] = useState<string[]>([]);
  const [batchScanning, setBatchScanning] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [coverSize, setCoverSize] = useState(1000);
  const [isOptimizingCover, setIsOptimizingCover] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent>();

  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<TrackItem[]>([]);
  const lastMbRequestAt = useRef(0);

  const selected = useMemo(() => tracks.find((track) => track.id === selectedId), [tracks, selectedId]);
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);
  const dirtyCount = useMemo(() => tracks.filter((track) => track.dirty).length, [tracks]);
  const duplicates = useMemo(() => duplicateIdSet(tracks), [tracks]);
  const duplicateGroupCount = useMemo(() => duplicateGroups(tracks).length, [tracks]);
  const missingCount = useMemo(() => tracks.filter(missingCoreMetadata).length, [tracks]);
  const missingCoverCount = useMemo(() => tracks.filter((track) => !track.cover).length, [tracks]);

  const albumGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    for (const track of tracks) {
      const key = albumKey(track);
      if (!key) continue;
      const current = map.get(key);
      if (current) current.count += 1;
      else map.set(key, { key, label: albumLabel(track), count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [tracks]);

  const visibleTracks = useMemo(() => tracks.filter((track) => {
    if (albumFilter !== "all" && albumKey(track) !== albumFilter) return false;
    if (trackFilter === "missing-tags" && !missingCoreMetadata(track)) return false;
    if (trackFilter === "missing-cover" && track.cover) return false;
    if (trackFilter === "duplicates" && !duplicates.has(track.id)) return false;
    if (trackFilter === "edited" && !track.dirty) return false;
    return true;
  }), [tracks, albumFilter, trackFilter, duplicates]);

  const selectedSmartSuggestions = selected ? smartSuggestions[selected.id] || [] : [];
  const selectedSmart = useMemo(() => {
    if (!selected) return undefined;
    const options = smartSuggestions[selected.id] || [];
    const choiceId = smartChoice[selected.id];
    return options.find((item) => item.id === choiceId) || options[0];
  }, [selected, smartSuggestions, smartChoice]);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark" || current === "system") setTheme(current);

    if (folderInput.current) folderInput.current.setAttribute("webkitdirectory", "");

    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    return () => tracksRef.current.forEach(revokeTrackUrls);
  }, []);

  useEffect(() => {
    if (!selected || !selectedSmart) {
      setSmartFields([]);
      return;
    }
    setSmartFields(candidateFields(selected, selectedSmart));
  }, [selected, selectedSmart]);

  function changeTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme remains active for this session when local storage is unavailable.
    }
  }

  const waitForMusicBrainzSlot = useCallback(async () => {
    const elapsed = Date.now() - lastMbRequestAt.current;
    if (elapsed < MB_MIN_INTERVAL) await delay(MB_MIN_INTERVAL - elapsed);
    lastMbRequestAt.current = Date.now();
  }, []);

  const importFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3"));
    if (!files.length) {
      setMessage("Choose one or more MP3 files.");
      return;
    }

    setIsLoading(true);
    setMessage(undefined);
    try {
      const imported: TrackItem[] = [];
      for (const file of files) imported.push(await readTrack(file));
      setTracks((current) => [...current, ...imported]);
      setSelectedId((current) => current || imported[0]?.id);
      setCheckedIds((current) => Array.from(new Set([...current, ...imported.map((track) => track.id)])));
      setMessage(`${imported.length} MP3 ${imported.length === 1 ? "track" : "tracks"} imported locally.`);
    } catch (error) {
      console.error(error);
      setMessage("I could not read one of those MP3 files. Try another file.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void importFiles(event.dataTransfer.files);
  }

  function updateTag(key: keyof EditableTags, value: string) {
    if (!selectedId) return;
    setTracks((current) => current.map((track) => track.id === selectedId
      ? { ...track, tags: { ...track.tags, [key]: value }, dirty: true }
      : track));
  }

  function updateTrackTags(trackId: string, updater: (tags: EditableTags) => EditableTags) {
    setTracks((current) => current.map((track) => {
      if (track.id !== trackId) return track;
      const tags = updater(track.tags);
      return { ...track, tags, dirty: !tagsEqual(tags, track.originalTags) || track.dirty };
    }));
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    const visibleIds = visibleTracks.map((track) => track.id);
    const allChecked = visibleIds.length > 0 && visibleIds.every((id) => checkedSet.has(id));
    if (allChecked) setCheckedIds((current) => current.filter((id) => !visibleIds.includes(id)));
    else setCheckedIds((current) => Array.from(new Set([...current, ...visibleIds])));
  }

  function removeTrack(id: string) {
    const removing = tracks.find((track) => track.id === id);
    if (removing) revokeTrackUrls(removing);
    const remaining = tracks.filter((track) => track.id !== id);
    setTracks(remaining);
    setCheckedIds((current) => current.filter((item) => item !== id));
    setSmartSuggestions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (selectedId === id) setSelectedId(remaining[0]?.id);
  }

  function clearAll() {
    tracks.forEach(revokeTrackUrls);
    setTracks([]);
    setSelectedId(undefined);
    setCheckedIds([]);
    setArtwork([]);
    setSmartSuggestions({});
    setMessage(undefined);
  }

  async function setCoverFromUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedId || !file.type.startsWith("image/")) return;
    const data = await file.arrayBuffer();
    const url = URL.createObjectURL(new Blob([data], { type: file.type }));
    setTracks((current) => current.map((track) => {
      if (track.id !== selectedId) return track;
      revokeCover(track.cover);
      return {
        ...track,
        cover: { url, data, mimeType: file.type, source: "upload", label: file.name, bytes: file.size },
        dirty: true,
      };
    }));
    event.target.value = "";
  }

  function removeCover() {
    if (!selectedId) return;
    setTracks((current) => current.map((track) => {
      if (track.id !== selectedId) return track;
      revokeCover(track.cover);
      return { ...track, cover: undefined, dirty: true };
    }));
  }

  const searchArtwork = useCallback(async (track: TrackItem, force = false) => {
    const { artist, album, title } = track.tags;
    if (!artist || (!album && !title)) {
      setArtwork([]);
      return;
    }
    const key = `${artist}|${album}|${title}`.toLowerCase();
    if (!force && key === lastSearchKey) return;

    setIsSearching(true);
    setSearchError(undefined);
    try {
      await waitForMusicBrainzSlot();
      const params = new URLSearchParams({ artist, album, title });
      const response = await fetch(`/api/artwork/search?${params}`);
      const data = await response.json() as { suggestions?: ArtworkSuggestion[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Artwork search failed");
      setArtwork(data.suggestions || []);
      setLastSearchKey(key);
    } catch (error) {
      setArtwork([]);
      setSearchError(error instanceof Error ? error.message : "Artwork search failed");
    } finally {
      setIsSearching(false);
    }
  }, [lastSearchKey, waitForMusicBrainzSlot]);

  useEffect(() => {
    if (!selected) {
      setArtwork([]);
      return;
    }
    const timer = window.setTimeout(() => void searchArtwork(selected), 1350);
    return () => window.clearTimeout(timer);
  }, [selected, searchArtwork]);

  async function coverFromUrl(imageUrl: string, label: string): Promise<CoverAsset> {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("That cover image could not be loaded.");
    const data = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    return {
      url: URL.createObjectURL(new Blob([data], { type: mimeType })),
      data,
      mimeType,
      source: "suggestion",
      label,
      bytes: data.byteLength,
    };
  }

  async function chooseSuggestion(suggestion: ArtworkSuggestion) {
    if (!selectedId) return;
    try {
      const cover = await coverFromUrl(suggestion.imageUrl, suggestion.title);
      setTracks((current) => current.map((track) => {
        if (track.id !== selectedId) return track;
        revokeCover(track.cover);
        return { ...track, cover, dirty: true };
      }));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "That cover image could not be loaded.");
    }
  }

  async function scanSmartFix(track: TrackItem, quiet = false) {
    setSmartLoadingIds((current) => Array.from(new Set([...current, track.id])));
    if (!quiet) setMessage("Smart Fix is checking MusicBrainz…");
    try {
      await waitForMusicBrainzSlot();
      const params = new URLSearchParams({
        title: track.tags.title || guessTagsFromFileName(track.fileName).title || "",
        artist: track.tags.artist || guessTagsFromFileName(track.fileName).artist || "",
        album: track.tags.album,
        duration: String(Math.round(track.duration)),
      });
      const response = await fetch(`/api/metadata/search?${params}`);
      const data = await response.json() as { suggestions?: MetadataSuggestion[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Smart Fix lookup failed");
      const suggestions = data.suggestions || [];
      setSmartSuggestions((current) => ({ ...current, [track.id]: suggestions }));
      setSmartChoice((current) => ({ ...current, [track.id]: suggestions[0]?.id || "" }));
      if (!quiet) setMessage(suggestions.length ? `Smart Fix found ${suggestions.length} possible match${suggestions.length === 1 ? "" : "es"}.` : "Smart Fix found no confident match.");
      return suggestions;
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "Smart Fix failed.");
      return [];
    } finally {
      setSmartLoadingIds((current) => current.filter((id) => id !== track.id));
    }
  }

  async function scanCheckedTracks() {
    const targets = tracks.filter((track) => checkedSet.has(track.id));
    if (!targets.length) {
      setMessage("Select tracks with the checkboxes first.");
      return;
    }
    setBatchScanning(true);
    let matches = 0;
    try {
      for (const track of targets) {
        const results = await scanSmartFix(track, true);
        if (results.length) matches += 1;
      }
      setMessage(`Smart Fix scanned ${targets.length} tracks and found matches for ${matches}. Review before applying.`);
    } finally {
      setBatchScanning(false);
    }
  }

  function toggleSmartField(key: keyof EditableTags) {
    setSmartFields((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function applySmartFix() {
    if (!selected || !selectedSmart) return;
    const updates = selectedSmart.tags;
    updateTrackTags(selected.id, (tags) => {
      const next = { ...tags };
      for (const key of smartFields) {
        const value = updates[key];
        if (typeof value === "string" && value.trim()) next[key] = value;
      }
      return next;
    });

    if (selectedSmart.coverUrl) {
      try {
        const cover = await coverFromUrl(selectedSmart.coverUrl, selectedSmart.tags.album || "Matched cover");
        setTracks((current) => current.map((track) => {
          if (track.id !== selected.id) return track;
          revokeCover(track.cover);
          return { ...track, cover, dirty: true };
        }));
      } catch {
        // Metadata still applies when the matched release has no available cover image.
      }
    }
    setMessage(`Applied ${smartFields.length} Smart Fix field${smartFields.length === 1 ? "" : "s"}${selectedSmart.coverUrl ? " and attempted matched artwork" : ""}.`);
  }

  function applyHighConfidenceChecked() {
    const targetIds = new Set(checkedIds);
    let applied = 0;
    setTracks((current) => current.map((track) => {
      if (!targetIds.has(track.id)) return track;
      const suggestion = (smartSuggestions[track.id] || [])[0];
      if (!suggestion || suggestion.score < 90) return track;
      const tags = { ...track.tags };
      for (const [rawKey, rawValue] of Object.entries(suggestion.tags)) {
        const key = rawKey as keyof EditableTags;
        if (typeof rawValue === "string" && rawValue.trim()) tags[key] = rawValue;
      }
      applied += 1;
      return { ...track, tags, dirty: true };
    }));
    setMessage(applied ? `Applied high-confidence metadata to ${applied} selected track${applied === 1 ? "" : "s"}. Covers remain reviewable.` : "No selected tracks have a 90%+ Smart Fix match yet.");
  }

  function applyAlbumInfoToChecked() {
    if (!selected || !checkedIds.length) return;
    const source = selected.tags;
    const targetIds = new Set(checkedIds);
    setTracks((current) => current.map((track) => targetIds.has(track.id) ? {
      ...track,
      tags: {
        ...track.tags,
        album: source.album,
        albumArtist: source.albumArtist,
        year: source.year,
        genre: source.genre,
        disc: source.disc,
      },
      dirty: true,
    } : track));
    setMessage(`Applied album fields to ${checkedIds.length} selected tracks.`);
  }

  function applyCoverToChecked() {
    if (!selected?.cover || !checkedIds.length) {
      setMessage("Select a source track with artwork first.");
      return;
    }
    const sourceCover = selected.cover;
    const targetIds = new Set(checkedIds);
    setTracks((current) => current.map((track) => {
      if (!targetIds.has(track.id)) return track;
      revokeCover(track.cover);
      return { ...track, cover: cloneCover(sourceCover), dirty: true };
    }));
    setMessage(`Applied the current cover to ${checkedIds.length} selected tracks.`);
  }

  function autoNumberChecked() {
    const targetIds = new Set(checkedIds);
    let number = 0;
    setTracks((current) => current.map((track) => {
      if (!targetIds.has(track.id)) return track;
      number += 1;
      return { ...track, tags: { ...track.tags, track: String(number) }, dirty: true };
    }));
    setMessage(`Numbered ${number} selected tracks in their current list order.`);
  }

  function cleanChecked() {
    const targetIds = new Set(checkedIds);
    setTracks((current) => current.map((track) => targetIds.has(track.id)
      ? { ...track, tags: cleanEditableTags(track.tags), dirty: true }
      : track));
    setMessage(`Cleaned capitalization, spacing, and common filename junk on ${checkedIds.length} selected tracks.`);
  }

  function resetChecked() {
    const targetIds = new Set(checkedIds);
    setTracks((current) => current.map((track) => {
      if (!targetIds.has(track.id)) return track;
      revokeCover(track.cover);
      return {
        ...track,
        tags: { ...track.originalTags },
        cover: cloneCover(track.originalCover),
        dirty: false,
      };
    }));
    setMessage(`Reset ${checkedIds.length} selected tracks to their imported metadata and artwork.`);
  }

  async function optimizeSelectedCover() {
    if (!selected?.cover) return;
    setIsOptimizingCover(true);
    try {
      const cover = await optimizeCover(selected.cover, coverSize, 0.88);
      setTracks((current) => current.map((track) => {
        if (track.id !== selected.id) return track;
        revokeCover(track.cover);
        return { ...track, cover, dirty: true };
      }));
      setMessage(`Cover center-cropped and optimized to ${coverSize}×${coverSize} JPEG.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not optimize that cover.");
    } finally {
      setIsOptimizingCover(false);
    }
  }

  async function findLyrics() {
    if (!selected) return;
    setLyricsLoading(true);
    try {
      const params = new URLSearchParams({
        title: selected.tags.title,
        artist: selected.tags.artist,
        album: selected.tags.album,
        duration: String(Math.round(selected.duration)),
      });
      const response = await fetch(`/api/lyrics/search?${params}`);
      const data = await response.json() as { result?: LyricsLookupResult | null; error?: string };
      if (!response.ok) throw new Error(data.error || "Lyrics lookup failed");
      if (!data.result) {
        setMessage("No lyrics match was found for this track.");
        return;
      }
      if (data.result.instrumental) {
        setMessage("LRCLIB identifies this track as instrumental.");
        return;
      }
      const lyrics = data.result.plainLyrics || data.result.syncedLyrics || "";
      if (!lyrics) {
        setMessage("A lyrics record was found, but it did not contain text.");
        return;
      }
      updateTag("lyrics", lyrics);
      setMessage("Lyrics added from LRCLIB. Review them before saving.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lyrics lookup failed.");
    } finally {
      setLyricsLoading(false);
    }
  }

  async function saveSelected() {
    if (!selected) return;
    setIsSaving(true);
    setMessage(undefined);
    try {
      const blob = await writeMp3(selected.file, selected.tags, selected.cover);
      downloadBlob(blob, suggestedOutputName(selected));
      setMessage("Updated MP3 created. Your original file was not changed.");
    } catch (error) {
      console.error(error);
      setMessage("Could not create the updated MP3.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAll() {
    if (!tracks.length) return;
    setIsSaving(true);
    setMessage(undefined);
    try {
      const zip = new JSZip();
      for (const track of tracks) {
        const blob = await writeMp3(track.file, track.tags, track.cover);
        zip.file(suggestedOutputName(track), blob);
      }
      const output = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      downloadBlob(output, "fdgrc-tag-studio-export.zip");
      setMessage(`${tracks.length} updated MP3 files exported as ZIP.`);
    } catch (error) {
      console.error(error);
      setMessage("Could not finish the batch export.");
    } finally {
      setIsSaving(false);
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(undefined);
  }

  return (
    <main className="app-shell">
      <header className="topbar sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="brand-tile grid h-10 w-10 place-items-center rounded-xl font-black">F</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">fdgrc Tag Studio</h1>
                <span className="version-badge">V1.5</span>
              </div>
              <p className="muted-soft text-xs">Smart MP3 metadata + cover art editor</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {installPrompt && <button className="btn btn-ghost" onClick={() => void installApp()}>Install app</button>}
            <div className="theme-switch" role="group" aria-label="Color theme">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`theme-option ${theme === option.value ? "active" : ""}`}
                  aria-pressed={theme === option.value}
                  title={`${option.label} theme`}
                  onClick={() => changeTheme(option.value)}
                >
                  <span aria-hidden="true">{option.icon}</span> <span className="theme-label">{option.label}</span>
                </button>
              ))}
            </div>
            {dirtyCount > 0 && <span className="muted hidden text-xs sm:inline">{dirtyCount} edited</span>}
            {tracks.length > 0 && <button className="btn btn-ghost" onClick={clearAll}>Clear</button>}
            <button className="btn btn-primary" disabled={!tracks.length || isSaving} onClick={() => void saveAll()}>
              {isSaving ? "Working…" : `Export ${tracks.length || "All"} as ZIP`}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1720px] px-4 pt-4 lg:px-8">
        <div className="library-strip grid gap-2 rounded-2xl p-3 sm:grid-cols-4">
          <button className="library-stat" onClick={() => setTrackFilter("all")}>
            <span className="library-stat-value">{tracks.length}</span><span className="library-stat-label">Tracks</span>
          </button>
          <button className="library-stat" onClick={() => setTrackFilter("missing-tags")}>
            <span className="library-stat-value">{missingCount}</span><span className="library-stat-label">Missing core tags</span>
          </button>
          <button className="library-stat" onClick={() => setTrackFilter("missing-cover")}>
            <span className="library-stat-value">{missingCoverCount}</span><span className="library-stat-label">Missing covers</span>
          </button>
          <button className="library-stat" onClick={() => setTrackFilter("duplicates")}>
            <span className="library-stat-value">{duplicateGroupCount}</span><span className="library-stat-label">Duplicate groups</span>
          </button>
        </div>
      </section>

      <div className="mx-auto grid max-w-[1720px] gap-4 px-4 py-4 lg:grid-cols-[350px_minmax(0,1fr)_410px] lg:px-8">
        <aside className="panel min-h-[760px] overflow-hidden">
          <div className="border-theme border-b p-4">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              className="drop-zone cursor-pointer rounded-2xl border border-dashed p-5 text-center transition"
            >
              <div className="mb-2 text-2xl">♫</div>
              <div className="text-sm font-semibold">Drop MP3 files or a folder</div>
              <div className="muted mt-1 text-xs">files are read locally in your browser</div>
              <input ref={fileInput} type="file" accept="audio/mpeg,.mp3" multiple hidden onChange={(event) => event.target.files && void importFiles(event.target.files)} />
              <input ref={folderInput} type="file" accept="audio/mpeg,.mp3" multiple hidden onChange={(event) => event.target.files && void importFiles(event.target.files)} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="btn btn-ghost text-xs" onClick={(event) => { event.stopPropagation(); fileInput.current?.click(); }}>Choose files</button>
              <button className="btn btn-ghost text-xs" onClick={(event) => { event.stopPropagation(); folderInput.current?.click(); }}>Choose folder</button>
            </div>
          </div>

          <div className="border-theme border-b p-3">
            <div className="grid grid-cols-2 gap-2">
              <select className="input input-compact" value={trackFilter} onChange={(event) => setTrackFilter(event.target.value as TrackFilter)}>
                <option value="all">All tracks</option>
                <option value="missing-tags">Missing tags</option>
                <option value="missing-cover">Missing cover</option>
                <option value="duplicates">Duplicates</option>
                <option value="edited">Edited</option>
              </select>
              <select className="input input-compact" value={albumFilter} onChange={(event) => setAlbumFilter(event.target.value)}>
                <option value="all">All albums</option>
                {albumGroups.map((group) => <option key={group.key} value={group.key}>{group.label} ({group.count})</option>)}
              </select>
            </div>
            <div className="muted mt-3 flex items-center justify-between text-xs">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={visibleTracks.length > 0 && visibleTracks.every((track) => checkedSet.has(track.id))} onChange={toggleAllVisible} />
                Select visible
              </label>
              <span>{checkedIds.length} selected</span>
            </div>
          </div>

          {checkedIds.length > 0 && (
            <div className="batch-tools border-theme border-b p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide">Batch tools</span>
                <button className="text-link text-xs" onClick={() => setCheckedIds([])}>Clear selection</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-secondary text-xs" disabled={!selected} onClick={applyAlbumInfoToChecked}>Apply album info</button>
                <button className="btn btn-secondary text-xs" disabled={!selected?.cover} onClick={applyCoverToChecked}>Apply current cover</button>
                <button className="btn btn-secondary text-xs" onClick={autoNumberChecked}>Auto-number</button>
                <button className="btn btn-secondary text-xs" onClick={cleanChecked}>Clean tags</button>
                <button className="btn btn-smart col-span-2 text-xs" disabled={batchScanning} onClick={() => void scanCheckedTracks()}>{batchScanning ? "Scanning…" : "Smart Fix scan selected"}</button>
                <button className="btn btn-secondary col-span-2 text-xs" onClick={applyHighConfidenceChecked}>Apply 90%+ metadata</button>
                <button className="btn btn-ghost col-span-2 text-xs" onClick={resetChecked}>Reset selected</button>
              </div>
            </div>
          )}

          <div className="muted flex items-center justify-between px-4 py-3 text-xs">
            <span>{visibleTracks.length} shown / {tracks.length}</span>
            {isLoading && <span className="accent-text">Reading…</span>}
          </div>

          <div className="max-h-[650px] overflow-y-auto px-2 pb-3">
            {tracks.length === 0 ? (
              <div className="muted-soft px-4 py-14 text-center text-sm">Your music stays on this device. Import an MP3 to begin.</div>
            ) : visibleTracks.length === 0 ? (
              <div className="muted-soft px-4 py-14 text-center text-sm">No tracks match the current library filter.</div>
            ) : visibleTracks.map((track) => {
              const quality = metadataQuality(track);
              const smart = (smartSuggestions[track.id] || [])[0];
              return (
                <div key={track.id} className={`track-row group mb-1 flex w-full items-center gap-1 rounded-xl p-1 transition ${selectedId === track.id ? "selected" : ""}`}>
                  <label className="grid h-10 w-7 shrink-0 cursor-pointer place-items-center" title="Select for batch tools">
                    <input type="checkbox" checked={checkedSet.has(track.id)} onChange={() => toggleChecked(track.id)} />
                  </label>
                  <button className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left" onClick={() => setSelectedId(track.id)}>
                    <div className="cover-thumb relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                      {track.cover ? <Image src={track.cover.url} alt="" fill sizes="44px" className="object-cover" unoptimized /> : <div className="muted-soft grid h-full place-items-center">♪</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {track.dirty && <span className="dirty-dot" title="Edited" />}
                        <div className="truncate text-sm font-medium">{track.tags.title || track.fileName}</div>
                      </div>
                      <div className="muted truncate text-xs">{track.tags.artist || "Unknown artist"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={`quality-badge ${quality >= 80 ? "good" : quality >= 55 ? "medium" : "low"}`}>{quality}% tags</span>
                        {duplicates.has(track.id) && <span className="mini-badge warning">duplicate</span>}
                        {!track.cover && <span className="mini-badge">no cover</span>}
                        {smart && <span className={`mini-badge ${confidenceClass(smart.score)}`}>fix {smart.score}%</span>}
                      </div>
                    </div>
                  </button>
                  <button aria-label={`Remove ${track.tags.title || track.fileName}`} onClick={() => removeTrack(track.id)} className="remove-track rounded-md px-2 py-1 opacity-0 group-hover:opacity-100">×</button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="panel min-h-[760px] p-5 lg:p-6">
          {!selected ? (
            <div className="grid min-h-[680px] place-items-center text-center">
              <div>
                <div className="icon-stage muted-soft border-theme mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border text-3xl">♪</div>
                <h2 className="text-xl font-semibold">Select an MP3 to edit</h2>
                <p className="muted mt-2 max-w-md text-sm">Tags, cover edits, and exports happen in your browser. Only search text is sent to metadata services.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-theme mb-5 flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {selected.dirty && <span className="dirty-dot" title="Edited" />}
                    <div className="truncate text-xl font-semibold">{selected.tags.title || selected.fileName}</div>
                    <span className={`quality-badge ${metadataQuality(selected) >= 80 ? "good" : metadataQuality(selected) >= 55 ? "medium" : "low"}`}>{metadataQuality(selected)}%</span>
                  </div>
                  <div className="muted mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>{formatDuration(selected.duration)}</span>
                    <span>{formatBitrate(selected.bitrate)}</span>
                    <span>{selected.sampleRate ? `${(selected.sampleRate / 1000).toFixed(1)} kHz` : "—"}</span>
                    <span>{(selected.file.size / 1024 / 1024).toFixed(1)} MB</span>
                    {duplicates.has(selected.id) && <span className="warning-text">Possible duplicate</span>}
                  </div>
                </div>
                <audio controls src={selected.audioUrl} className="h-10 w-full max-w-lg" />
              </div>

              <div className="smart-panel mb-6 rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="smart-spark">✦</span><h2 className="font-semibold">Smart Fix</h2></div>
                    <p className="muted mt-1 text-xs">Compare your tags with MusicBrainz before applying anything.</p>
                  </div>
                  <button className="btn btn-smart" disabled={smartLoadingIds.includes(selected.id)} onClick={() => void scanSmartFix(selected)}>
                    {smartLoadingIds.includes(selected.id) ? "Checking…" : selectedSmart ? "Scan again" : "Find metadata"}
                  </button>
                </div>

                {selectedSmart && (
                  <div className="mt-4">
                    {selectedSmartSuggestions.length > 1 && (
                      <label className="mb-3 block">
                        <span className="field-label">Match candidate</span>
                        <select className="input" value={selectedSmart.id} onChange={(event) => setSmartChoice((current) => ({ ...current, [selected.id]: event.target.value }))}>
                          {selectedSmartSuggestions.map((item) => (
                            <option key={item.id} value={item.id}>{item.score}% — {item.tags.artist || "Unknown"} — {item.tags.album || item.tags.title || "Recording"}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className={`confidence-pill ${confidenceClass(selectedSmart.score)}`}>{selectedSmart.score}% · {confidenceLabel(selectedSmart.score)}</span>
                      {selectedSmart.reasons.map((reason) => <span key={reason} className="reason-pill">{reason}</span>)}
                    </div>

                    <div className="smart-diff overflow-hidden rounded-xl border">
                      <div className="smart-diff-head grid grid-cols-[28px_100px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">
                        <span></span><span>Field</span><span>Current</span><span>Suggested</span>
                      </div>
                      {candidateFields(selected, selectedSmart).length === 0 ? (
                        <div className="muted p-4 text-sm">The best match does not propose any different fields.</div>
                      ) : candidateFields(selected, selectedSmart).map((key) => (
                        <label key={key} className="smart-diff-row grid cursor-pointer grid-cols-[28px_100px_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t px-3 py-2 text-xs">
                          <input type="checkbox" checked={smartFields.includes(key)} onChange={() => toggleSmartField(key)} />
                          <span className="muted font-medium">{smartFieldLabels[key] || key}</span>
                          <span className="truncate">{selected.tags[key] || "—"}</span>
                          <span className="accent-text truncate">{selectedSmart.tags[key] || "—"}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button className="btn btn-smart" disabled={!smartFields.length} onClick={() => void applySmartFix()}>Apply selected changes{selectedSmart.coverUrl ? " + matched cover" : ""}</button>
                      <span className="muted-soft text-xs">Low-confidence matches should be reviewed manually.</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((field) => (
                  <label key={field.key} className={field.key === "title" || field.key === "album" ? "sm:col-span-2" : ""}>
                    <span className="field-label">{field.label}</span>
                    <input className="input" value={selected.tags[field.key]} placeholder={field.placeholder} onChange={(event) => updateTag(field.key, event.target.value)} />
                  </label>
                ))}
                <label className="sm:col-span-2">
                  <span className="field-label">Comment</span>
                  <textarea className="input min-h-20 resize-y" value={selected.tags.comment} onChange={(event) => updateTag("comment", event.target.value)} />
                </label>
                <label className="sm:col-span-2">
                  <span className="field-label flex items-center justify-between gap-2">
                    <span>Lyrics</span>
                    <button type="button" className="text-link" disabled={lyricsLoading || !selected.tags.title || !selected.tags.artist} onClick={() => void findLyrics()}>{lyricsLoading ? "Searching…" : "Find lyrics"}</button>
                  </span>
                  <textarea className="input min-h-36 resize-y" value={selected.tags.lyrics} onChange={(event) => updateTag("lyrics", event.target.value)} />
                  <span className="muted-soft mt-1 block text-[11px]">Lyrics lookup uses LRCLIB and remains reviewable before export.</span>
                </label>
              </div>

              <div className="border-theme mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
                <button className="btn btn-primary" disabled={isSaving} onClick={() => void saveSelected()}>{isSaving ? "Creating MP3…" : "Save updated MP3"}</button>
                <button className="btn btn-secondary" onClick={() => {
                  const guessed = guessTagsFromFileName(selected.fileName);
                  updateTrackTags(selected.id, (tags) => ({ ...tags, ...Object.fromEntries(Object.entries(guessed).filter(([, value]) => value)) } as EditableTags));
                  setMessage("Re-applied filename intelligence to this track. Review the result before saving.");
                }}>Guess from filename</button>
                <div className="muted-soft text-xs">Your original file is never overwritten.</div>
              </div>
            </>
          )}
        </section>

        <aside className="panel min-h-[760px] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Cover Art</h2>
              <p className="muted-soft mt-1 text-xs">Search, upload, reuse, crop, resize, and compress.</p>
            </div>
            {selected && <button className="btn btn-ghost px-3 py-2 text-xs" onClick={() => void searchArtwork(selected, true)}>Refresh</button>}
          </div>

          {selected ? (
            <>
              <div className="cover-stage border-theme relative aspect-square overflow-hidden rounded-2xl border">
                {selected.cover ? (
                  <Image src={selected.cover.url} alt="Current cover" fill sizes="370px" className="object-cover" unoptimized />
                ) : (
                  <div className="muted-soft grid h-full place-items-center text-center"><div><div className="text-5xl">♪</div><div className="mt-2 text-sm">No embedded artwork</div></div></div>
                )}
              </div>
              <div className="muted mt-2 flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate">{selected.cover?.label || selected.cover?.source || "No artwork"}</span>
                <span className="shrink-0">{coverSizeLabel(selected.cover)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn btn-secondary" onClick={() => coverInput.current?.click()}>Upload image</button>
                <button className="btn btn-ghost" disabled={!selected.cover} onClick={removeCover}>Remove</button>
                <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void setCoverFromUpload(event)} />
              </div>

              <div className="cover-tool mt-3 rounded-xl border p-3">
                <div className="mb-2 text-xs font-semibold">Optimize cover</div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select className="input input-compact" value={coverSize} onChange={(event) => setCoverSize(Number(event.target.value))}>
                    <option value={500}>500 × 500</option>
                    <option value={1000}>1000 × 1000</option>
                    <option value={1500}>1500 × 1500</option>
                  </select>
                  <button className="btn btn-secondary text-xs" disabled={!selected.cover || isOptimizingCover} onClick={() => void optimizeSelectedCover()}>{isOptimizingCover ? "Optimizing…" : "Square + compress"}</button>
                </div>
                <p className="muted-soft mt-2 text-[11px]">Center-crops to a square and saves an ~88% quality JPEG locally.</p>
              </div>

              <div className="divider my-5 h-px" />
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Automatic suggestions</div>
                {isSearching && <div className="accent-text text-xs">Searching…</div>}
              </div>

              {searchError && <div className="warning-box mb-3 rounded-xl border p-3 text-xs">{searchError}</div>}
              {!selected.tags.artist || (!selected.tags.album && !selected.tags.title) ? (
                <div className="empty-box muted border rounded-xl p-4 text-xs">Add Artist plus Album or Title to search for matching artwork.</div>
              ) : artwork.length === 0 && !isSearching ? (
                <div className="empty-box muted border rounded-xl p-4 text-xs">No confident cover results yet. Adjust the tags and press Refresh.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {artwork.map((suggestion) => (
                    <button key={suggestion.id} className="suggestion-card overflow-hidden rounded-xl border text-left transition" onClick={() => void chooseSuggestion(suggestion)}>
                      <div className="suggestion-image relative aspect-square">
                        <Image src={suggestion.imageUrl} alt={suggestion.title} fill sizes="170px" className="object-cover" unoptimized />
                      </div>
                      <div className="p-2.5">
                        <div className="truncate text-xs font-semibold">{suggestion.title}</div>
                        <div className="muted-soft mt-1 truncate text-[11px]">{suggestion.date || suggestion.country || "MusicBrainz"}</div>
                        <div className="accent-text mt-1 text-[11px] font-medium">{suggestion.score}% match</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : <div className="muted-soft grid min-h-[520px] place-items-center text-center text-sm">Select a track to manage its artwork.</div>}
        </aside>
      </div>

      {message && <button className="toast fixed bottom-5 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl border px-4 py-3 text-left text-sm shadow-2xl" onClick={() => setMessage(undefined)}>{message}</button>}
      <footer className="muted-soft mx-auto max-w-[1720px] px-5 pb-8 pt-2 text-center text-xs">Developed by Ferdinand Degracia — AI Assisted Engineering · Metadata: MusicBrainz · Lyrics lookup: LRCLIB</footer>
    </main>
  );
}
