#!/usr/bin/env node
// A test music bed with a known pulse: kick on every beat, hats on the off-beats,
// a soft pad, starting a little after zero. For checking beat tracking and snapping.
//
//   node scripts/test/music-fixture.mjs <out.wav> [--bpm=100] [--seconds=30] [--offset=0.25]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "../lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [out] = pos;
if (!out) {
  console.error("Usage: node scripts/test/music-fixture.mjs <out.wav> [--bpm=100] [--seconds=30] [--offset=0.25]");
  process.exit(1);
}
const RATE = 44100;
const bpm = Number(opt.bpm ?? 100);
const secs = Number(opt.seconds ?? 30);
const offset = Number(opt.offset ?? 0.25);
const beat = 60 / bpm;
const n = Math.round(secs * RATE);
const x = new Float32Array(n);
let seed = 5;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let b = 0; offset + b * beat < secs; b++) {
  const t0 = offset + b * beat;
  const accent = b % 4 === 0 ? 1 : 0.75;
  // Kick: a falling sine thump.
  let ph = 0;
  for (let i = 0; i < 0.25 * RATE; i++) {
    const k = Math.round(t0 * RATE) + i;
    if (k >= n) break;
    const t = i / RATE;
    ph += (2 * Math.PI * (50 + 90 * Math.exp(-t * 30))) / RATE;
    x[k] += Math.sin(ph) * Math.exp(-t * 12) * 0.8 * accent;
  }
  // Hat on the off-beat.
  const h0 = Math.round((t0 + beat / 2) * RATE);
  for (let i = 0; i < 0.04 * RATE && h0 + i < n; i++) x[h0 + i] += noise() * Math.exp((-i / RATE) * 90) * 0.12;
}
for (let i = 0; i < n; i++) {
  const t = i / RATE;
  x[i] += 0.05 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t)) * Math.min(1, t / 2);
}
let peak = 1e-6;
for (const v of x) peak = Math.max(peak, Math.abs(v));
const buf = Buffer.alloc(44 + n * 2);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + n * 2, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(n * 2, 40);
x.forEach((v, i) => buf.writeInt16LE(Math.round((v / peak) * 0.6 * 32767), 44 + i * 2));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`✔ ${out}: ${bpm} BPM, first beat at ${offset} s, ${secs} s`);
