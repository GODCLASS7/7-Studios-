#!/usr/bin/env node
// Check a rendered edit at every cut, before anyone else sees it.
//
//   node scripts/cutcheck.mjs <job> <render.mp4>
//
// Uses jobs/<job>/.edl.resolved.json (from edl.mjs) to know where the cuts are.
//   Audio pop     a click or step in the sound at a cut               → FAIL
//   Black frame   a black or blank frame at a cut                     → FAIL
//   Flash         a piece shorter than 0.3 s                          → WARN
//   Jump cut      two pieces of one take back to back, same framing   → WARN (punch in, or cover with b-roll)
//   Face          a caption or overlay over a face box (set "faceBox" per source in edl.json) → WARN
//   Length        render length differs from the edit list           → FAIL
// Also draws out/<job>/cutcheck-v<N>.png: the frame before and after each cut,
// with the render time burned in, to read before sending the cut.
// Appends the report to jobs/<job>/qc.md. Exits 1 on any FAIL.

import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { diskPath, ff, parseArgs, pcm, popAt, readJson, ts, videoInfo } from "./lib/media.mjs";

const { pos } = parseArgs(process.argv.slice(2));
const [job, render] = pos;
const p = readJson(join("jobs", job || "", ".edl.resolved.json"));
if (!p || !render) {
  console.error("Usage: node scripts/cutcheck.mjs <job> <render.mp4>   (run edl.mjs first)");
  process.exit(1);
}
const info = videoInfo(render);
const W = info.width;
const H = info.height;
const fps = p.fps;
const results = [];
const add = (name, status, detail) => results.push({ name, status, detail });

const expected = p.durationInFrames / fps;
add("Length", Math.abs(info.duration - expected) <= 0.1 ? "PASS" : "FAIL", `${info.duration.toFixed(2)} s (edit list ${expected.toFixed(2)} s)`);

const cuts = p.segments.slice(1).map((s, i) => ({ i: i + 1, frame: s.from, t: s.from / fps, prev: p.segments[i], next: s }));

// Audio: the biggest sample-to-sample step right at the cut, against the sound around it.
const pops = [];
if (info.hasAudio) {
  for (const c of cuts) {
    const rate = 48000;
    const x = pcm(render, { rate, start: c.t - 0.04, length: 0.08 });
    const step = popAt(x, rate);
    if (step) pops.push(`${ts(c.t)} (step ${step.toFixed(2)})`);
  }
  add("Audio pops", pops.length ? "FAIL" : "PASS", pops.length ? `at ${pops.join(", ")}` : `none at ${cuts.length} cuts`);
} else add("Audio pops", "PASS", "no audio in render");

// Black or blank frames either side of each cut.
const lum = (t) => {
  const r = ff(["-ss", Math.max(0, t).toFixed(3), "-i", render, "-frames:v", "1", "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"], { binary: true });
  const b = r.stdout;
  let s = 0;
  for (const v of b) s += v;
  return b.length ? s / b.length : 255;
};
const black = [];
for (const c of cuts) {
  for (const t of [c.t - 1 / fps, c.t + 0.5 / fps]) if (lum(t) < 10) black.push(ts(t));
}
add("Black frames at cuts", black.length ? "FAIL" : "PASS", black.length ? `at ${black.join(", ")}` : "none");

const flashes = p.segments.filter((s) => s.durationInFrames < 0.3 * fps).map((s) => `${ts(s.from / fps)} (${(s.durationInFrames / fps).toFixed(2)} s)`);
add("Flash pieces", flashes.length ? "WARN" : "PASS", flashes.length ? `under 0.3 s at ${flashes.join(", ")}` : "none under 0.3 s");

const jumps = cuts.filter((c) => c.prev.src === c.next.src && c.prev.zoom === c.next.zoom && c.next.trimBefore !== c.prev.trimBefore + c.prev.durationInFrames).map((c) => ts(c.t));
add("Unmasked jump cuts", jumps.length ? "WARN" : "PASS", jumps.length ? `same take and framing at ${jumps.join(", ")}: punch in, cut to b-roll or cover with a graphic` : "every jump cut changes framing");

// Face boxes: source-normalised [x, y, w, h] mapped through the cover crop and punch-in.
const srcInfo = {};
const faceRect = (seg, key) => {
  const box = p.faceBoxes[key];
  if (!box) return null;
  srcInfo[seg.src] ??= videoInfo(diskPath(seg.src));
  const { width: w, height: h } = srcInfo[seg.src];
  const s = Math.max(W / w, H / h);
  const offX = (W - w * s) * seg.focusX;
  const offY = (H - h * s) * seg.focusY;
  const ox = seg.focusX * W;
  const oy = seg.focusY * H;
  const map = (px, py) => [ox + (offX + px * w * s - ox) * seg.zoom, oy + (offY + py * h * s - oy) * seg.zoom];
  const [x1, y1] = map(box[0], box[1]);
  const [x2, y2] = map(box[0] + box[2], box[1] + box[3]);
  return { x1, y1, x2, y2 };
};
const segAt = (frame) => p.segments.findIndex((s) => frame >= s.from && frame < s.from + s.durationInFrames);
const portrait = H > W;
const u = Math.min(W, H) / 1080;
const capSize = (portrait ? 74 : 58) * u * (p.captions.size || 1);
const overlaps = (a, b) => a && b && a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
const faceHits = [];
const checkBand = (label, frame, band) => {
  const i = segAt(frame);
  if (i < 0) return;
  const f = faceRect(p.segments[i], p.cutSources[i]);
  if (overlaps(f, band)) faceHits.push(`${label} at ${ts(frame / fps)}`);
};
for (const c of p.cues) {
  const top = H * p.captions.position - capSize * 0.6;
  const lines = c.words.map((w) => w.text).join(" ").length > 16 ? 2 : 1;
  checkBand("caption", Math.round(((c.startMs + c.endMs) / 2000) * fps), { x1: W * 0.12, x2: W * 0.88, y1: top, y2: top + lines * capSize * 1.12 });
}
for (const o of p.overlays) {
  const y = (o.y ?? (o.kind === "lower-third" ? (portrait ? 0.56 : 0.82) : o.kind === "title" ? (portrait ? 0.16 : 0.14) : 0.12)) * H;
  checkBand(o.kind, o.from + Math.round(o.durationInFrames / 2), { x1: W * 0.1, x2: W * 0.9, y1: y - 70 * u, y2: y + 70 * u });
}
const anyFace = Object.keys(p.faceBoxes).length > 0;
add("Text over faces", faceHits.length ? "WARN" : "PASS", anyFace ? (faceHits.length ? faceHits.join(", ") : "captions and overlays clear of faces") : "not checked: add \"faceBox\": [x, y, w, h] (0–1 of the source frame) to each source in edl.json");

// Cut sheet: last frame before and first frame after each cut, render time burned in.
const sheet = join("out", job, `cutcheck-v${p.version}.png`);
if (cuts.length) {
  const sel = cuts.flatMap((c) => [`eq(n\\,${c.frame - 1})`, `eq(n\\,${c.frame})`]).join("+");
  const rows = Math.ceil((cuts.length * 2) / 4);
  const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const label = `drawtext=fontfile=${font}:text='%{pts\\:hms}':x=12:y=12:fontsize=${Math.round(H / 28)}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8,`;
  let r = ff(["-i", render, "-vf", `${label}select='${sel}',scale=${portrait ? 270 : 480}:-2,tile=4x${rows}:padding=6:color=0x0B0B0D`, "-frames:v", "1", "-fps_mode", "passthrough", sheet]);
  if (r.status !== 0) r = ff(["-i", render, "-vf", `select='${sel}',scale=${portrait ? 270 : 480}:-2,tile=4x${rows}:padding=6:color=0x0B0B0D`, "-frames:v", "1", "-fps_mode", "passthrough", sheet]);
  add("Cut sheet", r.status === 0 ? "PASS" : "WARN", r.status === 0 ? `${sheet} (pairs: before | after, in cut order)` : "could not draw");
}

const icon = { PASS: "✅", WARN: "⚠️", FAIL: "❌" };
const report = `\n## Cut check — ${render} — ${new Date().toISOString()}\n\n${cuts.length} cuts in edit v${p.version}.\n\n| Check | Result | Detail |\n|---|---|---|\n${results.map((r) => `| ${r.name} | ${icon[r.status]} ${r.status} | ${r.detail} |`).join("\n")}\n`;
console.log(report);
appendFileSync(join("jobs", job, "qc.md"), report);
process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
