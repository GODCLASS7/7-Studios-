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
//   Face          a caption, overlay, insert or card over a face box (set "faceBox" per source in edl.json) → WARN
//   Safe zone     on 9:16, text or graphics under Instagram/TikTok's buttons and captions
//                 (outside x 6–89%, y 11–82% of the frame)                     → WARN
//   Length        render length differs from the edit list           → FAIL
// Also draws out/<job>/cutcheck-v<N>.png: the frame before and after each cut,
// with the render time burned in, to read before sending the cut.
// Appends the report to jobs/<job>/qc.md (not with --no-log, as the test runner uses). Exits 1 on any FAIL.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { diskPath, ff, labelFont, mapBox, parseArgs, pcm, popAt, readJson, ts, videoInfo } from "./lib/media.mjs";

const { pos, opt } = parseArgs(process.argv.slice(2));
const [job, render] = pos;
const p = readJson(join("jobs", job || "", ".edl.resolved.json"));
if (!p || !render) {
  console.error("Usage: node scripts/cutcheck.mjs <job> <render.mp4>   (run edl.mjs first)");
  process.exit(1);
}
mkdirSync(join("out", job), { recursive: true });
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
  const box = seg.faceBox || p.faceBoxes[key];
  if (!box) return null;
  srcInfo[seg.src] ??= videoInfo(diskPath(seg.src));
  return mapBox(box, srcInfo[seg.src], [W, H], seg.focusX, seg.focusY, seg.zoom);
};
const segAt = (frame) => p.segments.findIndex((s) => frame >= s.from && frame < s.from + s.durationInFrames);
const portrait = H > W;
const u = Math.min(W, H) / 1080;
const capSize = (portrait ? 74 : 58) * u * (p.captions.size || 1);
const overlaps = (a, b) => a && b && a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
const faceHits = [];
// A title's box at frame f, estimated from its style and text (src/titles/TitleFX.tsx sizes:
// base size, average letter width in em, line height). Close enough to flag a clash.
const TITLE_METRICS = { cutout: [150, 0.8, 1.3], editorial: [320, 0.5, 1.0], inflate: [230, 0.78, 1.2], neon: [210, 0.42, 1.1], extrude: [240, 0.5, 1.05], poster: [400, 0.5, 0.92], outline: [230, 0.74, 1.05], tag: [40, 0.55, 1.05] };
const titleBox = (t, f) => {
  const u = Math.min(W, H) / 1080;
  const ls = t.text.split("|").map((l) => l.replace(/\*/g, "").trim());
  const n = ls.length + (t.sub ? 0.3 : 0);
  const [base, em, lh] = TITLE_METRICS[t.style] || [200, 0.6, 1.1]; // a style added later still gets a rough box
  const longest = Math.max(...ls.map((l) => l.length));
  let w;
  let h;
  if (t.style === "tag") {
    // A one-line label (lines joined) at a fixed size, with padding, a dot and an optional sub line.
    const fs = base * u * t.size;
    w = ls.join(" ").length * em * fs + 78 * u * t.size;
    h = fs * lh + (t.sub ? fs * 0.5 + 4 * u : 0) + 28 * u * t.size;
  } else if (t.style === "poster") {
    w = Math.min(W * 0.84, 900 * u * t.size);
    h = Math.min(H * 0.62, ls.reduce((sum, l) => sum + Math.min(400 * u, w / Math.max(1, l.length * em)) * lh, 0));
  } else {
    const maxW = W * (t.style === "editorial" ? 0.9 : 0.82);
    const fs = Math.min(base * u * t.size, (H * 0.55) / (n * lh), maxW / Math.max(1, longest * em));
    w = Math.min(maxW, longest * em * fs);
    h = n * fs * lh;
  }
  const rel = f - t.from;
  const pinned = t.pin && t.pin.length > 1;
  const pk = pinned ? t.pin.reduce((best, k) => (Math.abs(k[0] - rel) < Math.abs(best[0] - rel) ? k : best)) : null;
  const cx = ((pk ? pk[1] : 0) + t.x) * W;
  const cy = ((pk ? pk[2] : 0) + t.y) * H;
  return { x1: cx - w / 2, x2: cx + w / 2, y1: cy - h / 2, y2: cy + h / 2 };
};
for (const t of p.titles || []) {
  if (t.layer !== "front") continue;
  for (const f of [t.from + Math.round(t.durationInFrames * 0.3), t.from + Math.round(t.durationInFrames * 0.7)]) {
    const i = segAt(f);
    if (i >= 0 && overlaps(faceRect(p.segments[i], p.cutSources[i]), titleBox(t, f))) {
      faceHits.push(`${t.style} title "${t.text.replace(/\|/g, " ")}" at ${ts(f / fps)}`);
      break;
    }
  }
}
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
// Effects: the glass card sits over the footage for its whole run.
for (const e of p.effects || []) {
  if (e.kind === "liquid-glass") {
    const top = e.cardY * H;
    checkBand("liquid-glass card", e.from + Math.round(1.6 * fps), { x1: W / 2 - 450 * u, x2: W / 2 + 450 * u, y1: top, y2: top + 610 * u });
  }
}
// Shoulder cards against the face, with the camera where it is while each card holds.
for (const e of p.effects || []) {
  if (e.kind !== "shoulder-zoom") continue;
  const s = Math.max(1, 0.32 / e.faceWidth);
  const tx = Math.min(0, Math.max(W - s * W, W / 2 - s * e.faceX * W));
  const ty = Math.min(0, Math.max(H - s * H, 0.255 * H - s * e.eyeY * H));
  const faceH = e.faceWidth * W * 1.35;
  const sc = W / 1080;
  const off = (H - 1920 * sc) / 2;
  for (const [label, t, panX, left] of [["start card", 1.9, 110, true], ["end card", 3.3, -110, false]]) {
    const z = 1.25;
    const room = (W / 2) * (z - 1);
    const x = Math.max(-room, Math.min(room, panX * sc));
    const pt = (px, py) => [0.5 * W + (px * s + tx - 0.5 * W) * z + x, 0.25 * H + (py * s + ty - 0.25 * H) * z];
    const [fx1, fy1] = pt(e.faceX * W - (e.faceWidth * W) / 2, e.eyeY * H - 0.4 * faceH);
    const [fx2, fy2] = pt(e.faceX * W + (e.faceWidth * W) / 2, e.eyeY * H + 0.6 * faceH);
    const cardX = left ? 70 : 1080 - 70 - 330;
    const card = { x1: cardX * sc, x2: (cardX + 330) * sc, y1: 520 * sc + off, y2: 720 * sc + off };
    if (overlaps(card, { x1: fx1, x2: fx2, y1: fy1, y2: fy2 })) faceHits.push(`shoulder ${label} at ${ts((e.from + Math.round(t * fps)) / fps)}`);
  }
}
const anyFace = Object.keys(p.faceBoxes).length > 0 || p.segments.some((s) => s.faceBox);

// Cut sheet: last frame before and first frame after each cut, render time burned in.
const sheet = join("out", job, `cutcheck-v${p.version}.png`);
if (cuts.length) {
  const sel = cuts.flatMap((c) => [`eq(n\\,${c.frame - 1})`, `eq(n\\,${c.frame})`]).join("+");
  const rows = Math.ceil((cuts.length * 2) / 4);
  const font = labelFont();
  const label = font ? `drawtext=fontfile='${font}':text='%{pts\\:hms}':x=12:y=12:fontsize=${Math.round(H / 28)}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8,` : "";
  let r = ff(["-i", render, "-vf", `${label}select='${sel}',scale=${portrait ? 270 : 480}:-2,tile=4x${rows}:padding=6:color=0x0B0B0D`, "-frames:v", "1", "-fps_mode", "passthrough", sheet]);
  if (r.status !== 0) r = ff(["-i", render, "-vf", `select='${sel}',scale=${portrait ? 270 : 480}:-2,tile=4x${rows}:padding=6:color=0x0B0B0D`, "-frames:v", "1", "-fps_mode", "passthrough", sheet]);
  add("Cut sheet", r.status === 0 ? "PASS" : "WARN", r.status === 0 ? `${sheet} (pairs: before | after, in cut order)` : "could not draw");
}

// Platform safe zone (vertical only): the top bar, the right-hand buttons and the caption/audio strip.
// The tutorial layout frames the presenter in a panel of its own, so the full-frame
// face and safe-zone geometry below doesn't apply: look at its frames instead.
const tutorialLayout = Boolean(p.tutorial);
if (portrait && !tutorialLayout) {
  const SAFE = { x1: 0.06 * W, x2: 0.89 * W, y1: 0.11 * H, y2: 0.82 * H };
  const out = [];
  const outside = (b) => b.x1 < SAFE.x1 - 2 || b.x2 > SAFE.x2 + 2 || b.y1 < SAFE.y1 - 2 || b.y2 > SAFE.y2 + 2;
  const lookAtF = (f) => (p.looks || []).find((r) => f >= r.from && f < r.to)?.look || "classic";
  for (const c of p.cues) {
    const f = Math.round(((c.startMs + c.endMs) / 2000) * fps);
    const look = lookAtF(f);
    const pos = look === "classic" ? p.captions.position : look === "cool-dude" ? Math.max(p.captions.position, 0.74) : Math.max(p.captions.position, 0.7);
    const size = look === "classic" ? capSize : (look === "bold" ? 66 : look === "cool-girl" ? 96 : 27) * u;
    const lines = c.words.map((w) => w.text).join(" ").length > 16 ? 2 : 1;
    const top = look === "classic" ? H * pos - size * 0.6 : H * pos - (lines * size * 1.15) / 2;
    const band = { x1: W * 0.12, x2: W * 0.88, y1: top, y2: top + lines * size * 1.15 };
    if (outside(band)) out.push(`captions at ${ts(f / fps)}`);
  }
  for (const i of p.inserts || []) {
    const h = i.w * W * (i.kind === "file-scroll" ? Number(i.data?.ratio ?? 1.25) : i.kind === "profile-follow" ? 0.62 : 0.7);
    const b = { x1: i.x * W - (i.w * W) / 2, x2: i.x * W + (i.w * W) / 2, y1: i.y * H - h / 2, y2: i.y * H + h / 2 };
    if (i.layer === "front" && outside(b)) out.push(`${i.kind} at ${ts(i.from / fps)}`);
    const k = p.segments.findIndex((s) => i.from + 15 >= s.from && i.from + 15 < s.from + s.durationInFrames);
    if (k >= 0 && i.layer === "front" && overlaps(faceRect(p.segments[k], p.cutSources[k]), b)) faceHits.push(`${i.kind} at ${ts(i.from / fps)}`);
  }
  for (const t of p.titles || []) {
    if (t.layer === "front" && outside(titleBox(t, t.from + Math.round(t.durationInFrames / 2)))) out.push(`${t.style} title at ${ts(t.from / fps)}`);
  }
  for (const e of p.effects || []) {
    if (e.kind === "liquid-glass") {
      const half = (portrait ? 410 : 450) * u;
      const b = { x1: W / 2 - half, x2: W / 2 + half, y1: e.cardY * H, y2: e.cardY * H + 610 * u };
      if (outside(b)) out.push(`liquid-glass card at ${ts(e.from / fps)}`);
    }
  }
  // Captions against front inserts (FootageEdit moves captions below an insert, up to 80% down).
  for (const i of p.inserts || []) {
    if (i.layer !== "front") continue;
    const h = i.w * W * (i.kind === "file-scroll" ? Number(i.data?.ratio ?? 1.25) : i.kind === "profile-follow" ? 0.62 : 0.7);
    const bottom = (i.y * H + h / 2) / H;
    if (bottom + 0.035 > 0.8 && p.cues.some((c) => c.endMs / 1000 > i.from / fps && c.startMs / 1000 < (i.from + i.durationInFrames) / fps))
      out.push(`captions under ${i.kind} at ${ts(i.from / fps)} (no room below it: move it up or make it smaller)`);
  }
  add("Safe zone (9:16)", out.length ? "WARN" : "PASS", out.length ? `outside the platform safe area: ${out.slice(0, 8).join(", ")}${out.length > 8 ? ` +${out.length - 8} more` : ""}` : "all text and graphics inside the safe area");
}

if (tutorialLayout) add("Text over faces", "PASS", "not checked: tutorial layout (presenter in a panel); read the frames");
else add("Text over faces", faceHits.length ? "WARN" : "PASS", anyFace ? (faceHits.length ? faceHits.join(", ") : "captions and overlays clear of faces") : "not checked: add \"faceBox\": [x, y, w, h] (0–1 of the source frame) to each source in edl.json");

// Effect check frames: the moments to look at (glass card with the line drawn, first
// screen word, both shoulder cards), side by side in out/<job>/effects-v<N>.png.
const fxFrames = (p.effects || []).flatMap((e) =>
  e.kind === "liquid-glass" ? [e.from + Math.round(1.6 * fps)] : e.kind === "screen-push" ? [e.from + 2, e.from + Math.round((e.words[Math.min(2, e.words.length - 1)].start + 0.05) * fps)] : [e.from + Math.round(1.9 * fps), e.from + Math.round(3.3 * fps), e.from + Math.round(2.6 * fps)],
).filter((f) => f < p.durationInFrames);
if (fxFrames.length) {
  const fxSheet = join("out", job, `effects-v${p.version}.png`);
  const sel = fxFrames.map((f) => `eq(n\\,${f})`).join("+");
  const r = ff(["-i", render, "-vf", `select='${sel}',scale=${portrait ? 360 : 640}:-2,tile=${Math.min(4, fxFrames.length)}x${Math.ceil(fxFrames.length / 4)}:padding=6:color=0x0B0B0D`, "-frames:v", "1", "-fps_mode", "passthrough", fxSheet]);
  add("Effect frames", r.status === 0 ? "PASS" : "WARN", r.status === 0 ? `${fxSheet} (${fxFrames.map((f) => ts(f / fps)).join(", ")}): read it` : "could not draw");
}

const icon = { PASS: "✅", WARN: "⚠️", FAIL: "❌" };
const report = `\n## Cut check — ${render} — ${new Date().toISOString()}\n\n${cuts.length} cuts in edit v${p.version}.\n\n| Check | Result | Detail |\n|---|---|---|\n${results.map((r) => `| ${r.name} | ${icon[r.status]} ${r.status} | ${r.detail} |`).join("\n")}\n`;
console.log(report);
if (!opt["no-log"]) appendFileSync(join("jobs", job, "qc.md"), report);
process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
