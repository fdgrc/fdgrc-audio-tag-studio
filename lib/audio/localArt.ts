import type { ArtConcept, CoverAsset } from "@/types/audio";

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const fallbackColors = ["#151a2e", "#354266", "#d36b4a", "#e8c07d", "#7ca6a6"];
const named: Record<string, string> = {
  navy: "#14213d", black: "#0b0d12", "electric blue": "#2775ff", rose: "#c34f73", amber: "#e39a2d",
  "deep plum": "#4b2142", slate: "#5d687c", "faded violet": "#74658f", sepia: "#8a6745", "dusty blue": "#66849b",
  "warm cream": "#ead9b7", crimson: "#a62b3b", charcoal: "#282a30", teal: "#248b8b", "sunset orange": "#e87945",
  "asphalt gray": "#4d5159", "forest green": "#2f6049", "ocean blue": "#347d9a", sand: "#cdb98d", red: "#ba3038", gold: "#d6a93b",
};

function color(value: string, index: number) {
  return named[value.toLowerCase()] || fallbackColors[index % fallbackColors.length];
}

export async function renderLocalConceptCover(input: {
  artist: string;
  title: string;
  palette: string[];
  concept: ArtConcept;
  includeText: boolean;
  direction?: string;
}): Promise<CoverAsset> {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");

  const seed = hashString(`${input.artist}|${input.title}|${input.concept.id}|${input.direction || ""}`);
  const random = rng(seed);
  const colors = (input.palette.length ? input.palette : fallbackColors).map(color);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.55, colors[1] || colors[0]);
  grad.addColorStop(1, colors[2] || colors[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 18; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 50 + random() * 260;
    const radial = ctx.createRadialGradient(x, y, 0, x, y, radius);
    radial.addColorStop(0, `${colors[(i + 2) % colors.length]}aa`);
    radial.addColorStop(1, `${colors[(i + 1) % colors.length]}00`);
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    const y = size * (0.16 + i * 0.085) + (random() - 0.5) * 50;
    ctx.moveTo(-20, y);
    for (let x = 0; x <= size + 40; x += 64) {
      ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * (2 + random() * 3) + i) * (20 + random() * 70));
    }
    ctx.stroke();
  }

  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.52)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  if (input.includeText) {
    ctx.fillStyle = "rgba(255,255,255,.96)";
    ctx.textBaseline = "bottom";
    ctx.font = "700 70px Arial, sans-serif";
    ctx.fillText((input.title || "Untitled").slice(0, 28), 72, 880, 880);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "500 32px Arial, sans-serif";
    ctx.fillText((input.artist || "Unknown Artist").slice(0, 40), 76, 930, 870);
  }

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not render cover.")), "image/jpeg", 0.9));
  const buffer = await blob.arrayBuffer();
  return { url: URL.createObjectURL(blob), data: buffer, mimeType: "image/jpeg", label: `Local ${input.concept.title} cover`, source: "generated", width: size, height: size, bytes: blob.size };
}
