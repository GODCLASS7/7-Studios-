#!/usr/bin/env node
// Cut the speaker out of the background, so text and inserts can sit behind
// their head (looks "bold", "cool-girl", "cool-dude"; inserts with "layer": "behind").
//
//   node scripts/matte.mjs <job> [source keys or files…] [--work=540] [--smooth=0.5] [--feather=1.5] [--grow=0] [--check]
//
// Without sources, it cuts out every source in jobs/<job>/edl.json. For each one
// it writes public/jobs/<job>/matte/<source>.webm (the person on transparency,
// same length and frames as the source) and records it in edl.json, so the
// next `npm run edl` layers it in.
//
// Engine: MediaPipe's selfie multiclass segmenter (Apache 2.0), run with the
// LiteRT runtime on the CPU (no GPU or graphics libraries), plus a guided filter
// that snaps the edge to the real hair and shoulders. Python environment at
// production/matte-venv (`pip install ai-edge-litert numpy pillow scipy`, once) and one
// 16 MB model from storage.googleapis.com into production/models/.
// --check also writes the black-and-white mask next to it, to look at.
// Hair against a busy background and fast hand moves are where a matte shows
// its limits: check a frame before building looks on it.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { diskPath, parseArgs, readJson, sourceKey, writeJson } from "./lib/media.mjs";
import { ensurePython, MODEL, PY, run } from "./lib/py.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, ...wanted] = pos;
if (!job) {
  console.error("Usage: node scripts/matte.mjs <job> [source…] [--work=540] [--smooth=0.5] [--feather=1.5] [--grow=0] [--check]");
  process.exit(1);
}
await ensurePython();

const edlPath = join("jobs", job, "edl.json");
const edl = readJson(edlPath);
const targets = wanted.length
  ? wanted.map((w) => (edl?.sources?.[w] ? { key: w, file: edl.sources[w].file } : { key: sourceKey(w), file: w }))
  : Object.entries(edl?.sources || {}).map(([key, s]) => ({ key, file: s.file }));
if (!targets.length) {
  console.error(`Nothing to cut out: give sources, or run autocut first so jobs/${job}/edl.json lists them.`);
  process.exit(1);
}

mkdirSync(join("public", "jobs", job, "matte"), { recursive: true });
for (const t of targets) {
  const rel = `jobs/${job}/matte/${t.key}.webm`;
  const t0 = Date.now();
  console.log(`▶ Cutting out ${t.file}…`);
  const args = ["scripts/matte/matte.py", diskPath(t.file), join("public", rel), "--model", MODEL];
  for (const k of ["work", "smooth", "feather", "grow"]) if (opt[k] !== undefined) args.push(`--${k}`, String(opt[k]));
  if (opt.check) args.push("--mask-out", join("out", job, `matte-${t.key}-mask.mp4`));
  mkdirSync(join("out", job), { recursive: true });
  run(PY, args, `Cutout of ${t.file}`);
  console.log(`✔ public/${rel} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (edl?.sources?.[t.key]) edl.sources[t.key].matte = rel;
}
if (edl) {
  writeJson(edlPath, edl);
  console.log(`Recorded in ${edlPath}. Run: npm run edl -- ${job}`);
}
