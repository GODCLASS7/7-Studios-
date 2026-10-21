#!/usr/bin/env node
// Render a composition with a named quality preset.
//
//   node scripts/render.mjs <CompositionId> <preset> [--props=jobs/x/props.json] [--out=path] [--frames=0-89] [--frame=60]
//
// Presets (compositions are authored at 1080p; `scale` multiplies that):
//   draft      540p, fast, every 2nd frame            -> quick motion check
//   review     1080p H.264                            -> client preview for approval
//   hd         1080p H.264, PNG frames, CRF 16, BT.709 -> final when the footage is 1080p (phone, webcam)
//   4k         2160p H.264, PNG frames, CRF 16        -> 4K delivery (web, YouTube)
//   4k-hevc    2160p H.265, PNG frames, CRF 18        -> smaller 4K delivery
//   master     2160p ProRes 422 HQ (.mov)             -> editing master
//   alpha      2160p ProRes 4444 with transparency    -> overlays for editors
//   webm-alpha 1080p VP9 WebM with transparency       -> overlays for websites
//   still      PNG still at --frame (default 0), 1x
//   still-4k   PNG still at --frame, 2x
//   still-print PNG still at --frame, 1x (author print compositions at full pixel size)
//
// Every run appends its wall-clock time to production/timings.jsonl so
// scripts/estimate.mjs can learn this machine's real render speed.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const PRESETS = {
  draft: { ext: "mp4", args: ["--scale=0.5", "--crf=30", "--every-nth-frame=2", "--codec=h264"] },
  review: { ext: "mp4", args: ["--scale=1", "--crf=20", "--codec=h264"] },
  hd: { ext: "mp4", args: ["--scale=1", "--crf=16", "--codec=h264", "--image-format=png", "--color-space=bt709"] },
  "4k": { ext: "mp4", args: ["--scale=2", "--crf=16", "--codec=h264", "--image-format=png", "--color-space=bt709"] },
  "4k-hevc": { ext: "mp4", args: ["--scale=2", "--crf=18", "--codec=h265", "--image-format=png", "--color-space=bt709"] },
  master: { ext: "mov", args: ["--scale=2", "--codec=prores", "--prores-profile=hq", "--image-format=png"] },
  alpha: { ext: "mov", args: ["--scale=2", "--codec=prores", "--prores-profile=4444", "--image-format=png", "--pixel-format=yuva444p10le"] },
  "webm-alpha": { ext: "webm", args: ["--scale=1", "--codec=vp9", "--image-format=png", "--pixel-format=yuva420p"] },
  still: { ext: "png", still: true, args: ["--scale=1", "--image-format=png"] },
  "still-4k": { ext: "png", still: true, args: ["--scale=2", "--image-format=png"] },
  "still-print": { ext: "png", still: true, args: ["--scale=1", "--image-format=png"] },
};

const [id, presetName = "review", ...rest] = process.argv.slice(2);
if (!id || !PRESETS[presetName]) {
  console.error(`Usage: node scripts/render.mjs <CompositionId> <${Object.keys(PRESETS).join("|")}> [--props=..] [--out=..] [--frames=..] [--frame=..]`);
  process.exit(1);
}
const preset = PRESETS[presetName];
const opt = Object.fromEntries(
  rest.filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=")];
  }),
);

const out = opt.out || join("out", `${id}-${presetName}.${preset.ext}`);
mkdirSync(dirname(out), { recursive: true });

const args = ["remotion", preset.still ? "still" : "render", id, out, ...preset.args];
if (opt.props) args.push(`--props=${opt.props}`);
if (opt.frames && !preset.still) args.push(`--frames=${opt.frames}`);
if (preset.still) args.push(`--frame=${opt.frame ?? 0}`);

// Claude Code cloud containers: use the pre-installed headless Chromium.
const cloudChrome = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
if (existsSync(cloudChrome)) args.push(`--browser-executable=${cloudChrome}`);

console.log(`▶ ${presetName}: npx ${args.join(" ")}`);
const t0 = Date.now();
const r = spawnSync("npx", args, { stdio: "inherit" });
const seconds = (Date.now() - t0) / 1000;

mkdirSync("production", { recursive: true });
appendFileSync(
  "production/timings.jsonl",
  JSON.stringify({ kind: "render", id, preset: presetName, frames: opt.frames ?? null, seconds, ok: r.status === 0, at: new Date().toISOString() }) + "\n",
);
console.log(`${r.status === 0 ? "✔" : "✖"} ${out} in ${seconds.toFixed(1)} s`);
process.exit(r.status ?? 1);
