#!/usr/bin/env node
// Build the studio's sound-effects pack: subtle, original, fully owned.
//
//   node scripts/sfx.mjs
//
// Writes public/audio/sfx/{pop,whoosh,click,shimmer,tick,riser}.wav (48 kHz mono),
// synthesised here, so there is nothing to license or credit. FootageEdit plays
// them from edl.json "sfx" ("auto", or a list of { at, sound, volume }), always
// well under the voice (volume capped at 0.35).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 48000;
let seed = 11;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

const wav = (samples) => {
  const n = samples.length;
  const peak = Math.max(1e-6, ...samples.map(Math.abs));
  const gain = 0.5 / peak; // −6 dBFS peak
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
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), 44 + i * 2));
  return buf;
};
const make = (seconds, fn) => Array.from({ length: Math.round(seconds * RATE) }, (_, i) => fn(i / RATE, i));

// A one-pole low-pass whose cutoff can move, for shaping noise.
const lowpass = () => {
  let y = 0;
  return (x, hz) => {
    const a = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
    y += a * (x - y);
    return y;
  };
};

const sounds = {
  // A soft, round pop for a word landing: a quick downward pitch drop.
  pop: (() => {
    let ph = 0;
    return make(0.12, (t) => {
      ph += (2 * Math.PI * (300 + 650 * Math.exp(-t * 60))) / RATE;
      return Math.sin(ph) * Math.exp(-t * 38) * Math.min(1, t / 0.002);
    });
  })(),
  // Air moving past: band-limited noise sweeping up then down, a bell-shaped swell.
  whoosh: (() => {
    const lp1 = lowpass();
    const lp2 = lowpass();
    return make(0.42, (t) => {
      const u = t / 0.42;
      const hz = 500 + 3800 * Math.sin(Math.PI * u);
      const n = noise();
      return (lp1(n, hz) - lp2(n, hz * 0.25)) * Math.sin(Math.PI * u) ** 2;
    });
  })(),
  // A tap: a tiny noise transient plus a short high blip.
  click: make(0.05, (t) => (noise() * Math.exp(-t * 400) * 0.6 + Math.sin(2 * Math.PI * 2200 * t) * Math.exp(-t * 160)) * Math.min(1, t / 0.0005)),
  // Sparkle: a few high partials starting at slightly different moments.
  shimmer: make(0.8, (t) =>
    [2637, 3136, 3951, 4699, 5274].reduce((s, f, k) => {
      const t0 = k * 0.045;
      return t < t0 ? s : s + Math.sin(2 * Math.PI * f * (t - t0)) * Math.exp(-(t - t0) * 6.5) * Math.min(1, (t - t0) / 0.004) * (0.9 - k * 0.1);
    }, 0),
  ),
  // A dry tick for each word on a screen.
  tick: make(0.03, (t) => Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 260)),
  // A gentle build into a reveal.
  riser: (() => {
    const lp = lowpass();
    let ph = 0;
    return make(0.9, (t) => {
      const u = t / 0.9;
      ph += (2 * Math.PI * (220 + 900 * u * u)) / RATE;
      return (Math.sin(ph) * 0.5 + lp(noise(), 800 + 5000 * u) * 0.7) * u ** 2 * Math.min(1, (0.9 - t) / 0.03);
    });
  })(),
};

const dir = join("public", "audio", "sfx");
mkdirSync(dir, { recursive: true });
for (const [name, s] of Object.entries(sounds)) writeFileSync(join(dir, `${name}.wav`), wav(s));
console.log(`✔ ${dir}/: ${Object.keys(sounds).join(", ")}`);
