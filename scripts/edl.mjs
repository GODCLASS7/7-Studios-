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

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findBeats } from "./lib/beats.mjs";
import { diskPath, ff, FORMAT_SIZE, mapBox, norm, parseArgs, readJson, ts, videoInfo, writeJson } from "./lib/media.mjs";

const { pos } = parseArgs(process.argv.slice(2));
const [job] = pos;
const edl = readJson(join("jobs", job || "", "edl.json"));
if (!edl) {
  console.error("Usage: node scripts/edl.mjs <job>   (needs jobs/<job>/edl.json; run autocut first)");
  process.exit(1);
}
const fps = edl.fps || 30;
const notes_early = [];

// Brand kit: public/brands/<slug>/brand.json, chosen with "brand": "<slug>". Its
// look, grade and caption colour are defaults; anything set in edl.json wins.
let brandKit = null;
if (edl.brand) {
  brandKit = readJson(join("public", "brands", edl.brand, "brand.json"));
  if (!brandKit) throw new Error(`Brand kit not found: public/brands/${edl.brand}/brand.json`);
  edl.look ??= brandKit.look;
  edl.grade ??= brandKit.grade;
  edl.captions = { ...(brandKit.captions || {}), ...(edl.captions || {}) };
}
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
// Voice cleanup ("audio": { "clean": "light" | "strong" }), after the cuts so the
// noise profile is the same everywhere: rumble cut, denoise, a touch of presence,
// de-ess, gentle compression, peak limit. Loudness is still set later by loudnorm.
const CLEAN = {
  // Measured on speech-like audio with pink noise and mains hum: the noise between words
  // drops from 22 dB below the voice to 35 dB (light) / 42 dB (strong).
  light: "highpass=f=80,afftdn=nr=20:nf=-30:tn=1,equalizer=f=3200:t=q:w=1.2:g=2,deesser=i=0.3,acompressor=threshold=-22dB:ratio=2.5:attack=12:release=180:makeup=2,agate=threshold=0.03:ratio=3:attack=5:release=220:range=0.2,alimiter=limit=0.89",
  strong: "highpass=f=90,afftdn=nr=24:nf=-32:tn=1,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=3,deesser=i=0.5,acompressor=threshold=-22dB:ratio=3:attack=10:release=180:makeup=2,agate=threshold=0.03:ratio=4:attack=5:release=180:range=0.1,alimiter=limit=0.89",
};
const clean = edl.audio?.clean;
if (clean && !CLEAN[clean]) throw new Error(`audio.clean must be "light" or "strong" (or false)`);
filters.push(`${segs.map((_, k) => `[a${k}]`).join("")}concat=n=${segs.length}:v=0:a=1${clean ? `,${CLEAN[clean]}` : ""}[out]`);
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
// Music beats ("music": { "file", "snap": true }): visual moments land on the nearest
// beat within a quarter second. Speech-timed things (captions, punch words,
// screen-push words, cuts) never move.
let beatFrames = [];
let beatInfo = null;
if (edl.music?.file && edl.music.snap) {
  const cache = join("jobs", job, `beats-${edl.music.file.split("/").pop()}.json`);
  const b = readJson(cache) || findBeats(diskPath(edl.music.file));
  if (b) {
    beatInfo = b;
    writeJson(cache, b);
    const off = Number(edl.music.offset || 0);
    beatFrames = b.beats.map((t) => Math.round((t - off) * fps)).filter((f) => f >= 0);
    if (b.confidence < 0.3) notes_early.push(`Music beat is weak (confidence ${b.confidence}); snapping may look random.`);
  }
}
const snapF = (f) => {
  if (!beatFrames.length) return f;
  let best = f;
  let d = Math.round(0.25 * fps) + 1;
  for (const b of beatFrames) if (Math.abs(b - f) < d) (d = Math.abs(b - f)), (best = b);
  return best;
};

const overlays = (edl.overlays || []).map((o) => {
  const seg = o.atPhrase ? segs.find((s) => s.phrase.split("+").includes(o.atPhrase)) : null;
  const from = snapF(seg ? seg.from : Math.round((o.at || 0) * fps));
  return { ...o, from, durationInFrames: Math.round((o.seconds || 2.5) * fps) };
});

// Talking-head effects (src/effects). Each starts at `at` (output seconds), `atPhrase`
// (a phrase ID) or `atWord` (the first time a word or phrase is said in the edit).
const OUT = FORMAT_SIZE[edl.format] || FORMAT_SIZE["9x16"];

// Framing from face tracks (npm run track): each segment gets the head box for
// its own stretch of time, and when source and edit differ in shape the crop
// follows the face (eyes about a third down), panning gently within a segment.
// A segment's or source's hand-set "focus" always wins.
const srcInfo = {};
const infoOf = (file) => (srcInfo[file] ??= videoInfo(diskPath(file)));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};
for (const s of segs) {
  const src = edl.sources[s.source];
  const tr = src.track ? readJson(src.track) : null;
  const manual = s.focus || src.focus;
  if (!tr) continue;
  const a = s.inF / fps;
  const b = s.outF / fps;
  const inSeg = tr.samples.filter((x) => x.head && x.t >= a - 0.1 && x.t <= b + 0.1);
  if (!inSeg.length) continue;
  s.faceBox = [0, 1, 2, 3].map((j) => Number(median(inSeg.map((x) => x.head[j])).toFixed(4)));
  if (manual) continue;
  const info = infoOf(s.file);
  const sc = Math.max(OUT[0] / info.width, OUT[1] / info.height);
  const dispW = info.width * sc;
  const dispH = info.height * sc;
  const fx = (cx) => (dispW > OUT[0] + 1 ? clamp01((OUT[0] / 2 - cx * dispW) / (OUT[0] - dispW)) : 0.5);
  const fy = (ey) => (dispH > OUT[1] + 1 ? clamp01((0.33 * OUT[1] - ey * dispH) / (OUT[1] - dispH)) : 0.4);
  const keys = inSeg.map((x) => {
    const f = x.face || x.head;
    return [Math.max(0, Math.round((x.t - a) * fps)), fx(x.head[0] + x.head[2] / 2), fy(f[1] + 0.4 * f[3])];
  });
  // Smooth over about a second, so the crop drifts with the speaker instead of chasing them.
  const sm = keys.map((k, i) => {
    const win = keys.slice(Math.max(0, i - 3), i + 4);
    return [k[0], win.reduce((t, w) => t + w[1], 0) / win.length, win.reduce((t, w) => t + w[2], 0) / win.length];
  });
  const xs = sm.map((k) => k[1]);
  s.autoFocus = [Number(median(xs).toFixed(4)), Number(median(sm.map((k) => k[2])).toFixed(4))];
  if (Math.max(...xs) - Math.min(...xs) > 0.03) s.focusTrack = sm.map((k) => [k[0], Number(k[1].toFixed(4)), Number(k[2].toFixed(4))]);
}
const focusOf = (s) => [s.focus?.[0] ?? edl.sources[s.source].focus?.[0] ?? s.autoFocus?.[0] ?? 0.5, s.focus?.[1] ?? edl.sources[s.source].focus?.[1] ?? s.autoFocus?.[1] ?? 0.4];
const faceBoxOf = (s) => s.faceBox || edl.sources[s.source].faceBox || null;
// The head on the output frame (pixels), for placing words behind it.
const headOut = (s) => {
  const box = faceBoxOf(s);
  if (!box) return null;
  const [fX, fY] = focusOf(s);
  return mapBox(box, infoOf(s.file), OUT, fX, fY, s.zoom || 1);
};
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
const faceAt = (frame) => {
  const s = segs.find((x) => frame >= x.from && frame < x.from + x.durationInFrames) || segs[0];
  const r = headOut(s);
  if (!r) return null;
  return { faceX: (r.x1 + r.x2) / 2 / OUT[0], faceWidth: (r.x2 - r.x1) / OUT[0], eyeY: (r.y1 + 0.4 * (r.y2 - r.y1)) / OUT[1] };
};
const notes = [...notes_early];
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
      kind: "liquid-glass", from: snapF(Math.round(at * fps)), durationInFrames: Math.ceil((0.18 + draw + hold + 0.35) * fps),
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
    const from = snapF(Math.round(at * fps));
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

// B-roll cutaways: other footage over the speaker while the voice carries on
// ("broll": [{ "file", "atWord" | "atPhrase" | "at", "seconds", "from": <seconds into the clip>, "zoom" }]).
const broll = (edl.broll || []).map((b) => {
  if (!b.file) throw new Error("broll: every cutaway needs a file (under public/)");
  if (!existsSync(diskPath(b.file))) throw new Error(`broll: ${b.file} not found under public/`);
  const at = startOf({ kind: "broll", ...b });
  const from = Math.round(at * fps);
  const len = Math.round((b.seconds || 2.5) * fps);
  const clipLen = Math.floor(infoOf(b.file).duration * fps) - Math.round((b.from || 0) * fps);
  if (clipLen < len) notes.push(`broll ${b.file}: the clip has ${(clipLen / fps).toFixed(1)} s after "from", shorter than the ${(len / fps).toFixed(1)} s asked; it will hold its last frame.`);
  return { src: b.file.replace(/^public\//, ""), from, durationInFrames: Math.min(len, total - from), trimBefore: Math.round((b.from || 0) * fps), zoom: b.zoom || 1, credit: b.credit || null };
});
const inBroll = (f) => broll.some((b) => f >= b.from && f < b.from + b.durationInFrames);

// Looks ("classic", "bold", "cool-girl", "cool-dude"): one default, switched per
// section by "sections": [{ atWord | atPhrase | at, look }]. A section runs until the next.
const LOOKS = ["classic", "bold", "cool-girl", "cool-dude"];
const lookOf = (l) => {
  if (!LOOKS.includes(l)) throw new Error(`Unknown look "${l}" (${LOOKS.join(", ")})`);
  return l;
};
const defaultLook = lookOf(edl.look || "classic");
const cuts = (edl.sections || []).map((sec) => ({ from: snapF(Math.round(startOf({ kind: "section", ...sec }) * fps)), look: lookOf(sec.look) })).sort((a, b) => a.from - b.from);
const lookRanges = [];
let lf = 0;
let curLook = defaultLook;
for (const c of cuts) {
  if (c.from > lf) lookRanges.push({ from: lf, to: c.from, look: curLook });
  lf = c.from;
  curLook = c.look;
}
lookRanges.push({ from: lf, to: total, look: curLook });
const lookAt = (f) => lookRanges.find((r) => f >= r.from && f < r.to)?.look || defaultLook;
const needsMatte = lookRanges.some((r) => r.look !== "classic") || (edl.inserts || []).some((i) => i.layer === "behind");
const missingMatte = Object.entries(edl.sources).filter(([, src]) => !src.matte).map(([k]) => k);
if (needsMatte && missingMatte.length) notes.push(`No cutout yet for source(s) ${missingMatte.join(", ")}: big words and "behind" inserts will sit in front instead. Run: npm run matte -- ${job}`);

// Punch words: the emphasis words, or (punch "auto") one strong word per cue, at most one every 2.2 s.
const STOP = new Set("about after again also because before being could every first from have here just like make many more most much only other over really should some than that their them then there these they thing think this those through very what when where which while with would your yours".split(" "));
const punchMode = cap.punch || (defaultLook === "classic" ? "emphasis" : "auto");
const emph = new Set((cap.emphasis || []).map((w) => norm(w)));
const punches = [];
const bigHead = [];
let lastPunch = -1e9;
for (const c of cues) {
  const f = Math.round((c.startMs / 1000) * fps);
  const look = lookAt(f);
  if (look === "classic" || punchMode === "none") continue;
  // Auto picks skip contractions ("here's", "don't") and the word just used.
  const cands = c.words.filter(
    (w) => emph.has(norm(w.text)) || (punchMode === "auto" && norm(w.text).length >= 5 && !STOP.has(norm(w.text)) && !norm(w.text).includes("'") && norm(w.text) !== norm(punches[punches.length - 1]?.text || "")),
  );
  const marked = cands.some((x) => emph.has(norm(x.text)));
  if (!cands.length || (!marked && c.startMs - lastPunch < 2200)) continue; // emphasis words always get their moment
  const w = cands.find((x) => emph.has(norm(x.text))) || [...cands].sort((a, b) => norm(b.text).length - norm(a.text).length)[0];
  // Behind the head: the word crosses the top of the head (15% down it), when the head is known.
  const seg = segs.find((x) => f >= x.from && f < x.from + x.durationInFrames);
  const head = seg ? headOut(seg) : null;
  const y = head ? Math.min(0.4, Math.max(0.12, (head.y1 + 0.15 * (head.y2 - head.y1)) / OUT[1])) : null;
  punches.push({ text: w.text.replace(/[.,!?;:]+$/, ""), startMs: w.startMs, endMs: Math.max(w.endMs + 700, w.startMs + 1100), look, cueStartMs: c.startMs, cueEndMs: c.endMs, ...(y ? { y: Number(y.toFixed(3)) } : {}) });
  // A head wider than half the frame hides the middle of a word set behind it.
  if (head && (head.x2 - head.x1) / OUT[0] > 0.5) bigHead.push([w.text.replace(/[.,!?;:]+$/, ""), (head.x2 - head.x1) / OUT[0]]);
  lastPunch = c.startMs;
}

if (bigHead.length)
  notes.push(
    `Punch words behind a big head (up to ${Math.round(Math.max(...bigHead.map((b) => b[1])) * 100)}% of the frame width): ${bigHead.map((b) => b[0]).join(", ")}. The head hides the middle of each word; check them in a frame. Frame wider (camera further back, less zoom), choose shorter punch words, or use "classic" for those sections.`,
  );
// No punch word behind the head while a cutaway hides the head.
for (let k = punches.length - 1; k >= 0; k--) if (inBroll(Math.round((punches[k].startMs / 1000) * fps))) punches.splice(k, 1);
// A punch word never competes with an insert placed behind the speaker.
const behindIns = (edl.inserts || []).filter((i) => i.layer === "behind").map((i) => {
  const at = startOf({ kind: i.kind, ...i });
  return [at * 1000, (at + (i.seconds || 3)) * 1000];
});
for (let k = punches.length - 1; k >= 0; k--) if (behindIns.some(([a, b]) => punches[k].endMs > a && punches[k].startMs < b)) punches.splice(k, 1);

// Orbiting reels (cool-girl): your own reels, or other creators' with their @handle shown.
const orbit = (edl.orbit || []).map((o) => {
  if (o.own === false && !o.credit) throw new Error(`orbit: ${o.file} isn't yours, so it needs "credit": "@handle"`);
  return { src: o.file, credit: o.own === false ? o.credit : o.credit || null, image: /\.(png|jpe?g|webp)$/i.test(o.file) };
});

// Inserts (src/inserts): app window, profile follow, file scroll.
const INSERTS = ["app-window", "profile-follow", "file-scroll"];
const inserts = (edl.inserts || []).map((i) => {
  if (!INSERTS.includes(i.kind)) throw new Error(`Unknown insert "${i.kind}" (${INSERTS.join(", ")})`);
  if (i.credit === undefined && i.own === false) throw new Error(`insert ${i.kind}: someone else's content needs "credit": "@handle"`);
  const at = startOf({ kind: i.kind, ...i });
  return {
    kind: i.kind,
    from: snapF(Math.round(at * fps)),
    durationInFrames: Math.round((i.seconds || 3) * fps),
    layer: i.layer === "behind" ? "behind" : "front",
    x: i.x ?? 0.5,
    y: i.y ?? (i.layer === "behind" ? 0.3 : 0.32),
    w: i.w ?? (i.layer === "behind" ? 0.86 : 0.78),
    credit: i.credit || null,
    data: i.data || {},
  };
});

// Sound effects: "auto" puts subtle ones on punch words, inserts, look changes and effects,
// or list them yourself: [{ at, sound, volume }]. Always well under the voice.
const SFX = { pop: "audio/sfx/pop.wav", whoosh: "audio/sfx/whoosh.wav", click: "audio/sfx/click.wav", shimmer: "audio/sfx/shimmer.wav", tick: "audio/sfx/tick.wav", riser: "audio/sfx/riser.wav" };
let sfx = [];
if (edl.sfx === "auto") {
  for (const p of punches) sfx.push({ from: Math.round((p.startMs / 1000) * fps) - 1, sound: p.look === "cool-girl" ? "shimmer" : "pop" });
  for (const i of inserts) sfx.push({ from: i.from, sound: "whoosh" }, ...(i.kind === "profile-follow" ? [{ from: i.from + Math.round(1.4 * fps), sound: "click" }] : []));
  for (const c of cuts) sfx.push({ from: c.from, sound: "whoosh" });
  for (const e of effects) sfx.push({ from: e.from + (e.kind === "shoulder-zoom" ? Math.round(2.4 * fps) : 0), sound: e.kind === "screen-push" ? "tick" : "whoosh" });
} else if (Array.isArray(edl.sfx)) {
  sfx = edl.sfx.map((x) => ({ from: Math.round(Number(x.at) * fps), sound: x.sound, volume: x.volume }));
}
sfx = sfx
  .filter((x) => x.from >= 0 && x.from < total)
  .map((x) => {
    if (!SFX[x.sound]) throw new Error(`Unknown sound "${x.sound}" (${Object.keys(SFX).join(", ")})`);
    return { from: x.from, src: SFX[x.sound], volume: Math.min(0.35, x.volume ?? 0.22) };
  });
if (sfx.length && !existsSync(join("public", "audio", "sfx", "pop.wav"))) notes.push("Sound effects are listed but not built yet. Run: npm run sfx");

const fam = (f, fallback) => (f?.family ? `"${f.family}", ${fallback}` : fallback);
const brand = brandKit
  ? {
      name: brandKit.name,
      accent: brandKit.colors?.accent || "#E8B44A",
      punch: brandKit.colors?.punch || "#FFD60A",
      text: brandKit.colors?.text || "#F4EFE6",
      background: brandKit.colors?.background || "#0B0B0D",
      displayFont: fam(brandKit.fonts?.display, "Inter, Helvetica, Arial, sans-serif"),
      serifFont: fam(brandKit.fonts?.serif, "Fraunces, Georgia, serif"),
      fonts: Object.values(brandKit.fonts || {})
        .filter((f) => f.file)
        .map((f) => ({ family: f.family, src: `brands/${edl.brand}/${f.file}`, ...(f.weight ? { weight: f.weight } : {}), ...(f.style ? { style: f.style } : {}) })),
      logo: brandKit.logo ? `brands/${edl.brand}/${brandKit.logo}` : null,
      wordmark: brandKit.wordmark || brandKit.name,
      endCard: brandKit.endCard && edl.endCard !== false ? { seconds: brandKit.endCard.seconds ?? 2.5, line: brandKit.endCard.line || "", sub: brandKit.endCard.sub || "" } : null,
    }
  : null;
// The end card plays after the last word, not over it.
const endFrames = brand?.endCard ? Math.round(brand.endCard.seconds * fps) : 0;

const props = {
  job,
  version: edl.version,
  fps,
  durationInFrames: total + endFrames,
  voice: voiceRel,
  brand,
  segments: segs.map((s) => ({
    src: s.file,
    from: s.from,
    durationInFrames: s.durationInFrames,
    trimBefore: s.inF,
    zoom: s.zoom || 1,
    push: s.push || 0,
    focusX: focusOf(s)[0],
    focusY: focusOf(s)[1],
    focusTrack: s.focusTrack || null,
    faceBox: faceBoxOf(s),
    matte: edl.sources[s.source].matte || null,
  })),
  looks: lookRanges,
  punches,
  orbit,
  inserts,
  sfx,
  cues: cap.style === "none" ? [] : cues,
  captions: { style: cap.style || "pop", position: cap.position ?? 0.66, uppercase: cap.uppercase ?? true, highlight: cap.highlight || "#E8B44A", size: cap.size || 1, emphasis: cap.emphasis || [] },
  grade: edl.grade || "none",
  overlays,
  music: edl.music ? { src: edl.music.file.replace(/^public\//, ""), volume: edl.music.volume ?? 0.12, duck: edl.music.duck ?? 0.35, outro: edl.music.outro ?? 2, trimBefore: Math.round(Number(edl.music.offset || 0) * fps) } : null,
  broll,
  speech,
  effects,
  faceBoxes: Object.fromEntries(Object.entries(edl.sources).filter(([, s]) => s.faceBox).map(([k, s]) => [k, s.faceBox])),
  cutSources: segs.map((s) => s.source),
};
writeJson(join("jobs", job, ".edl.resolved.json"), props);

const lines = [
  `# Edit v${edl.version} — ${job}`,
  "",
  `${(total / fps).toFixed(2)} s${endFrames ? ` + ${(endFrames / fps).toFixed(1)} s end card` : ""} · ${segs.length} segments · ${cues.length} caption cues · voice track \`public/${voiceRel}\``,
  "",
  "| Out | Source | Source time | Zoom | Text |",
  "|---|---|---|---|---|",
  ...segs.map((s) => `| ${ts(s.from / fps)} | ${s.source} (${s.phrase}) | ${ts(s.inF / fps)}–${ts(s.outF / fps)} | ${s.zoom || 1}× | ${s.text || ""} |`),
  "",
  ...(effects.length
    ? ["## Effects", "", "| In | Out | Effect | Detail |", "|---|---|---|---|", ...effects.map((e) => `| ${ts(e.from / fps)} | ${ts((e.from + e.durationInFrames) / fps)} | ${e.kind} | ${e.kind === "screen-push" ? e.words.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(" ") : e.kind === "liquid-glass" ? `${e.title} ${e.prefix}${e.endValue}${e.suffix} ${e.lineColour}` : `${e.style}: ${e.start.big} → ${e.end.big}; face x ${e.faceX.toFixed(2)} w ${e.faceWidth.toFixed(2)} eyes ${e.eyeY.toFixed(2)}`} |`), ""]
    : []),
  ...(lookRanges.length > 1 || defaultLook !== "classic" ? ["## Looks", "", ...lookRanges.map((r) => `- ${ts(r.from / fps)}–${ts(r.to / fps)}: **${r.look}**`), ""] : []),
  ...(punches.length ? ["## Punch words", "", punches.map((p) => `${ts(p.startMs / 1000)} **${p.text}** (${p.look})`).join(" · "), ""] : []),
  ...(inserts.length ? ["## Inserts", "", ...inserts.map((i) => `- ${ts(i.from / fps)}–${ts((i.from + i.durationInFrames) / fps)}: ${i.kind} (${i.layer})${i.credit ? `, credit ${i.credit}` : ""}`), ""] : []),
  ...(broll.length ? ["## B-roll", "", ...broll.map((b) => `- ${ts(b.from / fps)}–${ts((b.from + b.durationInFrames) / fps)}: ${b.src}`), ""] : []),
  ...(brand || clean || edl.music?.file
    ? [
        "## Sound and brand",
        "",
        ...(brand ? [`- Brand: ${brand.name}${brand.endCard ? `; end card ${brand.endCard.seconds} s after the last word ("${brand.endCard.line}")` : ""}`] : []),
        ...(clean ? [`- Voice cleanup: ${clean}`] : []),
        ...(edl.music?.file
          ? [`- Music: ${edl.music.file} at ${props.music.volume}, ducked to ${props.music.duck} under speech${beatInfo ? `; ${beatInfo.bpm} BPM, beat confidence ${beatInfo.confidence}, graphics snapped to the nearest of ${beatFrames.length} beats` : ""}`]
          : []),
        "",
      ]
    : []),
  ...(sfx.length ? ["## Sound effects", "", sfx.map((x) => `${ts(x.from / fps)} ${x.src.split("/").pop().replace(".wav", "")}`).join(" · "), ""] : []),
  ...(notes.length ? ["## Notes", "", ...notes.map((n) => `- ${n}`), ""] : []),
];
writeFileSync(join("jobs", job, "edit.md"), lines.join("\n"));
for (const n of notes) console.warn(`⚠ ${n}`);
console.log(`✔ jobs/${job}/.edl.resolved.json: ${(total / fps).toFixed(2)} s${endFrames ? ` + ${(endFrames / fps).toFixed(1)} s end card` : ""}, ${segs.length} segments, ${cues.length} cues; voice public/${voiceRel}`);
