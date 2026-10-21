#!/usr/bin/env node
// Carousel Studio: turn a video (or a topic) into a designed carousel post.
//
//   node scripts/carousel.mjs <job> frames <video> [--count=8] [--min-gap=2] [--cutout]
//   node scripts/carousel.mjs <job> render [--format=4x5|1x1|9x16] [--props=jobs/<job>/carousel.json]
//
// frames  picks the sharpest, best-exposed moments of a video (preferring ones with a
//         face, when `npm run track` has run), spread at least --min-gap seconds apart,
//         and saves them full size to public/jobs/<job>/carousel/frame-NN.jpg. With
//         --cutout it also cuts the person out of each (frame-NN-cut.png, transparent),
//         for covers like the "glow" look. Lists them in jobs/<job>/carousel-frames.json.
// render  renders jobs/<job>/carousel.json (look, handle, slides; see the Carousel
//         template) to out/<job>/carousel/slide-01.jpg …, plus a contact sheet
//         (sheet.jpg). "brand": "<slug>" in the JSON applies a brand kit.
//
// The words come first: Claude writes every slide from the transcript (takes.md) or
// the topic and shows them for approval before rendering (studio-stills §Carousels).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { brandProps } from "./lib/brand.mjs";
import { diskPath, ff, parseArgs, readJson, videoInfo, writeJson } from "./lib/media.mjs";
import { ensurePython, MODEL, PY, run } from "./lib/py.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, cmd, video] = pos;
const usage = "Usage: node scripts/carousel.mjs <job> frames <video> [--count=8] [--cutout] | render [--format=4x5]";
if (!job || !["frames", "render"].includes(cmd)) {
  console.error(usage);
  process.exit(1);
}
const pubDir = join("public", "jobs", job, "carousel");

if (cmd === "frames") {
  if (!video || !existsSync(diskPath(video))) {
    console.error(`${usage}\n(video not found: ${video})`);
    process.exit(1);
  }
  const file = diskPath(video);
  const info = videoInfo(file);
  const count = Number(opt.count ?? 8);
  const gap = Number(opt["min-gap"] ?? 2);
  // 4 samples a second at 320 px wide, grey: sharpness = variance of the Laplacian.
  const w = 320;
  const h = Math.round((info.height * w) / info.width / 2) * 2;
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `fps=4,scale=${w}:${h},format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1e9 });
  const buf = r.stdout;
  const n = Math.floor(buf.length / (w * h));
  // Face presence from a face track of this file, if there is one.
  const tracks = existsSync(join("jobs", job, "tracks")) ? readdirSync(join("jobs", job, "tracks")).map((f) => readJson(join("jobs", job, "tracks", f))) : [];
  const track = tracks.find((t) => t && t.source && diskPath(t.source) === file);
  const scored = [];
  for (let i = 0; i < n; i++) {
    const o = i * w * h;
    let sum = 0;
    let sum2 = 0;
    let mean = 0;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const k = o + y * w + x;
        const lap = 4 * buf[k] - buf[k - 1] - buf[k + 1] - buf[k - w] - buf[k + w];
        sum += lap;
        sum2 += lap * lap;
        mean += buf[k];
      }
    const m = (w - 2) * (h - 2);
    const sharp = sum2 / m - (sum / m) ** 2;
    const lum = mean / m;
    const t = i / 4;
    const face = track ? track.samples.find((s) => Math.abs(s.t - t) < 0.15)?.face : null;
    const exposure = lum < 40 || lum > 215 ? 0.4 : 1;
    scored.push({ t, score: sharp * exposure * (track ? (face ? 1.3 : 0.6) : 1) });
  }
  const picked = [];
  for (const c of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= count) break;
    if (c.t < 0.5 || c.t > info.duration - 0.5) continue;
    if (picked.every((p) => Math.abs(p.t - c.t) >= gap)) picked.push(c);
  }
  picked.sort((a, b) => a.t - b.t);
  mkdirSync(pubDir, { recursive: true });
  const frames = picked.map((p, i) => {
    const name = `frame-${String(i + 1).padStart(2, "0")}`;
    ff(["-ss", p.t.toFixed(3), "-i", file, "-frames:v", "1", "-q:v", "2", join(pubDir, `${name}.jpg`)]);
    return { t: Number(p.t.toFixed(2)), image: `jobs/${job}/carousel/${name}.jpg`, cutout: null };
  });
  if (opt.cutout) {
    await ensurePython();
    const args = [join("scripts", "matte", "cutout.py"), `--model=${MODEL}`];
    for (const f of frames) args.push(join("public", f.image), join("public", f.image.replace(/\.jpg$/, "-cut.png")));
    run(PY, args, "Cutting out the frames");
    for (const f of frames) f.cutout = f.image.replace(/\.jpg$/, "-cut.png");
  }
  writeJson(join("jobs", job, "carousel-frames.json"), { video, frames });
  console.log(`✔ ${frames.length} frames in ${pubDir}${opt.cutout ? " (+ cut-outs)" : ""}:`);
  for (const f of frames) console.log(`  ${f.t.toFixed(2)} s  ${f.image}${f.cutout ? `  ${f.cutout}` : ""}`);
  console.log(`Use them as "image" in jobs/${job}/carousel.json (a cut-out with "cutout": true).`);
  process.exit(0);
}

// render
const propsPath = opt.props || join("jobs", job, "carousel.json");
const props = readJson(propsPath);
if (!props?.slides?.length) {
  console.error(`No slides in ${propsPath}. Write it first (look, handle, slides[]).`);
  process.exit(1);
}
const missing = props.slides.filter((s) => s.image && !existsSync(join("public", s.image))).map((s) => s.image);
if (missing.length) {
  console.error(`Images not found under public/: ${missing.join(", ")}`);
  process.exit(1);
}
const resolved = { ...props, brand: typeof props.brand === "string" ? brandProps(props.brand, { endCard: false }) : (props.brand ?? null) };
const format = opt.format || props.format || "4x5";
const out = join("out", job, "carousel", format);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const resolvedPath = join("jobs", job, ".carousel.resolved.json");
writeJson(resolvedPath, resolved);
const chrome = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const rr = spawnSync(
  "npx",
  ["remotion", "render", `Carousel-${format}`, out, "--sequence", "--image-format=jpeg", "--jpeg-quality=95", `--props=${resolvedPath}`, "--log=error", ...(existsSync(chrome) ? [`--browser-executable=${chrome}`] : [])],
  { stdio: "inherit" },
);
if (rr.status !== 0) process.exit(1);
const files = readdirSync(out)
  .filter((f) => /\.jpe?g$/.test(f))
  .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
files.forEach((f, i) => renameSync(join(out, f), join(out, `slide-${String(i + 1).padStart(2, "0")}.jpg`)));
// Up to 5 a row, rows balanced (6 slides → 3 × 2, not 5 + 1).
const rows = Math.ceil(files.length / 5);
const cols = Math.ceil(files.length / rows);
ff(["-pattern_type", "glob", "-i", join(out, "slide-*.jpg"), "-vf", `scale=360:-2,tile=${cols}x${rows}:padding=8:color=0x222222`, "-frames:v", "1", join(out, "sheet.jpg")]);
console.log(`✔ ${files.length} slides in ${out}/ (slide-01.jpg …) and ${join(out, "sheet.jpg")}`);
