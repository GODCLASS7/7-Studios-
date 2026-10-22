#!/usr/bin/env node
// Find the beat in a music track: tempo, every beat and the downbeats.
//
//   node scripts/beats.mjs <audio> [--out=file.json] [--grid=120] [--trim-out=song-from-downbeat.wav]
//
// Prints the tempo and confidence and writes the beat times (seconds) next to
// the track (<audio>.beats.json) or to --out.
//   --grid=<bpm>      the tempo the motion is built on (SiteMorph, Cards): checks the track
//                     against it, warns when they differ by more than 1 BPM (the beats would
//                     drift off the grid) and writes the grid's beat times from the first downbeat.
//   --trim-out=<file> a copy of the track that starts on the first downbeat (the first kick),
//                     so frame 0 of the video lands on it. Also printed: the frames to skip
//                     instead (trimBefore) at 30 and 60 fps. In an edit, "music": { "file": …,
// "snap": true } runs this automatically and lands inserts, look changes and
// effects on the nearest beat (within a quarter second). Speech-timed things
// (captions, punch words, screen-push words) never move.

import { existsSync } from "node:fs";
import { diskPath, duration, ff, parseArgs, writeJson } from "./lib/media.mjs";
import { findBeats } from "./lib/beats.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [audio] = pos;
if (!audio || !existsSync(diskPath(audio))) {
  console.error("Usage: node scripts/beats.mjs <audio> [--out=file.json] [--grid=<bpm>] [--trim-out=<file>]");
  process.exit(1);
}
const r = findBeats(diskPath(audio));
if (!r) {
  console.error("Too short to find a beat.");
  process.exit(1);
}
const first = r.downbeats[0] ?? r.beats[0];
const len = duration(diskPath(audio));
if (opt.grid) {
  const g = Number(opt.grid);
  const drift = Math.abs(60 / g - 60 / r.bpm) * (len / (60 / r.bpm));
  r.grid = { bpm: g, beats: [] };
  for (let t = first; t < len; t += 60 / g) r.grid.beats.push(Number(t.toFixed(3)));
  if (Math.abs(r.bpm - g) > 1)
    console.log(`⚠ The track is ${r.bpm} BPM, not ${g}: a ${g} BPM grid drifts ${drift.toFixed(2)} s off the music by the end. Build the motion at ${r.bpm} BPM, or use a track at ${g}.`);
  else console.log(`✔ The track matches the ${g} BPM grid (detected ${r.bpm}).`);
}
if (opt["trim-out"]) {
  const dest = String(opt["trim-out"]);
  // A 5 ms fade-in so the cut on the kick doesn't click.
  const t = ff(["-i", diskPath(audio), "-ss", String(first), "-af", "afade=t=in:d=0.005", dest]);
  if (t.status !== 0) {
    console.error(t.stderr || "Couldn't write the trimmed track.");
    process.exit(1);
  }
  console.log(`✔ ${dest}: starts on the first downbeat (${first} s into the original)`);
}
const out = opt.out || `${diskPath(audio)}.beats.json`;
writeJson(out, r);
console.log(`✔ ${out}: ${r.bpm} BPM, ${r.beats.length} beats, first downbeat at ${first} s (skip ${Math.round(first * 30)} frames at 30 fps, ${Math.round(first * 60)} at 60), confidence ${r.confidence}${r.confidence < 0.3 ? " (weak pulse: snapping is not reliable on this track)" : ""}`);
