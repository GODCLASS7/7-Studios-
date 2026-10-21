#!/usr/bin/env node
// Find the best Shorts in a long video (sermon, talk, podcast, interview).
//
//   node scripts/shorts.mjs <job> [--count=5] [--min=20] [--max=60] [--target=35]
//   node scripts/shorts.mjs <job> --make=1,3        spin shortlisted clips off as their own jobs
//
// Reads jobs/<job>/takes.json (npm run pack). A candidate is a run of whole
// sentences from one source that lasts --min to --max seconds once pauses are
// closed. Each is scored on:
//   hook     the first line: speaks to "you", asks a question, has a number or a
//            strong word, is 5–12 words, and doesn't open with "so / and / um / let me…";
//   body     strong lines (contrast, numbers, scripture, lists), few fillers, no housekeeping
//            ("check my notes", "good morning", "see you next week");
//   ending   lands on a full stop, ideally a short punchy line;
//   pace     2–3.5 words a second; length close to --target.
// The best non-overlapping ones go to jobs/<job>/shorts.md with their scores and
// reasons. These are suggestions: read them, judge them as an editor (does it
// stand alone without context? is the payoff inside the clip?), then --make the
// ones you'd post. Each becomes jobs/<job>-s<n>/ with its own edit list, ready
// for `npm run edl`, looks, effects and finals.

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { norm, parseArgs, readJson, ts, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job] = pos;
const takes = readJson(join("jobs", job || "", "takes.json"));
if (!takes) {
  console.error("Usage: node scripts/shorts.mjs <job> [--count=5] [--min=20] [--max=60] [--target=35] | --make=1,3   (run npm run pack first)");
  process.exit(1);
}
const MIN = Number(opt.min ?? 20);
const MAX = Number(opt.max ?? 60);
const TARGET = Number(opt.target ?? 35);
const COUNT = Number(opt.count ?? 5);
const GAP = 0.15;

const STRONG = new Set(
  "truth secret mistake never always nobody everyone everything nothing stop why how what wrong right real hard harder hardest best worst only first second third last change changed life faith god lord jesus love fear pain hope prayer pray strength strong weak waiting wait wasted wasting working answer promise freedom breakthrough purpose".split(" "),
);
const OPENERS = new Set("so and but um uh erm anyway okay ok right well let's lets like yeah".split(" "));
const HOUSEKEEPING = ["good morning", "check my notes", "where was i", "get settled", "thank you all", "see you next week", "let's pray", "another time", "more i could say", "we'll get to it"];
const NUMBER = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|forty|hundred|thousand|million)\b/i;
const SCRIPTURE = /\b(isaiah|psalm|psalms|proverbs|john|matthew|mark|luke|romans|genesis|exodus|hebrews|james|says|verse|chapter)\b/i;

const words = (p) => p.text.split(/\s+/).filter(Boolean);
const short = (t, n = 90) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const lineValue = (p) => {
  const ws = words(p).map(norm);
  const lower = p.text.toLowerCase();
  let v = 0;
  const why = [];
  const strong = ws.filter((w) => STRONG.has(w)).length;
  if (strong) (v += Math.min(2, strong * 0.7), why.push("strong words"));
  if (NUMBER.test(p.text)) (v += 0.8, why.push("number"));
  if (SCRIPTURE.test(p.text)) (v += 0.8, why.push("scripture"));
  if (/\bnot\b.*\bbut\b|\bnot\b/.test(lower)) (v += 0.5, why.push("contrast"));
  if (/\?$/.test(p.text.trim())) (v += 0.8, why.push("question"));
  if (/\b(first|second|third|three things|two things)\b/.test(lower)) (v += 0.6, why.push("list"));
  if (HOUSEKEEPING.some((h) => lower.includes(h))) (v -= 3, why.push("housekeeping"));
  v -= (p.fillers || 0) * 0.8;
  return { v, why };
};

const bySource = {};
for (const p of takes.phrases) (bySource[p.source] ??= []).push(p);

const cands = [];
for (const list of Object.values(bySource)) {
  list.forEach((first, i) => {
    const prev = list[i - 1];
    const startsSentence = !prev || /[.?!]$/.test(prev.text.trim()) || first.start - prev.end > 0.8;
    if (!startsSentence || !first.text.trim()) return;
    let dur = 0;
    for (let j = i; j < list.length; j++) {
      const p = list[j];
      dur += p.end - p.start + (j > i ? GAP : 0);
      if (dur > MAX) break;
      if (dur < MIN || !/[.!?]$/.test(p.text.trim())) continue;
      // Housekeeping lines inside a clip are cut out of it.
      const kept = list.slice(i, j + 1).filter((x, k) => k === 0 || lineValue(x).v > -2);
      const keptDur = kept.reduce((t, x, k) => t + x.end - x.start + (k ? GAP : 0), 0);
      if (keptDur < MIN) continue;
      cands.push({ phrases: kept, dur: keptDur, next: list[j + 1], lastSpan: p });
    }
  });
}

const scored = cands.map((c) => {
  const [first] = c.phrases;
  const last = c.phrases[c.phrases.length - 1];
  const fw = words(first).map(norm);
  const reasons = [];
  let hook = 0;
  if (fw.some((w) => w === "you" || w === "your" || w === "you're")) (hook += 1.5, reasons.push("hook speaks to you"));
  if (/\?$/.test(first.text.trim())) (hook += 1.5, reasons.push("hook asks a question"));
  if (NUMBER.test(first.text)) (hook += 1, reasons.push("number in the hook"));
  if (fw.some((w) => STRONG.has(w))) (hook += 1.5, reasons.push("strong hook word"));
  if (fw.length >= 5 && fw.length <= 12) hook += 1;
  if (OPENERS.has(fw[0])) (hook -= 3, reasons.push(`opens with "${fw[0]}"`));
  if ((first.fillers || 0) > 0) (hook -= 2, reasons.push("filler in the first line"));
  if (HOUSEKEEPING.some((h) => first.text.toLowerCase().includes(h))) hook -= 3;
  const vals = c.phrases.map(lineValue);
  const body = vals.reduce((t, x) => t + x.v, 0) / c.phrases.length;
  const tags = [...new Set(vals.flatMap((x) => x.why))];
  const lw = words(last);
  let ending = /[.!]$/.test(last.text.trim()) ? 1 : 0;
  if (lw.length <= 8) (ending += 1, reasons.push("short punchy ending"));
  if (lw.map(norm).some((w) => STRONG.has(w))) ending += 0.5;
  if (HOUSEKEEPING.some((h) => last.text.toLowerCase().includes(h))) (ending -= 3, reasons.push("ends on housekeeping"));
  // A clip that stops right before "But… / Because… / That's why…" leaves its payoff outside.
  const nx = c.next;
  if (nx && nx.start - c.lastSpan.end < 0.8 && /^(but|because|so that|that's why|and that's|until)\b/i.test(nx.text.trim())) (ending -= 2, reasons.push(`payoff follows ("${short(nx.text, 40)}")`));
  if (/^(but|and that|that's why)\b/i.test(last.text.trim())) (ending += 1, reasons.push("ends on the turn"));
  const nWords = c.phrases.reduce((t, p) => t + words(p).length, 0);
  const wps = nWords / c.dur;
  const pace = wps >= 2 && wps <= 3.5 ? 1 : 0;
  const length = -Math.abs(c.dur - TARGET) / 12;
  const score = hook * 1.4 + body * 2 + ending + pace + length;
  return { ...c, score, parts: { hook, body, ending, pace, length }, reasons: [...reasons, ...tags.map((t) => `body: ${t}`)], wps };
});

// Best first, no overlaps.
scored.sort((a, b) => b.score - a.score);
const picked = [];
for (const c of scored) {
  const ids = new Set(c.phrases.map((p) => p.id));
  if (picked.some((p) => p.phrases.some((x) => ids.has(x.id)))) continue;
  picked.push(c);
  if (picked.length >= COUNT) break;
}

// Phrase IDs as runs: A.24-27,A.29-30 (gaps are lines cut out of the clip).
const keepOf = (c) => {
  const runs = [];
  for (const p of c.phrases) {
    const [src, n] = p.id.split(".");
    const last = runs[runs.length - 1];
    if (last && last.src === src && Number(n) === last.to + 1) last.to = Number(n);
    else runs.push({ src, from: Number(n), to: Number(n) });
  }
  return runs.map((r) => (r.from === r.to ? `${r.src}.${r.from}` : `${r.src}.${r.from}-${r.to}`)).join(",");
};

if (opt.make) {
  const nums = String(opt.make).split(",").map(Number);
  const prior = readJson(join("jobs", job, "shorts.json"));
  if (!prior) {
    console.error(`Run the finder first: npm run shorts -- ${job}`);
    process.exit(1);
  }
  const parentEdl = readJson(join("jobs", job, "edl.json"), {});
  for (const n of nums) {
    const c = prior.picked[n - 1];
    if (!c) {
      console.error(`No shortlisted clip #${n}`);
      process.exit(1);
    }
    const child = `${job}-s${n}`;
    if (!existsSync(join("jobs", child))) spawnSync("node", ["scripts/new-job.mjs", child, `${prior.title || job} · Short ${n}`, "--preset=talking-head"], { stdio: "ignore" });
    writeJson(join("jobs", child, "takes.json"), takes);
    // Carry the parent's sources (tracks, cutouts, face boxes) and look settings, not its cuts.
    const { segments: _s, version: _v, ...keep } = parentEdl;
    void _s;
    void _v;
    writeJson(join("jobs", child, "edl.json"), { ...keep, job: child, hook: c.hook });
    const r = spawnSync("node", ["scripts/autocut.mjs", child, `--keep=${c.keep}`, `--format=${parentEdl.format || "9x16"}`], { encoding: "utf8" });
    console.log(r.stdout.trim() || r.stderr.trim());
    writeFileSync(join("jobs", child, "source.md"), `# Short ${n} from ${job}\n\nPhrases ${c.keep} · ${ts(c.start)}–${ts(c.end)} in the source · score ${c.score}\n\nHook: "${c.hook}"\n`);
  }
  console.log(`Next, for each: npm run edl -- ${job}-s<n>, then looks/effects, render, cutcheck.`);
  process.exit(0);
}

const md = [
  `# Shorts shortlist — ${job}`,
  "",
  `${cands.length} candidate clips of ${MIN}–${MAX} s (whole sentences, pauses closed); the best ${picked.length} that don't overlap. Scores are a guide: judge each as an editor before making it.`,
  "",
  ...picked.flatMap((c, i) => [
    `## ${i + 1}. ${c.dur.toFixed(0)} s · score ${c.score.toFixed(1)} · \`--keep=${keepOf(c)}\``,
    "",
    `- **Hook:** "${short(c.phrases[0].text)}"`,
    `- **Ends:** "${short(c.phrases[c.phrases.length - 1].text)}"`,
    `- **Source:** ${c.phrases[0].source} ${ts(c.phrases[0].start)}–${ts(c.phrases[c.phrases.length - 1].end)} · ${c.wps.toFixed(1)} words/s`,
    `- **Why:** ${c.reasons.join("; ") || "steady content"}`,
    `- hook ${c.parts.hook.toFixed(1)} · body ${c.parts.body.toFixed(1)} · ending ${c.parts.ending.toFixed(1)} · pace ${c.parts.pace} · length ${c.parts.length.toFixed(1)}`,
    "",
  ]),
  `Make them: \`npm run shorts -- ${job} --make=1,2\``,
  "",
];
writeFileSync(join("jobs", job, "shorts.md"), md.join("\n"));
writeJson(join("jobs", job, "shorts.json"), {
  job,
  title: readJson(join("jobs", job, "job.json"), {}).title,
  picked: picked.map((c) => ({ keep: keepOf(c), score: Number(c.score.toFixed(2)), dur: Number(c.dur.toFixed(2)), start: c.phrases[0].start, end: c.phrases[c.phrases.length - 1].end, hook: c.phrases[0].text })),
});
console.log(md.join("\n"));
