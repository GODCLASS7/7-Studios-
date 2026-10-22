// Loop seam check: does the last frame flow into the first like any other frame?
//
// Every frame is shrunk to 128×128 grey and compared with the next. The seam (last →
// first) should look like an ordinary step: not a jump (much bigger than the usual
// step) and not a repeat (the last frame equal to the first, which stutters when
// the video loops).

import { ff } from "./media.mjs";

export const loopCheck = (file) => {
  const S = 128;
  const r = ff(["-i", file, "-vf", `scale=${S}:${S}:flags=area,format=gray`, "-f", "rawvideo", "pipe:1"], { binary: true });
  if (r.status !== 0) throw new Error(`Couldn't read ${file}`);
  const buf = r.stdout;
  const size = S * S;
  const n = Math.floor(buf.length / size);
  if (n < 4) return null;
  const diff = (a, b) => {
    let t = 0;
    for (let i = 0; i < size; i++) t += Math.abs(buf[a * size + i] - buf[b * size + i]);
    return t / size;
  };
  const steps = [];
  for (let i = 0; i + 1 < n; i++) steps.push(diff(i, i + 1));
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const seam = diff(n - 1, 0);
  const jump = seam > Math.max(2.5 * median, 1.2 * p95, 1.5);
  const repeat = median > 0.4 && seam < 0.15 * median;
  return {
    frames: n,
    seam: Number(seam.toFixed(2)),
    median: Number(median.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    pass: !jump && !repeat,
    why: jump
      ? `the seam (${seam.toFixed(2)}) is a jump: ${(seam / Math.max(median, 0.01)).toFixed(1)}× the usual step (${median.toFixed(2)})`
      : repeat
        ? "the last frame repeats the first: the loop will stutter (drop the last frame)"
        : `the seam (${seam.toFixed(2)}) is an ordinary step (median ${median.toFixed(2)}, 95th percentile ${p95.toFixed(2)})`,
  };
};
