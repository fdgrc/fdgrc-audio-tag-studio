import type { TranscriptSegment } from "@/types/audio";

function pad(value: number, width = 2) {
  return String(Math.max(0, Math.floor(value))).padStart(width, "0");
}

function parts(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return { hours, minutes, secs, ms: Math.min(ms, 999) };
}

function srtTime(seconds: number) {
  const { hours, minutes, secs, ms } = parts(seconds);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
}

function vttTime(seconds: number) {
  const { hours, minutes, secs, ms } = parts(seconds);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
}

function lrcTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.min(99, Math.round((safe - Math.floor(safe)) * 100));
  return `${pad(minutes)}:${pad(secs)}.${pad(centis)}`;
}

export function segmentsToLrc(segments: TranscriptSegment[]) {
  return segments
    .filter((segment) => segment.text.trim())
    .map((segment) => `[${lrcTime(segment.start)}]${segment.text.trim()}`)
    .join("\n");
}

export function segmentsToSrt(segments: TranscriptSegment[]) {
  return segments
    .filter((segment) => segment.text.trim())
    .map((segment, index) => `${index + 1}\n${srtTime(segment.start)} --> ${srtTime(Math.max(segment.end, segment.start + 0.5))}\n${segment.text.trim()}`)
    .join("\n\n");
}

export function segmentsToVtt(segments: TranscriptSegment[]) {
  const body = segments
    .filter((segment) => segment.text.trim())
    .map((segment) => `${vttTime(segment.start)} --> ${vttTime(Math.max(segment.end, segment.start + 0.5))}\n${segment.text.trim()}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}`;
}

export function segmentsToSyncedLyrics(segments: TranscriptSegment[]) {
  return segments
    .filter((segment) => segment.text.trim())
    .map((segment) => [segment.text.trim(), Math.max(0, Math.round(segment.start * 1000))] as [string, number]);
}
