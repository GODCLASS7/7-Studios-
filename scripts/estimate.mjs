#!/usr/bin/env node
// Estimate how long a job will take, phase by phase, with ready-by times.
//
//   node scripts/estimate.mjs <job-id> [--tz=Europe/London] [--start=2026-10-20T15:00]
//   node scripts/estimate.mjs --log <job-id> <phase> <actual-minutes>
//
// Inputs:  jobs/<job>/job.json (deliverables), production/bench.json (this
//          machine's measured render speed; run `npm run bench` once).
// Learning: every `--log` call records actual vs estimated time in
//          production/timings.jsonl. Later estimates for that phase are
//          multiplied by the median actual/estimated ratio, so estimates
//          get more accurate the more jobs the studio finishes.
// Outputs: jobs/<job>/estimate.json and jobs/<job>/estimate.md.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TIMINGS = "production/timings.jsonl";
const BENCH = "production/bench.json";

// Agent and provider time in minutes, as [low, high].
const D = {
  brief: [5, 10],
  research: [3, 8],
  plan: [2, 4],
  storyboardBase: [4, 8],
  storyboardPerPanel: [1, 2],
  styleFrames: [6, 12],
  buildPerSecond: { simple: [0.4, 0.8], medium: [0.8, 1.6], high: [1.6, 3.2] },
  buildPerStill: { simple: [5, 10], medium: [10, 20], high: [20, 40] },
  aiImageBatch: [1, 3], // per batch of up to 4 parallel images
  aiVideoBatch: [4, 12], // per batch of up to 4 parallel shots (provider queue + generation)
  upscaleBatch: [4, 10],
  // SetField (optional local engine): one job at a time on the user's GPU.
  // Vendor figures: a still ~20 s, a 5 s clip ~2.5 min on an RTX 4090; smaller cards are slower.
  localImage: [0.3, 1.5], // per image
  localVideo: [2.5, 10], // per shot
  qcBase: [5, 10],
  qcShareOfBuild: [0.1, 0.2],
};
const PARALLEL = 4;

// Seconds per output frame (or per still) if no benchmark exists yet.
// Measured on a 4-vCPU cloud container with a simple scene.
const FALLBACK_BENCH = {
  draft: 0.03,
  review: 0.08,
  "4k": 0.17,
  "4k-hevc": 0.25,
  master: 0.3,
  alpha: 0.35,
  "webm-alpha": 0.3,
  still: 4,
  "still-4k": 6,
  "still-print": 10,
  overhead: 8,
};
// Real scenes are heavier than the benchmark card.
const COMPLEXITY = { simple: 1.5, medium: 3, high: 6 };
const FOOTAGE_FACTOR = 2;

const readJsonl = (p) =>
  existsSync(p)
    ? readFileSync(p, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 1;
};
const fmt = (min) => {
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
};

const args = process.argv.slice(2);

if (args[0] === "--log") {
  const [, job, phase, actual] = args;
  if (!existsSync(join("jobs", job, "estimate.json"))) {
    console.error(`No estimate for ${job} yet. Run: npm run estimate -- ${job}  (then log actual times against it)`);
    process.exit(1);
  }
  const est = JSON.parse(readFileSync(join("jobs", job, "estimate.json"), "utf8"));
  const row = est.phases.find((p) => p.key === phase);
  if (!row) {
    console.error(`Unknown phase "${phase}". Phases: ${est.phases.map((p) => p.key).join(", ")}`);
    process.exit(1);
  }
  mkdirSync("production", { recursive: true });
  appendFileSync(
    TIMINGS,
    JSON.stringify({ kind: "phase", job, phase: row.learnKey, estimatedMin: (row.low + row.high) / 2, actualMin: Number(actual), at: new Date().toISOString() }) + "\n",
  );
  console.log(`Logged ${phase}: ${actual} min actual vs ${fmt((row.low + row.high) / 2)} estimated.`);
  process.exit(0);
}

const job = args.find((a) => !a.startsWith("--"));
if (!job) {
  console.error("Usage: node scripts/estimate.mjs <job-id> [--tz=Area/City] [--start=ISO]  |  --log <job-id> <phase> <minutes>");
  process.exit(1);
}
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const tz = opt.tz || process.env.TZ || "UTC";
const start = opt.start ? new Date(opt.start) : new Date();

const spec = JSON.parse(readFileSync(join("jobs", job, "job.json"), "utf8"));
const sbPath = join("jobs", job, "storyboard.json");
const panels = existsSync(sbPath) ? JSON.parse(readFileSync(sbPath, "utf8")).panels.length : 6;
const bench = { ...FALLBACK_BENCH, ...(existsSync(BENCH) ? JSON.parse(readFileSync(BENCH, "utf8")).secondsPerFrame : {}) };
const benched = existsSync(BENCH);

// Learned correction factors per phase.
const history = readJsonl(TIMINGS).filter((t) => t.kind === "phase" && t.estimatedMin > 0);
const factor = (learnKey) => {
  const ratios = history.filter((h) => h.phase === learnKey).map((h) => h.actualMin / h.estimatedMin);
  return ratios.length ? Math.min(3, Math.max(0.3, median(ratios))) : 1;
};

const phases = [];
const add = (key, label, who, [low, high], learnKey = key) => {
  const f = factor(learnKey);
  phases.push({ key, learnKey, label, who, low: low * f, high: high * f, learned: f !== 1 });
};
const gate = (label) => phases.push({ key: `gate-${phases.length}`, label, who: "You", gate: true, low: 0, high: 0 });
const scale = ([l, h], n) => [l * n, h * n];
const sum = (a, b) => [a[0] + b[0], a[1] + b[1]];

const motion = spec.deliverables.filter((d) => d.type === "motion");
const stills = spec.deliverables.filter((d) => d.type === "still");
const totalShots = spec.deliverables.reduce((n, d) => n + (d.aiVideoShots || 0), 0);
const totalImages = spec.deliverables.reduce((n, d) => n + (d.aiImages || 0), 0);
const totalUpscales = spec.deliverables.reduce((n, d) => n + (d.upscaleShots || 0), 0);

add("brief", "Brief, questions & assumptions", "Claude", spec.researchUrl ? sum(D.brief, D.research) : D.brief);
add("plan", "Production plan & estimate", "Claude", D.plan);
if (motion.length) {
  add("storyboard", `Storyboard (${panels} panels) + animatic`, "Claude", sum(D.storyboardBase, scale(D.storyboardPerPanel, panels)));
  gate("Approve storyboard");
}
add("style", `Style frames / design previews (${spec.deliverables.length} deliverable${spec.deliverables.length > 1 ? "s" : ""})`, "Claude", scale(D.styleFrames, Math.max(1, motion.length) + stills.length * 0.5));
gate("Approve style frames");
// AI generation: Higgsfield (default, cloud, parallel) or SetField (optional, local GPU, sequential).
const local = spec.aiProvider === "setfield";
if (totalImages) {
  local
    ? add("ai-images-local", `AI keyframes / images on SetField (${totalImages}, one at a time)`, "Your GPU", scale(D.localImage, totalImages))
    : add("ai-images", `AI keyframes / images (${totalImages})`, "Provider", scale(D.aiImageBatch, Math.ceil(totalImages / PARALLEL)));
}
if (totalShots) {
  local
    ? add("ai-video-local", `AI video shots on SetField (${totalShots}, one at a time)`, "Your GPU", scale(D.localVideo, totalShots))
    : add("ai-video", `AI video shots (${totalShots}, up to ${PARALLEL} in parallel)`, "Provider", scale(D.aiVideoBatch, Math.ceil(totalShots / PARALLEL)));
}
if (totalUpscales) add("upscale", `Upscale to 4K (${totalUpscales} shot${totalUpscales > 1 ? "s" : ""})`, "Provider", scale(D.upscaleBatch, Math.ceil(totalUpscales / PARALLEL)));

let build = [0, 0];
for (const d of motion) build = sum(build, scale(D.buildPerSecond[d.complexity || "medium"], d.seconds));
for (const d of stills) build = sum(build, scale(D.buildPerStill[d.complexity || "medium"], d.count || 1));
add("build", "Build compositions (motion + stills)", "Claude", build);

const renderMin = (d, preset) => {
  const c = COMPLEXITY[d.complexity || "medium"] * (d.aiVideoShots ? FOOTAGE_FACTOR : 1);
  if (d.type === "still") return ((bench[preset] ?? bench.still) * c * (d.count || 1)) / 60;
  const frames = d.seconds * (d.fps || 30) * (preset === "draft" ? 0.5 : 1);
  return (bench.overhead + frames * (bench[preset] ?? bench["4k"]) * c) / 60;
};
if (motion.length) {
  const draft = motion.reduce((m, d) => m + renderMin(d, "draft"), 0);
  add("draft-render", "Draft preview render", "Machine", [draft, draft * 1.5]);
  const review = motion.reduce((m, d) => m + renderMin(d, "review"), 0);
  add("review-render", "1080p review cut", "Machine", [review, review * 1.5]);
  gate("Approve review cut");
}
add("qc", "QC & fixes", "Claude", sum(D.qcBase, [build[0] * D.qcShareOfBuild[0], build[1] * D.qcShareOfBuild[1]]));
const final = spec.deliverables.reduce((m, d) => m + renderMin(d, d.preset || (d.type === "still" ? "still-4k" : "4k")), 0);
add("final-render", `Final masters (${spec.deliverables.map((d) => d.preset || "4k").join(", ")})`, "Machine", [final, final * 1.5]);
add("delivery", "QC check & delivery", "Claude", [2, 5]);

// Timeline: approvals are assumed instant; the user's review time adds on top.
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" });
let lo = 0;
let hi = 0;
const rows = phases.map((p, i) => {
  lo += p.low;
  hi += p.high;
  const at = (m) => clock.format(new Date(start.getTime() + m * 60000));
  return p.gate
    ? `| ${i + 1} | ⏸ **${p.label}** | You | your review time | — |`
    : `| ${i + 1} | ${p.label}${p.learned ? " ¹" : ""} | ${p.who} | ${fmt(p.low)} – ${fmt(p.high)} | ${at(lo)} – ${at(hi)} |`;
});

const md = `# Estimate — ${spec.title}

Start: ${clock.format(start)} (${tz}) · Working time: **${fmt(lo)} – ${fmt(hi)}** plus your review time at each ⏸ gate.

| # | Phase | Who | Time | Ready by |
|---|---|---|---|---|
${rows.join("\n")}

- Ready-by times assume each approval comes back right away; add your review time at each ⏸.
- Provider times (AI generation and upscaling) depend on the provider's queue and are the least certain.
- Render times ${benched ? "use this machine's benchmark (production/bench.json)" : "use default speeds; run `npm run bench` once for this machine's real speed"}.
${phases.some((p) => p.learned) ? "- ¹ Adjusted from this studio's logged actual times.\n" : ""}`;

writeFileSync(join("jobs", job, "estimate.json"), JSON.stringify({ job, start: start.toISOString(), tz, totalMin: [lo, hi], phases }, null, 2) + "\n");
writeFileSync(join("jobs", job, "estimate.md"), md);
console.log(md);
