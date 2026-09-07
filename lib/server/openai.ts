export const OPENAI_BASE = "https://api.openai.com/v1";

export function openAIKey() {
  return process.env.OPENAI_API_KEY?.trim() || "";
}

export async function openAIFetch(path: string, init: RequestInit = {}) {
  const key = openAIKey();
  if (!key) throw new Error("OPENAI_API_KEY is not configured on this Worker.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  return fetch(`${OPENAI_BASE}${path}`, { ...init, headers });
}

export function responseOutputText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const direct = (data as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  return "";
}

export async function upstreamError(response: Response) {
  try {
    const data = await response.json() as { error?: { message?: string } | string };
    if (typeof data.error === "string") return data.error;
    return data.error?.message || `OpenAI returned ${response.status}`;
  } catch {
    return `OpenAI returned ${response.status}`;
  }
}
