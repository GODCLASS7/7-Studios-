#!/usr/bin/env node
// The approved-post queue: nothing is posted unless the user approved that exact
// post (file, caption, account, trial settings, AI label, time), and the file
// hasn't changed since.
//
//   node scripts/posts.mjs add <file.mp4 | slides-dir> --platform=instagram|tiktok --account=<@handle>
//                              (--caption="…" | --caption-file=<txt>) [--trial=manual|auto]
//                              [--ai-label=yes|no] [--at=2026-10-24T18:00:00+00:00] [--job=<id>]
//   node scripts/posts.mjs show <id>              the post card to show the user for approval
//   node scripts/posts.mjs approve <id> --by="<the user's words>"   only after they approve the card
//   node scripts/posts.mjs hosted <id> <https-url>  record where the file is hosted for posting
//   node scripts/posts.mjs check <id>             right before posting: approved, unchanged, due?
//   node scripts/posts.mjs done <id> [--url=<permalink>]
//   node scripts/posts.mjs cancel <id>
//   node scripts/posts.mjs list
//
// The queue is production/posts.json. Posting itself is done by Claude with the
// connected tools (vidIQ for Instagram Reels, including trial reels; Higgsfield for
// TikTok, where the user submits TikTok's own form), and a scheduled post is a
// scheduled task that runs `check` first. See studio-edit §5c.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, readJson, videoInfo, writeJson } from "./lib/media.mjs";

process.on("uncaughtException", (e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
// POSTS_QUEUE points the queue elsewhere (the regression tests use a scratch copy).
const QUEUE = process.env.POSTS_QUEUE || join("production", "posts.json");
const { opt, pos } = parseArgs(process.argv.slice(2));
const [cmd, a1, a2] = pos;
const q = readJson(QUEUE, { posts: [] });
const save = () => writeJson(QUEUE, q);
const find = (id) => {
  const p = q.posts.find((x) => x.id === id);
  if (!p) {
    console.error(`No post "${id}" in ${QUEUE} (npm run posts -- list)`);
    process.exit(1);
  }
  return p;
};
const slidesOf = (dir) =>
  readdirSync(dir)
    .filter((f) => /^slide-\d+\.(jpe?g|webp)$/i.test(f))
    .sort()
    .map((f) => join(dir, f));
// One fingerprint for the post's media: the video, or every slide in order.
const hashOf = (p) => {
  const h = createHash("sha256");
  const files = p.kind === "carousel" ? slidesOf(p.file) : [p.file];
  for (const f of files) h.update(readFileSync(f));
  return h.digest("hex");
};
const card = (p) =>
  [
    `Post ${p.id} (${p.status})`,
    `  ${p.kind === "carousel" ? `Carousel: ${p.slides} slides in ${p.file}` : `Video: ${p.file} (${p.seconds} s)`}`,
    `  Fingerprint: ${p.sha256.slice(0, 16)}…`,
    `  Platform: ${p.platform}, account ${p.account}`,
    `  ${p.platform === "instagram" && p.kind === "reel" ? (p.trial ? `Trial reel (shown to non-followers first), graduation: ${p.trial === "MANUAL" ? "you decide" : "automatic if it performs"}` : "Regular reel (shown to followers)") : p.platform === "tiktok" ? "TikTok: you choose privacy and settings in TikTok's own form" : "Instagram carousel: post it yourself (the connected tools publish Reels only)"}`,
    `  AI-generated label: ${p.aiLabel === null ? "not decided (ask)" : p.aiLabel ? "yes" : "no"}`,
    `  When: ${p.at ? new Date(p.at).toUTCString() : "now, when approved"}`,
    `  Caption (${p.caption.length} characters):`,
    ...p.caption.split("\n").map((l) => `    | ${l}`),
    ...(p.approvedAt ? [`  Approved ${p.approvedAt}: "${p.approvedBy}"`] : []),
    ...(p.hostedUrl ? [`  Hosted: ${p.hostedUrl}`] : []),
    ...(p.postedAt ? [`  Posted ${p.postedAt}${p.url ? `: ${p.url}` : ""}`] : []),
  ].join("\n");

if (cmd === "add") {
  const file = a1;
  if (!file || !existsSync(file)) {
    console.error("Usage: node scripts/posts.mjs add <file.mp4 | slides-dir> --platform=instagram|tiktok --account=@handle --caption=…");
    process.exit(1);
  }
  const platform = String(opt.platform || "");
  if (!["instagram", "tiktok"].includes(platform)) throw new Error("--platform=instagram or --platform=tiktok");
  if (!opt.account) throw new Error("--account=@handle (the connected account to post from)");
  const caption = opt["caption-file"] ? readFileSync(opt["caption-file"], "utf8").trim() : String(opt.caption ?? "");
  const kind = statSync(file).isDirectory() ? "carousel" : "reel";
  const p = { id: `p${q.posts.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0) + 1}`, job: opt.job || null, kind, file, platform, account: String(opt.account), caption };
  const problems = [];
  if (kind === "carousel") {
    const slides = slidesOf(file);
    if (!slides.length) throw new Error(`No slide-NN.jpg files in ${file} (npm run carousel -- <job> render)`);
    p.slides = slides.length;
    if (platform === "tiktok" && slides.length > 35) problems.push("TikTok photo posts take at most 35 images");
    if (platform === "instagram" && slides.length > 20) problems.push("Instagram carousels take at most 20 slides");
    for (const s of slides) {
      const { width, height } = videoInfo(s);
      if (platform === "tiktok" && !((width <= 1080 && height <= 1920) || (width <= 1920 && height <= 1080))) problems.push(`${s} is ${width}×${height}; TikTok photos must fit 1080×1920`);
    }
  } else {
    const info = videoInfo(file);
    p.seconds = Number(info.duration.toFixed(1));
    const [lo, hi] = platform === "instagram" ? [3, 900] : [3, 600];
    if (info.duration < lo || info.duration > hi) problems.push(`${platform} needs ${lo}–${hi} s; this is ${p.seconds} s`);
    if (platform === "tiktok" && (info.fps < 23 || info.fps > 60)) problems.push(`TikTok needs 23–60 fps; this is ${info.fps}`);
  }
  if (platform === "instagram" && caption.length > 2200) problems.push(`Instagram captions take 2,200 characters; this is ${caption.length}`);
  if (platform === "tiktok" && caption.length > 4000) problems.push(`TikTok descriptions take 4,000 characters; this is ${caption.length}`);
  p.trial = null;
  if (opt.trial) {
    if (platform !== "instagram" || kind !== "reel") problems.push("Trial posts are for Instagram Reels only");
    p.trial = /^auto|ss_performance$/i.test(String(opt.trial)) ? "SS_PERFORMANCE" : "MANUAL";
  }
  p.aiLabel = opt["ai-label"] === undefined ? null : /^(yes|true|1)$/i.test(String(opt["ai-label"]));
  p.at = opt.at ? new Date(String(opt.at)).toISOString() : null;
  if (opt.at && Number.isNaN(Date.parse(String(opt.at)))) throw new Error(`Can't read the time "${opt.at}" (use 2026-10-24T18:00:00+00:00)`);
  if (problems.length) {
    console.error(`✖ Not queued:\n${problems.map((x) => `  - ${x}`).join("\n")}`);
    process.exit(1);
  }
  p.sha256 = hashOf(p);
  p.status = "draft";
  p.createdAt = new Date().toISOString();
  q.posts.push(p);
  save();
  console.log(`${card(p)}\n\nShow this card to the user. Only after they approve it: npm run posts -- approve ${p.id} --by="<their words>"`);
} else if (cmd === "show") {
  console.log(card(find(a1)));
} else if (cmd === "approve") {
  const p = find(a1);
  if (!opt.by) throw new Error('--by="<the user\'s words of approval>" is required');
  if (p.aiLabel === null && p.platform === "instagram" && p.kind === "reel") throw new Error(`Ask the user whether to add Instagram's AI-generated label, then re-add the post with --ai-label=yes|no`);
  if (hashOf(p) !== p.sha256) throw new Error(`${p.file} changed since the card was made; re-add it and show the new card`);
  Object.assign(p, { status: "approved", approvedAt: new Date().toISOString(), approvedBy: String(opt.by) });
  save();
  console.log(`✔ ${p.id} approved${p.at ? ` for ${new Date(p.at).toUTCString()}` : ""}.`);
} else if (cmd === "hosted") {
  const p = find(a1);
  if (!/^https:\/\//.test(a2 || "")) throw new Error("Give the https URL the file is hosted at");
  p.hostedUrl = a2;
  save();
  console.log(`✔ ${p.id} hosted at ${a2}`);
} else if (cmd === "check") {
  const p = find(a1);
  const errs = [];
  if (p.status !== "approved") errs.push(`status is "${p.status}", not approved`);
  if (!existsSync(p.file)) errs.push(`${p.file} is missing (render it again, or post from the hosted copy only if its fingerprint was checked)`);
  else if (hashOf(p) !== p.sha256) errs.push(`${p.file} changed since it was approved`);
  if (p.at && Date.now() < Date.parse(p.at) - 5 * 60 * 1000) errs.push(`not due until ${new Date(p.at).toUTCString()}`);
  console.log(card(p));
  if (errs.length) {
    console.error(`\n✖ Do not post:\n${errs.map((x) => `  - ${x}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`\n✔ OK to post exactly as above.${p.platform === "instagram" && p.kind === "reel" ? ` vidIQ: vidiq_instagram_publish_reel with the account ${p.account}, the caption above${p.trial ? `, trialParams.graduationStrategy=${p.trial}` : ""}${p.aiLabel ? ", isAiGenerated=true" : ""}.` : ""}`);
} else if (cmd === "done") {
  const p = find(a1);
  Object.assign(p, { status: "posted", postedAt: new Date().toISOString(), url: opt.url || null });
  save();
  console.log(`✔ ${p.id} marked posted${p.url ? `: ${p.url}` : ""}. Pull its numbers in a week (studio-edit §5b).`);
} else if (cmd === "cancel") {
  const p = find(a1);
  p.status = "cancelled";
  save();
  console.log(`✔ ${p.id} cancelled`);
} else if (cmd === "list") {
  if (!q.posts.length) console.log("No posts queued.");
  for (const p of q.posts) console.log(`${p.id}  ${p.status.padEnd(9)} ${p.platform.padEnd(9)} ${p.account}  ${p.at ? new Date(p.at).toISOString().slice(0, 16).replace("T", " ") : "now"}  ${p.file}${p.trial ? "  (trial)" : ""}`);
} else {
  console.error("Usage: node scripts/posts.mjs add | show | approve | hosted | check | done | cancel | list   (see the top of the file)");
  process.exit(1);
}
