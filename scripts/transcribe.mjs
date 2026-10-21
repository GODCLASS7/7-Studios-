#!/usr/bin/env node
// Word-level transcripts for footage, voiceover or songs.
//
//   node scripts/transcribe.mjs <job> <media...> [--engine=elevenlabs|whisper] [--lang=en] [--model=…] [--keyterms="Wait Culture,Isaiah"]
//   node scripts/transcribe.mjs <job> <media> --from=<file.json|.srt|.lrc>      import a transcript you already have
//   node scripts/transcribe.mjs <job> <media> --align=<text file>              forced alignment of known text (lyrics, scripts)
//
// Engines:
//   elevenlabs (default if ELEVENLABS_API_KEY is set): Scribe speech-to-text, with
//     word timestamps, speaker labels and audio events such as (laughter). Paid per
//     minute of audio. --align uses ElevenLabs forced alignment instead.
//   whisper: whisper.cpp on this computer via @remotion/install-whisper-cpp. Free;
//     downloads the model once (from Hugging Face) into production/whisper/.
//
// Writes jobs/<job>/transcripts/<source>.json in one format for every engine:
//   { source, engine, language, duration, approx?, words: [{ text, start, end, type: "word"|"event", speaker? }] }
// Times are in seconds from the start of the source file.

import { existsSync, mkdirSync, openAsBlob, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { duration, ff, loadEnv, parseArgs, publicRel, transcriptPath, writeJson } from "./lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [job, ...media] = pos;
if (!job || !media.length) {
  console.error("Usage: node scripts/transcribe.mjs <job> <media...> [--engine=elevenlabs|whisper] [--from=file] [--align=text.txt] [--lang=en]");
  process.exit(1);
}
loadEnv();
const engine = opt.from ? "import" : opt.align ? "align" : opt.engine || (process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "whisper");
const tmp = join("production", "tmp");
mkdirSync(tmp, { recursive: true });

// Audio only, mono: smaller uploads and the 16 kHz WAV whisper.cpp needs.
const extractAudio = (file, ext = "flac") => {
  const out = join(tmp, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
  const r = ff(["-i", file, "-vn", "-ac", "1", "-ar", "16000", ...(ext === "wav" ? ["-c:a", "pcm_s16le"] : []), out]);
  if (r.status !== 0) throw new Error(`Could not read audio from ${file}: ${r.stderr}`);
  return out;
};

const eleven = async (path, form) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Set ELEVENLABS_API_KEY in .env (see providers.md §6). Never paste the key into chat.");
  const res = await fetch(`https://api.elevenlabs.io/v1/${path}`, { method: "POST", headers: { "xi-api-key": key }, body: form });
  if (!res.ok) {
    const body = await res.text();
    const hint =
      res.status === 401 || res.status === 403
        ? " Check the key has Speech to Text access (ElevenLabs → API keys → Edit)."
        : "";
    throw new Error(`ElevenLabs ${path} failed (${res.status}).${hint} ${body.slice(0, 300)}`);
  }
  return res.json();
};

const fromElevenWords = (words) =>
  words
    .filter((w) => w.type !== "spacing")
    .map((w) => ({
      text: w.text.trim(),
      start: Number(w.start),
      end: Number(w.end),
      type: w.type === "audio_event" ? "event" : "word",
      ...(w.speaker_id ? { speaker: w.speaker_id } : {}),
    }))
    .filter((w) => w.text);

const viaElevenLabs = async (file) => {
  const audio = extractAudio(file);
  const form = new FormData();
  form.append("model_id", opt.model || process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  form.append("file", await openAsBlob(audio), "audio.flac");
  form.append("timestamps_granularity", "word");
  form.append("diarize", "true");
  form.append("tag_audio_events", "true");
  if (opt.lang) form.append("language_code", opt.lang);
  for (const k of String(opt.keyterms || "").split(",").map((s) => s.trim()).filter(Boolean)) form.append("keyterms", k);
  const j = await eleven("speech-to-text", form);
  rmSync(audio, { force: true });
  return { language: j.language_code, words: fromElevenWords(j.words || []) };
};

const viaAlign = async (file) => {
  const text = readFileSync(opt.align, "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .replace(/[|*]/g, " ");
  const audio = extractAudio(file);
  const form = new FormData();
  form.append("file", await openAsBlob(audio), "audio.flac");
  form.append("text", text);
  const j = await eleven("forced-alignment", form);
  rmSync(audio, { force: true });
  return { language: opt.lang, loss: j.loss, words: (j.words || []).map((w) => ({ text: w.text.trim(), start: w.start, end: w.end, type: "word", loss: w.loss })).filter((w) => w.text) };
};

const viaWhisper = async (file) => {
  const { downloadWhisperModel, installWhisperCpp, toCaptions, transcribe } = await import("@remotion/install-whisper-cpp");
  const to = resolve("production/whisper");
  const version = process.env.WHISPER_CPP_VERSION || "1.5.5";
  const model = opt.model || "medium.en";
  await installWhisperCpp({ to, version, printOutput: false });
  await downloadWhisperModel({ folder: to, model, printOutput: false });
  const audio = extractAudio(file, "wav");
  const out = await transcribe({ inputPath: resolve(audio), whisperPath: to, whisperCppVersion: version, model, tokenLevelTimestamps: true, splitOnWord: true, language: opt.lang || null });
  rmSync(audio, { force: true });
  const { captions } = toCaptions({ whisperCppOutput: out });
  return {
    language: out.result?.language,
    words: captions
      .map((c) => ({ text: c.text.trim(), start: c.startMs / 1000, end: c.endMs / 1000, type: /^\[.*\]$|^\(.*\)$/.test(c.text.trim()) ? "event" : "word" }))
      .filter((w) => w.text),
  };
};

// Imports: our own format, ElevenLabs JSON, Remotion Caption[] JSON, SRT (cue-level) or LRC (line-level).
const time = (s) => {
  const m = s.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`) : NaN;
};
const spread = (text, start, end) => {
  const words = text.split(/\s+/).filter(Boolean);
  const step = (end - start) / Math.max(1, words.length);
  return words.map((w, i) => ({ text: w, start: start + i * step, end: start + (i + 1) * step, type: "word" }));
};
const viaImport = (file) => {
  const src = readFileSync(opt.from, "utf8");
  if (opt.from.endsWith(".json")) {
    const j = JSON.parse(src);
    if (Array.isArray(j)) return { words: j.map((c) => ({ text: c.text.trim(), start: c.startMs / 1000, end: c.endMs / 1000, type: "word" })).filter((w) => w.text) };
    if (j.words?.[0]?.start !== undefined && j.engine) return j;
    return { language: j.language_code, words: fromElevenWords(j.words || []) };
  }
  if (opt.from.endsWith(".srt") || opt.from.endsWith(".vtt")) {
    const words = [];
    for (const block of src.replace(/\r/g, "").split(/\n\n+/)) {
      const lines = block.split("\n");
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) continue;
      const [a, b] = lines[i].split("-->").map(time);
      words.push(...spread(lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, ""), a, b));
    }
    return { approx: "word times spread evenly inside each subtitle cue", words };
  }
  if (opt.from.endsWith(".lrc")) {
    const rows = [...src.matchAll(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/gm)].map((m) => ({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() }));
    const total = duration(file);
    const words = rows.flatMap((r, i) => (r.text ? spread(r.text, r.t, Math.min(rows[i + 1]?.t ?? total, r.t + 6)) : []));
    return { approx: "LRC gives line starts; word times are spread across each line", lines: rows, words };
  }
  throw new Error(`Unsupported import format: ${opt.from}`);
};

for (const file of media) {
  if (!existsSync(file)) {
    console.error(`Not found: ${file}`);
    process.exit(1);
  }
  const t0 = Date.now();
  const run = { elevenlabs: viaElevenLabs, whisper: viaWhisper, import: viaImport, align: viaAlign }[engine];
  if (!run) {
    console.error(`Unknown engine "${engine}". Use elevenlabs or whisper.`);
    process.exit(1);
  }
  try {
    const r = await run(file);
    const out = transcriptPath(job, file);
    writeJson(out, { source: publicRel(file), engine, duration: duration(file), ...r, createdAt: new Date().toISOString() });
    const n = r.words.filter((w) => w.type === "word").length;
    console.log(`✔ ${out}: ${n} words via ${engine} in ${((Date.now() - t0) / 1000).toFixed(1)} s${r.approx ? ` (approximate: ${r.approx})` : ""}`);
  } catch (e) {
    console.error(`✖ ${file}: ${e.message}`);
    if (engine === "whisper") console.error("  Whisper needs git, a C compiler and access to huggingface.co for the model. On a locked-down network, use --engine=elevenlabs or --from=<transcript>.");
    process.exit(1);
  }
}
