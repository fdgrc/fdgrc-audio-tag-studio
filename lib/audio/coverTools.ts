import type { CoverAsset } from "@/types/audio";

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the cover image."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode the cover image.")), type, quality);
  });
}

export async function optimizeCover(cover: CoverAsset, size = 1000, quality = 0.88): Promise<CoverAsset> {
  const image = await loadImage(cover.url);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, Math.floor((image.naturalWidth - sourceSize) / 2));
  const sourceY = Math.max(0, Math.floor((image.naturalHeight - sourceSize) / 2));

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available in this browser.");
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

  const blob = await canvasToBlob(canvas, "image/jpeg", quality);
  const data = await blob.arrayBuffer();
  return {
    url: URL.createObjectURL(blob),
    data,
    mimeType: "image/jpeg",
    source: "optimized",
    label: `${size}×${size} optimized JPEG`,
    width: size,
    height: size,
    bytes: blob.size,
  };
}

export function cloneCover(cover?: CoverAsset): CoverAsset | undefined {
  if (!cover) return undefined;
  if (!cover.data) return { ...cover };
  const data = cover.data.slice(0);
  return {
    ...cover,
    data,
    url: URL.createObjectURL(new Blob([data], { type: cover.mimeType || "image/jpeg" })),
  };
}
