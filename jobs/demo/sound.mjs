#!/usr/bin/env node
// Synthesizes the demo teaser's 20 s, 120 BPM soundtrack, deterministically, so
// every cut and title can be timed to the same beat grid as the visuals.
//
//   node jobs/demo/sound.mjs   ->  public/jobs/demo/audio/teaser-120bpm.wav
//
// Events (seconds) mirror src/videos/Teaser/beats.ts.

import { mkdirSync, writeFileSync } from "node:fs";

const SR = 48000;
const LEN = 20;
const buf = new Float32Array(SR * LEN);

// Seeded noise so the track is identical on every run.
let s = 0x2f6e2b1;
const rnd = () => {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;

const add = (t0, dur, fn) => {
  const a = Math.round(t0 * SR);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n && a + i < buf.length; i++) buf[a + i] += fn(i / SR);
};

const kick = (t0, gain = 0.9) => {
  let ph = 0;
  add(t0, 0.5, (dt) => {
    const f = 44 + 120 * Math.exp(-dt * 32);
    ph += (2 * Math.PI * f) / SR;
    const click = dt < 0.004 ? noise() * 0.25 * (1 - dt / 0.004) : 0;
    return gain * Math.sin(ph) * Math.exp(-dt * 7) + click;
  });
};
const hat = (t0, gain = 0.12) => {
  let prev = 0;
  add(t0, 0.08, (dt) => {
    const x = noise();
    const hp = x - prev;
    prev = x;
    return gain * hp * Math.exp(-dt * 70);
  });
};
const clap = (t0, gain = 0.35) => {
  let prev = 0;
  add(t0, 0.3, (dt) => {
    const x = noise();
    const hp = x - 0.6 * prev;
    prev = x;
    const flam = dt < 0.03 ? 0.6 + 0.4 * Math.sin(dt * 2 * Math.PI * 100) : 1;
    return gain * hp * Math.exp(-dt * 16) * flam;
  });
};

// Drone bed 0–16 s: swells in, dips just before the final hit.
add(0, 16, (t) => {
  const env = Math.min(1, t / 3.5) * (t > 15.6 ? Math.max(0, (16 - t) / 0.4) : 1);
  return 0.16 * env * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 82.41 * t) + 0.25 * Math.sin(2 * Math.PI * 110.3 * t + Math.sin(t * 0.7)));
});
// Noise riser into the first kick.
{
  let prev = 0;
  add(2.0, 1.5, (dt) => {
    const x = noise();
    const hp = x - prev;
    prev = x;
    return 0.14 * hp * Math.pow(dt / 1.5, 2);
  });
}

// Kicks on quarter notes from 3.5 s to 15.5 s.
for (let t = 3.5; t <= 15.5 + 1e-9; t += 0.5) kick(t);
// Ticks on the title's word landings (4.25–5.5 s) and 8ths through the middle section.
for (let i = 1; i <= 6; i++) hat(4 + i * 0.25, 0.2);
for (let t = 7.25; t < 16; t += 0.5) hat(t);
// Accents: APPROVED stamp, format tiles.
clap(9.0);
for (const t of [12.5, 13.0, 13.5, 14.0, 14.5]) hat(t, 0.22);

// Final hit at 16 s: big kick, clap and an A-major chord that rings out to 20 s.
kick(16, 1.0);
clap(16, 0.4);
add(16, 4, (dt) => {
  const fade = dt > 3.4 ? Math.max(0, (4 - dt) / 0.6) : 1;
  const chord = [110, 164.81, 220, 277.18, 329.63].reduce((acc, f, i) => acc + Math.sin(2 * Math.PI * f * dt) / (1 + i * 0.6), 0);
  return 0.16 * chord * Math.exp(-dt * 0.8) * fade;
});

// Soft clip, then write 16-bit stereo WAV.
const pcm = Buffer.alloc(buf.length * 4);
for (let i = 0; i < buf.length; i++) {
  const v = Math.max(-1, Math.min(1, Math.tanh(buf[i] * 1.1)));
  const int = Math.round(v * 32767);
  pcm.writeInt16LE(int, i * 4);
  pcm.writeInt16LE(int, i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

mkdirSync("public/jobs/demo/audio", { recursive: true });
writeFileSync("public/jobs/demo/audio/teaser-120bpm.wav", Buffer.concat([header, pcm]));
console.log("Wrote public/jobs/demo/audio/teaser-120bpm.wav");
