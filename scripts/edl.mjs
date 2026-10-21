#!/usr/bin/env node
// Resolve an edit list into render-ready props, and build the voice track.
//
//   node scripts/edl.mjs <job>
//
// Reads jobs/<job>/edl.json (written by autocut.mjs, then refined by hand) and:
//   1. snaps every cut to a frame, so picture and sound stay in sync;
//   2. builds the dialogue track with ffmpeg: each piece trimmed exactly and
//      given 30 ms fades, so no cut ever pops
//      → public/jobs/<job>/edit/voice-v<N>.wav;
//   3. maps the transcript words onto the new timeline and groups them into
//      caption cues (breaking on punctuation and pauses, never a 1-word flash);
//   4. writes jobs/<job>/.edl.resolved.json (props for the FootageEdit
//      compositions) and jobs/<job>/edit.md (output time → source time, text),
//      the sheet to use for timestamped notes like "at 0:12, …".
//
// Render: npm run render -- FootageEdit-9x16 review --props=jobs/<job>/.edl.resolved.json

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diskPath, ff, parseArgs, readJson, ts, writeJson } from "./lib/media.mjs";

const { pos } = parseArgs(process.argv.slice(2));
const [job] = pos;
const edl = readJson(join("jobs", job || "", "edl.json"));
if (!edl) {
  console.error("Usage: node scripts/edl.mjs <job>   (needs jobs/<job>/edl.json; run autocut first)");
  process.exit(1);
}
const fps = edl.fps || 30;
const FADE = 0.03;

// 1. Frame-accurate segments on the output timeline.
let at = 0;
const segs = edl.segments.map((s, i) => {
  const src = edl.sources[s.source];
  if (!src) throw new Error(`Segment ${i + 1}: unknown source "${s.source}"`);
  const inF = Math.round(s.in * fps);
  const outF = Math.round(s.out * fps);
  const r = { ...s, i, file: src.file, inF, outF, from: at, durationInFrames: outF - inF };
  at += r.durationInFrames;
  return r;
});
const total = at;

// 2. Voice track: trim + 30 ms fades per piece, then concatenate.
const outDir = join("public", "jobs", job, "edit");
mkdirSync(outDir, { recursive: true });
const voiceRel = `jobs/${job}/edit/voice-v${edl.version}.wav`;
const inputs = [];
const filters = [];
segs.forEach((s, k) => {
  inputs.push("-i", diskPath(s.file));
  const a = s.inF / fps;
  const d = s.durationInFrames / fps;
  filters.push(`[${k}:a]atrim=start=${a.toFixed(4)}:duration=${d.toFixed(4)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=${FADE},afade=t=out:st=${Math.max(0, d - FADE).toFixed(4)}:d=${FADE}[a${k}]`);
});
filters.push(`${segs.map((_, k) => `[a${k}]`).join("")}concat=n=${segs.length}:v=0:a=1[out]`);
const r = ff([...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "pcm_s16le", join("public", voiceRel)]);
if (r.status !== 0) {
  console.error(`Voice track failed: ${r.stderr}`);
  process.exit(1);
}

// 3. Words on the output timeline, then caption cues.
const words = [];
for (const s of segs) {
  const tr = readJson(edl.sources[s.source].transcript || join("jobs", job, "transcripts", `${s.source}.json`), { words: [] });
  const a = s.inF / fps;
  const b = s.outF / fps;
  for (const w of tr.words) {
    if (w.type !== "word" || w.end <= a || w.start >= b) continue;
    const start = s.from / fps + Math.max(0, w.start - a);
    const end = s.from / fps + Math.min(b, w.end) - a;
    words.push({ text: w.text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), seg: s.i });
  }
}
const cap = edl.captions || {};
const maxWords = cap.maxWords || 3;
const cues = [];
let cur = [];
const push = () => {
  if (cur.length) cues.push({ startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs, words: cur.map(({ text, startMs, endMs }) => ({ text, startMs, endMs })) });
  cur = [];
};
words.forEach((w, i) => {
  const prev = words[i - 1];
  const breakHere = cur.length && (cur.length >= maxWords || w.startMs - prev.endMs >= 300 || /[.?!,;:]$/.test(prev.text) || w.seg !== prev.seg);
  if (breakHere) push();
  cur.push(w);
});
push();
// A cue shorter than 0.4 s flashes; join it to its neighbour when that stays readable.
for (let i = 0; i < cues.length; i++) {
  const c = cues[i];
  if (c.endMs - c.startMs >= 400) continue;
  const next = cues[i + 1];
  if (next && c.words.length + next.words.length <= maxWords + 1 && next.startMs - c.endMs < 300) {
    next.words = [...c.words, ...next.words];
    next.startMs = c.startMs;
    cues.splice(i--, 1);
  }
}
// Hold each cue until the next one starts (up to 0.6 s), so captions don't blink between words.
cues.forEach((c, i) => {
  const next = cues[i + 1];
  c.endMs = Math.round(Math.min(next ? next.startMs : (total * 1000) / fps, c.endMs + 600));
});

// Speech intervals (frames) for music ducking.
const speech = cues.map((c) => [Math.floor((c.startMs / 1000) * fps), Math.ceil((c.endMs / 1000) * fps)]);

// Overlays: `at` (output seconds) or `atPhrase` (a phrase ID from takes.md).
const overlays = (edl.overlays || []).map((o) => {
  const seg = o.atPhrase ? segs.find((s) => s.phrase.split("+").includes(o.atPhrase)) : null;
  const from = seg ? seg.from : Math.round((o.at || 0) * fps);
  return { ...o, from, durationInFrames: Math.round((o.seconds || 2.5) * fps) };
});

const props = {
  job,
  version: edl.version,
  fps,
  durationInFrames: total,
  voice: voiceRel,
  segments: segs.map((s) => ({
    src: s.file,
    from: s.from,
    durationInFrames: s.durationInFrames,
    trimBefore: s.inF,
    zoom: s.zoom || 1,
    push: s.push || 0,
    focusX: s.focus?.[0] ?? edl.sources[s.source].focus?.[0] ?? 0.5,
    focusY: s.focus?.[1] ?? edl.sources[s.source].focus?.[1] ?? 0.4,
  })),
  cues: cap.style === "none" ? [] : cues,
  captions: { style: cap.style || "pop", position: cap.position ?? 0.66, uppercase: cap.uppercase ?? true, highlight: cap.highlight || "#E8B44A", size: cap.size || 1, emphasis: cap.emphasis || [] },
  grade: edl.grade || "none",
  overlays,
  music: edl.music ? { src: edl.music.file, volume: edl.music.volume ?? 0.12, duck: edl.music.duck ?? 0.35 } : null,
  speech,
  faceBoxes: Object.fromEntries(Object.entries(edl.sources).filter(([, s]) => s.faceBox).map(([k, s]) => [k, s.faceBox])),
  cutSources: segs.map((s) => s.source),
};
writeJson(join("jobs", job, ".edl.resolved.json"), props);

const lines = [
  `# Edit v${edl.version} — ${job}`,
  "",
  `${(total / fps).toFixed(2)} s · ${segs.length} segments · ${cues.length} caption cues · voice track \`public/${voiceRel}\``,
  "",
  "| Out | Source | Source time | Zoom | Text |",
  "|---|---|---|---|---|",
  ...segs.map((s) => `| ${ts(s.from / fps)} | ${s.source} (${s.phrase}) | ${ts(s.inF / fps)}–${ts(s.outF / fps)} | ${s.zoom || 1}× | ${s.text || ""} |`),
  "",
];
writeFileSync(join("jobs", job, "edit.md"), lines.join("\n"));
console.log(`✔ jobs/${job}/.edl.resolved.json: ${(total / fps).toFixed(2)} s, ${segs.length} segments, ${cues.length} cues; voice public/${voiceRel}`);
