#!/usr/bin/env node
// Time a song's lyric cards to the vocal, for the ScriptureLyric template.
//
//   node scripts/lyrics.mjs <job> --audio=<song file> --lyrics=jobs/<job>/lyrics.txt
//                           [--lrc=<file.lrc>] [--lead=0.5] [--hold=0.8] [--min=1.2] [--offset=0]
//
// Timing comes from, in order of preference:
//   1. a word transcript of the song in jobs/<job>/transcripts/ (best: ElevenLabs
//      forced alignment, `npm run transcribe -- <job> <song> --align=<lyrics.txt>`,
//      which matches the lyrics you give it to the vocal; speech-to-text also works,
//      less precisely, because singing is harder to recognise);
//   2. --lrc: a timed lyric file (line starts), e.g. exported from a music app or DAW.
//
// lyrics.txt: one card per line. "|" marks the line break, *word* marks an
// emphasis word (underlined in the accent colour). Blank lines and [section]
// labels are ignored. Optional header lines:
//   # overline: THE WAIT CULTURE
//   # reference: Song Title · Artist
//   # intro: Song Title | Artist        (title card before the first line)
//   # version: LIVE
//
// Writes jobs/<job>/lyrics.props.json, ready for:
//   npm run render -- ScriptureLyric-9x16 review --props=jobs/<job>/lyrics.props.json
// and prints every card's time so they can be checked against the song.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { diskPath, duration, norm, parseArgs, publicRel, readJson, transcriptPath, ts, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job] = pos;
if (!job || !opt.audio || !opt.lyrics) {
  console.error("Usage: node scripts/lyrics.mjs <job> --audio=<song> --lyrics=<lyrics.txt> [--lrc=file.lrc] [--lead=0.5] [--hold=0.8]");
  process.exit(1);
}
// Cards land half a second before the vocal so the words are inked in as they are sung.
const LEAD = Number(opt.lead ?? 0.5);
const HOLD = Number(opt.hold ?? 0.8);
const MIN = Number(opt.min ?? 1.2);
const OFFSET = Number(opt.offset ?? 0);
const audioDisk = diskPath(opt.audio);
const songLength = duration(audioDisk);

const head = {};
const lines = [];
for (const raw of readFileSync(opt.lyrics, "utf8").split("\n")) {
  const l = raw.trim();
  const h = l.match(/^#\s*(\w+)\s*:\s*(.+)$/);
  if (h) head[h[1].toLowerCase()] = h[2].trim();
  else if (l && !l.startsWith("#") && !/^\[.*\]$/.test(l)) lines.push(l);
}
const cards = lines.map((l) => ({
  text: l.replace(/\*/g, ""),
  emphasis: [...l.matchAll(/\*([^*]+)\*/g)].map((m) => m[1]),
  tokens: l.replace(/[*|]/g, " ").split(/\s+/).map(norm).filter(Boolean),
}));

// Distance ≤ 1 counts as a match for longer words (sung vowels, spelling).
const close = (a, b) => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || a.slice(i) === b.slice(i + 1);
};

let source;
const transcript = readJson(transcriptPath(job, audioDisk));
if (opt.lrc) {
  const rows = [...readFileSync(opt.lrc, "utf8").matchAll(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/gm)].map((m) => ({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() })).filter((r) => r.text);
  if (rows.length < cards.length) console.warn(`⚠ The LRC has ${rows.length} timed lines for ${cards.length} cards; the rest are spaced evenly.`);
  cards.forEach((c, i) => {
    if (rows[i]) {
      c.first = rows[i].t;
      c.last = rows[i + 1] ? rows[i + 1].t - 0.4 : rows[i].t + 3;
    }
  });
  source = `LRC ${opt.lrc}`;
} else if (transcript) {
  const T = transcript.words.filter((w) => w.type === "word").map((w) => ({ ...w, n: norm(w.text) }));
  let j = 0;
  let matched = 0;
  let total = 0;
  for (const c of cards) {
    for (const tok of c.tokens) {
      total++;
      for (let k = j; k < Math.min(T.length, j + 10); k++) {
        if (close(tok, T[k].n)) {
          c.first ??= T[k].start;
          c.last = T[k].end;
          j = k + 1;
          matched++;
          break;
        }
      }
    }
  }
  source = `${transcript.engine} transcript (${matched}/${total} lyric words matched)`;
  if (matched / Math.max(1, total) < 0.6) console.warn("⚠ Under 60% of the lyric words matched the transcript. Check the lyrics, or use forced alignment (--align) or an LRC file.");
} else {
  console.error(`No timing source. Either transcribe the song first:\n  npm run transcribe -- ${job} ${opt.audio} --align=${opt.lyrics}\nor pass --lrc=<file.lrc>.`);
  process.exit(1);
}

// Lines with no timing are spread between their timed neighbours.
cards.forEach((c, i) => {
  if (c.first !== undefined) return;
  const prev = cards.slice(0, i).reverse().find((x) => x.first !== undefined);
  const nextIdx = cards.findIndex((x, k) => k > i && x.first !== undefined);
  const a = prev ? prev.last : 0;
  const b = nextIdx >= 0 ? cards[nextIdx].first : songLength;
  const gapCount = (nextIdx >= 0 ? nextIdx : cards.length) - cards.indexOf(prev ?? cards[0]);
  c.first = a + (b - a) * ((i - (prev ? cards.indexOf(prev) : -1)) / Math.max(1, gapCount));
  c.last = c.first + 2;
  c.guessed = true;
});

const phrases = cards.map((c, i) => {
  const start = Math.max(0, c.first + OFFSET - LEAD);
  const next = cards[i + 1] ? Math.max(0, cards[i + 1].first + OFFSET - LEAD) : songLength;
  const seconds = Math.max(Math.min(MIN, next - start - 0.1), Math.min(next - start - 0.1, c.last + OFFSET + HOLD - start));
  return { text: c.text, start: Number(start.toFixed(2)), seconds: Number(seconds.toFixed(2)), ...(c.emphasis.length ? { emphasis: c.emphasis } : {}) };
});
const lastEnd = Math.max(...phrases.map((p) => p.start + p.seconds));
const props = {
  overline: head.overline || "THE WAIT CULTURE",
  reference: head.reference || "",
  // Always set: render props merge over the template's defaults, which carry a translation stamp.
  version: head.version || "",
  ...(head.intro ? { intro: { title: head.intro.split("|")[0].trim(), sub: head.intro.split("|")[1]?.trim() } } : {}),
  phrases,
  endSeconds: Number(Math.max(2.5, songLength - lastEnd).toFixed(2)),
  audio: existsSync(join("public", publicRel(opt.audio))) ? publicRel(opt.audio) : opt.audio,
};
const out = join("jobs", job, "lyrics.props.json");
writeJson(out, props);
console.log(`Timing from ${source}; song ${ts(songLength)}.\n`);
console.log("| # | In | Out | Card |\n|---|---|---|---|");
phrases.forEach((p, i) => console.log(`| ${i + 1} | ${ts(p.start)} | ${ts(p.start + p.seconds)} | ${p.text.replace(/\|/g, " / ")}${cards[i].guessed ? " ⚠ guessed" : ""} |`));
console.log(`\n✔ ${out}`);
