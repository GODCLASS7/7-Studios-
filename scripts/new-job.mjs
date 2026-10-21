#!/usr/bin/env node
// Create a job folder with every file the studio pipeline expects.
//
//   node scripts/new-job.mjs <job-id> "<Project title>" [--format=16x9]
//
// jobs/<id>/            documents: brief, plan, storyboard, approvals, assets
// public/jobs/<id>/     media the compositions load with staticFile()

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [id, title = "Untitled project", ...rest] = process.argv.slice(2);
if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('Usage: node scripts/new-job.mjs <job-id: lowercase-with-hyphens> "<Project title>" [--format=16x9]');
  process.exit(1);
}
const format = (rest.find((a) => a.startsWith("--format=")) || "--format=16x9").split("=")[1];
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

writeFileSync(
  join(dir, "brief.md"),
  `# ${title} — Brief

- **Client / brand:**
- **Goal (one sentence):**
- **Audience:**
- **Deliverables:** (type, format, length or size, quantity)
- **Where it will be used:**
- **Must-say copy / CTA:**
- **Brand assets:** (logo, fonts, colours, references, links)
- **Audio:** (music, voiceover, SFX)
- **Look & feel references:**
- **Deadline:**
- **AI provider:** Higgsfield (default) / SetField (optional, local GPU)
- **Budget for AI generation (credits):**
- **Assumptions Claude made:** (filled in by Claude, confirmed by client)
`,
);

writeFileSync(
  join(dir, "job.json"),
  JSON.stringify(
    {
      id,
      title,
      created: new Date().toISOString(),
      researchUrl: null,
      // "higgsfield" (default, cloud, credits) or "setfield" (optional, local GPU, no credits).
      aiProvider: "higgsfield",
      deliverables: [
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
      fps: 30,
      status: "draft",
      panels: [
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
  JSON.stringify({ hardRules: [], credits: [], visualNotes: [], motionVocabulary: [], adaptations: [], soundDesign: [], qaChecklist: [], pitfalls: [] }, null, 2) + "\n",
);
console.log(`Created ${dir}/ and public/jobs/${id}/`);
