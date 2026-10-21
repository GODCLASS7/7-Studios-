#!/usr/bin/env node
// Track the speaker's face through each source, so framing and text placement
// follow them automatically (no hand-set face boxes).
//
//   node scripts/track.mjs <job> [source keys or files…] [--rate=5]
//
// Writes jobs/<job>/tracks/<source>.json (face and head boxes, 5 per second,
// smoothed) and records it in edl.json. `npm run edl` then:
//   - gives every segment the face box for its own stretch of time (cut check,
//     shoulder cards, captions all use it);
//   - reframes automatically when the source and the edit differ in shape
//     (16:9 footage in a 9:16 edit): the crop follows the face, panning slowly
//     inside a segment if the speaker moves. A segment's own "focus" still wins.
// Same engine and environment as `npm run matte` (MediaPipe segmenter via LiteRT, CPU).

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { diskPath, parseArgs, readJson, sourceKey, writeJson } from "./lib/media.mjs";
import { ensurePython, MODEL, PY, run } from "./lib/py.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, ...wanted] = pos;
if (!job) {
  console.error("Usage: node scripts/track.mjs <job> [source…] [--rate=5]");
  process.exit(1);
}
await ensurePython();

const edlPath = join("jobs", job, "edl.json");
const edl = readJson(edlPath);
const targets = wanted.length
  ? wanted.map((w) => (edl?.sources?.[w] ? { key: w, file: edl.sources[w].file } : { key: sourceKey(w), file: w }))
  : Object.entries(edl?.sources || {}).map(([key, s]) => ({ key, file: s.file }));
if (!targets.length) {
  console.error(`Nothing to track: give sources, or run autocut first so jobs/${job}/edl.json lists them.`);
  process.exit(1);
}
mkdirSync(join("jobs", job, "tracks"), { recursive: true });
for (const t of targets) {
  const out = join("jobs", job, "tracks", `${t.key}.json`);
  const t0 = Date.now();
  console.log(`▶ Tracking the face in ${t.file}…`);
  run(PY, ["scripts/matte/track.py", diskPath(t.file), out, "--model", MODEL, "--rate", String(opt.rate ?? 5)], `Tracking ${t.file}`);
  const tr = readJson(out);
  const found = tr.samples.filter((s) => s.face).length;
  console.log(`✔ ${out}: a face in ${found} of ${tr.samples.length} samples, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (found < tr.samples.length * 0.6) console.warn("  ⚠ The face is missing in many samples (turned away, off frame, or very small). Check a timeline frame; set faceBox/focus by hand where needed.");
  if (edl?.sources?.[t.key]) edl.sources[t.key].track = out;
}
if (edl) {
  writeJson(edlPath, edl);
  console.log(`Recorded in ${edlPath}. Run: npm run edl -- ${job}`);
}
