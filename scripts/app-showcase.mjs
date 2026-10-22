#!/usr/bin/env node
// The moving wall in the app: short, muted loops of the studio's own templates, made
// by the studio itself, small enough to play many at once (like a feed).
//
//   node scripts/app-showcase.mjs [--only=logo-intro,terminal]
//
// Writes app/ui/public/showcase/<name>.mp4 + <name>.jpg (poster) and showcase.json.
// Re-run after changing a template so the app shows what it really makes.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ff, parseArgs } from "./lib/media.mjs";
import { browserPath } from "./lib/browser.mjs";

const { opt } = parseArgs(process.argv.slice(2));
const OUT = join("app", "ui", "public", "showcase");
const TMP = join("production", "tmp", "showcase");
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// name, label, composition, frames, scale, props, ratio
const ART = ["one-line", "ascii", "pixel", "sketch", "riso", "hud", "ink"];
const CLIPS = [
  { name: "logo-intro", label: "Logo sting", comp: "LogoIntro-1x1", frames: [0, 149], scale: 0.45, ratio: "1 / 1" },
  { name: "logo-intro-dark", label: "Logo sting", comp: "LogoIntro-9x16", frames: [0, 149], scale: 0.4, ratio: "9 / 16", props: { theme: "dark" } },
  ...[0, 1, 2, 4, 5, 6].map((i) => ({ name: `art-${ART[i]}`, label: `Art style · ${ART[i]}`, comp: "ArtStyles-9x16", frames: [i * 75, i * 75 + 74], scale: 0.4, ratio: "9 / 16" })),
  { name: "sitemorph", label: "SiteMorph", comp: "SiteMorph-1x1", frames: [0, 509], scale: 0.45, ratio: "1 / 1" },
  { name: "sitemorph-site", label: "SiteMorph · a website", comp: "SiteMorph-9x16", frames: [0, 539], scale: 0.4, ratio: "9 / 16", propsFile: "jobs/site-test/sitemorph.json" },
  { name: "terminal", label: "Terminal", comp: "Terminal-9x16", frames: [0, 269], scale: 0.4, ratio: "9 / 16" },
  { name: "titles", label: "Cinematic titles", comp: "Titles-9x16", frames: [0, 239], scale: 0.4, ratio: "9 / 16" },
  { name: "cards", label: "Card line-up", comp: "Cards-9x16", frames: [0, 254], scale: 0.4, ratio: "9 / 16" },
  { name: "titles-wide", label: "Cinematic titles", comp: "Titles-16x9", frames: [240, 419], scale: 0.3, ratio: "16 / 9" },
];
const only = opt.only ? new Set(String(opt.only).split(",")) : null;
const chrome = await browserPath();
const bundle = join(TMP, "bundle");
console.log("Bundling…");
rmSync(bundle, { recursive: true, force: true });
let r = spawnSync("npx", ["remotion", "bundle", `--out-dir=${bundle}`, "--log=error"], { stdio: "inherit" });
if (r.status !== 0) process.exit(1);

const made = [];
for (const c of CLIPS) {
  const out = join(OUT, `${c.name}.mp4`);
  if (only && !only.has(c.name)) {
    if (existsSync(out)) made.push(c);
    continue;
  }
  if (c.propsFile && !existsSync(c.propsFile)) {
    console.log(`  skip ${c.name}: ${c.propsFile} is made by npm test (site capture)`);
    if (existsSync(out)) made.push(c);
    continue;
  }
  const raw = join(TMP, `${c.name}.mp4`);
  const args = ["remotion", "render", bundle, c.comp, raw, `--frames=${c.frames[0]}-${c.frames[1]}`, `--scale=${c.scale}`, "--codec=h264", "--crf=18", "--muted", "--log=error", `--browser-executable=${chrome}`];
  if (c.props) {
    const pf = join(TMP, `${c.name}.props.json`);
    writeFileSync(pf, JSON.stringify(c.props));
    args.push(`--props=${pf}`);
  }
  if (c.propsFile) args.push(`--props=${c.propsFile}`);
  process.stdout.write(`  ${c.name}… `);
  r = spawnSync("npx", args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) {
    console.log(`failed\n${r.stderr.split("\n").slice(-5).join("\n")}`);
    continue;
  }
  // 30 fps, small, starts playing at once (faststart), no sound track at all.
  ff(["-i", raw, "-an", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-movflags", "+faststart", out]);
  ff(["-ss", "1.2", "-i", out, "-frames:v", "1", "-q:v", "4", join(OUT, `${c.name}.jpg`)]);
  made.push(c);
  console.log("done");
}
writeFileSync(join(OUT, "showcase.json"), JSON.stringify(made.map(({ name, label, comp, ratio }) => ({ name, label, template: comp.split("-")[0], ratio })), null, 2));
console.log(`✔ ${made.length} clips in ${OUT}`);
