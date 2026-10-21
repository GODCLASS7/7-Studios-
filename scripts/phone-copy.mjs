#!/usr/bin/env node
// A small copy of a render for checking on a phone (send it, watch it, give notes).
//
//   node scripts/phone-copy.mjs <render.mp4> [out.mp4]
//
// 720 px on the short side, H.264, fast start, so it plays straight away in a
// chat app or a phone's photo roll. Default output: <render>_phone.mp4. Not for
// delivery: finals keep their full preset.

import { statSync } from "node:fs";
import { ff, parseArgs, videoInfo } from "./lib/media.mjs";

const { pos } = parseArgs(process.argv.slice(2));
const [src, out = src?.replace(/\.(mp4|mov|webm)$/i, "_phone.mp4")] = pos;
if (!src) {
  console.error("Usage: node scripts/phone-copy.mjs <render.mp4> [out.mp4]");
  process.exit(1);
}
const { width, height } = videoInfo(src);
const scale = width < height ? "scale=720:-2" : "scale=-2:720";
const r = ff(["-i", src, "-vf", `${scale},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]);
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(1);
}
console.log(`✔ ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
