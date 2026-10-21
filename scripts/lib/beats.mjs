// Beat tracking for music beds: tempo, beat times and downbeats.
//
// Onset strength = rise in log energy per 23 ms hop (bass-weighted, where kicks
// live) → tempo by autocorrelation between 70 and 180 BPM (gently preferring
// about 110) → beat phase by the strongest grid → downbeat as the strongest of
// the four phases. Good on music with a clear pulse; ambient pads without drums
// have no beat to find (confidence comes back low).

import { pcm } from "./media.mjs";

export const findBeats = (file) => {
  const rate = 11025;
  const x = pcm(file, { rate });
  const hop = 256;
  const win = 512;
  const n = Math.floor((x.length - win) / hop);
  if (n < 50) return null;
  // Bass-weighted energy: a one-pole low-pass (~180 Hz) plus a little of the full band.
  const lp = new Float32Array(x.length);
  const a = 1 - Math.exp((-2 * Math.PI * 180) / rate);
  for (let i = 1; i < x.length; i++) lp[i] = lp[i - 1] + a * (x[i] - lp[i - 1]);
  const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let eb = 0;
    let ef = 0;
    for (let i = f * hop; i < f * hop + win; i++) {
      eb += lp[i] * lp[i];
      ef += x[i] * x[i];
    }
    env[f] = Math.log(1e-6 + eb * 3 + ef * 0.5);
  }
  const onset = new Float32Array(n);
  for (let f = 1; f < n; f++) onset[f] = Math.max(0, env[f] - env[f - 1]);
  const mean = onset.reduce((t, v) => t + v, 0) / n;
  for (let f = 0; f < n; f++) onset[f] = Math.max(0, onset[f] - mean);

  const fpsEnv = rate / hop;
  const lagMin = Math.floor((60 / 180) * fpsEnv);
  const lagMax = Math.ceil((60 / 70) * fpsEnv);
  let best = 0;
  let bestLag = lagMin;
  const scores = [];
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let f = lag; f < n; f++) s += onset[f] * onset[f - lag];
    const bpm = (60 * fpsEnv) / lag;
    s *= Math.exp(-0.5 * Math.log2(bpm / 110) ** 2 / 0.8 ** 2); // gentle prior around 110 BPM
    scores.push(s);
    if (s > best) (best = s), (bestLag = lag);
  }
  // Parabolic refinement of the lag.
  const k = bestLag - lagMin;
  const [l, c, r] = [scores[k - 1] ?? scores[k], scores[k], scores[k + 1] ?? scores[k]];
  const shift = l - 2 * c + r !== 0 ? (0.5 * (l - r)) / (l - 2 * c + r) : 0;
  const period = bestLag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = (60 * fpsEnv) / period;

  // Phase: the offset whose grid collects the most onset strength.
  let bestPhase = 0;
  let bestSum = -1;
  const phaseSums = [];
  for (let ph = 0; ph < period; ph += 0.25) {
    let s = 0;
    for (let t = ph; t < n; t += period) s += onset[Math.round(t)] || 0;
    phaseSums.push(s);
    if (s > bestSum) (bestSum = s), (bestPhase = ph);
  }
  // Each grid beat moves to the strongest onset within ±3 hops (±70 ms), so small
  // tempo rounding never adds up to drift; the time is the middle of that hop.
  const beats = [];
  for (let t = bestPhase; t < n; t += period) {
    const c = Math.round(t);
    let at = c;
    for (let f = Math.max(1, c - 3); f <= Math.min(n - 1, c + 3); f++) if (onset[f] > onset[at] * 1.2) at = f;
    beats.push(Number((((at + 0.5) * hop + (win - hop) / 2) / rate).toFixed(3)));
  }
  // Downbeats: of the four possible bar starts, the one with the strongest beats.
  const strength = beats.map((b) => onset[Math.round((b * rate) / hop)] || 0);
  let bar = 0;
  let barBest = -1;
  for (let o = 0; o < 4; o++) {
    const s = strength.filter((_, i) => i % 4 === o).reduce((t, v) => t + v, 0);
    if (s > barBest) (barBest = s), (bar = o);
  }
  const downbeats = beats.filter((_, i) => i % 4 === bar);
  const avg = phaseSums.reduce((t, v) => t + v, 0) / phaseSums.length;
  const confidence = Math.min(1, Math.max(0, (bestSum / Math.max(1e-6, avg) - 1) / 3));
  return { bpm: Number(bpm.toFixed(1)), beats, downbeats, confidence: Number(confidence.toFixed(2)) };
};
