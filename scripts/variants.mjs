#!/usr/bin/env node
// Trial versions of one edit, to find out what works before (or instead of)
// posting to everyone: a different hook headline, opening line, caption style,
// editing style, grade, framing or pace, one change at a time.
//
//   node scripts/variants.mjs <job> plan [--auto=4]
//   node scripts/variants.mjs <job> build [--render] [--only=t2,t3] [--format=9x16]
//
// plan   shows jobs/<job>/variants.json, or with --auto writes a starter plan of
//        mechanical changes (caption style, pace, framing, grade). Hooks and opening
//        lines are editorial: Claude writes those from takes.md and the user approves
//        the plan before anything is built (studio-edit §5c).
// build  makes each version its own job, jobs/<job>-<id>/ (the edit list copied with
//        the change applied, then autocut/edl), and with --render renders a review
//        copy of each to out/<job>/variants/<id>.mp4, a phone copy, and a sheet of
//        every version's first second (out/<job>/variants/sheet.jpg). The list of
//        versions and what changed is written to jobs/<job>/variants.md.
//
// variants.json:
// { "goal": "which opening keeps people past 3 s",
//   "variants": [
//     { "id": "t1", "label": "As edited" },
//     { "id": "t2", "label": "Question headline", "hook": { "text": "Why does waiting hurt?", "style": "editorial", "seconds": 2.2 } },
//     { "id": "t3", "label": "Opens on A.3", "keep": "A.3,A.6,A.4-A.9" },
//     { "id": "t4", "label": "Karaoke captions", "captions": { "style": "karaoke" } },
//     { "id": "t5", "label": "Tighter", "pause": 0.2 },
//     { "id": "t6", "label": "Bold style", "style": "bold" },
//     { "id": "t7", "label": "Closer, film grade", "zoom": 1.12, "grade": "film" } ] }
// Other keys: "look", "music" (merged), "fx" (added), "titles" (added).
//
// Posting them as trial reels (shown to non-followers first) happens only with the
// user's approval of each exact post; see studio-edit §5c and scripts/posts.mjs.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ff, parseArgs, readJson, videoInfo, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, cmd] = pos;
const usage = "Usage: node scripts/variants.mjs <job> plan [--auto=4] | build [--render] [--only=t2,t3]";
if (!job || !["plan", "build"].includes(cmd)) {
  console.error(usage);
  process.exit(1);
}
const base = readJson(join("jobs", job, "edl.json"));
if (!base) {
  console.error(`No edit list for ${job} yet (jobs/${job}/edl.json). Edit it first: autocut, then edl.`);
  process.exit(1);
}
const planPath = join("jobs", job, "variants.json");
const KEYS = ["id", "label", "hook", "keep", "captions", "pause", "style", "look", "grade", "zoom", "music", "fx", "titles"];

if (cmd === "plan") {
  if (opt.auto) {
    if (existsSync(planPath) && !opt.force) {
      console.error(`${planPath} exists. Edit it, or pass --force to replace it with a starter plan.`);
      process.exit(1);
    }
    const capNow = base.captions?.style || "pop";
    const ideas = [
      { label: `Captions: ${capNow === "karaoke" ? "box" : "karaoke"}`, captions: { style: capNow === "karaoke" ? "box" : "karaoke" } },
      { label: "Tighter pace (pauses over 0.2 s closed)", pause: 0.2 },
      { label: "Closer framing", zoom: 1.12 },
      { label: `Grade: ${base.grade === "punchy" ? "film" : "punchy"}`, grade: base.grade === "punchy" ? "film" : "punchy" },
      { label: "Captions: serif", captions: { style: "serif" } },
      { label: "Bold editing style", style: "bold" },
    ];
    const n = Math.max(1, Math.min(ideas.length, Number(opt.auto) || 4));
    const plan = {
      goal: "Which version keeps people watching (hold at 3 s, average watch, shares)",
      variants: [{ id: "t1", label: "As edited" }, ...ideas.slice(0, n - 1).map((v, i) => ({ id: `t${i + 2}`, ...v }))],
    };
    writeJson(planPath, plan);
    console.log(`✔ ${planPath}: a starter plan of ${plan.variants.length}. Add hook headlines or opening lines (from takes.md), then get it approved.`);
  }
  const plan = readJson(planPath);
  if (!plan) {
    console.error(`No plan yet. Write ${planPath}, or start one: npm run variants -- ${job} plan --auto=4`);
    process.exit(1);
  }
  console.log(`Goal: ${plan.goal || "(none set)"}`);
  for (const v of plan.variants) console.log(`  ${v.id}  ${v.label || ""}  ${describe(v)}`);
  process.exit(0);
}

// build
const plan = readJson(planPath);
if (!plan?.variants?.length) {
  console.error(`No plan: ${planPath}. Run: npm run variants -- ${job} plan --auto=4`);
  process.exit(1);
}
const only = opt.only ? String(opt.only).split(",") : null;
const ids = new Set();
for (const v of plan.variants) {
  if (!/^[a-z0-9-]+$/i.test(v.id || "")) throw new Error(`Every variant needs an id of letters, numbers or dashes (got "${v.id}")`);
  if (ids.has(v.id)) throw new Error(`Variant id "${v.id}" is used twice`);
  ids.add(v.id);
  const unknown = Object.keys(v).filter((k) => !KEYS.includes(k));
  if (unknown.length) throw new Error(`Variant ${v.id}: unknown keys ${unknown.join(", ")} (${KEYS.join(", ")})`);
  if (v.style && !existsSync(join("presets", "styles", `${v.style}.json`))) throw new Error(`Variant ${v.id}: no editing style "${v.style}" in presets/styles/`);
}
const node = (args) => {
  const r = spawnSync("node", args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
};
// The play order of the base edit as phrase IDs, so pace changes keep the same story.
const baseKeep = [];
for (const s of base.segments) for (const id of String(s.phrase).split("+")) if (baseKeep[baseKeep.length - 1] !== id) baseKeep.push(id);

const format = opt.format || base.format || "9x16";
const outDir = join("out", job, "variants");
const rows = [];
// Two versions that resolve to the same picture and sound test nothing; say so before rendering.
const seen = new Map();
// (Caption style only shows in classic sections, so it doesn't count when there are none.)
const fingerprint = (r) => {
  const classic = !r.looks?.length || r.looks.some((l) => l.look === "classic");
  return JSON.stringify({ ...r, job: 0, version: 0, voice: 0, captions: { ...r.captions, style: classic ? r.captions.style : 0 } });
};
for (const v of plan.variants) {
  if (only && !only.includes(v.id)) continue;
  const child = `${job}-${v.id}`;
  const dir = join("jobs", child);
  mkdirSync(dir, { recursive: true });
  const edl = structuredClone(base);
  edl.job = child;
  edl.version = 1;
  edl.variantOf = { job, id: v.id, label: v.label || "" };
  if (v.style) {
    // The style decides the look, grade, captions and sound unless this variant sets them.
    edl.style = v.style;
    delete edl.look;
    delete edl.grade;
    delete edl.sfx;
    edl.captions = {};
  }
  if (v.look) edl.look = v.look;
  if (v.grade) edl.grade = v.grade;
  if (v.captions) edl.captions = { ...(edl.captions || {}), ...v.captions };
  if (v.music) edl.music = { ...(edl.music || {}), ...v.music };
  if (v.fx) edl.fx = [...(edl.fx || []), ...v.fx];
  if (v.titles) edl.titles = [...(edl.titles || []), ...v.titles];
  if (v.hook) {
    // An on-screen headline over the first seconds; the words are the user's, approved in the plan.
    const h = typeof v.hook === "string" ? { text: v.hook } : v.hook;
    if (!h.text) throw new Error(`Variant ${v.id}: "hook" needs text`);
    edl.titles = [{ style: h.style || "editorial", text: h.text, sub: h.sub ?? null, at: 0, seconds: h.seconds ?? 2.2, y: h.y ?? 0.22, size: h.size ?? 0.8, layer: h.layer || "front" }, ...(edl.titles || [])];
  }
  if (v.zoom) {
    for (const s of edl.segments) s.zoom = Number(((s.zoom || 1) * v.zoom).toFixed(3));
  }
  writeJson(join(dir, "edl.json"), edl);
  // A new opening or pace means cutting again from the takes.
  if (v.keep || v.pause) {
    const takes = join("jobs", job, "takes.json");
    if (!existsSync(takes)) throw new Error(`Variant ${v.id}: "keep" and "pause" need jobs/${job}/takes.json (npm run pack)`);
    copyFileSync(takes, join(dir, "takes.json"));
    if (existsSync(join("jobs", job, "takes.md"))) copyFileSync(join("jobs", job, "takes.md"), join(dir, "takes.md"));
    node(["scripts/autocut.mjs", child, `--keep=${v.keep || baseKeep.join(",")}`, ...(v.pause ? [`--pause=${v.pause}`] : []), `--format=${format}`, ...(edl.style ? [`--style=${edl.style}`] : [])]);
    // Keep the zoom of variants that asked for one; otherwise autocut's punch-ins stand.
    if (v.zoom) {
      const e2 = readJson(join(dir, "edl.json"));
      for (const s of e2.segments) s.zoom = Number(((s.zoom || 1) * v.zoom).toFixed(3));
      writeJson(join(dir, "edl.json"), e2);
    }
  }
  node(["scripts/edl.mjs", child]);
  const resolved = readJson(join(dir, ".edl.resolved.json"));
  const row = { id: v.id, label: v.label || "", change: describe(v), seconds: (resolved.durationInFrames / resolved.fps).toFixed(1), job: child, file: null, same: null };
  const fp = fingerprint(resolved);
  if (seen.has(fp)) {
    row.same = seen.get(fp);
    console.warn(`⚠ ${v.id} comes out the same as ${row.same}: its change has no effect on this edit (see the notes in jobs/${child}/edit.md). Change the plan; it isn't rendered.`);
    rows.push(row);
    continue;
  } else seen.set(fp, v.id);
  if (opt.render && !row.same) {
    mkdirSync(outDir, { recursive: true });
    const comp = resolved.tutorial ? `Tutorial-${format}` : `FootageEdit-${format}`;
    const file = join(outDir, `${v.id}.mp4`);
    node(["scripts/render.mjs", comp, "review", `--props=${join(dir, ".edl.resolved.json")}`, `--out=${file}`]);
    node(["scripts/phone-copy.mjs", file]);
    row.file = file;
  }
  rows.push(row);
}

const shown = rows.filter((r) => r.file);
if (opt.render && shown.length) {
  // A sheet of each version at 1 s (the moment people decide), left to right in plan order.
  const frames = [];
  for (const r of shown) {
    const png = join(outDir, `${r.id}-1s.jpg`);
    ff(["-ss", "1", "-i", r.file, "-frames:v", "1", "-vf", "scale=360:-2", png]);
    frames.push(png);
  }
  const h = videoInfo(frames[0]).height;
  const inputs = frames.flatMap((f) => ["-i", f]);
  const pads = frames.map((_, i) => `[${i}]pad=372:${h + 12}:6:6:color=0x222222[p${i}]`).join(";");
  ff([...inputs, "-filter_complex", `${pads};${frames.map((_, i) => `[p${i}]`).join("")}hstack=${frames.length}`, "-frames:v", "1", join(outDir, "sheet.jpg")]);
}

const md = [
  `# Variants of ${job}`,
  "",
  `Goal: ${plan.goal || "(none set)"}`,
  "",
  "| Id | Label | Change | Length | Job | Review file |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.label} | ${r.change} | ${r.seconds} s | ${r.job} | ${r.same ? `same as ${r.same}: no effect, not rendered` : r.file || "(not rendered)"} |`),
  "",
  "Post only what the user approves, one exact post at a time (studio-edit §5c). After a week, compare",
  "hold at 3 s, average watch time and shares, and write what won into house notes.",
  "",
];
writeFileSync(join("jobs", job, "variants.md"), md.join("\n"));
console.log(`✔ ${rows.length} variant(s) built; see jobs/${job}/variants.md${opt.render && shown.length ? ` and ${outDir}/sheet.jpg (${shown.map((r) => r.id).join(", ")}, left to right)` : ""}`);
if (rows.some((r) => r.same)) process.exitCode = 2;

function describe(v) {
  const parts = [];
  if (v.hook) parts.push(`hook "${typeof v.hook === "string" ? v.hook : v.hook.text}"`);
  if (v.keep) parts.push(`order ${v.keep}`);
  if (v.pause) parts.push(`pauses > ${v.pause} s closed`);
  if (v.captions) parts.push(`captions ${JSON.stringify(v.captions)}`);
  if (v.style) parts.push(`style ${v.style}`);
  if (v.look) parts.push(`look ${v.look}`);
  if (v.grade) parts.push(`grade ${v.grade}`);
  if (v.zoom) parts.push(`zoom ×${v.zoom}`);
  if (v.music) parts.push("music");
  if (v.fx) parts.push(`${v.fx.length} effect(s)`);
  if (v.titles) parts.push(`${v.titles.length} title(s)`);
  return parts.join("; ") || "no change (the control)";
}
