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
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<TrackItem[]>([]);

  const selected = useMemo(() => tracks.find((track) => track.id === selectedId), [tracks, selectedId]);

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
    <main className="min-h-screen bg-[#080a0f] text-white">
      <header className="border-b border-white/10 bg-black/30 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 font-black text-black">F</div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">fdgrc Tag Studio</h1>
                <p className="text-xs text-white/45">MP3 metadata + cover art editor</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tracks.length > 0 && <button className="btn btn-ghost" onClick={clearAll}>Clear</button>}
            <button className="btn btn-primary" disabled={!tracks.length || isSaving} onClick={() => void saveAll()}>
              {isSaving ? "Working…" : `Export ${tracks.length || "All"} as ZIP`}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)_380px] lg:px-8">
        <aside className="panel min-h-[720px] overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInput.current?.click()}
              className="cursor-pointer rounded-2xl border border-dashed border-emerald-300/40 bg-emerald-300/[0.04] p-5 text-center transition hover:border-emerald-300/70 hover:bg-emerald-300/[0.07]"
            >
              <div className="mb-2 text-2xl">♫</div>
              <div className="text-sm font-semibold">Drop MP3 files here</div>
              <div className="mt-1 text-xs text-white/45">or click to choose files</div>
              <input ref={fileInput} type="file" accept="audio/mpeg,.mp3" multiple hidden onChange={(event) => event.target.files && void importFiles(event.target.files)} />
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 text-xs text-white/45">
            <span>{tracks.length} tracks</span>
            {isLoading && <span className="text-emerald-300">Reading…</span>}
          </div>

          <div className="max-h-[620px] overflow-y-auto px-2 pb-3">
            {tracks.length === 0 ? (
              <div className="px-4 py-14 text-center text-sm text-white/35">Your music stays on this device. Import an MP3 to begin.</div>
            ) : tracks.map((track) => (
              <div
                key={track.id}
                className={`group mb-1 flex w-full items-center gap-1 rounded-xl p-1 transition ${selectedId === track.id ? "bg-white/10" : "hover:bg-white/[0.05]"}`}
              >
                <button className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left" onClick={() => setSelectedId(track.id)}>
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5">
                    {track.cover ? <Image src={track.cover.url} alt="" fill sizes="44px" className="object-cover" unoptimized /> : <div className="grid h-full place-items-center text-white/30">♪</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{track.tags.title || track.fileName}</div>
                    <div className="truncate text-xs text-white/45">{track.tags.artist || "Unknown artist"}</div>
                  </div>
                </button>
                <button
                  aria-label={`Remove ${track.tags.title || track.fileName}`}
                  onClick={() => removeTrack(track.id)}
                  className="rounded-md px-2 py-1 text-white/25 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                >×</button>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel min-h-[720px] p-5 lg:p-6">
          {!selected ? (
            <div className="grid min-h-[650px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-3xl text-white/35">♪</div>
                <h2 className="text-xl font-semibold">Select an MP3 to edit</h2>
                <p className="mt-2 max-w-md text-sm text-white/45">Tags are read in your browser. The audio file is not uploaded for editing.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-xl font-semibold">{selected.tags.title || selected.fileName}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
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

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
                <button className="btn btn-primary" disabled={isSaving} onClick={() => void saveSelected()}>{isSaving ? "Creating MP3…" : "Save updated MP3"}</button>
                <div className="text-xs text-white/40">Your original file is never overwritten.</div>
              </div>
            </>
          )}
        </section>

        <aside className="panel min-h-[720px] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Cover Art</h2>
              <p className="mt-1 text-xs text-white/40">Embedded, uploaded, or suggested automatically.</p>
            </div>
            {selected && <button className="btn btn-ghost px-3 py-2 text-xs" onClick={() => void searchArtwork(selected, true)}>Refresh</button>}
          </div>

          {selected ? (
            <>
              <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                {selected.cover ? (
                  <Image src={selected.cover.url} alt="Current cover" fill sizes="340px" className="object-cover" unoptimized />
                ) : (
                  <div className="grid h-full place-items-center text-center text-white/30"><div><div className="text-5xl">♪</div><div className="mt-2 text-sm">No embedded artwork</div></div></div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn btn-secondary" onClick={() => coverInput.current?.click()}>Upload image</button>
                <button className="btn btn-ghost" disabled={!selected.cover} onClick={removeCover}>Remove</button>
                <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void setCoverFromUpload(event)} />
              </div>

              <div className="my-5 h-px bg-white/10" />
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Automatic suggestions</div>
                {isSearching && <div className="text-xs text-emerald-300">Searching…</div>}
              </div>

              {searchError && <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-amber-100">{searchError}</div>}
              {!selected.tags.artist || (!selected.tags.album && !selected.tags.title) ? (
                <div className="rounded-xl border border-white/10 p-4 text-xs text-white/40">Add Artist plus Album or Title to search for matching artwork.</div>
              ) : artwork.length === 0 && !isSearching ? (
                <div className="rounded-xl border border-white/10 p-4 text-xs text-white/40">No confident cover results yet. Adjust the tags and press Refresh.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {artwork.map((suggestion) => (
                    <button key={suggestion.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] text-left transition hover:border-emerald-300/40" onClick={() => void chooseSuggestion(suggestion)}>
                      <div className="relative aspect-square bg-white/5">
                        <Image src={suggestion.imageUrl} alt={suggestion.title} fill sizes="160px" className="object-cover" unoptimized />
                      </div>
                      <div className="p-2.5">
                        <div className="truncate text-xs font-semibold">{suggestion.title}</div>
                        <div className="mt-1 truncate text-[11px] text-white/40">{suggestion.date || suggestion.country || "MusicBrainz"}</div>
                        <div className="mt-1 text-[11px] font-medium text-emerald-300">{suggestion.score}% match</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : <div className="grid min-h-[500px] place-items-center text-center text-sm text-white/35">Select a track to manage its artwork.</div>}
        </aside>
      </div>

      {message && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-white/10 bg-[#171b22] px-4 py-3 text-sm shadow-2xl">{message}</div>}
      <footer className="mx-auto max-w-[1600px] px-5 pb-8 pt-2 text-center text-xs text-white/30">Developed by Ferdinand Degracia — AI Assisted Engineering</footer>
    </main>
  );
}
