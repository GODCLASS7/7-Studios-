#!/usr/bin/env node
// Regression tests: re-run the studio on its test material and compare with saved results.
//
//   npm test                          lint, checks, golden frames (about 3 min)
//   npm test -- --full                also renders every test edit and runs the cut check on it,
//                                     and re-runs face tracking (about 10 min more)
//   npm test -- --only=look-test,beats
//   npm test -- --update              save today's frames and picks as the new golden results,
//                                     after a change you meant to make (look at them first)
//   npm test -- --tolerance=0.3       % of pixels allowed to differ (default 0.15)
//
// The test material is synthetic, so a fresh copy of the project can run it: the
// footage fixture (a voice of tone bursts, a silhouette or a public-domain NASA
// portrait in scripts/test/assets), a music bed with a known tempo, and generic
// graphic reels. Anything missing is rebuilt first; the cut-out needs Python
// (it sets itself up). Golden frames are half-size JPEGs in tests/golden/; a frame
// passes when under --tolerance % of its pixels differ by more than an eighth of
// full brightness after a slight blur (so font smoothing on another computer
// doesn't count). A failed frame writes golden | now | difference to out/test/.
//
// Checks:
//   lint          eslint + tsc
//   beats         three music beds at 84, 100 and 128 BPM: tempo within 1.5 BPM, beats within 25 ms
//   edl           every test job builds its props, voice track and cue list
//   voice         voice cleanup (shorts-test-s1): voice at least 30 dB above the noise between words
//   shorts        the Shorts finder still picks the same clips from the long test talk
//   frames        golden frames of every test edit
//   track (full)  face found in at least 95% of the moving 16:9 test take
//   cutcheck (full) each test edit rendered and passed by the cut check
//
// Exits 1 if anything fails.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findBeats } from "../lib/beats.mjs";
import { parseArgs, pcm, readJson, writeJson } from "../lib/media.mjs";

const { opt } = parseArgs(process.argv.slice(2));
const ONLY = opt.only ? new Set(String(opt.only).split(",")) : null;
const want = (name) => !ONLY || ONLY.has(name);
const FULL = Boolean(opt.full);
const UPDATE = Boolean(opt.update);
const TOL = Number(opt.tolerance ?? 0.15);
const TMP = join("production", "tmp", "test");
const OUT = join("out", "test");
const GOLD = join("tests", "golden");
const MANIFEST = join(GOLD, "manifest.json");
const PHOTO = join("scripts", "test", "assets", "astronaut.png");
const CHROME = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const BROWSER = existsSync(CHROME) ? [`--browser-executable=${CHROME}`] : [];
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });
const manifest = readJson(MANIFEST, { jobs: {} });

// The test jobs. footageJob: whose fixture footage the job cuts from.
const JOBS = {
  "edit-test": { fixture: ["--vertical"] },
  "look-test": { fixture: [`--photo=${PHOTO}`], reels: true },
  "reframe-test": { fixture: [`--photo=${PHOTO}`, "--wide"] },
  "shorts-test-s1": { footageJob: "shorts-test", fixture: ["--vertical", "--script=jobs/shorts-test/talk.txt"] },
  "prelive-test": { footageJob: "reframe-test", fixture: [`--photo=${PHOTO}`, "--wide"], music: [100], broll: true },
  "lyric-test": { comp: "ScriptureLyric-9x16", props: "jobs/lyric-test/lyrics.props.json" },
};

const results = [];
const record = (area, name, status, detail) => {
  results.push({ area, name, status, detail });
  const icon = { pass: "✅", fail: "❌", saved: "💾", skip: "⏭️ " }[status];
  console.log(`${icon} ${area.padEnd(9)} ${name.padEnd(16)} ${detail}`);
};
const run = (cmd, args, inherit = false) => spawnSync(cmd, args, { encoding: "utf8", stdio: inherit ? "inherit" : "pipe", maxBuffer: 1e9 });
const node = (script, args) => run("node", [script, ...args]);
const tail = (r) => `${r.stderr || ""}${r.stdout || ""}`.trim().split("\n").slice(-3).join(" | ");
const ffmpeg = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

console.log(`\nMotion Studio tests${FULL ? " (full)" : ""}${UPDATE ? " — updating golden results" : ""}\n`);

// ── lint ─────────────────────────────────────────────────────────────────────
if (want("lint")) {
  const r = run("npm", ["run", "lint", "--silent"]);
  record("lint", "eslint + tsc", r.status === 0 ? "pass" : "fail", r.status === 0 ? "clean" : tail(r));
}

// ── beats ────────────────────────────────────────────────────────────────────
if (want("beats")) {
  for (const bpm of [84, 100, 128]) {
    const wav = join(TMP, `beat-${bpm}.wav`);
    if (!existsSync(wav)) node("scripts/test/music-fixture.mjs", [wav, `--bpm=${bpm}`, "--seconds=20"]);
    const b = findBeats(wav);
    const truth = [];
    for (let t = 0.25; t < 20; t += 60 / bpm) truth.push(t);
    const errs = (b?.beats || []).map((x) => Math.min(...truth.map((t) => Math.abs(t - x))) * 1000);
    const mean = errs.reduce((s, e) => s + e, 0) / Math.max(1, errs.length);
    const ok = b && Math.abs(b.bpm - bpm) <= 1.5 && mean <= 25;
    record("beats", `${bpm} BPM`, ok ? "pass" : "fail", b ? `found ${b.bpm} BPM, beats off by ${mean.toFixed(0)} ms on average (max ${Math.max(...errs).toFixed(0)})` : "no beat found");
  }
}

// ── test material ────────────────────────────────────────────────────────────
const jobs = Object.entries(JOBS).filter(([job]) => want(job) || want("frames") || want("edl") || (job === "shorts-test-s1" && want("voice")) || (FULL && want("cutcheck")));
const ready = new Set();
for (const [job, cfg] of jobs) {
  if (cfg.comp) {
    ready.add(job);
    continue;
  }
  const edl = readJson(join("jobs", job, "edl.json"));
  if (!edl) {
    record("edl", job, "fail", `jobs/${job}/edl.json missing`);
    continue;
  }
  const fj = cfg.footageJob || job;
  if (!existsSync(join("public", "jobs", fj, "footage", "take-a.mp4"))) {
    console.log(`   building the test footage for ${fj}…`);
    const r = node("scripts/test/footage-fixture.mjs", [fj, ...cfg.fixture]);
    if (r.status !== 0) {
      record("edl", job, "fail", `footage fixture: ${tail(r)}`);
      continue;
    }
  }
  if (cfg.reels) {
    const dir = join("public", "jobs", job, "reels");
    mkdirSync(dir, { recursive: true });
    const reels = [
      ["reel-1.mp4", "gradients=s=360x640:c0=0x1F1A15:c1=0xB4442F:c2=0xF2C14E:n=3:speed=0.03:seed=1:d=6:r=30"],
      ["reel-2.mp4", "life=s=360x640:mold=10:r=30:ratio=0.12:seed=7:death_color=#1F1A15:life_color=#F2C14E,trim=duration=6"],
    ];
    for (const [f, src] of reels) if (!existsSync(join(dir, f))) ffmpeg(["-f", "lavfi", "-i", src, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "24", join(dir, f)]);
    if (!existsSync(join(dir, "reel-3.jpg"))) ffmpeg(["-f", "lavfi", "-i", "gradients=s=360x640:c0=0xF7F1E6:c1=0xB4442F:seed=3:d=1", "-frames:v", "1", join(dir, "reel-3.jpg")]);
  }
  if (cfg.music) {
    for (const bpm of cfg.music) {
      const wav = join("public", "audio", "test", `beat-${bpm}.wav`);
      if (!existsSync(wav)) node("scripts/test/music-fixture.mjs", [wav, `--bpm=${bpm}`, "--seconds=30"]);
    }
  }
  if (cfg.broll) {
    const dir = join("public", "jobs", job, "broll");
    mkdirSync(dir, { recursive: true });
    // Generic stand-ins for shot b-roll, named the way a library would tag them.
    const clips = [
      ["sunrise-sky.mp4", "gradients=s=1080x1920:c0=0x1F1A15:c1=0xB4442F:c2=0xF2C14E:n=3:speed=0.02:seed=2:d=5:r=30", "morning light, hope, sky, waiting, dawn"],
      ["hands-season.mp4", "gradients=s=1080x1920:c0=0x2E3B2F:c1=0xF7F1E6:n=2:speed=0.03:seed=9:d=5:r=30", "hands, season, autumn leaves, patience"],
    ];
    for (const [f, src, tags] of clips) {
      if (!existsSync(join(dir, f))) ffmpeg(["-f", "lavfi", "-i", src, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "22", join(dir, f)]);
      writeFileSync(join(dir, f.replace(/\.mp4$/, ".txt")), `${tags}\n`);
    }
  }
  // Cut-outs the edit uses: rebuilt when missing (needs Python; sets itself up).
  let ok = true;
  for (const [key, s] of Object.entries(edl.sources || {})) {
    if (s.matte && !existsSync(join("public", s.matte))) {
      console.log(`   cutting out ${job} ${key} (first run sets up Python)…`);
      const r = node("scripts/matte.mjs", [job, key]);
      if (r.status !== 0) {
        record("edl", job, "fail", `cut-out: ${tail(r)}`);
        ok = false;
      }
    }
  }
  if (!ok) continue;
  const r = node("scripts/edl.mjs", [job]);
  const p = readJson(join("jobs", job, ".edl.resolved.json"));
  const voice = p?.voice && existsSync(join("public", p.voice));
  const good = r.status === 0 && p?.durationInFrames > 0 && p.cues?.length > 0 && voice;
  if (want("edl") || want(job)) record("edl", job, good ? "pass" : "fail", good ? `${(p.durationInFrames / p.fps).toFixed(1)} s, ${p.segments.length} segments, ${p.cues.length} caption cues` : tail(r) || "props incomplete");
  if (good) ready.add(job);
}

// ── voice cleanup ────────────────────────────────────────────────────────────
if (want("voice") && ready.has("shorts-test-s1")) {
  const p = readJson(join("jobs", "shorts-test-s1", ".edl.resolved.json"));
  const rate = 16000;
  const x = pcm(join("public", p.voice), { rate });
  const words = p.cues.flatMap((c) => c.words).sort((a, b) => a.startMs - b.startMs);
  const rms = (spans) => {
    let s = 0;
    let n = 0;
    for (const [a, b] of spans) for (let i = Math.floor((a / 1000) * rate); i < Math.min(x.length, (b / 1000) * rate); i++) (s += x[i] * x[i]), n++;
    return Math.sqrt(s / Math.max(1, n));
  };
  const speech = words.map((w) => [w.startMs + 40, w.endMs - 40]).filter(([a, b]) => b > a);
  const gaps = [];
  for (let i = 1; i < words.length; i++) if (words[i].startMs - words[i - 1].endMs > 200) gaps.push([words[i - 1].endMs + 60, words[i].startMs - 60]);
  const db = 20 * Math.log10(rms(speech) / Math.max(1e-9, rms(gaps)));
  record("voice", "clean: light", db >= 30 ? "pass" : "fail", `voice ${db.toFixed(0)} dB above the noise between words (uncleaned test take: about 22)`);
}

// ── shorts ───────────────────────────────────────────────────────────────────
if (want("shorts")) {
  const r = node("scripts/shorts.mjs", ["shorts-test", "--count=4", "--min=12", "--max=40", "--target=25"]);
  const picked = (readJson(join("jobs", "shorts-test", "shorts.json"))?.picked || []).map((s) => s.keep);
  if (r.status !== 0 || !picked.length) record("shorts", "shorts-test", "fail", tail(r) || "no picks");
  else if (UPDATE || !manifest.shorts) {
    manifest.shorts = picked;
    record("shorts", "shorts-test", "saved", picked.join("  ·  "));
  } else {
    const same = JSON.stringify(picked) === JSON.stringify(manifest.shorts);
    record("shorts", "shorts-test", same ? "pass" : "fail", same ? picked.join("  ·  ") : `now ${picked.join(" · ")}; was ${manifest.shorts.join(" · ")}`);
  }
}

// ── golden frames ────────────────────────────────────────────────────────────
const gray = (f) => spawnSync("ffmpeg", ["-v", "error", "-i", f, "-vf", "format=gray,gblur=sigma=1.5", "-f", "rawvideo", "-"], { maxBuffer: 1e9 }).stdout;
const changed = (a, b) => {
  const [x, y] = [gray(a), gray(b)];
  if (!x.length || x.length !== y.length) return 100;
  let n = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > 32) n++;
  return (100 * n) / x.length;
};
const frameJobs = [...ready].filter((job) => want("frames") || want(job));
let bundle = null;
const ensureBundle = () => {
  if (bundle) return bundle;
  bundle = join(TMP, "bundle");
  rmSync(bundle, { recursive: true, force: true });
  const r = run("npx", ["remotion", "bundle", `--out-dir=${bundle}`, "--log=error"]);
  if (r.status !== 0) {
    record("frames", "bundle", "fail", tail(r));
    bundle = false;
  }
  return bundle;
};
for (const job of frameJobs) {
  const cfg = JOBS[job];
  const propsFile = cfg.props || join("jobs", job, ".edl.resolved.json");
  const p = readJson(propsFile);
  const comp = cfg.comp || `FootageEdit-${readJson(join("jobs", job, "edl.json")).format}`;
  const fps = p.fps || 30;
  // Frames to compare: spread over the edit (or over the lyric cards).
  const dur = p.durationInFrames || Math.round((Math.max(...p.phrases.map((ph) => (ph.start ?? 0) + ph.seconds)) + 1) * fps);
  const was = manifest.jobs[job];
  if (was && !UPDATE && was.durationInFrames !== dur) {
    record("frames", job, "fail", `length changed: ${was.durationInFrames} → ${dur} frames (re-run with --update if that was meant)`);
    continue;
  }
  const frames = !UPDATE && was?.frames ? was.frames : [0.08, 0.3, 0.55, 0.8].map((f) => Math.round(f * dur));
  if (!ensureBundle()) break;
  mkdirSync(join(GOLD, job), { recursive: true });
  const fails = [];
  for (const f of frames) {
    const now = join(TMP, `${job}-f${f}.png`);
    const r = run("npx", ["remotion", "still", bundle, comp, now, `--props=${propsFile}`, `--frame=${f}`, "--scale=0.5", "--image-format=png", "--log=error", ...BROWSER]);
    if (r.status !== 0) {
      fails.push(`frame ${f} did not render: ${tail(r)}`);
      continue;
    }
    const gold = join(GOLD, job, `f${f}.jpg`);
    if (UPDATE || !existsSync(gold)) {
      ffmpeg(["-i", now, "-q:v", "3", gold]);
      continue;
    }
    const pct = changed(now, gold);
    if (pct > TOL) {
      const sheet = join(OUT, `${job}-f${f}-diff.png`);
      ffmpeg(["-i", gold, "-i", now, "-filter_complex", "[0:v]format=rgb24,split[g1][g2];[1:v]format=rgb24,split[n1][n2];[g2]format=gray[gg];[n2]format=gray[ng];[gg][ng]blend=all_mode=difference,eq=contrast=4,format=rgb24[d];[g1][n1][d]hstack=3", "-frames:v", "1", sheet]);
      fails.push(`frame ${f}: ${pct.toFixed(2)}% changed → ${sheet}`);
    }
  }
  if (UPDATE || !was) {
    manifest.jobs[job] = { comp, durationInFrames: dur, frames };
    record("frames", job, fails.length ? "fail" : "saved", fails.length ? fails.join("; ") : `${frames.length} golden frames saved in ${join(GOLD, job)}`);
  } else record("frames", job, fails.length ? "fail" : "pass", fails.length ? fails.join("; ") : `${frames.length} frames match (frames ${frames.join(", ")})`);
}

// ── full: tracking and rendered cut checks ───────────────────────────────────
if (FULL && want("track")) {
  const r = node("scripts/track.mjs", ["reframe-test"]);
  const t = readJson(join("jobs", "reframe-test", "tracks", "A.json"));
  const found = t ? t.samples.filter((s) => s.face).length / t.samples.length : 0;
  record("track", "reframe-test", r.status === 0 && found >= 0.95 ? "pass" : "fail", r.status === 0 ? `face found in ${(found * 100).toFixed(0)}% of ${t.samples.length} samples` : tail(r));
}
if (FULL && want("cutcheck")) {
  for (const job of [...ready].filter((j) => !JOBS[j].comp && (want("cutcheck") || want(j)))) {
    if (!ensureBundle()) break;
    const comp = `FootageEdit-${readJson(join("jobs", job, "edl.json")).format}`;
    const out = join(OUT, `${job}.mp4`);
    const t0 = Date.now();
    const r = run("npx", ["remotion", "render", bundle, comp, out, `--props=${join("jobs", job, ".edl.resolved.json")}`, "--codec=h264", "--crf=20", "--log=error", ...BROWSER]);
    if (r.status !== 0) {
      record("cutcheck", job, "fail", `render failed: ${tail(r)}`);
      continue;
    }
    const c = node("scripts/cutcheck.mjs", [job, out, "--no-log"]);
    const rows = (c.stdout || "").split("\n").filter((l) => /❌|⚠️/.test(l)).map((l) => l.split("|")[1]?.trim());
    record("cutcheck", job, c.status === 0 ? "pass" : "fail", `${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${c.status === 0 ? "no FAIL" : "FAIL"}${rows.length ? ` (flagged: ${rows.join(", ")})` : ""}`);
  }
}

if (UPDATE || results.some((r) => r.status === "saved")) writeJson(MANIFEST, manifest);
const fails = results.filter((r) => r.status === "fail");
console.log(`\n${results.length - fails.length} of ${results.length} passed${fails.length ? `; ${fails.length} failed: ${fails.map((f) => `${f.area} ${f.name}`).join(", ")}` : "."}`);
process.exit(fails.length ? 1 : 0);
