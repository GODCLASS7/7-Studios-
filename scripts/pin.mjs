#!/usr/bin/env node
// Pin a spot in a source video, so a title or graphic stays stuck to it while the
// camera or the subject moves ("Monday" behind a passing cyclist, a label on a building).
//
//   node scripts/pin.mjs <job> <source> --point=<x>,<y> [--at=<seconds>] [--name=<pin>] [--box=0.08]
//
// --point is the spot as fractions of the SOURCE frame (0–1), as seen at --at seconds
// into the source (default: the start of the first segment cut from it). Pick it
// from a timeline frame (npm run timeline). Choose a spot with texture or corners
// (a sign, a window edge, a pattern), not a plain wall or sky.
// Writes jobs/<job>/pins/<name>.json (the spot every frame of the source, forward and
// backward) and records it in edl.json "pins". A title then uses it with
// "pin": "<name>" and "x"/"y" as an offset from the spot (fractions of the frame).
// Engine: OpenCV pyramidal Lucas-Kanade optical flow with a forward-backward check
// (installs opencv-python-headless into production/matte-venv on first use).

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { diskPath, parseArgs, readJson, writeJson } from "./lib/media.mjs";
import { ensureModule, ensurePython, PY, run } from "./lib/py.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, key] = pos;
const edlPath = join("jobs", job || "", "edl.json");
const edl = readJson(edlPath);
if (!edl || !key || !opt.point) {
  console.error("Usage: node scripts/pin.mjs <job> <source> --point=<x>,<y> [--at=<seconds>] [--name=<pin>] [--box=0.08]");
  process.exit(1);
}
const src = edl.sources?.[key];
if (!src) {
  console.error(`No source "${key}" in ${edlPath} (sources: ${Object.keys(edl.sources || {}).join(", ")})`);
  process.exit(1);
}
const at = opt.at !== undefined ? Number(opt.at) : (edl.segments.find((s) => s.source === key)?.in ?? 0);
const name = opt.name || `${key}-${String(at).replace(".", "_")}`;
await ensurePython();
ensureModule("cv2", "opencv-python-headless");
mkdirSync(join("jobs", job, "pins"), { recursive: true });
const out = join("jobs", job, "pins", `${name}.json`);
console.log(`▶ Pinning ${src.file} at ${at} s, point ${opt.point}…`);
run(PY, [join("scripts", "matte", "pin.py"), diskPath(src.file), out, `--at=${at}`, `--point=${opt.point}`, `--box=${opt.box ?? 0.08}`], "Pin tracking");
const pin = readJson(out);
const held = pin.samples.filter((s) => !s[3]);
edl.pins = { ...(edl.pins || {}), [name]: { source: key, file: out } };
writeJson(edlPath, edl);
console.log(`✔ ${out}: ${pin.samples.length - held.length} of ${pin.samples.length} frames tracked${held.length ? `; held at ${held.length} (check those moments in a frame)` : ""}.`);
console.log(`Use it: "titles": [{ "style": "editorial", "text": "Monday", "pin": "${name}", "x": 0, "y": -0.1, "layer": "behind", … }]`);
