#!/usr/bin/env node
// Measure how reference videos are edited, so a style can be learned from
// them and saved as a recipe in the studio-styles skill.
//
//   node scripts/analyze-reference.mjs <name> <video|folder...> [--scene=0.3]
//   node scripts/analyze-reference.mjs <name> --fetch <url...>      download with yt-dlp first (your computer only)
//
// For each video: length, frame size and rate, every cut (ffmpeg scene
// detection), shot lengths, the first 3 seconds, loudness, and, if a
// transcript exists in references/<name>/transcripts/, speaking pace.
// Pictures to read: a contact sheet of the first frame of every shot, and a
// strip of the first 3 seconds (every 0.25 s), where the hook lives.
//
// Output: references/<name>/analysis.md (+ sheets/*.png). Media in references/
// is git-ignored. Use downloads for study only: never reuse another creator's
// footage, music or graphics in a delivery. Style is learnable; their content isn't ours.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { ff, parseArgs, readJson, videoInfo } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [name, ...inputs] = pos;
if (!name || !inputs.length) {
  console.error("Usage: node scripts/analyze-reference.mjs <name> <video|folder...>   |   <name> --fetch <url...>");
  process.exit(1);
}
const dir = join("references", name);
const sheets = join(dir, "sheets");
mkdirSync(sheets, { recursive: true });

if (opt.fetch) {
  const probe = spawnSync("yt-dlp", ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.error("yt-dlp isn't installed. Install it on your computer (brew install yt-dlp, or pip install yt-dlp), or download the videos yourself and pass the files.");
    process.exit(1);
  }
  for (const url of inputs) {
    const r = spawnSync("yt-dlp", ["-f", "mp4/bestvideo*+bestaudio/best", "--merge-output-format", "mp4", "-o", join(dir, "%(uploader)s-%(id)s.%(ext)s"), url], { stdio: "inherit" });
    if (r.status !== 0) console.error(`✖ Could not download ${url} (the site may block downloads, or the network may; on a cloud session, upload the files instead).`);
  }
}

const VIDEO = [".mp4", ".mov", ".m4v", ".webm", ".mkv"];
const files = (opt.fetch ? [dir] : inputs).flatMap((p) => (existsSync(p) && statSync(p).isDirectory() ? readdirSync(p).filter((f) => VIDEO.includes(extname(f).toLowerCase())).map((f) => join(p, f)) : [p]));
if (!files.length) {
  console.error("No videos to analyse.");
  process.exit(1);
}

const THRESH = Number(opt.scene ?? 0.3);
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((t, x) => t + x, 0) / Math.max(1, s.length);
  return { n: s.length, mean, median: s.length ? s[Math.floor(s.length / 2)] : 0, min: s[0] ?? 0, max: s[s.length - 1] ?? 0 };
};
const rows = [];
const allShots = [];
for (const file of files) {
  const info = videoInfo(file);
  const key = basename(file, extname(file));
  // Cuts: a hard scene change (score above the threshold), or a sharp spike
  // against the frames around it, which catches punch-ins and jump cuts
  // inside one take that a plain threshold misses.
  const r = ff(["-i", file, "-an", "-vf", "select='gte(scene,0)',metadata=print:key=lavfi.scene_score", "-f", "null", "-"], { loglevel: "info" });
  const out = r.stderr || "";
  const times = [...out.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const scores = [...out.matchAll(/scene_score=([\d.]+)/g)].map((m) => Number(m[1]));
  const cuts = [];
  scores.forEach((sc, i) => {
    const around = [...scores.slice(Math.max(0, i - 15), i), ...scores.slice(i + 1, i + 16)].sort((a, b) => a - b);
    const typical = around[Math.floor(around.length / 2)] ?? 0;
    const spike = sc > 0.05 && sc > 6 * Math.max(typical, 0.004);
    if ((sc > THRESH || spike) && (!cuts.length || times[i] - cuts[cuts.length - 1] > 0.15)) cuts.push(times[i]);
  });
  const bounds = [0, ...cuts, info.duration];
  const shots = bounds.slice(1).map((b, i) => b - bounds[i]).filter((d) => d > 0.05);
  allShots.push(...shots);
  const s = stats(shots);
  const hookCuts = cuts.filter((t) => t < 3).length;

  // Loudness.
  let lufs = "—";
  if (info.hasAudio) {
    const l = ff(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { loglevel: "info" }).stderr || "";
    const m = l.match(/I:\s+(-?[\d.]+) LUFS/g);
    if (m) lufs = m[m.length - 1].replace(/I:\s+/, "");
  }

  // Speaking pace from a transcript, if one was made.
  const tr = readJson(join(dir, "transcripts", `${key}.json`));
  const words = tr ? tr.words.filter((w) => w.type === "word") : [];
  const wpm = words.length ? Math.round(words.length / (info.duration / 60)) : null;

  // Pictures: first frame of each shot (up to 24), and the first 3 seconds.
  const starts = [0, ...cuts].slice(0, 24).map((t) => t + 0.08);
  const sel = starts.map((t) => `between(t\\,${t.toFixed(3)}\\,${(t + 0.05).toFixed(3)})`).join("+");
  const portrait = info.height > info.width;
  const cols = portrait ? 8 : 6;
  ff(["-i", file, "-vf", `select='${sel}',scale=${portrait ? 200 : 320}:-2,tile=${cols}x${Math.ceil(starts.length / cols)}:padding=4:color=0x0B0B0D`, "-frames:v", "1", "-fps_mode", "passthrough", join(sheets, `${key}-shots.png`)]);
  ff(["-t", "3", "-i", file, "-vf", `fps=4,scale=${portrait ? 200 : 320}:-2,tile=12x1:padding=4:color=0x0B0B0D`, "-frames:v", "1", join(sheets, `${key}-hook.png`)]);

  rows.push({ key, file, info, cuts, s, hookCuts, lufs, wpm });
}

const all = stats(allShots);
const f1 = (x) => x.toFixed(2);
const md = [
  `# Reference analysis — ${name}`,
  "",
  `${files.length} video(s). Cuts = scene score over ${THRESH} or a sharp spike against nearby frames (punch-ins, jump cuts). Check the shot sheets: flashes and fast camera moves can count as cuts.`,
  "",
  "| Video | Size · fps | Length | Cuts | Avg shot | Median | Shortest–longest | Cuts in first 3 s | Loudness | Words/min |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.key} | ${r.info.width}×${r.info.height} · ${r.info.fps.toFixed(0)} | ${f1(r.info.duration)} s | ${r.cuts.length} | ${f1(r.s.mean)} s | ${f1(r.s.median)} s | ${f1(r.s.min)}–${f1(r.s.max)} s | ${r.hookCuts} | ${r.lufs} | ${r.wpm ?? "—"} |`),
  "",
  `**Across all:** ${all.n} shots, average ${f1(all.mean)} s, median ${f1(all.median)} s, ${f1(60 / Math.max(0.01, all.mean))} cuts per minute.`,
  "",
  "## Pictures to read",
  "",
  ...rows.flatMap((r) => [`- \`sheets/${r.key}-shots.png\`: first frame of each shot`, `- \`sheets/${r.key}-hook.png\`: the first 3 seconds, every 0.25 s`]),
  "",
  "## Breakdown (fill in after reading the sheets, then get approval)",
  "",
  "- **Pacing:** average shot length, how often it cuts, where it slows down",
  "- **Jump cuts:** how tight; are pauses removed",
  "- **Zooms and punch-ins:** when, and how far",
  "- **Captions:** font style, size, colour, position, words per line, animation, highlighted words",
  "- **Graphics, emojis, pop-ups, b-roll:** what and when",
  "- **Colour and look**",
  "- **Sound:** music, effects, levels (see loudness above)",
  "- **Hook:** what happens in the first 3 seconds",
  "",
  "Once approved, save it as a recipe in `.claude/skills/studio-styles/SKILL.md` (Learned recipes), with these numbers.",
  "",
];
writeFileSync(join(dir, "analysis.md"), md.join("\n"));
console.log(md.slice(0, 8 + rows.length).join("\n"));
console.log(`\n✔ ${join(dir, "analysis.md")} and ${sheets}/`);
