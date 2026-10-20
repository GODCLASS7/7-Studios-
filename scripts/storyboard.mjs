#!/usr/bin/env node
// Render a job's storyboard for approval.
//
//   node scripts/storyboard.mjs <job-id> [--animatic] [--draft]
//
// Reads jobs/<job>/storyboard.json. For each panel with `capture`
// ({ composition, frame }), it first renders that frame to
// public/jobs/<job>/panels/<id>.png and uses it as the panel image, so the
// storyboard can show real design frames next to sketched ones.
//
// Outputs:
//   out/<job>/storyboard-v<version>.png   the approval sheet
//   out/<job>/animatic-v<version>.mp4     (with --animatic) timed preview

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [job, ...flags] = process.argv.slice(2);
if (!job) {
  console.error("Usage: node scripts/storyboard.mjs <job-id> [--animatic] [--draft]");
  process.exit(1);
}
const src = join("jobs", job, "storyboard.json");
if (!existsSync(src)) {
  console.error(`Missing ${src}. Create the job with: npm run new-job -- ${job} "<title>"`);
  process.exit(1);
}

const render = (args) => {
  const r = spawnSync("node", ["scripts/render.mjs", ...args], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const sb = JSON.parse(readFileSync(src, "utf8"));
const panelDir = join("public", "jobs", job, "panels");
mkdirSync(panelDir, { recursive: true });

for (const p of sb.panels) {
  if (!p.capture) continue;
  const rel = `jobs/${job}/panels/${p.id}.png`;
  render([p.capture.composition, "still", `--frame=${p.capture.frame}`, `--out=public/${rel}`]);
  p.image = rel;
}

const resolved = join("jobs", job, ".storyboard.resolved.json");
writeFileSync(resolved, JSON.stringify(sb, null, 2));

const outDir = join("out", job);
render(["StoryboardSheet", "still", `--props=${resolved}`, `--out=${join(outDir, `storyboard-v${sb.version}.png`)}`]);
if (flags.includes("--animatic")) {
  render([
    "StoryboardAnimatic",
    flags.includes("--draft") ? "draft" : "review",
    `--props=${resolved}`,
    `--out=${join(outDir, `animatic-v${sb.version}.mp4`)}`,
  ]);
}
console.log(`\nStoryboard v${sb.version} for "${sb.project}" is in ${outDir}/`);
