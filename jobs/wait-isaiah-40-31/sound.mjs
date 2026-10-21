#!/usr/bin/env node
// Original pad for "The Wait Culture — Isaiah 40:31": one chord per card (D, Bm, G, A, D/F#, Dadd9),
// slow attack, gentle tremolo, a paper rustle on each card and a soft low hit on the end card.
//   node jobs/wait-isaiah-40-31/sound.mjs  ->  public/jobs/wait-isaiah-40-31/audio/pad-isaiah-40-31.wav
import { mkdirSync, writeFileSync } from "node:fs";

const SR = 48000;
const LEN = 20;
const L = new Float32Array(SR * LEN);
const R = new Float32Array(SR * LEN);
let s = 0x51a7e;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Card start times (s) and chords (MIDI notes).
const cards = [
  [0, [50, 54, 57, 62]], // D
  [3.5, [47, 54, 59, 62]], // Bm
  [6.5, [43, 50, 55, 59]], // G
  [10, [45, 52, 57, 61]], // A
  [13, [42, 50, 57, 62]], // D/F#
  [16.5, [50, 57, 64, 66]], // Dadd9
];
cards.forEach(([t0, notes], i) => {
  const t1 = i + 1 < cards.length ? cards[i + 1][0] : LEN;
  const a = Math.round(t0 * SR);
  const n = Math.round((t1 - t0 + 1.2) * SR); // 1.2 s overlap into the next chord
  for (let k = 0; k < n && a + k < L.length; k++) {
    const t = k / SR;
    const env = Math.min(1, t / 0.9) * (t > t1 - t0 ? Math.max(0, 1 - (t - (t1 - t0)) / 1.2) : 1);
    const trem = 1 + 0.08 * Math.sin(2 * Math.PI * 0.35 * t);
    let l = 0;
    let r = 0;
    notes.forEach((m, j) => {
      const f = hz(m);
      const g = j === 0 ? 0.32 : 0.2;
      l += g * (Math.sin(2 * Math.PI * f * 0.9985 * t) + 0.15 * Math.sin(4 * Math.PI * f * t));
      r += g * (Math.sin(2 * Math.PI * f * 1.0015 * t) + 0.15 * Math.sin(4 * Math.PI * f * t + 0.3));
    });
    L[a + k] += 0.32 * env * trem * l;
    R[a + k] += 0.32 * env * trem * r;
  }
  // Paper rustle: band-limited noise, 0.3 s.
  let p1 = 0;
  let p2 = 0;
  for (let k = 0; k < 0.3 * SR; k++) {
    const t = k / SR;
    const x = rnd();
    p1 = 0.6 * p1 + 0.4 * x;
    const bp = p1 - p2;
    p2 = 0.9 * p2 + 0.1 * p1;
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 9);
    L[a + k] += 0.22 * env * bp;
    R[a + k] += 0.18 * env * bp;
  }
});
// Soft low hit on the end card.
{
  const a = Math.round(16.5 * SR);
  for (let k = 0; k < 2.5 * SR; k++) {
    const t = k / SR;
    const v = 0.5 * Math.sin(2 * Math.PI * (55 + 30 * Math.exp(-t * 8)) * t) * Math.exp(-t * 2.2);
    L[a + k] += v;
    R[a + k] += v;
  }
}
// Fade in/out, soft clip, 16-bit stereo WAV.
const pcm = Buffer.alloc(L.length * 4);
for (let i = 0; i < L.length; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.6) * Math.min(1, (LEN - t) / 1.4);
  pcm.writeInt16LE(Math.round(Math.tanh(L[i] * fade) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(Math.tanh(R[i] * fade) * 32767), i * 4 + 2);
}
const h = Buffer.alloc(44);
h.write("RIFF", 0);
h.writeUInt32LE(36 + pcm.length, 4);
h.write("WAVEfmt ", 8);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(2, 22);
h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 4, 28);
h.writeUInt16LE(4, 32);
h.writeUInt16LE(16, 34);
h.write("data", 36);
h.writeUInt32LE(pcm.length, 40);
mkdirSync("public/jobs/wait-isaiah-40-31/audio", { recursive: true });
writeFileSync("public/jobs/wait-isaiah-40-31/audio/pad-isaiah-40-31.wav", Buffer.concat([h, pcm]));
console.log("Wrote public/jobs/wait-isaiah-40-31/audio/pad-isaiah-40-31.wav");
