#!/usr/bin/env node
// Is this computer ready to run Motion Studio? One table of checks, each with its fix.
//
//   node scripts/doctor.mjs [--network]
//
// Required: Node, the npm packages, a full ffmpeg (with the filters and encoders
// the studio uses), the bundled fonts. Optional, each enabling one feature:
// ElevenLabs key (transcription), Python (cutout, face tracking), the sound pack,
// AWS keys (cloud rendering), a git remote (backup). --network also tests the
// hosts those features talk to. Never prints a key, only whether it is set.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statfsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, parseArgs } from "./lib/media.mjs";

loadEnv();
const { opt } = parseArgs(process.argv.slice(2));
const rows = [];
const add = (area, status, detail, fix = "") => rows.push({ area, status, detail, fix });
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });

// Node
const [maj, min] = process.versions.node.split(".").map(Number);
add("Node", maj > 22 || (maj === 22 && min >= 13) || (maj === 20 && min >= 19) ? "ok" : "fail", `v${process.versions.node}`, "Install Node 22 LTS from nodejs.org");

// Packages
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const want = pkg.dependencies.remotion;
const have = existsSync("node_modules/remotion/package.json") ? JSON.parse(readFileSync("node_modules/remotion/package.json", "utf8")).version : null;
add("npm packages", have === want ? "ok" : "fail", have ? `remotion ${have}` : "not installed", "npm i");
const linuxGnu = process.platform === "linux" && !existsSync("/etc/alpine-release");
if (linuxGnu) add("Linux compositor", existsSync("node_modules/@remotion/compositor-linux-x64-gnu") ? "ok" : "warn", "glibc build", "npm run setup:cloud");

// ffmpeg
const f = sh("ffmpeg", ["-hide_banner", "-filters"]);
if (f.status !== 0) add("ffmpeg", "fail", "not found on PATH", "brew install ffmpeg / apt install ffmpeg / winget install Gyan.FFmpeg");
else {
  const need = ["blackdetect", "scdet", "tile", "afftdn", "deesser", "agate", "loudnorm", "showwavespic", "alphamerge", "drawtext"];
  const miss = need.filter((n) => !new RegExp(`\\b${n}\\b`).test(f.stdout));
  const enc = sh("ffmpeg", ["-hide_banner", "-encoders"]).stdout || "";
  const missEnc = ["libx264", "libvpx-vp9", "aac"].filter((e) => !enc.includes(e));
  add("ffmpeg", miss.length || missEnc.length ? "fail" : "ok", miss.length || missEnc.length ? `missing ${[...miss, ...missEnc].join(", ")}` : "full build", "Install a full ffmpeg build (brew install ffmpeg)");
}

// Fonts
const fonts = ["Inter-Variable-latin.woff2", "Fraunces-Variable-latin.woff2", "Fraunces-Italic-Variable-latin.woff2", "PlusJakartaSans-Variable-latin.woff2", "DMMono-500-latin.woff2", "Caveat-Variable-latin.woff2", "Anton-400-latin.woff2"];
const missFonts = fonts.filter((x) => !existsSync(join("public", "brand", "fonts", x)));
add("Fonts", missFonts.length ? "fail" : "ok", missFonts.length ? `missing ${missFonts.join(", ")}` : `${fonts.length} bundled`, "Restore public/brand/fonts from the project zip");

// Optional features
add("ElevenLabs key", process.env.ELEVENLABS_API_KEY ? "ok" : "warn", process.env.ELEVENLABS_API_KEY ? "set in .env" : "not set: transcription uses Whisper or imports", "Add ELEVENLABS_API_KEY to .env (Speech to Text access)");
const py = sh(process.platform === "win32" ? "python" : "python3", ["--version"]);
const pyv = (py.stdout || py.stderr || "").match(/(\d+)\.(\d+)/);
add("Python", pyv && (Number(pyv[1]) > 3 || Number(pyv[2]) >= 10) ? "ok" : "warn", pyv ? pyv[0] : "not found: no cutout or face tracking", "Install Python 3.10+ (python.org)");
add("Cutout / tracking", existsSync("production/matte-venv") && existsSync("production/models/selfie_multiclass_256x256.tflite") ? "ok" : "warn", existsSync("production/matte-venv") ? "environment ready" : "sets itself up on first npm run matte / track", "");
const cv = existsSync("production/matte-venv") && sh(join("production", "matte-venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"), ["-c", "import cv2"]).status === 0;
add("Pins (OpenCV)", cv ? "ok" : "warn", cv ? "ready" : "installs itself on first npm run pin", "");
add("Sound effects", existsSync("public/audio/sfx/pop.wav") ? "ok" : "warn", existsSync("public/audio/sfx/pop.wav") ? "pack built" : "not built", "npm run sfx");
add("Cloud rendering", process.env.REMOTION_AWS_ACCESS_KEY_ID ? (existsSync("production/lambda.json") ? "ok" : "warn") : "warn", process.env.REMOTION_AWS_ACCESS_KEY_ID ? (existsSync("production/lambda.json") ? "set up" : "keys set; run setup") : "optional: no AWS keys", "See scripts/render-cloud.mjs");

// Backup
const remote = sh("git", ["remote", "-v"]).stdout || "";
const dirty = (sh("git", ["status", "--porcelain"]).stdout || "").trim().split("\n").filter(Boolean).length;
add("Backup (git)", remote.trim() ? "ok" : "warn", remote.trim() ? remote.split("\n")[0].split(/\s+/)[1] : `no remote: the project exists only on this machine${dirty ? `, ${dirty} uncommitted change(s)` : ""}`, "Create a private GitHub repo and push (git remote add origin …; git push -u origin main)");

// Approved posts whose time has passed without going out (a scheduled task didn't run).
const posts = existsSync("production/posts.json") ? JSON.parse(readFileSync("production/posts.json", "utf8")).posts || [] : [];
const overdue = posts.filter((p) => p.status === "approved" && p.at && Date.parse(p.at) < Date.now() - 15 * 60 * 1000);
if (posts.length) add("Post queue", overdue.length ? "warn" : "ok", overdue.length ? `${overdue.length} approved post(s) past their time: ${overdue.map((p) => p.id).join(", ")}` : `${posts.filter((p) => p.status === "approved").length} approved, waiting`, "npm run posts -- list; post them (after posts check) or cancel them");

// Disk
try {
  const s = statfsSync(".");
  const gb = (s.bavail * s.bsize) / 1e9;
  add("Disk space", gb > 20 ? "ok" : gb > 5 ? "warn" : "fail", `${gb.toFixed(0)} GB free`, "4K renders and footage need room: free some space");
} catch {
  add("Disk space", "warn", "could not read", "");
}

if (opt.network) {
  for (const [host, what] of [
    ["https://api.elevenlabs.io", "ElevenLabs"],
    ["https://storage.googleapis.com", "segmentation model"],
    ["https://huggingface.co", "Whisper models"],
    ["https://registry.npmjs.org", "npm"],
  ]) {
    const r = sh("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "8", host]);
    const code = Number(r.stdout || 0);
    add(`Network: ${what}`, code > 0 ? "ok" : "warn", code > 0 ? `${host} reachable` : `${host} blocked`, "Allow the host in your network or proxy settings");
  }
}

const icon = { ok: "✅", warn: "⚠️ ", fail: "❌" };
console.log("\nMotion Studio doctor\n");
for (const r of rows) console.log(`${icon[r.status]} ${r.area.padEnd(20)} ${r.detail}${r.status !== "ok" && r.fix ? `\n   → ${r.fix}` : ""}`);
const fails = rows.filter((r) => r.status === "fail").length;
console.log(`\n${fails ? `${fails} problem(s) to fix before rendering.` : "Ready. Warnings only turn off optional features."}`);
process.exit(fails ? 1 : 0);
