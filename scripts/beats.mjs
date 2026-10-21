#!/usr/bin/env node
// Find the beat in a music track: tempo, every beat and the downbeats.
//
//   node scripts/beats.mjs <audio> [--out=file.json]
//
// Prints the tempo and confidence and writes the beat times (seconds) next to
// the track (<audio>.beats.json) or to --out. In an edit, "music": { "file": …,
// "snap": true } runs this automatically and lands inserts, look changes and
// effects on the nearest beat (within a quarter second). Speech-timed things
// (captions, punch words, screen-push words) never move.

import { existsSync } from "node:fs";
import { diskPath, parseArgs, writeJson } from "./lib/media.mjs";
import { findBeats } from "./lib/beats.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [audio] = pos;
if (!audio || !existsSync(diskPath(audio))) {
  console.error("Usage: node scripts/beats.mjs <audio> [--out=file.json]");
  process.exit(1);
}
const r = findBeats(diskPath(audio));
if (!r) {
  console.error("Too short to find a beat.");
  process.exit(1);
}
const out = opt.out || `${diskPath(audio)}.beats.json`;
writeJson(out, r);
console.log(`✔ ${out}: ${r.bpm} BPM, ${r.beats.length} beats, first at ${r.beats[0]} s, confidence ${r.confidence}${r.confidence < 0.3 ? " (weak pulse: snapping is not reliable on this track)" : ""}`);
