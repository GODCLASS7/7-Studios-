#!/usr/bin/env node
// Correct words the transcript got wrong, so captions say what was really said.
//
//   node scripts/fix-words.mjs <job> "cloud code=>Claude Code" "claws=>Claude" [--only=A.3,A.5] [--dry]
//   node scripts/fix-words.mjs <job> --from=jobs/<job>/word-fixes.txt
//
// Each fix is "heard=>meant", one or more words on each side (matched without
// caring about capitals or punctuation; punctuation on the last word is kept).
// --only limits it to phrase IDs from takes.md, for words that are right
// elsewhere (a real "cloud"). Every change is listed with its phrase and time:
// check them. Originals are kept on each word as "orig", and the run is logged
// in jobs/<job>/word-fixes.log. Then re-run `npm run pack` and `npm run edl`.
//
// Names, brands and scripture words that keep coming out wrong belong in the
// client's house notes, and in --keyterms when transcribing.

import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { norm, parseArgs, readJson, ts, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, ...pairs] = pos;
const rules = [...pairs, ...(opt.from ? readFileSync(opt.from, "utf8").split("\n").filter((l) => l.includes("=>") && !l.startsWith("#")) : [])].map((r) => {
  const [a, b] = r.split("=>").map((x) => x.trim());
  return { from: a.split(/\s+/).map(norm), to: b.split(/\s+/) };
});
if (!job || !rules.length) {
  console.error('Usage: node scripts/fix-words.mjs <job> "heard=>meant" … [--only=A.3,A.5] [--dry]');
  process.exit(1);
}
const takes = readJson(join("jobs", job, "takes.json"));
const only = opt.only ? new Set(String(opt.only).split(",")) : null;
const dir = join("jobs", job, "transcripts");
const log = [];

readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .forEach((f) => {
    const path = join(dir, f);
    const tr = readJson(path);
    const src = takes?.sources.find((s) => s.transcript === path);
    const phraseOf = (i) => takes?.phrases.find((p) => p.source === src?.key && p.words.includes(i))?.id;
    const out = [];
    for (let i = 0; i < tr.words.length; ) {
      const rule = rules.find((r) => r.from.every((t, k) => tr.words[i + k] && tr.words[i + k].type === "word" && norm(tr.words[i + k].text) === t));
      const ph = phraseOf(i);
      if (!rule || (only && !only.has(ph))) {
        out.push(tr.words[i++]);
        continue;
      }
      const span = tr.words.slice(i, i + rule.from.length);
      const tail = span[span.length - 1].text.match(/[.,!?;:]+$/)?.[0] || "";
      const dur = (span[span.length - 1].end - span[0].start) / rule.to.length;
      rule.to.forEach((w, k) =>
        out.push({ ...span[0], text: k === rule.to.length - 1 ? w + tail : w, start: Number((span[0].start + k * dur).toFixed(3)), end: Number((span[0].start + (k + 1) * dur).toFixed(3)), orig: span.map((x) => x.text).join(" ") }),
      );
      log.push(`${f.replace(".json", "")} ${ph ?? "?"} ${ts(span[0].start)}: "${span.map((x) => x.text).join(" ")}" → "${rule.to.join(" ")}${tail}"`);
      i += rule.from.length;
    }
    if (!opt.dry) writeJson(path, { ...tr, words: out });
  });

console.log(log.length ? log.join("\n") : "No matches.");
if (!opt.dry && log.length) {
  appendFileSync(join("jobs", job, "word-fixes.log"), `\n# ${new Date().toISOString()}\n${log.join("\n")}\n`);
  console.log(`\n✔ ${log.length} fix(es). Now: npm run pack -- ${job} && npm run edl -- ${job}`);
}
