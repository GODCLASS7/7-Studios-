#!/usr/bin/env node
// Download a generated or supplied asset into a job and record where it came from.
//
//   node scripts/fetch-asset.mjs <url> <job-id> <footage|stills|audio|data|brand|panels> <filename> \
//     [--model=seedance_2_0] [--prompt="..."] [--provider-job=<id>] [--credits=12] [--note="..."]
//
// Saves to public/jobs/<job>/<kind>/<filename> (use it with staticFile) and
// appends provenance to jobs/<job>/assets.json, so every AI shot can be traced
// back to its model, prompt and cost.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [url, job, kind, filename, ...rest] = process.argv.slice(2);
const KINDS = ["footage", "stills", "audio", "data", "brand", "panels"];
if (!url || !job || !KINDS.includes(kind) || !filename) {
  console.error(`Usage: node scripts/fetch-asset.mjs <url> <job-id> <${KINDS.join("|")}> <filename> [--model=..] [--prompt=..] [--provider-job=..] [--credits=..] [--note=..]`);
  process.exit(1);
}
const opt = Object.fromEntries(
  rest.filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.join("=")];
  }),
);

const dir = join("public", "jobs", job, kind);
mkdirSync(dir, { recursive: true });
const dest = join(dir, filename);
// curl honours the environment's proxy and CA settings.
const r = spawnSync("curl", ["-sSfL", "--retry", "3", "-o", dest, url], { stdio: "inherit" });
if (r.status !== 0) {
  console.error(`Download failed: ${url}`);
  process.exit(1);
}

const manifestPath = join("jobs", job, "assets.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
const entry = {
  file: `jobs/${job}/${kind}/${filename}`,
  kind,
  sourceUrl: url,
  model: opt.model || null,
  prompt: opt.prompt || null,
  providerJobId: opt["provider-job"] || null,
  credits: opt.credits ? Number(opt.credits) : null,
  note: opt.note || null,
  bytes: statSync(dest).size,
  fetchedAt: new Date().toISOString(),
};
writeFileSync(manifestPath, JSON.stringify([...manifest.filter((m) => m.file !== entry.file), entry], null, 2) + "\n");
console.log(`Saved ${dest} (${(entry.bytes / 1e6).toFixed(1)} MB). Use: staticFile("${entry.file}")`);
