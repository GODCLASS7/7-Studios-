#!/usr/bin/env node
// Technical QC for a rendered video or still.
//
//   node scripts/qc.mjs <file> [--expect=3840x2160] [--fps=30] [--seconds=20] [--lufs=-14] [--job=<id>]
//
// Checks resolution, frame rate, duration, codec/pixel format, black
// segments and (if there is audio) integrated loudness and true peak.
// With --job, appends the report to jobs/<id>/qc.md. Exits 1 on any FAIL.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const [file, ...rest] = process.argv.slice(2);
if (!file || !existsSync(file)) {
  console.error("Usage: node scripts/qc.mjs <file> [--expect=WxH] [--fps=N] [--seconds=N] [--lufs=-14] [--job=id]");
  process.exit(1);
}
const opt = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));

// Prefer a full system ffmpeg/ffprobe build. Remotion's bundled build is
// minimal (no blackdetect, lut3d, tile or fps filters).
const systemFfmpeg = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
const hasSystem = systemFfmpeg.status === 0;
const tool = (name, args) => {
  const r = hasSystem
    ? spawnSync(name, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    : spawnSync("npx", ["remotion", name, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { out: r.stdout || "", err: r.stderr || "", ok: r.status === 0 };
};
const hasBlackdetect = hasSystem && /\bblackdetect\b/.test(systemFfmpeg.stdout || "");

const probe = JSON.parse(tool("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).out || "{}");
const v = (probe.streams || []).find((s) => s.codec_type === "video");
const a = (probe.streams || []).find((s) => s.codec_type === "audio");
const isStill = [".png", ".jpg", ".jpeg", ".webp"].includes(extname(file).toLowerCase());
const results = [];
const check = (name, pass, detail, warnOnly = false) => results.push({ name, status: pass ? "PASS" : warnOnly ? "WARN" : "FAIL", detail });

if (!v) {
  check("Readable", false, "No video/image stream found");
} else {
  const size = `${v.width}x${v.height}`;
  check("Resolution", !opt.expect || opt.expect === size, `${size}${opt.expect ? ` (expected ${opt.expect})` : ""}`);
  if (!isStill) {
    const [n, d] = (v.avg_frame_rate || "0/1").split("/").map(Number);
    const fps = d ? n / d : 0;
    check("Frame rate", !opt.fps || Math.abs(fps - Number(opt.fps)) < 0.01, `${fps.toFixed(3)} fps`);
    const dur = Number(probe.format?.duration || 0);
    check("Duration", !opt.seconds || Math.abs(dur - Number(opt.seconds)) <= 0.1, `${dur.toFixed(2)} s${opt.seconds ? ` (expected ${opt.seconds})` : ""}`);
    check("Codec", true, `${v.codec_name} ${v.profile || ""} · ${v.pix_fmt}`);
    check(
      "Colour space",
      v.color_space === "bt709",
      `${v.color_space || "untagged"}${v.color_space === "bt709" ? "" : " (expected bt709; use the 4k/4k-hevc presets, which pass --color-space=bt709)"}`,
      true,
    );

    if (hasBlackdetect) {
      const black = tool("ffmpeg", ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.25:pix_th=0.05", "-an", "-f", "null", "-"]).err;
      const segs = [...black.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => `${Number(m[1]).toFixed(2)}–${Number(m[2]).toFixed(2)} s`);
      check("Black frames", segs.length === 0, segs.length ? `black at ${segs.join(", ")} (fine if it is an intended fade)` : "none ≥ 0.25 s", true);
    } else {
      check("Black frames", false, "not checked: needs a full ffmpeg build on PATH (brew/apt install ffmpeg)", true);
    }
  }
}

if (!isStill) {
  if (a) {
    const ln = tool("ffmpeg", ["-hide_banner", "-i", file, "-af", "loudnorm=print_format=json", "-vn", "-f", "null", "-"]).err;
    const j = ln.slice(ln.lastIndexOf("{"), ln.lastIndexOf("}") + 1);
    try {
      const m = JSON.parse(j);
      const target = Number(opt.lufs ?? -14);
      check("Loudness", Math.abs(Number(m.input_i) - target) <= 1, `${m.input_i} LUFS (target ${target} ±1)`, true);
      check("True peak", Number(m.input_tp) <= -1, `${m.input_tp} dBTP (max -1)`, true);
    } catch {
      check("Loudness", false, "could not measure", true);
    }
  } else {
    check("Audio", true, "no audio stream (fine for silent graphics)");
  }
}
const mb = statSync(file).size / 1e6;
check("File size", true, `${mb.toFixed(1)} MB${probe.format?.bit_rate ? ` · ${(Number(probe.format.bit_rate) / 1e6).toFixed(1)} Mb/s` : ""}`);

const icon = { PASS: "✅", WARN: "⚠️", FAIL: "❌" };
const report = `\n## QC — ${file} — ${new Date().toISOString()}\n\n| Check | Result | Detail |\n|---|---|---|\n${results
  .map((r) => `| ${r.name} | ${icon[r.status]} ${r.status} | ${r.detail} |`)
  .join("\n")}\n`;
console.log(report);
if (opt.job) appendFileSync(join("jobs", opt.job, "qc.md"), report);
process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
