#!/usr/bin/env node
// Draw a stretch of footage or of a finished edit as one picture: filmstrip,
// waveform and words on a time axis, with pauses marked.
//
//   node scripts/timeline.mjs <job> <media> <from-s> <to-s> [--frames=8] [--mark=12.4:cut,15:hook] [--name=…]
//
// <media> is a source in public/jobs/<job>/footage/ (words come from its
// transcript) or a render of the edit (words come from the resolved edit list).
// Use it at decision points (comparing retakes, an ambiguous pause, a cut that
// feels wrong) and read the PNG; there's no need to watch the whole video.
//
// Output: out/<job>/timeline/<name>.png

import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { diskPath, ff, isFiller, parseArgs, pcm, peaks, readJson, sourceKey, transcriptPath, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, media, a, b] = pos;
if (!job || !media || a === undefined || b === undefined) {
  console.error("Usage: node scripts/timeline.mjs <job> <media> <from-s> <to-s> [--frames=8] [--mark=t:label,…]");
  process.exit(1);
}
const from = Number(a);
const to = Number(b);
const file = diskPath(media);
const name = opt.name || `${sourceKey(media)}_${from.toFixed(1)}-${to.toFixed(1)}`;
const n = Number(opt.frames || 8);

// Frames, evenly spread, small enough to keep the sheet light.
const relDir = `jobs/${job}/timeline/${name}`;
rmSync(join("public", relDir), { recursive: true, force: true });
mkdirSync(join("public", relDir), { recursive: true });
const frames = [];
for (let i = 0; i < n; i++) {
  const t = from + ((i + 0.5) / n) * (to - from);
  const rel = `${relDir}/f${i}.jpg`;
  const r = ff(["-ss", t.toFixed(3), "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", join("public", rel)]);
  if (r.status === 0) frames.push({ src: rel, t });
}

const samples = pcm(file, { start: from, length: to - from });
const pk = peaks(samples, 800);
const max = Math.max(0.05, ...pk);

// Words: from the source transcript, or from the edit's caption cues for a render.
let words = [];
const tr = readJson(transcriptPath(job, media));
if (tr) {
  words = tr.words.filter((w) => w.end > from && w.start < to).map((w) => ({ text: w.text, start: w.start, end: w.end, filler: w.type === "event" || isFiller(w) }));
} else {
  const props = readJson(join("jobs", job, ".edl.resolved.json"), { cues: [] });
  words = props.cues.flatMap((c) => c.words).map((w) => ({ text: w.text, start: w.startMs / 1000, end: w.endMs / 1000 })).filter((w) => w.end > from && w.start < to);
}
const gaps = [];
for (let i = 1; i < words.length; i++) if (words[i].start - words[i - 1].end >= 0.3) gaps.push({ start: words[i - 1].end, end: words[i].start });
const marks = String(opt.mark || "")
  .split(",")
  .filter(Boolean)
  .map((m) => {
    const [t, ...label] = m.split(":");
    return { t: Number(t), label: label.join(":") || "mark" };
  });

const propsPath = join("jobs", job, ".timeline.json");
writeJson(propsPath, { title: `${job} · ${media.split("/").pop()}`, from, to, frames, peaks: pk.map((v) => Number((v / max).toFixed(3))), words, gaps, marks });
const out = join("out", job, "timeline", `${name}.png`);
const r = spawnSync("node", ["scripts/render.mjs", "TimelineView", "still", `--props=${propsPath}`, `--out=${out}`], { stdio: ["ignore", "ignore", "inherit"] });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`✔ ${out}`);
