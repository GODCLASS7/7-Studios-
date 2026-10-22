// Talking to the app server on this computer. Every change carries the x-7s header,
// which the server requires (other web pages can't add it).

export type Run = {
  id: string;
  task: string;
  label: string;
  args: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed" | "cancelled" | "stopped";
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  code?: number;
  log: string[];
  outputs: string[];
};
export type GalleryItem = {
  id: string;
  kind: "image" | "video";
  file: string;
  thumb: string | null;
  width: number;
  height: number;
  seconds: number | null;
  prompt: string;
  userPrompt: string;
  preset: string | null;
  character: string | null;
  engine: string;
  model: string | null;
  seed: number;
  aspect: string;
  quality: string;
  cost: { usd?: number; credits?: number; note?: string } | null;
  demo: boolean;
  createdAt: string;
  favorite: boolean;
  tags: string[];
  source?: { image: string | null; endImage: string | null };
};
export type Generation = {
  id: string;
  req: Record<string, unknown>;
  engine: string;
  status: "running" | "done" | "failed" | "waiting";
  stage: string;
  pct: number;
  note?: string;
  items: (GalleryItem & { pending?: boolean; requestId?: string; note?: string })[];
  error: string | null;
  createdAt: string;
};
export type Preset = {
  id: string;
  name: string;
  kind: "image" | "edit" | "video";
  category?: string;
  description?: string;
  prompt: string;
  aspect?: string;
  tags?: string[];
  params?: Record<string, unknown>;
  tested?: boolean;
};
export type Character = {
  id: string;
  name: string;
  description: string;
  consent: { kind: "self" | "permission" | "fictional"; note?: string; date?: string };
  refs: string[];
};
export type Status = {
  name: string;
  version: string;
  ffmpeg: string | null;
  node: string;
  platform: string;
  engine: {
    default: string;
    engines: string[];
    presets: number;
    characters: number;
    gallery: number;
    openUrl: string;
    premiumKey: boolean;
    workflows: Record<string, { draft: string; final: string }>;
    gpuHourly: number;
    premium: Record<string, string | null>;
  };
  keys: Record<string, boolean>;
  compositions: Record<string, string[]>;
};
export type Job = {
  id: string;
  title: string;
  format: string | null;
  updated: number;
  has: Record<string, boolean>;
};
export type FileEntry = { path: string; size: number; mtime: number };

export class ApiError extends Error {}

const call = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  const r = await fetch(url, {
    method,
    headers: body === undefined ? { "x-7s": "1" } : { "x-7s": "1", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!r.ok) throw new ApiError((data as { error?: string })?.error || (typeof data === "string" ? data : `Error ${r.status}`));
  return data as T;
};
export const get = <T>(url: string) => call<T>("GET", url);
export const post = <T>(url: string, body: unknown = {}) => call<T>("POST", url, body);
export const put = <T>(url: string, body: unknown) => call<T>("PUT", url, body);
export const patch = <T>(url: string, body: unknown) => call<T>("PATCH", url, body);
export const del = <T>(url: string) => call<T>("DELETE", url);

export const runTask = (task: string, args: Record<string, unknown> = {}) => post<Run>("/api/runs", { task, args });

// Upload one file with progress (fetch can't report upload progress).
export const upload = (file: File, opts: { job?: string; into?: string } = {}, onProgress?: (p: number) => void) =>
  new Promise<{ path: string; size: number }>((ok, bad) => {
    const q = new URLSearchParams({ name: file.name });
    if (opts.job) q.set("job", opts.job);
    if (opts.into) q.set("into", opts.into);
    const x = new XMLHttpRequest();
    x.open("POST", `/api/upload?${q}`);
    x.setRequestHeader("x-7s", "1");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      try {
        const d = JSON.parse(x.responseText);
        if (x.status >= 400) bad(new ApiError(d.error || "Upload failed"));
        else ok(d);
      } catch {
        bad(new ApiError("Upload failed"));
      }
    };
    x.onerror = () => bad(new ApiError("Upload failed: is 7 Studios still running?"));
    x.send(file);
  });

// Paths: media under public/ are served at /static, renders under out/ at /out.
export const mediaUrl = (p: string | null | undefined) => {
  if (!p) return "";
  if (/^(https?:|data:|blob:)/.test(p)) return p;
  const clean = p.replace(/^\/+/, "");
  if (clean.startsWith("out/")) return `/${clean}`;
  return `/static/${clean.replace(/^public\//, "")}`;
};
export const isVideo = (p: string) => /\.(mp4|mov|webm|m4v)$/i.test(p);
export const isImage = (p: string) => /\.(png|jpe?g|webp|gif|svg)$/i.test(p);
export const isAudio = (p: string) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(p);
export const fileName = (p: string) => p.split("/").pop() || p;
export const ago = (t: string | number) => {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};
export const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} kB`);
