#!/usr/bin/env node
// Measure this machine's render speed per preset, for scripts/estimate.mjs.
//
//   node scripts/bench.mjs
//
// Bundles once, then renders the StudioCheck card at two lengths per preset.
// The difference gives seconds per frame without the startup overhead.
// Writes production/bench.json. Takes about 2–3 minutes.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";

const chrome = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const extra = existsSync(chrome) ? [`--browser-executable=${chrome}`] : [];
const run = (args) => {
  const t0 = Date.now();
  const r = spawnSync("npx", ["remotion", ...args, ...extra, "--log=error"], { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) throw new Error(`Failed: remotion ${args.join(" ")}`);
  return (Date.now() - t0) / 1000;
};

console.log("Bundling…");
run(["bundle", "--out-dir=build/bench"]);
mkdirSync("out/bench", { recursive: true });

const PRESETS = {
  draft: ["--scale=0.5", "--crf=30", "--codec=h264"],
  review: ["--scale=1", "--crf=20", "--codec=h264"],
  "4k": ["--scale=2", "--crf=16", "--codec=h264", "--image-format=png"],
  "4k-hevc": ["--scale=2", "--crf=18", "--codec=h265", "--image-format=png"],
  master: ["--scale=2", "--codec=prores", "--prores-profile=hq", "--image-format=png"],
};

const secondsPerFrame = {};
let overhead = 0;
for (const [name, flags] of Object.entries(PRESETS)) {
  const ext = name === "master" ? "mov" : "mp4";
  const short = run(["render", "build/bench", "StudioCheck", `out/bench/${name}-a.${ext}`, "--frames=0-14", ...flags]);
  const long = run(["render", "build/bench", "StudioCheck", `out/bench/${name}-b.${ext}`, "--frames=0-74", ...flags]);
  secondsPerFrame[name] = Math.max(0.005, (long - short) / 60);
  overhead = Math.max(overhead, short - 15 * secondsPerFrame[name]);
  console.log(`${name.padEnd(8)} ${secondsPerFrame[name].toFixed(3)} s/frame`);
}
secondsPerFrame.alpha = secondsPerFrame.master * 1.2;
secondsPerFrame["webm-alpha"] = secondsPerFrame.review * 3;
secondsPerFrame.still = run(["still", "build/bench", "StudioCheck", "out/bench/still.png", "--frame=60", "--image-format=png"]);
secondsPerFrame["still-4k"] = run(["still", "build/bench", "StudioCheck", "out/bench/still-4k.png", "--frame=60", "--scale=2", "--image-format=png"]);
secondsPerFrame["still-print"] = secondsPerFrame["still-4k"] * 2;
secondsPerFrame.overhead = overhead;

mkdirSync("production", { recursive: true });
writeFileSync(
  "production/bench.json",
  JSON.stringify({ measuredAt: new Date().toISOString(), cpus: os.cpus().length, platform: `${os.platform()}-${os.arch()}`, secondsPerFrame }, null, 2) + "\n",
);
console.log("Wrote production/bench.json");
