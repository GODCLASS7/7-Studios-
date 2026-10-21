#!/usr/bin/env node
// Pack every transcript of a job into one short reading view, so the edit is
// decided from text (as video-use does), not by watching hours of footage.
//
//   node scripts/pack.mjs <job> [--gap=0.5]
//
// Reads jobs/<job>/transcripts/*.json. Splits each source into phrases at
// pauses ≥ --gap seconds or sentence ends, and gives each phrase an ID
// (A.1, A.2 … for the first source, B.1 … for the next).
//
// Writes:
//   jobs/<job>/takes.md    the reading view: [start-end] speaker text, with (um) fillers and ‖pauses‖ marked
//   jobs/<job>/takes.json  the same phrases with times, for autocut.mjs

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isFiller, parseArgs, readJson, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job] = pos;
if (!job) {
  console.error("Usage: node scripts/pack.mjs <job> [--gap=0.5]");
  process.exit(1);
}
const GAP = Number(opt.gap ?? 0.5);
const dir = join("jobs", job, "transcripts");
let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
} catch {
  console.error(`No transcripts in ${dir}. Run: npm run transcribe -- ${job} <media...>`);
  process.exit(1);
}

const letter = (i) => (i < 26 ? String.fromCharCode(65 + i) : `S${i + 1}`);
const f2 = (s) => s.toFixed(2).padStart(6, "0");
const sources = [];
const phrases = [];
const md = [`# Takes — ${job}`, "", "Phrase IDs feed `npm run autocut -- " + job + " --keep=A.1,A.3-A.5`. `(um)` marks fillers; `‖0.8‖` marks a pause inside a phrase.", ""];

files.forEach((f, si) => {
  const t = readJson(join(dir, f));
  const key = letter(si);
  sources.push({ key, file: t.source, transcript: join(dir, f), duration: t.duration });
  const words = t.words;
  const groups = [];
  let cur = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const newPhrase = cur.length && (w.start - prev.end >= GAP || /[.?!]$/.test(prev.text) || (w.speaker && prev.speaker && w.speaker !== prev.speaker));
    if (newPhrase) {
      groups.push(cur);
      cur = [];
    }
    cur.push(i);
  });
  if (cur.length) groups.push(cur);

  md.push(`## ${key} · ${t.source}  (${t.duration.toFixed(1)} s, ${groups.length} phrases, ${t.engine}${t.approx ? ", approximate times" : ""})`, "");
  groups.forEach((g, gi) => {
    const ws = g.map((i) => words[i]);
    const id = `${key}.${gi + 1}`;
    const parts = ws.map((w, k) => {
      const gap = k ? w.start - ws[k - 1].end : 0;
      const pause = gap >= 0.3 ? `‖${gap.toFixed(1)}‖ ` : "";
      const text = w.type === "event" ? `[${w.text.replace(/^[[(]|[\])]$/g, "")}]` : isFiller(w) ? `(${w.text})` : w.text;
      return pause + text;
    });
    const fillers = ws.filter((w) => w.type === "word" && isFiller(w)).length;
    const speaker = ws.find((w) => w.speaker)?.speaker;
    phrases.push({ id, source: key, start: ws[0].start, end: ws[ws.length - 1].end, text: ws.filter((w) => w.type === "word" && !isFiller(w)).map((w) => w.text).join(" "), words: g, fillers, speaker });
    md.push(`  ${id.padEnd(6)} [${f2(ws[0].start)}-${f2(ws[ws.length - 1].end)}]${speaker ? ` ${speaker}` : ""} ${parts.join(" ")}`);
  });
  md.push("");
});

writeFileSync(join("jobs", job, "takes.md"), md.join("\n") + "\n");
writeJson(join("jobs", job, "takes.json"), { job, gap: GAP, sources, phrases });
console.log(`✔ jobs/${job}/takes.md: ${sources.length} source(s), ${phrases.length} phrases`);
