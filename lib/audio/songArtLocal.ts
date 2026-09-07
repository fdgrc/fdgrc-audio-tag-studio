import type { SongAnalysis } from "@/types/audio";

const groups = [
  { theme: "love", mood: "warm and intimate", palette: ["rose", "amber", "deep plum"], words: ["love","heart","kiss","hold","baby","darling","together","touch","forever"] },
  { theme: "heartbreak", mood: "melancholic and reflective", palette: ["midnight blue", "slate", "faded violet"], words: ["goodbye","gone","alone","lonely","cry","tears","broken","miss","lost","leave","left"] },
  { theme: "night", mood: "cinematic and nocturnal", palette: ["navy", "black", "electric blue"], words: ["night","midnight","moon","stars","dark","street","city","lights","neon"] },
  { theme: "memory", mood: "nostalgic and dreamlike", palette: ["sepia", "dusty blue", "warm cream"], words: ["remember","memory","memories","yesterday","again","past","dream","dreaming","old"] },
  { theme: "fire and light", mood: "radiant and dramatic", palette: ["amber", "crimson", "charcoal"], words: ["fire","flame","burn","light","shine","spark","bright","sun","glow"] },
  { theme: "travel", mood: "open and cinematic", palette: ["teal", "sunset orange", "asphalt gray"], words: ["road","drive","train","car","home","away","miles","run","running","fly","journey"] },
  { theme: "nature", mood: "organic and atmospheric", palette: ["forest green", "ocean blue", "sand"], words: ["rain","ocean","sea","river","wind","sky","cloud","mountain","flower","tree"] },
  { theme: "power", mood: "bold and energetic", palette: ["red", "gold", "black"], words: ["power","strong","fight","rise","king","queen","win","alive","free","freedom"] },
];

function words(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter(Boolean);
}

function safeTitle(value: string, fallback: string) {
  return value.trim() || fallback;
}

export function analyzeSongLocally(input: { artist?: string; title?: string; album?: string; lyrics?: string }): SongAnalysis {
  const tokens = words(input.lyrics || "");
  const counts = new Map<string, number>();
  for (const group of groups) {
    const set = new Set(group.words);
    counts.set(group.theme, tokens.reduce((sum, token) => sum + (set.has(token) ? 1 : 0), 0));
  }
  const ranked = groups
    .map((group) => ({ ...group, score: counts.get(group.theme) || 0 }))
    .sort((a, b) => b.score - a.score);
  const primary = ranked[0].score > 0 ? ranked[0] : groups[3];
  const secondary = ranked.find((item) => item.theme !== primary.theme && item.score > 0) || groups[2];
  const themes = [primary.theme, secondary.theme].filter((v, i, a) => a.indexOf(v) === i);
  const imagery = [
    `${primary.theme} as a central visual metaphor`,
    `${secondary.theme} used as environmental detail`,
    "strong square composition with one clear focal point",
    "subtle texture that remains readable at thumbnail size",
  ];
  const title = safeTitle(input.title || "", "Untitled");
  const artist = safeTitle(input.artist || "", "Unknown artist");
  const summary = tokens.length
    ? `A ${primary.mood} visual direction led by ${themes.join(" and ")}. The concept uses the song's recurring language as visual cues without reproducing the lyrics.`
    : `A cautious metadata-led visual direction for “${title}” by ${artist}; add or transcribe lyrics for stronger theme detection.`;
  const palette = Array.from(new Set([...primary.palette, ...secondary.palette])).slice(0, 6);
  const energy = /!{2,}/.test(input.lyrics || "") || tokens.length > 500 ? "dynamic" : primary.theme === "power" || primary.theme === "fire and light" ? "high" : primary.theme === "heartbreak" || primary.theme === "memory" ? "low" : "medium";
  const concepts = [
    {
      id: "local-symbol",
      title: "Symbolic Focus",
      description: `A single symbolic subject expressing ${primary.theme}, surrounded by understated ${secondary.theme} details. Minimal and emotionally direct.`,
      prompt: `Original square cover for ${title} by ${artist}. Single symbolic focal subject expressing ${primary.theme}; subtle ${secondary.theme} environmental details; ${primary.mood}; palette ${palette.join(", ")}; cinematic lighting; no logos or copied album artwork.`,
    },
    {
      id: "local-cinematic",
      title: "Cinematic Scene",
      description: `A wide-feeling scene compressed into a square frame, with atmosphere built around ${primary.theme} and ${secondary.theme}.`,
      prompt: `Original cinematic square song cover for ${title}. Atmospheric scene built around ${primary.theme} and ${secondary.theme}; ${primary.mood}; palette ${palette.join(", ")}; strong depth, subtle grain, clear focal point, no copied artwork.`,
    },
    {
      id: "local-abstract",
      title: "Abstract Pulse",
      description: `Abstract shapes, light and texture derived from the song's ${primary.theme} mood, designed to remain distinctive as a small cover thumbnail.`,
      prompt: `Original abstract square cover for ${title}. Geometric and organic forms reflecting ${primary.theme}; hints of ${secondary.theme}; palette ${palette.join(", ")}; modern editorial composition, textured, no logos, no existing cover imitation.`,
    },
  ];
  return { summary, mood: primary.mood, energy: energy as SongAnalysis["energy"], themes, imagery, palette, concepts };
}
