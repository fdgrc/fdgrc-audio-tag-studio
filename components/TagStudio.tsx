"use client";

import Image from "next/image";
import JSZip from "jszip";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readTrack } from "@/lib/audio/readMetadata";
import { suggestedOutputName, writeMp3 } from "@/lib/audio/writeId3";
import { formatBitrate, formatDuration } from "@/lib/format";
import type { ArtworkSuggestion, CoverAsset, EditableTags, TrackItem } from "@/types/audio";

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

type ThemeMode = "light" | "system" | "dark";

const themeOptions: Array<{ value: ThemeMode; icon: string; label: string }> = [
  { value: "light", icon: "☀", label: "Light" },
  { value: "system", icon: "◐", label: "System" },
  { value: "dark", icon: "☾", label: "Dark" },
];

const THEME_STORAGE_KEY = "fdgrc-tag-studio-theme";

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

function revokeTrackUrls(track: TrackItem) {
  URL.revokeObjectURL(track.audioUrl);
  if (track.cover?.url.startsWith("blob:")) URL.revokeObjectURL(track.cover.url);
}

export default function TagStudio() {
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [artwork, setArtwork] = useState<ArtworkSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [lastSearchKey, setLastSearchKey] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("system");
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<TrackItem[]>([]);

  const selected = useMemo(() => tracks.find((track) => track.id === selectedId), [tracks, selectedId]);
  const dirtyCount = useMemo(() => tracks.filter((track) => track.dirty).length, [tracks]);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark" || current === "system") setTheme(current);
  }, []);

  function changeTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme still applies for the current session when storage is unavailable.
    }
  }

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    return () => tracksRef.current.forEach(revokeTrackUrls);
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
    setTracks((current) => current.map((track) => track.id === selectedId ? { ...track, tags: { ...track.tags, [key]: value }, dirty: true } : track));
  }

  function removeTrack(id: string) {
    const removing = tracks.find((track) => track.id === id);
    if (removing) revokeTrackUrls(removing);
    const remaining = tracks.filter((track) => track.id !== id);
    setTracks(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id);
  }

  function clearAll() {
    tracks.forEach(revokeTrackUrls);
    setTracks([]);
    setSelectedId(undefined);
    setArtwork([]);
    setMessage(undefined);
  }

  async function setCoverFromUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedId) return;
    if (!file.type.startsWith("image/")) return;
    const data = await file.arrayBuffer();
    const url = URL.createObjectURL(new Blob([data], { type: file.type }));
    setTracks((current) => current.map((track) => {
      if (track.id !== selectedId) return track;
      if (track.cover?.url.startsWith("blob:")) URL.revokeObjectURL(track.cover.url);
      return { ...track, cover: { url, data, mimeType: file.type, source: "upload", label: file.name }, dirty: true };
    }));
    event.target.value = "";
  }

  function removeCover() {
    if (!selectedId) return;
    setTracks((current) => current.map((track) => {
      if (track.id !== selectedId) return track;
      if (track.cover?.url.startsWith("blob:")) URL.revokeObjectURL(track.cover.url);
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
  }, [lastSearchKey]);

  useEffect(() => {
    if (!selected) {
      setArtwork([]);
      return;
    }
    const timer = window.setTimeout(() => void searchArtwork(selected), 650);
    return () => window.clearTimeout(timer);
  }, [selected, searchArtwork]);

  async function chooseSuggestion(suggestion: ArtworkSuggestion) {
    if (!selectedId) return;
    const response = await fetch(suggestion.imageUrl);
    if (!response.ok) {
      setSearchError("That cover image could not be loaded.");
      return;
    }
    const data = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
    setTracks((current) => current.map((track) => {
      if (track.id !== selectedId) return track;
      if (track.cover?.url.startsWith("blob:")) URL.revokeObjectURL(track.cover.url);
      const cover: CoverAsset = { url, data, mimeType, source: "suggestion", label: suggestion.title };
      return { ...track, cover, dirty: true };
    }));
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="brand-tile grid h-10 w-10 place-items-center rounded-xl font-black">F</div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">fdgrc Tag Studio</h1>
              <p className="muted-soft text-xs">MP3 metadata + cover art editor</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
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

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_380px] lg:px-8">
        <aside className="panel min-h-[720px] overflow-hidden">
          <div className="border-theme border-b p-4">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              className="drop-zone cursor-pointer rounded-2xl border border-dashed p-5 text-center transition"
            >
              <div className="mb-2 text-2xl">♫</div>
              <div className="text-sm font-semibold">Drop MP3 files here</div>
              <div className="muted mt-1 text-xs">or click to choose files</div>
              <input ref={fileInput} type="file" accept="audio/mpeg,.mp3" multiple hidden onChange={(event) => event.target.files && void importFiles(event.target.files)} />
            </div>
          </div>

          <div className="muted flex items-center justify-between px-4 py-3 text-xs">
            <span>{tracks.length} tracks</span>
            {isLoading && <span className="accent-text">Reading…</span>}
          </div>

          <div className="max-h-[620px] overflow-y-auto px-2 pb-3">
            {tracks.length === 0 ? (
              <div className="muted-soft px-4 py-14 text-center text-sm">Your music stays on this device. Import an MP3 to begin.</div>
            ) : tracks.map((track) => (
              <div
                key={track.id}
                className={`track-row group mb-1 flex w-full items-center gap-1 rounded-xl p-1 transition ${selectedId === track.id ? "selected" : ""}`}
              >
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
                  </div>
                </button>
                <button
                  aria-label={`Remove ${track.tags.title || track.fileName}`}
                  onClick={() => removeTrack(track.id)}
                  className="remove-track rounded-md px-2 py-1 opacity-0 group-hover:opacity-100"
                >×</button>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel min-h-[720px] p-5 lg:p-6">
          {!selected ? (
            <div className="grid min-h-[650px] place-items-center text-center">
              <div>
                <div className="icon-stage muted-soft border-theme mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border text-3xl">♪</div>
                <h2 className="text-xl font-semibold">Select an MP3 to edit</h2>
                <p className="muted mt-2 max-w-md text-sm">Tags are read in your browser. The audio file is not uploaded for editing.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="border-theme mb-6 flex flex-col gap-4 border-b pb-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {selected.dirty && <span className="dirty-dot" title="Edited" />}
                    <div className="truncate text-xl font-semibold">{selected.tags.title || selected.fileName}</div>
                  </div>
                  <div className="muted mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>{formatDuration(selected.duration)}</span>
                    <span>{formatBitrate(selected.bitrate)}</span>
                    <span>{selected.sampleRate ? `${(selected.sampleRate / 1000).toFixed(1)} kHz` : "—"}</span>
                    <span>{(selected.file.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                </div>
                <audio controls src={selected.audioUrl} className="h-10 w-full max-w-lg" />
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
                  <span className="field-label">Lyrics</span>
                  <textarea className="input min-h-32 resize-y" value={selected.tags.lyrics} onChange={(event) => updateTag("lyrics", event.target.value)} />
                </label>
              </div>

              <div className="border-theme mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
                <button className="btn btn-primary" disabled={isSaving} onClick={() => void saveSelected()}>{isSaving ? "Creating MP3…" : "Save updated MP3"}</button>
                <div className="muted-soft text-xs">Your original file is never overwritten.</div>
              </div>
            </>
          )}
        </section>

        <aside className="panel min-h-[720px] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Cover Art</h2>
              <p className="muted-soft mt-1 text-xs">Embedded, uploaded, or suggested automatically.</p>
            </div>
            {selected && <button className="btn btn-ghost px-3 py-2 text-xs" onClick={() => void searchArtwork(selected, true)}>Refresh</button>}
          </div>

          {selected ? (
            <>
              <div className="cover-stage border-theme relative aspect-square overflow-hidden rounded-2xl border">
                {selected.cover ? (
                  <Image src={selected.cover.url} alt="Current cover" fill sizes="340px" className="object-cover" unoptimized />
                ) : (
                  <div className="muted-soft grid h-full place-items-center text-center"><div><div className="text-5xl">♪</div><div className="mt-2 text-sm">No embedded artwork</div></div></div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn btn-secondary" onClick={() => coverInput.current?.click()}>Upload image</button>
                <button className="btn btn-ghost" disabled={!selected.cover} onClick={removeCover}>Remove</button>
                <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void setCoverFromUpload(event)} />
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
                        <Image src={suggestion.imageUrl} alt={suggestion.title} fill sizes="160px" className="object-cover" unoptimized />
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
          ) : <div className="muted-soft grid min-h-[500px] place-items-center text-center text-sm">Select a track to manage its artwork.</div>}
        </aside>
      </div>

      {message && <div className="toast fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-2xl">{message}</div>}
      <footer className="muted-soft mx-auto max-w-[1600px] px-5 pb-8 pt-2 text-center text-xs">Developed by Ferdinand Degracia — AI Assisted Engineering</footer>
    </main>
  );
}
