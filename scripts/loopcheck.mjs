#!/usr/bin/env node
// Check that a looping video (a hero loop, a SiteMorph loop) has no seam.
//
//   npm run loopcheck -- <video>
//
// Passes when the last frame flows into the first like any other frame; fails on a
// jump or on a repeated frame at the seam. Exit code 1 on a fail.

import { existsSync } from "node:fs";
import { diskPath } from "./lib/media.mjs";
import { loopCheck } from "./lib/loop.mjs";

const file = process.argv[2];
if (!file || !existsSync(diskPath(file))) {
  console.error("Usage: npm run loopcheck -- <video>");
  process.exit(1);
}
const r = loopCheck(diskPath(file));
if (!r) {
  console.error("Too few frames to check.");
  process.exit(1);
}
console.log(`${r.pass ? "✔ PASS" : "✘ FAIL"} loop seam over ${r.frames} frames: ${r.why}`);
process.exit(r.pass ? 0 : 1);
