#!/usr/bin/env node
// Build a job's master spec: everything an AI agent needs to rebuild or adapt
// the finished piece. Writes:
//   jobs/<id>/SPEC.md                          the spec as Markdown (commit this)
//   out/<id>/spec/<id>_master-spec.html|.pdf   the designed A4 document
//
//   node scripts/spec.mjs <job-id> [--no-pdf]
//
// Sources: job.json, brief.md, storyboard.json, spec.json (optional extras:
// hard rules, narration, music, sound design, mix, motion vocabulary,
// adaptations, pitfalls, QA), assets.json, approvals.md, qc.md, estimate.json,
// the delivery files in out/<id>/delivery, src/lib/tokens.ts and package.json.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [job, ...flags] = process.argv.slice(2);
if (!job || !existsSync(join("jobs", job, "job.json"))) {
  console.error("Usage: node scripts/spec.mjs <job-id> [--no-pdf]   (jobs/<job-id>/job.json must exist)");
  process.exit(1);
}
const J = (...p) => join("jobs", job, ...p);
const read = (p, fallback = null) => (existsSync(p) ? readFileSync(p, "utf8") : fallback);
const readJson = (p, fallback = null) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);

const spec = readJson(J("job.json"));
const extra = readJson(J("spec.json"), {});
const sb = readJson(J("storyboard.json"));
const assetsLog = readJson(J("assets.json"), []);
const pkg = readJson("package.json");
const title = spec.title;
const slug = job;

// ---------- probing ----------
const hasSystemFfmpeg = spawnSync("ffprobe", ["-version"]).status === 0;
const probeTool = (name, args) =>
  hasSystemFfmpeg ? spawnSync(name, args, { encoding: "utf8" }) : spawnSync("npx", ["remotion", name, ...args], { encoding: "utf8" });
const probe = (file) => {
  const r = probeTool("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  try {
    const j = JSON.parse(r.stdout);
    const v = j.streams.find((s) => s.codec_type === "video");
    const a = j.streams.find((s) => s.codec_type === "audio");
    const [n, d] = (v?.avg_frame_rate || "0/1").split("/").map(Number);
    return {
      width: v?.width,
      height: v?.height,
      fps: d ? Math.round((n / d) * 100) / 100 : null,
      seconds: Number(j.format?.duration || 0),
      codec: v?.codec_name,
      pix: v?.pix_fmt,
      colour: v?.color_space,
      audio: a ? `${a.codec_name} ${Math.round(Number(a.sample_rate) / 1000)} kHz` : null,
    };
  } catch {
    return {};
  }
};
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.startsWith(".") ? [] : [join(dir, e.name)]))
    : [];

// Latest QC row values per file from qc.md.
const qcByFile = {};
for (const block of (read(J("qc.md"), "") || "").split(/\n## QC — /).slice(1)) {
  const file = block.split(" — ")[0].trim();
  const rows = Object.fromEntries(
    [...block.matchAll(/^\| ([^|]+) \| [^|]*?(PASS|WARN|FAIL) \| ([^|]*) \|$/gm)].map((m) => [m[1].trim(), { status: m[2], detail: m[3].trim() }]),
  );
  qcByFile[file] = rows;
}

// Delivery files.
const deliveryDir = join("out", job, "delivery");
const deliveries = walk(deliveryDir).map((f) => {
  const isVideo = [".mp4", ".mov", ".webm"].includes(extname(f).toLowerCase());
  const p = probe(f);
  const qc = qcByFile[f] || {};
  return { file: f, name: basename(f), isVideo, size: statSync(f).size, ...p, qc };
});

// Match each deliverable to its delivered file: explicit `deliveryFile`, else by format (video) or type (still).
const usedFiles = new Set();
const pairs = spec.deliverables.map((d) => {
  const del =
    deliveries.find(
      (x) => !usedFiles.has(x.name) && (d.deliveryFile ? x.name === d.deliveryFile : d.type === "still" ? !x.isVideo : x.isVideo && d.format && x.name.includes(d.format)),
    ) || null;
  if (del) usedFiles.add(del.name);
  return { d, del };
});
const labelFor = (file) => pairs.find((p) => p.del?.file === file)?.d.name || basename(file);

// Assets under public/jobs/<id>/ with provenance from assets.json.
const assets = walk(join("public", "jobs", job)).map((f) => {
  const rel = relative("public", f).split("\\").join("/");
  const log = assetsLog.find((a) => a.file === rel);
  return { rel, size: statSync(f).size, sha: sha256(f).slice(0, 16), log };
});

// Design tokens from src/lib/tokens.ts.
const tokensSrc = read("src/lib/tokens.ts", "");
const block = (name) => (tokensSrc.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\}`)) || [])[1] || "";
const colors = [...block("color").matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)].map((m) => [m[1], m[2]]);
const typeScale = [...block("type").matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], m[2]]);
const springs = [...tokensSrc.matchAll(/(\w+):\s*(\{ damping: [^}]+\})/g)].map((m) => [m[1], m[2]]);

const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout.trim() || "uncommitted";
const remotion = pkg.dependencies?.remotion;

// ---------- helpers ----------
const fmtS = (s) => (s == null ? "—" : `${Number(s).toFixed(s % 1 ? 2 : 0)} s`);
const formatOf = (d) => (d.width && d.height ? `${d.width}×${d.height}` : "—");
const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map((c) => String(c ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`)].join("\n");
const list = (items) => (items?.length ? items.map((x) => `- ${x}`).join("\n") : "—");
const numbered = (items) => (items?.length ? items.map((x, i) => `${i + 1}. ${x}`).join("\n") : "—");
const starts = [];
(sb?.panels || []).reduce((t, p) => (starts.push(t), t + p.seconds), 0);

const videoDeliveries = deliveries.filter((d) => d.isVideo);
const main = videoDeliveries[0];
const loud = (d) => d?.qc?.Loudness?.detail?.split(" (")[0];
const peak = (d) => d?.qc?.["True peak"]?.detail?.split(" (")[0];

const qcSummary = (d) => {
  const rows = Object.values(d.qc);
  if (!rows.length) return "not run";
  const fails = rows.filter((r) => r.status === "FAIL").length;
  const warns = rows.filter((r) => r.status === "WARN").length;
  return fails ? `❌ ${fails} failed (§14)` : `✅ passed${warns ? ` · ${warns} warning${warns > 1 ? "s" : ""} (§14)` : ""}`;
};

// ---------- sections (Markdown) ----------
const S = [];
const section = (id, heading, md) => S.push({ id, heading, md });

const deliverLines = deliveries.length
  ? deliveries.map((d) => `- ${d.name}: ${formatOf(d)}${d.isVideo ? `, ${d.fps} fps, ${fmtS(d.seconds)}` : ""}`).join("\n")
  : spec.deliverables.map((d) => `- ${d.name}: ${d.format || ""} ${d.seconds ? `${d.seconds} s` : ""}`).join("\n");

section(
  "prompt",
  "Start here: the prompt to paste into Claude",
  `1. Open **Claude Code** (desktop app, \`claude\` in a terminal, or claude.ai/code) in a **Motion Studio** project folder. The project has \`CLAUDE.md\` and \`.claude/skills/studio*\`. This job runs code and renders video, so it needs Claude Code rather than a plain chat.
2. Attach this PDF, or point Claude at \`jobs/${slug}/SPEC.md\` if the job folder is already there.
3. Send the prompt below. To adapt rather than rebuild, add what should change at the end.

\`\`\`text
I'm attaching ${slug}_master-spec.pdf. It is the complete spec for "${title}",
made in Motion Studio (Remotion). Rebuild it exactly as the spec describes.

What to deliver
${deliverLines}

How to work
1. Read the whole spec first. The hard rules in section 3 are binding.
2. Work in a Motion Studio project. On a fresh copy run npm i (and
   npm run setup:cloud in a Claude Code cloud session). Tell me what you installed.
3. Create the job with npm run new-job -- ${slug} "${title}" and fill brief.md,
   job.json, storyboard.json and spec.json from sections 1-3 and 8-9.
4. Collect the assets in section 5 and check their SHA-256. If a generated asset is
   missing, show me its Appendix A prompt, provider and cost, and wait for my OK.
5. Build the scenes from the shot lists (section 8, then 9) with the visual and
   motion system in section 7, timed to the beat grid in section 10.
6. Run npm run lint, render a still of every scene and show me; fix what I flag.
7. Render with the commands in section 13, normalise loudness, and run every
   check in section 14.
8. Deliver the files and report measured loudness, true peak and anything you
   couldn't verify.

Ground rules
- Ask me before any paid generation, purchase, sign-up, or download that isn't
  listed in section 5.
- Never sign in, place an order or submit a form anywhere.
\`\`\`

**Useful follow-ups while it works**
- "Show me the storyboard and one still per scene before you render."
- "Stop before any step that costs credits, and tell me the cost first."
- "Render the main format first. Start the others only after I approve it."`,
);

section(
  "credits",
  "0. Who made what (the short answer)",
  table(
    ["Layer", "Made with", "Notes"],
    [
      ["Picture", "Motion Studio (Remotion " + remotion + ")", `Compositions: ${[...new Set(spec.deliverables.map((d) => d.composition).filter(Boolean))].map((c) => `\`${c}\``).join(", ")}`],
      ...(extra.credits || []).map((c) => [c.layer, c.madeWith, c.notes]),
      ...(assetsLog.filter((a) => a.model).map((a) => ["AI asset", `${a.model}`, `\`${a.file}\`${a.credits != null ? ` · ${a.credits} credits` : ""}`])),
      ["Fonts", "Bundled in public/brand/fonts", "Inter (SIL OFL) unless the job's brand fonts say otherwise"],
    ],
  ),
);

section(
  "deliverables",
  "1. Deliverables",
  deliveries.length
    ? table(
        ["File", "Format", "Length", "Audio", "QC"],
        deliveries.map((d) => [
          `\`${d.name}\``,
          d.isVideo ? `${formatOf(d)}, ${d.fps} fps, ${d.codec} ${d.pix || ""}${d.colour ? `, ${d.colour}` : ""}` : `${formatOf(d)} ${extname(d.name).slice(1).toUpperCase()}`,
          d.isVideo ? fmtS(d.seconds) : "—",
          d.isVideo ? (d.audio ? `${loud(d) || "?"} integrated, ${peak(d) || "?"}` : "none") : "—",
          qcSummary(d),
        ]),
      )
    : table(["Deliverable", "Type", "Format", "Length / count", "Preset"], spec.deliverables.map((d) => [d.name, d.type, d.format, d.seconds ? `${d.seconds} s` : d.count, d.preset])),
);

section("brief", "2. Brief", (read(J("brief.md"), "—") || "—").replace(/^# .*\n+/, ""));

section(
  "rules",
  "3. Hard rules (all binding)",
  `${numbered(extra.hardRules)}

**Studio rules (always apply)**
${list([
  "Every text, logo, number and UI element is set in Remotion, never rendered by an AI model.",
  "All motion comes from `useCurrentFrame()`; timing is in seconds × fps; no CSS transitions, timers or `Math.random()`.",
  "Fonts are bundled locally and loaded with `@remotion/fonts`; nothing loads from the network at render time.",
  "No paid generation without an approved quote, and no skipped approval gates (storyboard, style frames, review cut).",
  "No real-person likeness without consent; no generated third-party logos or trademarks.",
])}`,
);

section(
  "tools",
  "4. Tools to install",
  table(
    ["Tool", "Version used", "Install", "Used for"],
    [
      ["Node.js (+ npm)", pkg.engines?.node || "22", "nodejs.org, or `brew install node`", "Everything"],
      ["Motion Studio deps", `remotion ${remotion}`, "`npm i` (cloud: `npm run setup:cloud`)", "Rendering, studio scripts"],
      ["Chromium", "managed by Remotion", "downloaded on first render", "Frame rendering, PDF export"],
      ["FFmpeg (full build)", "any recent", "`brew install ffmpeg` / `apt install ffmpeg`", "Black-frame QC, contact sheets, LUTs (optional)"],
      ["AI provider", spec.aiProvider || "higgsfield", spec.aiProvider === "setfield" ? "SetField app + `claude mcp add setfield …`" : "Higgsfield connector in your Claude account", "AI keyframes and footage (only if §5 lists generated assets)"],
      ...(extra.tools || []).map((t) => [t.tool, t.version, t.install, t.usedFor]),
    ],
  ),
);

section(
  "assets",
  "5. Asset manifest",
  assets.length
    ? `Every file the compositions load, under \`public/\`. Check the SHA-256 prefix after copying.\n\n${table(
        ["File", "Size", "SHA-256 (first 16)", "Source"],
        assets.map((a) => [`\`${a.rel}\``, mb(a.size), `\`${a.sha}\``, a.log ? `${a.log.model || a.log.kind}${a.log.prompt ? " (prompt in Appendix A)" : ""}` : "made in this project"]),
      )}\n\nShared studio files also used: \`public/brand/fonts/Inter-Variable-latin.woff2\`.`
    : "No job-specific assets. Everything is drawn in code.",
);

section(
  "narration",
  extra.narration ? `6. Narration (${extra.narration.voice || "voice-over"})` : "6. Narration",
  extra.narration
    ? `${extra.narration.notes || ""}\n\n> ${extra.narration.script}\n\n${extra.narration.lines?.length ? table(["Line", "Start (s)", "Text", "Key word → title"], extra.narration.lines.map((l) => [l.id, l.start, l.text, l.keyword || "—"])) : ""}`
    : "None. This piece is music and sound design only.",
);

section(
  "visual",
  "7. Visual system",
  `**Palette** (\`src/lib/tokens.ts\`)
${table(["Token", "Hex"], colors.map(([k, v]) => [k, `\`${v}\``]))}

**Type scale** (px at the 1080p authoring size; 4K renders at 2×): ${typeScale.map(([k, v]) => `${k} ${v}`).join(" · ")}

**Springs:** ${springs.map(([k, v]) => `${k} \`${v}\``).join(" · ")}

${extra.visualNotes ? list(extra.visualNotes) : ""}

**Motion vocabulary**
${extra.motionVocabulary?.length ? table(["Move", "How it's built"], extra.motionVocabulary.map((m) => [m.name, m.how])) : "—"}`,
);

section(
  "shots",
  `8. Shot list: ${sb ? `${sb.format.replace("x", ":")} (${sb.fps} fps, ${sb.panels.reduce((t, p) => t + p.seconds, 0)} s${extra.music?.bpm ? `, ${extra.music.bpm} BPM` : ""})` : "—"}`,
  sb
    ? `${table(
        ["#", "Time (s)", "Picture", "On-screen text", "Camera", "Source", "Audio"],
        sb.panels.map((p, i) => [
          `${p.id} ${p.title}`,
          `${starts[i].toFixed(1)}–${(starts[i] + p.seconds).toFixed(1)}`,
          p.action,
          p.onScreenText ? `“${p.onScreenText}”` : "—",
          p.camera || "static",
          p.source || "motion",
          p.audio || "—",
        ]),
      )}\n\nThe approved storyboard (v${sb.version}) and the final-frames sheet are reproduced in Appendix B.`
    : "No storyboard on file.",
);

section(
  "adapt",
  "9. Other formats (adaptations)",
  extra.adaptations?.length
    ? table(["Format", "Composition", "What changes"], extra.adaptations.map((a) => [a.format, `\`${a.composition}\``, a.notes]))
    : "Single format.",
);

section(
  "music",
  "10. Music",
  extra.music
    ? `${table(["Made with", "Tempo", "Licence", "File"], [[extra.music.madeWith, extra.music.bpm ? `${extra.music.bpm} BPM` : "—", extra.music.licence || "—", extra.music.file ? `\`${extra.music.file}\`` : "—"]])}\n\n${extra.music.notes || ""}`
    : "—",
);

section(
  "sfx",
  "11. Sound design",
  extra.soundDesign?.length ? table(["Time (s)", "Cue", "Purpose"], extra.soundDesign.map((c) => [c.at, c.cue, c.purpose || "—"])) : "—",
);

section(
  "mix",
  "12. Mix and master",
  `${list([
    `Target: ${extra.mix?.targetLufs ?? -14} LUFS integrated, true peak ≤ ${extra.mix?.truePeak ?? -1.5} dBTP (two-pass \`npm run loudnorm\`, video stream copied, trimmed to picture length).`,
    ...(extra.mix?.notes || []),
  ])}

${videoDeliveries.length ? `**Measured on the finals:** ${videoDeliveries.map((d) => `${d.name}: ${loud(d) || "?"}, ${peak(d) || "?"}`).join(" · ")}` : ""}`,
);

const renderCmds = pairs
  .filter(({ d }) => d.composition)
  .map(({ d, del }) => {
    const out = del ? `out/${job}/delivery/${del.name}` : `out/${job}/${d.composition}.${d.type === "still" ? "png" : "mp4"}`;
    const raw = d.type === "still" ? out : `out/${job}/${d.composition}-${d.preset || "4k"}.mp4`;
    const lines = [`npm run render -- ${d.composition} ${d.preset || (d.type === "still" ? "still-4k" : "4k")} --out=${raw}`];
    if (d.type !== "still") lines.push(`npm run loudnorm -- ${raw} ${out}`);
    const dims = del ? ` --expect=${del.width}x${del.height}` : "";
    lines.push(`npm run qc -- ${out}${dims}${d.type !== "still" ? ` --fps=${d.fps || 30} --seconds=${d.seconds}` : ""} --job=${job}`);
    return `# ${d.name}\n${lines.join("\n")}`;
  })
  .join("\n\n");

section(
  "build",
  "13. Build, render and deliver",
  `Built at commit \`${git}\` of Motion Studio. Run everything from the project root.

${extra.buildNotes ? list(extra.buildNotes) : ""}

\`\`\`bash
npm i                                   # once (cloud: npm run setup:cloud)
npm run lint                            # must pass
npm run storyboard -- ${job} --animatic   # approval sheet + animatic
${extra.prebuild ? extra.prebuild.join("\n") + "\n" : ""}
${renderCmds}

npm run storyboard -- ${job} --name=frames   # final-frames sheet
npm run spec -- ${job}                      # this document
\`\`\`

File naming: \`<job>_<deliverable>_<format>_<resolution>_v<N>.<ext>\`.`,
);

const qcRows = deliveries
  .filter((d) => Object.keys(d.qc).length)
  .map((d) => {
    const entries = Object.entries(d.qc);
    const notes = entries.filter(([, v]) => v.status !== "PASS").map(([k, v]) => `${v.status === "WARN" ? "⚠️" : "❌"} ${k}: ${v.detail}`);
    return [`\`${d.name}\``, `${entries.filter(([, v]) => v.status === "PASS").length}/${entries.length}`, notes.length ? notes.join("<br>") : "All checks passed"];
  });
section(
  "qa",
  "14. QA checklist",
  `${list([
    "`npm run lint` passes (ESLint + TypeScript).",
    "Every final passes `npm run qc`: resolution, fps, exact duration, BT.709, loudness and true peak.",
    "Hierarchy: one focal point per frame; text readable at phone size; contrast ≥ 4.5:1 for body text.",
    "Safe areas: nothing important within 5% of the edges; on 9:16, bottom 20% and right 12% clear.",
    "No orphan words on headlines; brand palette only; spelling and numbers match the brief.",
    ...(extra.qaChecklist || []),
  ]).replace(/^- /gm, "- ☐ ")}

${qcRows.length ? `**Results on the finals** (\`npm run qc\`; full reports in \`jobs/${job}/qc.md\`)\n\n${table(["File", "Passed", "Warnings and failures"], qcRows)}` : ""}

${extra.pitfalls?.length ? `**Pitfalls found during production**\n${list(extra.pitfalls)}` : ""}`,
);

const prompts = assetsLog.filter((a) => a.prompt);
section(
  "appA",
  "Appendix A: AI prompts",
  prompts.length
    ? prompts.map((a, i) => `${i + 1}. **${a.file}** (${a.model}${a.credits != null ? `, ${a.credits} credits` : ""}): “${a.prompt}”`).join("\n")
    : extra.aiNotes || "No AI-generated assets in the final cut.",
);

const timings = readJsonlSafe("production/timings.jsonl").filter((t) => t.kind === "phase" && t.job === job);
function readJsonlSafe(p) {
  return (read(p, "") || "")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return {};
      }
    });
}
const approvals = (read(J("approvals.md"), "") || "").split("\n").filter((l) => l.startsWith("|")).join("\n");
section(
  "appB",
  "Appendix B: Storyboard, frames, approvals and timings",
  `${approvals || "No approvals logged."}

${timings.length ? `**Time logged (minutes)**\n\n${table(["Phase", "Estimated", "Actual"], timings.map((t) => [t.phase, Math.round(t.estimatedMin), t.actualMin]))}` : ""}

[[IMAGES]]`,
);

// ---------- SPEC.md ----------
const md = `# ${title}: master spec

Everything an AI agent needs to rebuild or adapt this job in Motion Studio: tools, assets, visual and motion system, shot lists, music, sound, mix, build commands and QA. Generated by \`npm run spec -- ${job}\` at commit \`${git}\`.

${S.map((s) => `## ${s.heading}\n\n${s.md.replace("[[IMAGES]]", "Storyboard and final-frames images: see the PDF, or `out/" + job + "/`.")}`).join("\n\n")}
`;
writeFileSync(J("SPEC.md"), md);
console.log(`Wrote ${J("SPEC.md")}`);

if (flags.includes("--no-pdf")) process.exit(0);

// ---------- HTML / PDF ----------
const outDir = join("out", job, "spec");
mkdirSync(join(outDir, "img"), { recursive: true });
const b64 = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;

// Cover frames: a mid-point frame from each video deliverable, plus stills.
const covers = [];
for (const d of [...deliveries].sort((a, b) => Number(b.isVideo) - Number(a.isVideo)).slice(0, 3)) {
  const img = join(outDir, "img", `${basename(d.name, extname(d.name))}.jpg`);
  const args = d.isVideo
    ? ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(extra.cover?.[d.name] ?? (d.seconds * 0.42).toFixed(2)), "-i", d.file, "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "3", img]
    : ["-hide_banner", "-loglevel", "error", "-y", "-i", d.file, "-vf", "scale=-2:720", "-q:v", "3", img];
  if (probeTool("ffmpeg", args).status === 0 && existsSync(img)) covers.push({ img, d });
}
const sheetImgs = [`storyboard-v${sb?.version}.png`, `frames-v${sb?.version}.png`]
  .map((f) => join("out", job, f))
  .filter((f) => existsSync(f));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => {
  const codes = [];
  let t = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  t = t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
};
const mdToHtml = (src) => {
  const lines = src.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
    } else if (/^\|/.test(l) && /^\|[-| :]+\|?$/.test(lines[i + 1] || "")) {
      const cells = (row) => row.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, "|")));
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else if (/^\s*([-*]|\d+\.) /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const items = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.) /.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (/^\s*([-*]|\d+\.) /.test(lines[i]) && !/^\s{2,}([-*]|\d+\.) /.test(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.) /, ""));
        else items[items.length - 1] += `\n${lines[i].replace(/^\s{2,3}/, "")}`;
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      const checks = !ordered && items.every((it) => it.startsWith("☐ "));
      out.push(
        `<${tag}${checks ? ' class="checks"' : ""}>${items
          .map((it) => {
            const [first, ...rest] = (checks ? it.replace(/^☐ /, "") : it).split("\n");
            return `<li>${inline(first)}${rest.length ? mdToHtml(rest.join("\n")) : ""}</li>`;
          })
          .join("")}</${tag}>`,
      );
    } else if (/^> /.test(l)) {
      const buf = [];
      while (i < lines.length && /^> /.test(lines[i])) buf.push(lines[i++].slice(2));
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
    } else if (/^#{3,4} /.test(l)) {
      out.push(`<h3>${inline(l.replace(/^#+ /, ""))}</h3>`);
      i++;
    } else if (l.trim() === "") {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^(```|\||\s*([-*]|\d+\.) |> |#)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join(" "))}</p>`);
    }
  }
  return out.join("\n");
};

const fontData = b64("public/brand/fonts/Inter-Variable-latin.woff2", "font/woff2");
const imagesHtml = sheetImgs.map((f) => `<figure><img src="${b64(f, "image/png")}"><figcaption>${basename(f)}</figcaption></figure>`).join("");
const facts = [
  ["Deliverables", spec.deliverables.map((d) => esc(d.name)).join("<br>")],
  ["Spec", main ? `${fmtS(main.seconds)} · ${main.fps} fps · ${main.codec?.toUpperCase()}${main.audio ? " + AAC" : ""}<br>${loud(main) || ""}${peak(main) ? ` · ${peak(main)}` : ""}` : "—"],
  ["Built with", `Motion Studio · Remotion ${remotion}<br>commit ${git} · ${new Date().toISOString().slice(0, 10)}`],
];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}: master spec</title>
<style>
@font-face{font-family:Inter;src:url(${fontData}) format("woff2");font-weight:100 900}
:root{--bg:#0B0B0D;--ink:#1C1C1F;--muted:#6B6760;--accent:#E8B44A;--line:#E6E1D8;--paper:#FFFFFF;--tint:#FBF6EC}
@page{size:A4;margin:18mm 16mm 20mm;
  @bottom-left{content:"${esc(title).replace(/"/g, "'")} · Master spec";font:600 8pt Inter;color:#8A8680}
  @bottom-right{content:"Page " counter(page) " of " counter(pages);font:700 8pt Inter;color:#8A8680}}
@page:first{margin:0;@bottom-left{content:none}@bottom-right{content:none}}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:400 9.6pt/1.5 Inter,Helvetica,Arial,sans-serif;font-feature-settings:"calt" 0;color:var(--ink);background:var(--paper)}
ul.checks{list-style:none;padding-left:0}
ul.checks>li{padding-left:6mm;position:relative}
ul.checks>li::before{content:"";position:absolute;left:0;top:1.2mm;width:3mm;height:3mm;border:.9pt solid var(--accent);border-radius:.7mm}
.cover{height:297mm;width:210mm;background:radial-gradient(ellipse at 30% 35%,#2A251C 0%,var(--bg) 62%);color:#F4EFE6;padding:22mm 18mm 0;position:relative;page-break-after:always;overflow:hidden}
.kicker{font:800 8pt Inter;letter-spacing:.32em;color:var(--accent);text-transform:uppercase}
.cover h1{font:900 34pt/1.05 Inter;margin:6mm 0 4mm;letter-spacing:-.01em}
.cover h1 span{color:var(--accent)}
.cover .lede{font:600 11pt/1.45 Inter;color:#CFC9BE;max-width:150mm}
.frames{display:flex;gap:8mm;align-items:flex-start;margin-top:14mm}
.frames .col{display:flex;flex-direction:column;gap:6mm}
.frames .landscape{flex:1;min-width:0}
.frames figure{margin:0;display:flex;flex-direction:column;align-items:flex-start;gap:2.5mm}
.frames img{border-radius:3mm;border:1px solid #3A362F;box-shadow:0 8mm 16mm rgba(0,0,0,.45);display:block}
.frames .portrait img{height:122mm;width:auto}
.frames .landscape img{max-width:100%;width:auto;height:auto;max-height:var(--fit,58mm)}
.frames.only-landscape .landscape img{max-height:none}
.frames figcaption{font:800 7pt Inter;letter-spacing:.2em;color:#9A958C;text-transform:uppercase}
.facts{position:absolute;left:18mm;right:18mm;bottom:26mm;display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
.facts div{border-top:1.2pt solid var(--accent);padding-top:3mm;font:500 8.2pt/1.5 Inter;color:#CFC9BE}
.facts b{display:block;font:800 9pt Inter;color:#F4EFE6;margin-bottom:1.5mm}
.bar{position:absolute;left:0;right:0;bottom:0;height:9mm;background:repeating-linear-gradient(90deg,var(--accent) 0 26mm,#F4EFE6 26mm 31mm,#2A2A30 31mm 52mm)}
h2{font:900 15pt/1.2 Inter;margin:9mm 0 4mm;padding:3mm 4mm;border-left:2.2mm solid var(--accent);background:linear-gradient(90deg,var(--tint),#fff 70%);break-after:avoid}
h3{font:800 10.5pt Inter;margin:5mm 0 2mm}
section{break-inside:auto}
section.newpage{break-before:page}
p{margin:0 0 2.6mm}
table{width:100%;border-collapse:collapse;margin:2mm 0 4mm;font-size:8.4pt;break-inside:auto}
thead th{background:var(--bg);color:#F4EFE6;text-align:left;font:800 8pt Inter;padding:2.2mm 2.6mm}
td{padding:2mm 2.6mm;border-bottom:.6pt solid var(--line);vertical-align:top}
tr{break-inside:avoid}
tbody tr:nth-child(even) td{background:#FCFAF6}
code{font:600 8pt ui-monospace,Menlo,Consolas,monospace;background:#F4EFE6;color:#7A4E0B;padding:.3mm 1.2mm;border-radius:1mm}
pre{background:var(--bg);color:#F1ECE2;border-radius:2.5mm;padding:4mm 5mm;font:500 7.8pt/1.55 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;break-inside:avoid;border-left:2mm solid var(--accent)}
pre code{background:none;color:inherit;padding:0;font:inherit}
blockquote{margin:3mm 0;padding:3.5mm 5mm;background:#FFF8E6;border-left:2mm solid var(--accent);border-radius:1.5mm;font-weight:600}
ul,ol{margin:0 0 3mm;padding-left:6mm}
li{margin:.8mm 0}
ol>li::marker{color:var(--accent);font-weight:800}
a{color:#8A5A12}
.toc a{color:var(--ink);text-decoration:none;font-weight:700}
.toc li{list-style:none;border-bottom:.6pt solid var(--line);padding:2.2mm 0;margin:0}
.toc ol{padding:0}
figure{margin:4mm 0;break-inside:avoid}
figure img{width:100%;border:.6pt solid var(--line);border-radius:2mm}
figcaption{font:700 7.5pt Inter;color:var(--muted);margin-top:1.5mm}
</style></head><body>
<div class="cover">
  <div class="kicker">${esc(title)} · job ${esc(job)}</div>
  <h1>Master <span>spec</span></h1>
  <div class="lede">Everything an AI agent needs to rebuild or adapt this piece in Motion Studio: tools, assets, visual and motion system, shot lists, music, sound, mix, build commands and QA.</div>
  ${(() => {
    const fig = (c) => `<figure><img src="${b64(c.img, "image/jpeg")}"><figcaption>${esc(labelFor(c.d.file))}${c.d.width && c.d.height ? ` · ${c.d.width}×${c.d.height}` : ""}</figcaption></figure>`;
    const aspect = (c) => (c.d.width || 1) / (c.d.height || 1);
    const tallest = [...covers].sort((a, b) => aspect(a) - aspect(b))[0];
    if (!tallest || aspect(tallest) >= 1) return `<div class="frames only-landscape"><div class="col landscape">${covers.map(fig).join("")}</div></div>`;
    const rest = covers.filter((c) => c !== tallest);
    const each = rest.length ? (122 - 12 * (rest.length - 1)) / rest.length - 7 : 0;
    return `<div class="frames"><div class="col portrait">${fig(tallest)}</div>${rest.length ? `<div class="col landscape" style="--fit:${each.toFixed(1)}mm">${rest.map(fig).join("")}</div>` : ""}</div>`;
  })()}
  <div class="facts">${facts.map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join("")}</div>
  <div class="bar"></div>
</div>
<section><h2>Contents</h2><div class="toc"><ol>${S.map((s) => `<li><a href="#${s.id}">${esc(s.heading)}</a></li>`).join("")}</ol></div></section>
${S.map((s, idx) => `<section id="${s.id}"${idx === 0 ? ' class="newpage"' : ""}><h2>${inline(s.heading)}</h2>${mdToHtml(s.md.replace("[[IMAGES]]", "")).concat(s.id === "appB" ? imagesHtml : "")}</section>`).join("\n")}
</body></html>`;

const htmlPath = join(outDir, `${job}_master-spec.html`);
const pdfPath = join(outDir, `${job}_master-spec.pdf`);
writeFileSync(htmlPath, html);

// Print with the same headless Chromium Remotion renders with.
const { ensureBrowser } = await import("@remotion/renderer");
const cloudChrome = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const status = await ensureBrowser(existsSync(cloudChrome) ? { browserExecutable: cloudChrome } : {});
const chrome = status.path;
const r = spawnSync(
  chrome,
  [
    "--headless",
    "--no-sandbox",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=8000",
    `--print-to-pdf=${resolve(pdfPath)}`,
    pathToFileURL(resolve(htmlPath)).href,
  ],
  { encoding: "utf8" },
);
if (r.status !== 0 || !existsSync(pdfPath)) {
  console.error(r.stderr || "PDF printing failed");
  process.exit(1);
}
console.log(`Wrote ${pdfPath} (${mb(statSync(pdfPath).size)})`);
