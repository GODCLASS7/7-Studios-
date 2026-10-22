#!/usr/bin/env node
// Render on AWS Lambda with Remotion Lambda: a 4K minute-long render in about a
// minute instead of 15+ on a laptop. Optional; needs your own AWS account.
//
//   node scripts/render-cloud.mjs setup                         once: deploy the function and upload the project
//   node scripts/render-cloud.mjs sync                          re-upload the project after adding footage or code
//   node scripts/render-cloud.mjs <Comp> <preset> [--props=…] [--out=…]
//
// Setup (once, in your AWS account; see https://www.remotion.dev/docs/lambda/setup):
//   1. Create an IAM user for Remotion with the policy `npx remotion lambda policies user` prints,
//      and a role named remotion-lambda-role with `npx remotion lambda policies role`.
//   2. Put its keys in .env (never in chat):
//        REMOTION_AWS_ACCESS_KEY_ID=…   REMOTION_AWS_SECRET_ACCESS_KEY=…   REMOTION_AWS_REGION=us-east-1
//   3. node scripts/render-cloud.mjs setup
// The project's public/ folder (footage included) is uploaded to your S3 bucket by
// setup/sync, so sync after adding a job's media. AWS bills per render (usually
// cents for a short 4K video) plus S3 storage; delete old renders in the bucket.
// Licence: Remotion's company licence applies to cloud rendering for companies over 3 people.
// Status: built from Remotion's documented CLI; not yet run against a real AWS
// account in this project. Test it on a short render first.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv, parseArgs, readJson, writeJson } from "./lib/media.mjs";

loadEnv();
const { opt, pos } = parseArgs(process.argv.slice(2));
const [cmd, preset = "review"] = pos;
const STATE = join("production", "lambda.json");

if (!process.env.REMOTION_AWS_ACCESS_KEY_ID || !process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
  console.error("Set REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY in .env first (see the steps at the top of this script).");
  process.exit(1);
}
const region = process.env.REMOTION_AWS_REGION || "us-east-1";
const npx = (args, capture = false) => {
  const r = spawnSync("npx", ["remotion", "lambda", ...args, `--region=${region}`], { stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`✖ remotion lambda ${args[0]} ${args[1] || ""} failed.${capture ? `\n${r.stderr}` : ""}`);
    process.exit(1);
  }
  return r.stdout || "";
};

if (cmd === "setup" || cmd === "sync") {
  if (cmd === "setup") npx(["functions", "deploy", "--memory=3009", "--disk=10240", "--timeout=900"]);
  const outText = npx(["sites", "create", "src/index.ts", "--site-name=seven-studios"], true);
  const url = outText.match(/https:\/\/\S+\/index\.html/)?.[0] || outText.match(/https:\/\/\S+/)?.[0];
  if (!url) {
    console.error(`Couldn't read the site URL from:\n${outText}`);
    process.exit(1);
  }
  writeJson(STATE, { region, serveUrl: url, at: new Date().toISOString() });
  console.log(`✔ Project uploaded: ${url}\nRecorded in ${STATE}.`);
  process.exit(0);
}

const PRESETS = {
  draft: ["--scale=0.5", "--crf=30", "--every-nth-frame=2", "--codec=h264"],
  review: ["--scale=1", "--crf=20", "--codec=h264"],
  hd: ["--scale=1", "--crf=16", "--codec=h264", "--image-format=png", "--color-space=bt709"],
  "4k": ["--scale=2", "--crf=16", "--codec=h264", "--image-format=png", "--color-space=bt709"],
  "4k-hevc": ["--scale=2", "--crf=18", "--codec=h265", "--image-format=png", "--color-space=bt709"],
  master: ["--scale=2", "--codec=prores", "--prores-profile=hq", "--image-format=png"],
};
if (!cmd || !PRESETS[preset]) {
  console.error(`Usage: node scripts/render-cloud.mjs setup | sync | <Comp> <${Object.keys(PRESETS).join("|")}> [--props=…] [--out=…]`);
  process.exit(1);
}
const state = readJson(STATE);
if (!state?.serveUrl) {
  console.error("Run `node scripts/render-cloud.mjs setup` first.");
  process.exit(1);
}
const out = opt.out || join("out", `${cmd}-${preset}-cloud.${preset === "master" ? "mov" : "mp4"}`);
mkdirSync(dirname(out), { recursive: true });
const args = ["render", state.serveUrl, cmd, out, ...PRESETS[preset]];
if (opt.props) {
  if (!existsSync(opt.props)) {
    console.error(`Props file not found: ${opt.props}`);
    process.exit(1);
  }
  args.push(`--props=${opt.props}`);
}
const t0 = Date.now();
npx(args);
console.log(`✔ ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s on Lambda`);
