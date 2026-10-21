#!/usr/bin/env node
// Prepare a client review page for a job: the cut plus timestamped notes.
//
//   node scripts/review-page.mjs <job> <render.mp4> [--label=v2] [--changes="Captions smaller; cut the pause at 0:12"]
//
// Makes a phone-size copy of the render (720p) in out/<job>/review/<label>.mp4,
// adds it to out/<job>/review/versions.json, and writes out/<job>/review/review.html
// from review/template.html. Earlier versions stay listed, so the client can
// compare. Then Claude publishes it with the Artifact tool (see the studio-edit
// skill, "Client review page"): the page, every <label>.mp4 as a published file,
// and capabilities { db: {}, user: { scopes: ["profile"] } }. Viewers add notes
// at the moment they pause on; Claude reads them with ArtifactData (collection
// "notes"), turns them into changes, and marks each one done with a reply.

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ff, parseArgs, readJson, videoInfo, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, render] = pos;
if (!job || !render || !existsSync(render)) {
  console.error('Usage: node scripts/review-page.mjs <job> <render.mp4> [--label=v2] [--changes="…"]');
  process.exit(1);
}
const dir = join("out", job, "review");
mkdirSync(dir, { recursive: true });
const vpath = join(dir, "versions.json");
const data = readJson(vpath, { versions: [] });
const label = String(opt.label || `v${data.versions.length + 1}`);
if (!/^[A-Za-z0-9._-]+$/.test(label)) {
  console.error("Use a simple label such as v2 or v2b.");
  process.exit(1);
}

const file = `${label}.mp4`;
const info = videoInfo(render);
const scale = info.width < info.height ? "scale=720:-2" : "scale=-2:720";
const r = ff(["-i", render, "-vf", `${scale},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", join(dir, file)]);
if (r.status !== 0) {
  copyFileSync(render, join(dir, file));
}
const mb = statSync(join(dir, file)).size / 1e6;
if (mb > 15) console.warn(`⚠ ${file} is ${mb.toFixed(1)} MB; published files must be under 15 MB. Shorten or lower the quality.`);

const jobJson = readJson(join("jobs", job, "job.json"), {});
const entry = {
  label,
  file,
  date: new Date().toISOString().slice(0, 10),
  changes: String(opt.changes || (data.versions.length ? "" : "First cut.")),
  length: `${info.duration.toFixed(1)} s`,
  size: `${info.width}×${info.height}`,
  aspect: `${info.width} / ${info.height}`,
};
data.versions = [...data.versions.filter((v) => v.label !== label), entry];
data.title = jobJson.title || job;
data.client = jobJson.brief?.client || "";
data.job = job;
writeJson(vpath, data);

const template = readFileSync(join("review", "template.html"), "utf8");
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const html = template.replace("<title>__TITLE__</title>", `<title>${data.title.replace(/[<&]/g, "")} review</title>`).replace(/\/\*__REVIEW_DATA__\*\/[\s\S]*?\/\*__END__\*\//, `/*__REVIEW_DATA__*/ ${json} /*__END__*/`);
writeFileSync(join(dir, "review.html"), html);

const files = Object.fromEntries(data.versions.map((v) => [v.file, join(dir, v.file)]));
console.log(`✔ ${join(dir, "review.html")} with ${data.versions.length} version(s); ${file} is ${mb.toFixed(1)} MB`);
console.log(`Publish: Artifact file_path=${join(dir, "review.html")} files=${JSON.stringify(files)} capabilities={"db":{},"user":{"scopes":["profile"]}}`);
const known = readJson(join("jobs", job, "review.json"));
if (known?.url) console.log(`Existing review page: ${known.url} (publish with the same file path, or pass url, to keep the link)`);
