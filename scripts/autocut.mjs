#!/usr/bin/env node
// Turn chosen phrases into a tight edit list (EDL): fillers removed, long
// pauses closed up, and the cuts padded so no word is clipped.
//
//   node scripts/autocut.mjs <job> [--keep=A.3,A.1-A.2,B.4] [--pause=0.35] [--pad=0.06]
//                            [--fillers=like,so] [--punch=alternate|editorial|none] [--format=9x16]
//
// --keep lists phrase IDs from jobs/<job>/takes.md in the order they should
// play, so the hook can come first. Without it, every phrase is kept in order.
// Claude picks the best take of each line by reading takes.md; this script
// does the precise cutting.
//
// Writes jobs/<job>/edl.json. Every hand-edited field (captions, looks, titles,
// effects, brand, music, source face boxes…) survives a re-run; segments are
// replaced and the version goes up by one. --style=<name> takes the pace and
// punch-ins from an editing style (presets/styles/) and records it.

import { join } from "node:path";
import { isFiller, parseArgs, readJson, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job] = pos;
if (!job) {
  console.error("Usage: node scripts/autocut.mjs <job> [--keep=A.1,A.3-A.5] [--pause=0.35] [--pad=0.06] [--punch=alternate|none]");
  process.exit(1);
}
const takes = readJson(join("jobs", job, "takes.json"));
if (!takes) {
  console.error(`No takes yet. Run: npm run pack -- ${job}`);
  process.exit(1);
}
// An editing style (presets/styles/<name>.json) sets the pace and punch-ins; flags still win.
const style = opt.style ? readJson(join("presets", "styles", `${opt.style}.json`)) : null;
if (opt.style && !style) throw new Error(`Unknown style "${opt.style}" (presets/styles/)`);
const PAUSE = Number(opt.pause ?? style?.autocut?.pause ?? 0.35);
const PAD = Number(opt.pad ?? style?.autocut?.pad ?? 0.06);
opt.punch ??= style?.autocut?.punch;
const extraFillers = String(opt.fillers || "").split(",").map((s) => s.trim()).filter(Boolean);
const byId = Object.fromEntries(takes.phrases.map((p) => [p.id, p]));

const expand = (spec) =>
  spec.split(",").flatMap((part) => {
    const [a, b] = part.trim().split("-");
    if (!b) return [a];
    const [src, from] = a.split(".");
    const to = Number(b.includes(".") ? b.split(".")[1] : b);
    return Array.from({ length: to - Number(from) + 1 }, (_, i) => `${src}.${Number(from) + i}`);
  });
const keep = opt.keep ? expand(opt.keep) : takes.phrases.map((p) => p.id);
const missing = keep.filter((id) => !byId[id]);
if (missing.length) {
  console.error(`Unknown phrase IDs: ${missing.join(", ")} (see jobs/${job}/takes.md)`);
  process.exit(1);
}

const words = Object.fromEntries(takes.sources.map((s) => [s.key, readJson(s.transcript).words]));
const segments = [];
for (const id of keep) {
  const p = byId[id];
  const all = words[p.source];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[0];
    const last = run[run.length - 1];
    const before = all[first - 1];
    const after = all[last + 1];
    const inT = Math.max(all[first].start - PAD, before ? before.end + 0.01 : 0, 0);
    const outT = Math.min(all[last].end + PAD, after ? after.start - 0.01 : Infinity);
    segments.push({ source: p.source, in: Number(inT.toFixed(3)), out: Number(outT.toFixed(3)), phrase: id, text: run.map((i) => all[i].text).join(" ") });
    run = [];
  };
  for (const i of p.words) {
    const w = all[i];
    if (w.type === "event" || (w.type === "word" && isFiller(w, extraFillers))) {
      flush();
      continue;
    }
    if (run.length && w.start - all[run[run.length - 1]].end > PAUSE) flush();
    run.push(i);
  }
  flush();
}

// Join pieces that nearly touch; a 1–2 frame cut reads as a glitch, not an edit.
const merged = [];
for (const s of segments) {
  const prev = merged[merged.length - 1];
  if (prev && prev.source === s.source && s.in - prev.out >= 0 && s.in - prev.out < 0.08) {
    prev.out = s.out;
    prev.text += ` ${s.text}`;
    if (!prev.phrase.split("+").includes(s.phrase)) prev.phrase += `+${s.phrase}`;
  } else merged.push({ ...s });
}

// Jump cuts inside one take are hidden by alternating a punch-in. "editorial"
// alternates wide and close on every cut, like a two-camera studio interview
// (the cool-dude look); it needs 4K footage to stay sharp.
if (opt.punch === "editorial") {
  merged.forEach((s, i) => {
    if (i % 2) s.zoom = 1.35;
  });
} else if ((opt.punch || "alternate") === "alternate") {
  let zoomed = false;
  merged.forEach((s, i) => {
    const prev = merged[i - 1];
    const jump = prev && prev.source === s.source;
    zoomed = jump ? !zoomed : false;
    if (zoomed) s.zoom = 1.12;
  });
}

const path = join("jobs", job, "edl.json");
const old = readJson(path, {});
const sources = Object.fromEntries(takes.sources.map((s) => [s.key, { file: s.file, ...(old.sources?.[s.key] || {}), transcript: s.transcript }]));
// Everything autocut doesn't own (looks, titles, effects, brand, music…) is kept as it was.
const edl = {
  ...old,
  ...(opt.style ? { style: opt.style } : {}),
  job,
  version: (old.version || 0) + 1,
  format: opt.format || old.format || "9x16",
  fps: old.fps || 30,
  sources,
  segments: merged,
  // With an editing style, its caption settings apply unless edl.json sets its own.
  captions: old.captions || (opt.style || old.style ? {} : { style: "pop", maxWords: 3, position: 0.66, uppercase: true, highlight: "#E8B44A" }),
  grade: old.grade ?? "none",
  overlays: old.overlays || [],
};
writeJson(path, edl);
const total = merged.reduce((t, s) => t + s.out - s.in, 0);
const raw = takes.sources.reduce((t, s) => t + s.duration, 0);
console.log(`✔ ${path} v${edl.version}: ${merged.length} segments, ${total.toFixed(1)} s from ${raw.toFixed(1)} s of footage`);
