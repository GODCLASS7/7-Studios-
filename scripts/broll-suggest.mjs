#!/usr/bin/env node
// Suggest b-roll for an edit from what is being said.
//
//   node scripts/broll-suggest.mjs <job> [--min-gap=4]
//
// For each line in the edit (jobs/<job>/.edl.resolved.json, so run `npm run edl`
// first) it picks the concrete words (names, places, objects, actions), then
// looks for clips whose file names or tags match in:
//   public/jobs/<job>/broll/      this job's footage
//   public/broll/                 the studio's library (tag files with a sidecar
//                                 <clip>.txt of keywords, or public/broll/tags.json
//                                 { "file.mp4": "kitchen, cooking, hands" })
// Writes jobs/<job>/broll.md: each suggestion with a ready "broll" entry for
// edl.json, at most one cutaway every --min-gap seconds, never in the first
// 2 seconds (the hook stays on the speaker's face). Lines with no match get an
// AI prompt to generate one (studio-ai-footage; quote credits first).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { norm, parseArgs, readJson, ts } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job] = pos;
const p = readJson(join("jobs", job || "", ".edl.resolved.json"));
if (!p) {
  console.error("Usage: node scripts/broll-suggest.mjs <job>   (run npm run edl first)");
  process.exit(1);
}
const MIN_GAP = Number(opt["min-gap"] ?? 4);
const STOP = new Set(
  "about after again also because before being could every first from have here just like make many more most much only other over really should some than that their them then there these they thing think this those through very what when where which while with would your yours you're don't can't isn't it's that's here's there's i'm we're they're going want need know said says tell told".split(" "),
);
// Words that can't be filmed on their own: lines made only of these stay on the speaker.
const ABSTRACT = new Set(
  "keep give learn learned know knowing show showing make take come came feel felt hard hardest part ends end today time thing things truth answer reason point".split(" "),
);
const concrete = (w) => !ABSTRACT.has(w) && !/(ing|ed|ly)$/.test(w);
const VIDEO = [".mp4", ".mov", ".webm", ".m4v", ".jpg", ".jpeg", ".png"];
const libTags = readJson(join("public", "broll", "tags.json"), {});
const library = [];
for (const dir of [join("public", "jobs", job, "broll"), join("public", "broll")]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!VIDEO.includes(extname(f).toLowerCase())) continue;
    const side = join(dir, f.replace(/\.[^.]+$/, ".txt"));
    const tags = [f.replace(/\.[^.]+$/, ""), libTags[f] || "", existsSync(side) ? readFileSync(side, "utf8") : ""].join(" ");
    library.push({ file: join(dir, f).replace(/^public\//, "public/"), tokens: new Set(tags.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)) });
  }
}

// Lines of the edit with their start time (output timeline).
const lines = [];
for (const c of p.cues) {
  const last = lines[lines.length - 1];
  if (last && c.startMs - last.endMs < 250 && !/[.?!]$/.test(last.text)) {
    last.text += " " + c.words.map((w) => w.text).join(" ");
    last.endMs = c.endMs;
  } else lines.push({ startMs: c.startMs, endMs: c.endMs, text: c.words.map((w) => w.text).join(" ") });
}

const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
const out = [];
let lastAt = -1e9;
for (const l of lines) {
  const at = l.startMs / 1000;
  const keywords = [...new Set(l.text.split(/\s+/).map(norm).filter((w) => w.length >= 4 && !STOP.has(w)))];
  if (!keywords.length) continue;
  const hits = library
    .map((c) => ({ c, score: keywords.filter((k) => c.tokens.has(k) || [...c.tokens].some((t) => stem(t) === stem(k))).length }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
  const usable = at >= 2 && at - lastAt >= MIN_GAP;
  out.push({ at, text: l.text, keywords, hits, usable });
  if (usable && hits.length) lastAt = at;
}

const firstWord = (t) => t.split(/\s+/)[0].replace(/[.,!?;:]+$/, "");
const md = [
  `# B-roll ideas — ${job}`,
  "",
  `${library.length} clip(s) in the library. Suggestions keep the first 2 s on the speaker and leave at least ${MIN_GAP} s between cutaways. Copy the entries you want into edl.json "broll", then npm run edl.`,
  "",
  ...out.flatMap((o) => {
    const head = `## ${ts(o.at)} · "${o.text.length > 80 ? o.text.slice(0, 79) + "…" : o.text}"`;
    if (!o.usable) return [head, "", `_Skipped (${o.at < 2 ? "the hook" : "too close to the last cutaway"}). Keywords: ${o.keywords.join(", ")}_`, ""];
    if (o.hits.length) {
      const best = o.hits[0].c.file;
      return [head, "", `Matches: ${o.hits.slice(0, 3).map((h) => `\`${h.c.file}\``).join(", ")}`, "", "```json", JSON.stringify({ file: best, atWord: firstWord(o.text), seconds: 2.5 }), "```", ""];
    }
    const things = o.keywords.filter(concrete);
    if (!things.length) return [head, "", `_Stay on the speaker: nothing concrete to show (${o.keywords.join(", ")})._`, ""];
    return [head, "", `No clip matches ${things.slice(0, 4).join(", ")}. Shoot it, or generate one (quote credits first): "Cinematic b-roll of ${things.slice(0, 3).join(", ")}, natural light, shallow depth of field, slow push-in, 9:16, no text".`, ""];
  }),
];
writeFileSync(join("jobs", job, "broll.md"), md.join("\n"));
const gen = out.filter((o) => o.usable && !o.hits.length && o.keywords.some(concrete)).length;
console.log(`✔ jobs/${job}/broll.md: ${out.filter((o) => o.usable && o.hits.length).length} matched, ${gen} to shoot or generate, ${out.filter((o) => o.usable && !o.hits.length).length - gen} better on the speaker, ${out.filter((o) => !o.usable).length} skipped`);
