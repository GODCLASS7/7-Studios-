#!/usr/bin/env node
// Create a job folder with every file the studio pipeline expects.
//
//   node scripts/new-job.mjs <job-id> "<Project title>" [--format=16x9] [--preset=<name>]
//   node scripts/new-job.mjs --presets          list the presets in presets/
//
// jobs/<id>/            documents: brief, plan, storyboard, approvals, assets, spec
// public/jobs/<id>/     media the compositions load with staticFile()
//
// A preset (presets/<name>.json, see the studio-styles skill) fills in the brief
// defaults, deliverables, a drawn storyboard and the spec rules for a kind of
// job; everything stays editable.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "--presets") {
  for (const f of readdirSync("presets").filter((f) => f.endsWith(".json")).sort()) {
    const p = JSON.parse(readFileSync(join("presets", f), "utf8"));
    console.log(`${p.name.padEnd(15)} ${p.label}  [${p.recipes.join(", ")}]`);
  }
  process.exit(0);
}

const [id, title = "Untitled project", ...rest] = args;
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: node scripts/new-job.mjs <job-id: lowercase-with-hyphens> "<Project title>" [--format=16x9] [--preset=<name>]   |   --presets');
  process.exit(1);
}
const opt = (k) => (rest.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1];
const presetName = opt("preset");
let preset = null;
if (presetName) {
  const file = join("presets", `${presetName}.json`);
  if (!existsSync(file)) {
    console.error(`No preset "${presetName}". Run: npm run new-job -- --presets`);
    process.exit(1);
  }
  preset = JSON.parse(readFileSync(file, "utf8"));
}
const format = opt("format") || preset?.storyboard?.format || "16x9";
const dir = join("jobs", id);
if (existsSync(dir)) {
  console.error(`${dir} already exists.`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
for (const sub of ["footage", "stills", "panels", "audio", "data", "brand"]) {
  mkdirSync(join("public", "jobs", id, sub), { recursive: true });
}
const today = new Date().toISOString().slice(0, 10);

const briefFields = [
  ["Client / brand", ""],
  ["Goal (one sentence)", ""],
  ["Audience", ""],
  ["Deliverables", "(type, format, length or size, quantity)"],
  ["Where it will be used", ""],
  ["Must-say copy / CTA", ""],
  ["Brand assets", "(logo, fonts, colours, references, links)"],
  ["Audio", "(music, voiceover, SFX)"],
  ["Look & feel references", ""],
  ["Deadline", ""],
  ["AI provider", "Higgsfield (default) / SetField (optional, local GPU)"],
  ["Budget for AI generation (credits)", ""],
  ["Assumptions Claude made", "(filled in by Claude, confirmed by client)"],
];
writeFileSync(
  join(dir, "brief.md"),
  `# ${title} — Brief
${preset ? `\n> Started from preset **${preset.name}** (${preset.label}); style recipes: ${preset.recipes.join(", ")} (studio-styles skill). Preset values are defaults: confirm or replace them.\n` : ""}
${briefFields.map(([k, hint]) => `- **${k}:** ${preset?.brief?.[k] ?? hint}`.trimEnd()).join("\n")}
`,
);

writeFileSync(
  join(dir, "job.json"),
  JSON.stringify(
    {
      id,
      title,
      created: new Date().toISOString(),
      preset: preset?.name ?? null,
      recipes: preset?.recipes ?? [],
      researchUrl: null,
      // "higgsfield" (default, cloud, credits) or "setfield" (optional, local GPU, no credits).
      aiProvider: preset?.aiProvider ?? "higgsfield",
      deliverables: preset?.deliverables ?? [
        {
          name: "Main video",
          type: "motion",
          composition: "",
          format,
          seconds: 20,
          fps: 30,
          preset: "4k",
          complexity: "medium",
          aiVideoShots: 0,
          aiImages: 0,
          upscaleShots: 0,
        },
      ],
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(dir, "storyboard.json"),
  JSON.stringify(
    {
      project: title,
      version: 1,
      date: today,
      format,
      fps: preset?.storyboard?.fps ?? 30,
      status: "draft",
      panels: preset?.storyboard?.panels ?? [
        {
          id: "1",
          title: "Opening",
          seconds: 3,
          shot: "Wide",
          camera: "push-in",
          source: "motion",
          action: "Describe what happens.",
          draw: [{ type: "text", x: 50, y: 50, text: "TITLE", size: 12 }],
        },
      ],
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(dir, "approvals.md"),
  `# ${title} — Approvals log

| # | Gate | Version | Sent | Decision | Notes |
|---|---|---|---|---|---|
`,
);
writeFileSync(join(dir, "assets.json"), "[]\n");
// Extra facts for the master spec (npm run spec). Every field is optional; see the studio-spec skill.
writeFileSync(
  join(dir, "spec.json"),
  JSON.stringify(
    { hardRules: [], credits: [], visualNotes: [], motionVocabulary: [], adaptations: [], soundDesign: [], qaChecklist: [], pitfalls: [], ...(preset?.spec ?? {}) },
    null,
    2,
  ) + "\n",
);
console.log(`Created ${dir}/ and public/jobs/${id}/${preset ? ` from preset ${preset.name}` : ""}`);
