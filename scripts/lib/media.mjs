// Shared helpers for the footage scripts (transcribe, pack, autocut, edl,
// timeline, cutcheck, lyrics, analyze-reference).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, extname, join } from "node:path";

// On a Mac, Homebrew's plain ffmpeg has no text filter (drawtext) for the check sheets;
// ffmpeg-full has it but isn't on PATH by itself, so it goes first whenever it's installed.
for (const d of ["/opt/homebrew/opt/ffmpeg-full/bin", "/usr/local/opt/ffmpeg-full/bin"]) {
  const path = process.env.PATH || "";
  if (existsSync(join(d, "ffmpeg")) && !path.split(delimiter).includes(d)) process.env.PATH = d + delimiter + path;
}

export const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
export const writeJson = (p, data) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
};

// `--key=value` flags and positional arguments.
export const parseArgs = (argv) => {
  const opt = {};
  const pos = [];
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, ...v] = a.slice(2).split("=");
      opt[k] = v.length ? v.join("=") : true;
    } else pos.push(a);
  }
  return { opt, pos };
};

// Keys live in .env (gitignored) or the environment, never in chat or in the repo.
export const loadEnv = () => {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};

// A full system ffmpeg is needed for scdet, tile, silencedetect and showwavespic.
export const ff = (args, opts = {}) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", opts.loglevel || "error", "-y", ...args], { encoding: opts.binary ? "buffer" : "utf8", maxBuffer: 1024 * 1024 * 1024 });
  if (r.error) throw new Error("ffmpeg not found on PATH. Install it (brew install ffmpeg / apt install ffmpeg).");
  return r;
};
// A bold font file for labels burned into check sheets (ffmpeg drawtext), on Linux or macOS.
export const labelFont = () =>
  [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "C:/Windows/Fonts/arialbd.ttf",
  ].find((f) => existsSync(f)) || null;
export const ffprobe = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}`);
  return JSON.parse(r.stdout);
};
export const duration = (file) => Number(ffprobe(file).format?.duration || 0);
export const videoInfo = (file) => {
  const p = ffprobe(file);
  const v = p.streams.find((s) => s.codec_type === "video");
  const [n, d] = (v?.avg_frame_rate || "0/1").split("/").map(Number);
  return { width: v?.width, height: v?.height, fps: d ? n / d : 0, duration: Number(p.format?.duration || 0), hasAudio: p.streams.some((s) => s.codec_type === "audio") };
};

// Mono PCM samples as a Float32Array (for waveforms, pop detection and beat finding).
export const pcm = (file, { rate = 8000, start, length } = {}) => {
  const args = [];
  if (start !== undefined) args.push("-ss", String(Math.max(0, start)));
  if (length !== undefined) args.push("-t", String(length));
  args.push("-i", file, "-vn", "-ac", "1", "-ar", String(rate), "-f", "f32le", "-");
  const r = ff(args, { binary: true });
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
};

export const peaks = (samples, bins) => {
  const out = new Array(bins).fill(0);
  const per = Math.max(1, Math.floor(samples.length / bins));
  for (let b = 0; b < bins; b++) {
    let m = 0;
    for (let i = b * per; i < Math.min(samples.length, (b + 1) * per); i++) m = Math.max(m, Math.abs(samples[i]));
    out[b] = Number(m.toFixed(3));
  }
  return out;
};

export const sourceKey = (file) => basename(file, extname(file));
export const transcriptPath = (job, file) => join("jobs", job, "transcripts", `${sourceKey(file)}.json`);

// Paths in EDLs and props are relative to public/ (for staticFile); scripts need the disk path.
export const diskPath = (p) => (existsSync(p) ? p : join("public", p));
export const publicRel = (p) => p.replace(/^public\//, "");

export const FILLERS = ["um", "umm", "uh", "uhh", "erm", "er", "ah", "hmm", "mm", "mhm"];
export const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
export const isFiller = (w, extra = []) => [...FILLERS, ...extra].includes(norm(w.text));

export const ts = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

// A click at a cut: within ±5 ms of the middle of an 80 ms window, a sample step
// far bigger than the window's ordinary steps. Returns the step size, or 0.
export const popAt = (x, rate) => {
  if (x.length < rate * 0.02) return 0;
  const d = new Float32Array(x.length - 1);
  for (let i = 1; i < x.length; i++) d[i - 1] = Math.abs(x[i] - x[i - 1]);
  const mid = Math.floor(x.length / 2);
  const w = Math.round(rate * 0.005);
  let peak = 0;
  for (let i = Math.max(0, mid - w); i < Math.min(d.length, mid + w); i++) peak = Math.max(peak, d[i]);
  const sorted = Array.from(d).sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length * 0.9)] || 1e-6;
  return peak > 0.08 && peak / typical > 4 ? peak : 0;
};

// Composition size for an edit format.
export const FORMAT_SIZE = { "9x16": [1080, 1920], "16x9": [1920, 1080], "1x1": [1080, 1080], "4x5": [1080, 1350] };

// A face box [x, y, w, h] (0–1 of the source frame) mapped onto the output frame
// through the cover crop (object-position = focus) and the punch-in zoom.
export const mapBox = (box, src, out, focusX, focusY, zoom) => {
  const [W, H] = out;
  const s = Math.max(W / src.width, H / src.height);
  const offX = (W - src.width * s) * focusX;
  const offY = (H - src.height * s) * focusY;
  const ox = focusX * W;
  const oy = focusY * H;
  const map = (px, py) => [ox + (offX + px * src.width * s - ox) * zoom, oy + (offY + py * src.height * s - oy) * zoom];
  const [x1, y1] = map(box[0], box[1]);
  const [x2, y2] = map(box[0] + box[2], box[1] + box[3]);
  return { x1, y1, x2, y2 };
};
