#!/usr/bin/env node
// Make a synthetic talking-head take plus its transcript, to test the footage
// edit pipeline without a camera or a paid transcription call.
//
//   node scripts/test/footage-fixture.mjs <job> [--vertical]
//
// --vertical makes a 1080×1920 phone-style take (head about 30% of the width,
// eyes a quarter down), the framing the shoulder-zoom effect expects.
// --photo=<image> builds a vertical take from a real photo of a person instead,
// with a slow camera drift, to test the background cutout (scripts/matte.mjs).
// --script=<file> voices your own text instead of the built-in lines ("…" = a long pause).
// --photo=<image> --wide makes it 16:9 instead, with the speaker moving across
// the frame, to test face tracking and automatic reframing (scripts/track.mjs).
// Writes public/jobs/<job>/footage/take-a.mp4 (1920×1080, 30 fps): a presenter
// silhouette with the SOURCE timecode burned in, so every cut can be checked by
// eye, and a "voice" of tone bursts, one per word, with fillers (um, uh), a
// false start, a long pause and room tone. The matching word timings are written
// in ElevenLabs JSON format to jobs/<job>/fixtures/take-a.elevenlabs.json, to
// exercise `transcribe --from=…`.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ff, writeJson } from "../lib/media.mjs";

const job = process.argv[2];
const photo = process.argv.find((a) => a.startsWith("--photo="))?.slice(8);
const wide = photo && process.argv.includes("--wide");
const vertical = (photo && !wide) || process.argv.includes("--vertical");
if (!job) {
  console.error("Usage: node scripts/test/footage-fixture.mjs <job>");
  process.exit(1);
}
const scriptFile = process.argv.find((a) => a.startsWith("--script="))?.slice(9);
const script = scriptFile
  ? readFileSync(scriptFile, "utf8").replace(/\s+/g, " ").trim()
  : "So um the hardest part of waiting is … uh … The hardest part of waiting is not knowing when it ends. " +
  "But here's what I learned. Um. Waiting is not wasting. God is working in the wait. … " +
  "So if you're in a season of waiting today, uh, don't give up. Keep showing up.";

// Word timings: length-based durations, short gaps, longer pauses at punctuation and "…".
const words = [];
let t = 0.6;
for (const raw of script.split(/\s+/)) {
  if (raw === "…") {
    t += 1.3;
    continue;
  }
  const d = 0.14 + 0.05 * raw.replace(/\W/g, "").length;
  words.push({ text: raw, start: Number(t.toFixed(3)), end: Number((t + d).toFixed(3)), type: "word", speaker_id: "speaker_0" });
  t += d + (/[.!?]$/.test(raw) ? 0.55 : /,$/.test(raw) ? 0.3 : 0.07);
}
const total = Number((t + 0.8).toFixed(2));

// Voice: harmonic tone bursts with a 15 ms envelope, pitch varying per word; low room tone throughout.
const rate = 48000;
const n = Math.round(total * rate);
const pcm = new Int16Array(n);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let i = 0; i < n; i++) pcm[i] = Math.round(rnd() * 90);
words.forEach((w, k) => {
  const f0 = 120 + ((k * 37) % 60) + (/^(um|uh)/i.test(w.text) ? -25 : 0);
  const a = Math.round(w.start * rate);
  const b = Math.round(w.end * rate);
  for (let i = a; i < b && i < n; i++) {
    const x = (i - a) / rate;
    const env = Math.min(1, x / 0.015, (b - i) / rate / 0.015);
    const s = Math.sin(2 * Math.PI * f0 * x) * 0.5 + Math.sin(2 * Math.PI * f0 * 2 * x) * 0.3 + Math.sin(2 * Math.PI * f0 * 3.1 * x) * 0.15;
    pcm[i] = Math.max(-32767, Math.min(32767, pcm[i] + Math.round(s * env * 9000)));
  }
});
const tmp = join("production", "tmp");
mkdirSync(tmp, { recursive: true });
const wav = join(tmp, `${job}-voice.wav`);
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + n * 2, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(n * 2, 40);
writeFileSync(wav, Buffer.concat([header, Buffer.from(pcm.buffer)]));

// Picture: one presenter frame (head + shoulders), then the source timecode burned in.
const still = join(tmp, `${job}-presenter.png`);
const geq =
  "lum='if(lt(pow((X-960)/150,2)+pow((Y-430)/190,2),1),170,if(lt(pow((X-960)/430,2)+pow((Y-1020)/330,2),1),120,40+20*Y/H))':cb=128:cr='if(lt(pow((X-960)/150,2)+pow((Y-430)/190,2),1),142,128)'";
const geqV =
  "lum='if(lt(pow((X-540)/165,2)+pow((Y-560)/205,2),1),170,if(lt(pow((X-540)/430,2)+pow((Y-1330)/400,2),1),120,40+20*Y/H))':cb=128:cr='if(lt(pow((X-540)/165,2)+pow((Y-560)/205,2),1),142,128)'";
let r = wide
  ? // A 2400×1080 canvas with the speaker in the middle; the crop below moves across it.
    ff(["-i", photo, "-i", photo, "-filter_complex", "[0]scale=2400:2400,crop=2400:1080,gblur=sigma=40[bg];[1]scale=1080:1080[fg];[bg][fg]overlay=x=660:y=0,format=yuv420p", "-frames:v", "1", still])
  : photo
  ? // The photo, sharp, at the bottom of a 9:16 frame over a blurred copy of itself.
    ff(["-i", photo, "-i", photo, "-filter_complex", "[0]scale=1920:1920,crop=1080:1920,gblur=sigma=40[bg];[1]scale=1400:1400[fg];[bg][fg]overlay=x=-75:y=520,format=yuv420p", "-frames:v", "1", still])
  : ff(["-f", "lavfi", "-i", `color=c=black:s=${vertical ? "1080x1920" : "1920x1080"}`, "-frames:v", "1", "-vf", `format=yuv444p,geq=${vertical ? geqV : geq}`, still]);
if (r.status !== 0) throw new Error(r.stderr);
// A photo gets a slow drift and breathing zoom, so the cutout is tested on moving footage.
const drift = wide
  ? "crop=1920:1080:x='240+240*sin(t/3)':y=0,"
  : photo
    ? "scale=1188:2112,crop=1080:1920:x='54+40*sin(t/2.1)':y='96+36*sin(t/2.9)',"
    : "";
const out = join("public", "jobs", job, "footage", "take-a.mp4");
mkdirSync(join("public", "jobs", job, "footage"), { recursive: true });
const font = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf";
r = ff([
  "-loop", "1", "-framerate", "30", "-i", still, "-i", wav, "-t", String(total),
  "-vf", `${drift}drawtext=fontfile=${font}:text='TAKE A  %{pts\\:hms}':x=60:y=60:fontsize=54:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=14,format=yuv420p`,
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-shortest", out,
]);
if (r.status !== 0) throw new Error(r.stderr);
writeJson(join("jobs", job, "fixtures", "take-a.elevenlabs.json"), { language_code: "en", text: script, words });
console.log(`✔ ${out} (${total} s, ${words.length} words) + jobs/${job}/fixtures/take-a.elevenlabs.json`);
