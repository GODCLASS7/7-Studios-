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
import { diskPath, ff, FORMAT_SIZE, mapBox, norm, parseArgs, readJson, ts, videoInfo, writeJson } from "./lib/media.mjs";

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

// Talking-head effects (src/effects). Each starts at `at` (output seconds), `atPhrase`
// (a phrase ID) or `atWord` (the first time a word or phrase is said in the edit).
const OUT = FORMAT_SIZE[edl.format] || FORMAT_SIZE["9x16"];
const portrait = OUT[1] >= OUT[0];
const sayStart = (text, after = 0) => {
  const toks = String(text).split(/\s+/).map(norm).filter(Boolean);
  for (let i = 0; i + toks.length <= words.length; i++) {
    if (words[i].startMs / 1000 < after) continue;
    if (toks.every((t, j) => norm(words[i + j].text) === t)) return words.slice(i, i + toks.length);
  }
  return null;
};
const startOf = (e) => {
  if (e.atPhrase) {
    const seg = segs.find((s) => s.phrase.split("+").includes(e.atPhrase));
    if (!seg) throw new Error(`effect ${e.kind}: phrase ${e.atPhrase} isn't in the edit`);
    return seg.from / fps;
  }
  if (e.atWord) {
    const hit = sayStart(e.atWord);
    if (!hit) throw new Error(`effect ${e.kind}: "${e.atWord}" isn't said in the edit (check edit.md)`);
    return hit[0].startMs / 1000;
  }
  return Number(e.at ?? 0);
};
const HEX = {
  "liquid-glass": { green: "#22C55E", gold: "#E8B44A", blue: "#3D7BFF", red: "#EF4444", purple: "#8B5CF6", orange: "#F97316", white: "#FFFFFF" },
  "screen-push": { white: "#FFFFFF", green: "#7CFFA0", amber: "#FFC46B", gold: "#FFC46B", red: "#FF6B6B", blue: "#7CC4FF" },
  "shoulder-zoom": { clay: "#B03926", gold: "#E8B44A", green: "#3FA66A", blue: "#3D7BFF", red: "#D9412B", purple: "#7B5CFF" },
};
const hex = (kind, c, fallback) => {
  if (!c) return fallback;
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c)) {
    const h = c.replace("#", "");
    return `#${h.length === 3 ? h.split("").map((x) => x + x).join("") : h}`.toUpperCase();
  }
  const v = HEX[kind][String(c).toLowerCase()];
  if (!v) throw new Error(`effect ${kind}: unknown colour "${c}"; use a hex code or one of ${Object.keys(HEX[kind]).join(", ")}`);
  return v;
};
const card = (spec) => {
  const [label = "", big = "", small = ""] = String(spec).split("|").map((x) => x.trim());
  return String(spec).includes("|") ? { label, big, small } : { label: "", big: label, small: "" };
};
const srcInfo = {};
const faceAt = (frame) => {
  const s = segs.find((x) => frame >= x.from && frame < x.from + x.durationInFrames) || segs[0];
  const box = edl.sources[s.source].faceBox;
  if (!box) return null;
  srcInfo[s.file] ??= videoInfo(diskPath(s.file));
  const fX = s.focus?.[0] ?? edl.sources[s.source].focus?.[0] ?? 0.5;
  const fY = s.focus?.[1] ?? edl.sources[s.source].focus?.[1] ?? 0.4;
  const r = mapBox(box, srcInfo[s.file], OUT, fX, fY, s.zoom || 1);
  return { faceX: (r.x1 + r.x2) / 2 / OUT[0], faceWidth: (r.x2 - r.x1) / OUT[0], eyeY: (r.y1 + 0.4 * (r.y2 - r.y1)) / OUT[1] };
};
const notes = [];
const effects = (edl.effects || []).flatMap((e) => {
  if (e.kind === "liquid-glass") {
    const m = String(e.value ?? "82%").match(/^([^\d.-]*)(-?[\d,]*\.?\d+)(.*)$/);
    if (!m) throw new Error(`liquid-glass: can't read the value "${e.value}" (try 82%, $10K, 2.4M)`);
    const num = Number(m[2].replace(/,/g, ""));
    const decimals = (m[2].split(".")[1] || "").length;
    const draw = e.drawSeconds ?? 1.16;
    const hold = e.holdSeconds ?? 1.5;
    const at = startOf(e);
    return [{
      kind: "liquid-glass", from: Math.round(at * fps), durationInFrames: Math.ceil((0.18 + draw + hold + 0.35) * fps),
      title: String(e.title || "").toUpperCase(), startValue: e.startValue ?? Number((num / 5).toFixed(decimals)), endValue: num,
      prefix: m[1], suffix: m[3], decimals, lineColour: hex("liquid-glass", e.colour, "#22C55E"), nodeColour: e.nodeColour || "#FFFFFF",
      textColour: e.textColour || "#F4EFE6", shape: e.shape || [0.18, 0.22, 0.26, 0.34, 0.4, 0.52, 0.64, 0.78, 0.92],
      drawSeconds: draw, holdSeconds: hold, cardY: e.cardY ?? (portrait ? 0.4 : 0.3), frost: e.frost ?? 7, bend: e.bend ?? 1,
    }];
  }
  if (e.kind === "screen-push") {
    const typed = String(e.text || "").split(/\s+/).filter(Boolean);
    let starts;
    let endAbs;
    if (!e.when || e.when === "said") {
      const hit = sayStart(e.text);
      if (!hit) throw new Error(`screen-push: "${e.text}" isn't said in the edit; give "when": [from, to] in seconds instead`);
      starts = hit.map((w) => w.startMs / 1000);
      endAbs = Math.max(hit[hit.length - 1].endMs / 1000 + 0.3, starts[starts.length - 1] + 0.9);
    } else {
      const [a, b] = e.when;
      starts = typed.map((_, i) => a + (i * (b - a)) / typed.length);
      endAbs = b;
      notes.push(`screen-push "${e.text}": words spaced evenly across ${a}–${b} s`);
    }
    endAbs = Math.min(endAbs, total / fps);
    const t0 = starts[0];
    if (typed.length > 15) notes.push(`screen-push "${e.text}": ${typed.length} words is long; 3–15 reads best`);
    return [{
      kind: "screen-push", from: Math.round(t0 * fps), durationInFrames: Math.max(1, Math.ceil((endAbs - t0) * fps)),
      words: typed.map((text, i) => ({ text, start: Number((starts[i] - t0).toFixed(3)) })), endAt: Number((endAbs - t0).toFixed(3)),
      textColour: hex("screen-push", e.colour, "#FFFFFF"), allCaps: e.allCaps ?? false, zoom: e.zoom ?? 3.1, pixelSize: e.pixelSize ?? 10,
      screenColour: e.screenColour || "#363636", fringe: e.fringe ?? 3, glow: e.glow ?? 0.85, focusFalloff: e.focusFalloff ?? 5,
    }];
  }
  if (e.kind === "shoulder-zoom") {
    if (!portrait) {
      notes.push("shoulder-zoom is designed for vertical frames (9:16, 4:5, 1:1); skipped in this landscape edit");
      return [];
    }
    const at = startOf(e);
    const from = Math.round(at * fps);
    const face = faceAt(from + Math.round(1.9 * fps));
    if (face && face.faceWidth > 0.36)
      notes.push(`shoulder-zoom at ${at.toFixed(2)} s: the head fills ${Math.round(face.faceWidth * 100)}% of the frame width (the cards need about 32%), so they will touch it. Use a wider shot or a source framed with more space beside the head.`);
    if (!face) notes.push("shoulder-zoom: no faceBox on this source, so default framing is assumed (face centred, eyes a quarter down). Set one for a safe fit.");
    if (at + 4.6 > total / fps) notes.push(`shoulder-zoom at ${at.toFixed(2)} s runs past the end of the edit (it needs 4.6 s)`);
    return [{
      kind: "shoulder-zoom", from, durationInFrames: Math.round(4.6 * fps), style: e.style === "transition" ? "transition" : "normal",
      start: card(e.start ?? "BEFORE | $3,200 | per month"), end: card(e.end ?? "AFTER | $32,000 | per month"),
      accent: hex("shoulder-zoom", e.colour, "#B03926"), ...(face || { faceX: 0.5, faceWidth: 0.32, eyeY: 0.255 }),
    }];
  }
  throw new Error(`Unknown effect kind "${e.kind}" (liquid-glass, screen-push, shoulder-zoom)`);
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
  effects,
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
  ...(effects.length
    ? ["## Effects", "", "| In | Out | Effect | Detail |", "|---|---|---|---|", ...effects.map((e) => `| ${ts(e.from / fps)} | ${ts((e.from + e.durationInFrames) / fps)} | ${e.kind} | ${e.kind === "screen-push" ? e.words.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(" ") : e.kind === "liquid-glass" ? `${e.title} ${e.prefix}${e.endValue}${e.suffix} ${e.lineColour}` : `${e.style}: ${e.start.big} → ${e.end.big}; face x ${e.faceX.toFixed(2)} w ${e.faceWidth.toFixed(2)} eyes ${e.eyeY.toFixed(2)}`} |`), ""]
    : []),
  ...(notes.length ? ["## Notes", "", ...notes.map((n) => `- ${n}`), ""] : []),
];
writeFileSync(join("jobs", job, "edit.md"), lines.join("\n"));
for (const n of notes) console.warn(`⚠ ${n}`);
console.log(`✔ jobs/${job}/.edl.resolved.json: ${(total / fps).toFixed(2)} s, ${segs.length} segments, ${cues.length} cues; voice public/${voiceRel}`);
