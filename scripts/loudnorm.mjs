#!/usr/bin/env node
// Two-pass loudness normalisation for a rendered video, video stream copied untouched.
//
//   node scripts/loudnorm.mjs <in.mp4> <out.mp4> [--lufs=-14] [--tp=-1.5]
//
// Pass 1 measures; pass 2 applies a linear gain to hit the target exactly.
// The output is trimmed to the video stream's length, because AAC encoding
// otherwise pads the audio and makes the file slightly longer than the edit.
// Uses Remotion's bundled ffmpeg/ffprobe (loudnorm is included).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output || !existsSync(input)) {
  console.error("Usage: node scripts/loudnorm.mjs <in> <out> [--lufs=-14] [--tp=-1.5]");
  process.exit(1);
}
const opt = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const I = Number(opt.lufs ?? -14);
const TP = Number(opt.tp ?? -1.5);

const run = (tool, args) => spawnSync("npx", ["remotion", tool, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", input]).stdout);
const video = probe.streams.find((s) => s.codec_type === "video");
if (!probe.streams.some((s) => s.codec_type === "audio")) {
  console.error("No audio stream; nothing to normalise.");
  process.exit(1);
}

const measure = run("ffmpeg", ["-hide_banner", "-i", input, "-af", `loudnorm=I=${I}:TP=${TP}:LRA=11:print_format=json`, "-vn", "-f", "null", "-"]).stderr;
const m = JSON.parse(measure.slice(measure.lastIndexOf("{"), measure.lastIndexOf("}") + 1));
console.log(`Measured ${m.input_i} LUFS, ${m.input_tp} dBTP → target ${I} LUFS, ${TP} dBTP`);

const filter = `loudnorm=I=${I}:TP=${TP}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
const r = run("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  input,
  "-af",
  filter,
  "-ar",
  "48000",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "320k",
  "-t",
  String(Number(video.duration)),
  "-movflags",
  "+faststart",
  output,
]);
if (r.status !== 0) {
  console.error(r.stderr);
  process.exit(1);
}
console.log(`Wrote ${output}`);
