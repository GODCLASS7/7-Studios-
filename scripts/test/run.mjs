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
//   pin           a spot pinned on the panning 16:9 test take stays within 1 px of the truth
//   styles        every editing style in presets/styles uses looks, grades, captions and titles that exist
//   carousel      frames picked and cut out of the look-test take, the test carousel rendered (6 slides)
//   variants      the look-test trial plan builds 4 versions, each with its change, none the same
//   posts         the post queue refuses unapproved, changed or not-yet-due posts (on a scratch queue)
//   frames        golden frames of every test edit (fx-test: all 18 effects), the title styles, the
//                 tutorial, the cards, the carousel (and its 8 looks) and the 14 caption styles
//   app (full)    the 7 Studios app end to end in a browser: every studio opens; Image, Video,
//                 Motion, Web (capture → plan → render → beat and loop check), Edit and Publish
//                 (queue and approve, on a scratch queue) work; the server's safety checks hold
//   track (full)  face found in at least 95% of the moving 16:9 test take
//   cutcheck (full) each test edit rendered and passed by the cut check
//
// Exits 1 if anything fails.

import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findBeats } from "../lib/beats.mjs";
import { parseArgs, pcm, readJson, writeJson } from "../lib/media.mjs";
import { ensureModule, ensurePython, PY } from "../lib/py.mjs";

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

// The test jobs. footageJob: whose fixture footage the job cuts from. layoutComp: an
// edit-list job rendered with another template. comp: a template rendered from a props
// file (or its default props), with fixed frames to compare.
const JOBS = {
  "edit-test": { fixture: ["--vertical"] },
  "look-test": { fixture: [`--photo=${PHOTO}`], reels: true },
  "reframe-test": { fixture: [`--photo=${PHOTO}`, "--wide"] },
  "shorts-test-s1": { footageJob: "shorts-test", fixture: ["--vertical", "--script=jobs/shorts-test/talk.txt"] },
  "prelive-test": { footageJob: "reframe-test", fixture: [`--photo=${PHOTO}`, "--wide"], music: [100], broll: true },
  "titles-test": { footageJob: "reframe-test", fixture: [`--photo=${PHOTO}`, "--wide"], frames: [41, 153, 225, 280, 407] },
  "tutorial-test": { footageJob: "look-test", fixture: [`--photo=${PHOTO}`], screen: true, layoutComp: "Tutorial-9x16" },
  "lyric-test": { comp: "ScriptureLyric-9x16", props: "jobs/lyric-test/lyrics.props.json" },
  // All 18 effects of the pack in one 51 s edit of the look-test take (uses its cut-out and reels).
  // tol: the white sticker outlines trace the cut-out's edge, so the tiny edge differences of a
  // cut-out rebuilt on another computer show more than elsewhere.
  "fx-test": { tol: 0.4, footageJob: "look-test", fixture: [`--photo=${PHOTO}`], reels: "look-test", screen: "tutorial-test", frames: [48, 165, 228, 288, 325, 420, 465, 540, 675, 750, 810, 870, 939, 954, 1056, 1200, 1272, 1470, 1515] },
  "titles-reel": { comp: "Titles-9x16", dur: 480, frames: [36, 96, 156, 216, 276, 336, 396, 456] },
  cards: { comp: "Cards-9x16", dur: 255, frames: [40, 78, 125, 200] },
  // Motion additions: each of the seven art styles mid-way, SiteMorph through its states, the terminal.
  "art-styles": { comp: "ArtStyles-9x16", dur: 525, frames: [40, 115, 190, 265, 340, 415, 490] },
  sitemorph: { comp: "SiteMorph-1x1", dur: 510, frames: [40, 100, 160, 250, 340, 420, 500] },
  terminal: { comp: "Terminal-9x16", dur: 270, frames: [60, 150, 240] },
  "cards-stack": { comp: "Cards-16x9", props: "tests/fixtures/cards-stack.json", dur: 189, frames: [30, 60, 100, 160] },
  // Carousel Studio end to end: frames from the look-test take, a cut-out cover, the brand kit.
  "carousel-test": { comp: "Carousel-4x5", props: "jobs/carousel-test/.carousel.resolved.json", dur: 6, frames: [0, 1, 2, 3, 4, 5], carousel: true },
};
// Every carousel look on the sample deck (props merge over the defaults: only the look changes).
const CAROUSEL_LOOKS = ["glow", "paper", "poster", "editorial", "bold", "soft", "pop", "scripture"];
for (const look of CAROUSEL_LOOKS) {
  const file = join(TMP, `carousel-${look}.json`);
  writeJson(file, { look });
  JOBS[`carousel-${look}`] = { comp: "Carousel-4x5", props: file, dur: 6, frames: [0, 2, 3], group: "carousel" };
}
const CAPTION_STYLES = ["pill", "box", "karaoke", "typewriter", "serif", "minimal", "outline", "stack", "subtitle", "neon", "marker", "bubble", "gradient", "stamp"];

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

console.log(`\n7 Studios tests${FULL ? " (full)" : ""}${UPDATE ? " — updating golden results" : ""}\n`);

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
    // The bed accents every fourth beat from 0.25 s: that's the first downbeat.
    const d0 = b?.downbeats?.[0];
    record("beats", `${bpm} BPM downbeat`, d0 !== undefined && Math.abs(d0 - 0.25) <= 0.03 ? "pass" : "fail", `first downbeat at ${d0} s (expected 0.25)`);
  }
  // A track trimmed to start on its kick: the first beat (and downbeat) is at the very start.
  const trimmed = join(TMP, "beat-100-trim.wav");
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(TMP, "beat-100.wav"), "-ss", "0.25", trimmed]);
  const tb = existsSync(trimmed) ? findBeats(trimmed) : null;
  record("beats", "starts on the kick", tb && tb.downbeats[0] <= 0.04 ? "pass" : "fail", tb ? `first downbeat at ${tb.downbeats[0]} s (expected about 0)` : "no beat found");
}

// ── test material ────────────────────────────────────────────────────────────
const jobs = Object.entries(JOBS).filter(([job, cfg]) => want(job) || want("frames") || want("edl") || (cfg.group && want(cfg.group)) || (cfg.carousel && want("carousel")) || (job === "shorts-test-s1" && want("voice")) || (FULL && want("cutcheck")));
const ready = new Set();
let fixtureBundle = null;
for (const [job, cfg] of jobs) {
  if (cfg.carousel) {
    // Pick 4 frames from the look-test take (cut out), then render the deck with the brand kit.
    const take = join("public", "jobs", "look-test", "footage", "take-a.mp4");
    if (!existsSync(take)) node("scripts/test/footage-fixture.mjs", ["look-test", `--photo=${PHOTO}`]);
    const f = node("scripts/carousel.mjs", [job, "frames", "jobs/look-test/footage/take-a.mp4", "--count=4", "--cutout"]);
    const picked = readJson(join("jobs", job, "carousel-frames.json"))?.frames || [];
    const r = f.status === 0 ? node("scripts/carousel.mjs", [job, "render", "--format=4x5"]) : f;
    const dir = join("out", job, "carousel", "4x5");
    const slides = existsSync(dir) ? readdirSync(dir).filter((x) => /^slide-\d+\.jpg$/.test(x)).length : 0;
    const ok = r.status === 0 && picked.length === 4 && picked.every((x) => x.cutout) && slides === 6;
    if (want("carousel") || want(job)) record("carousel", job, ok ? "pass" : "fail", ok ? `frames at ${picked.map((x) => x.t).join(", ")} s (cut out), 6 slides + sheet in ${dir}` : tail(r) || `${picked.length} frames, ${slides} slides`);
    if (ok) ready.add(job);
    continue;
  }
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
  // A generic app screen "recording" for the tutorial layout, rendered from TestScreen.
  const screenJob = typeof cfg.screen === "string" ? cfg.screen : job;
  const screen = join("public", "jobs", screenJob, "screen", "app.mp4");
  if (cfg.screen && !existsSync(screen)) {
    console.log("   rendering the test screen recording…");
    if (!fixtureBundle) {
      fixtureBundle = join(TMP, "fixture-bundle");
      run("npx", ["remotion", "bundle", `--out-dir=${fixtureBundle}`, "--log=error"]);
    }
    mkdirSync(join("public", "jobs", screenJob, "screen"), { recursive: true });
    const r = run("npx", ["remotion", "render", fixtureBundle, "TestScreen", screen, "--codec=h264", "--crf=20", "--log=error", ...BROWSER]);
    if (r.status !== 0) {
      record("edl", job, "fail", `test screen: ${tail(r)}`);
      continue;
    }
  }
  if (cfg.reels) {
    const dir = join("public", "jobs", typeof cfg.reels === "string" ? cfg.reels : job, "reels");
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
      // The cut-out belongs to the job named in its path (fx-test shares look-test's).
      const owner = s.matte.split("/")[1] || job;
      console.log(`   cutting out ${owner} ${key} (first run sets up Python)…`);
      const r = node("scripts/matte.mjs", [owner, key]);
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

// ── pin tracking ─────────────────────────────────────────────────────────────
// The 16:9 test take pans by crop x = 240 + 240·sin(t/3), so a spot on the photo has a known path.
if (want("pin")) {
  const take = join("public", "jobs", "reframe-test", "footage", "take-a.mp4");
  if (!existsSync(take)) node("scripts/test/footage-fixture.mjs", ["reframe-test", `--photo=${PHOTO}`, "--wide"]);
  await ensurePython();
  ensureModule("cv2", "opencv-python-headless");
  const out = join(TMP, "pin.json");
  const r = run(PY, [join("scripts", "matte", "pin.py"), take, out, "--at=5", "--point=0.542,0.426"]);
  const pin = readJson(out);
  if (r.status !== 0 || !pin) record("pin", "panning take", "fail", tail(r));
  else {
    const crop = (t) => 240 + 240 * Math.sin(t / 3);
    const s0 = pin.samples.find((s) => Math.abs(s[0] - 5) < 0.02);
    const errs = pin.samples.map(([t, x, y]) => Math.hypot(x * 1920 - (s0[1] * 1920 - (crop(t) - crop(5))), y * 1080 - s0[2] * 1080));
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const max = Math.max(...errs);
    record("pin", "panning take", mean < 1 && max < 3 ? "pass" : "fail", `${errs.length} frames, off by ${mean.toFixed(2)} px on average (max ${max.toFixed(2)})`);
  }
}

// ── editing styles ───────────────────────────────────────────────────────────
if (want("styles")) {
  const LOOKS = ["classic", "bold", "cool-girl", "cool-dude"];
  const GRADES = ["none", "neutral", "warm", "cool", "punchy", "film", "noir", "faded", "worship", "food"];
  const TITLES = ["cutout", "editorial", "inflate", "neon", "extrude", "poster", "outline", "tag"];
  const FX = ["clone", "frame-break", "god-rays", "rack-focus", "vertigo", "doodles", "freeze", "green-screen", "callout", "checklist", "counter", "chips", "before-after", "blackout", "phone", "cover", "comment", "zoom-through"];
  const dir = join("presets", "styles");
  const bad = [];
  const names = readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const f of names) {
    const st = readJson(join(dir, f));
    const n = f.replace(".json", "");
    if (st.name !== n) bad.push(`${n}: name "${st.name}"`);
    if (st.look && !LOOKS.includes(st.look)) bad.push(`${n}: look ${st.look}`);
    if (st.grade && !GRADES.includes(st.grade)) bad.push(`${n}: grade ${st.grade}`);
    if (st.captions?.style && !["pop", "line", "none", ...CAPTION_STYLES].includes(st.captions.style)) bad.push(`${n}: captions ${st.captions.style}`);
    if (st.titles?.style && !TITLES.includes(st.titles.style)) bad.push(`${n}: titles ${st.titles.style}`);
    for (const x of st.suggestedFx || []) if (!FX.includes(x)) bad.push(`${n}: fx ${x}`);
    if (st.autocut?.pause && !(st.autocut.pause > 0.05 && st.autocut.pause < 1.5)) bad.push(`${n}: pause ${st.autocut.pause}`);
  }
  record("styles", "presets/styles", bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : `${names.length} styles valid`);
}

// ── trial variants ───────────────────────────────────────────────────────────
if (want("variants") && ready.has("look-test")) {
  const r = node("scripts/variants.mjs", ["look-test", "build"]);
  const v = (id) => readJson(join("jobs", `look-test-${id}`, ".edl.resolved.json"));
  const [t1, t2, t3, t4] = ["t1", "t2", "t3", "t4"].map(v);
  const checks = [
    [r.status === 0, `build exited ${r.status}${r.status === 2 ? " (a version came out the same as another)" : ""}`],
    [t2?.titles?.[0]?.from === 0 && /hurt/.test(t2.titles[0].text), "t2 opens on its hook headline"],
    [t3?.segments?.[0]?.trimBefore !== t1?.segments?.[0]?.trimBefore, "t3 opens on another line"],
    [t4?.segments?.[0]?.zoom > t1?.segments?.[0]?.zoom && t4?.grade === "punchy", "t4 is closer, with the punchy grade"],
  ];
  const failed = checks.filter(([ok]) => !ok).map(([, what]) => what);
  record("variants", "look-test plan", failed.length ? "fail" : "pass", failed.length ? `not met: ${failed.join("; ")}` : "4 versions built, each with its own change");
}

// ── post queue ───────────────────────────────────────────────────────────────
if (want("posts")) {
  const queue = join(TMP, "posts.json");
  rmSync(queue, { force: true });
  const vid = join(TMP, "post-test.mp4");
  if (!existsSync(vid)) ffmpeg(["-f", "lavfi", "-i", "color=c=0x1F1A15:s=360x640:d=5:r=30", "-f", "lavfi", "-i", "sine=f=440:d=5", "-shortest", "-pix_fmt", "yuv420p", "-c:v", "libx264", vid]);
  const posts = (args) => spawnSync("node", ["scripts/posts.mjs", ...args], { encoding: "utf8", env: { ...process.env, POSTS_QUEUE: queue } });
  const later = new Date(Date.now() + 864e5).toISOString();
  const earlier = new Date(Date.now() - 6e4).toISOString();
  const steps = [
    ["queues a post", posts(["add", vid, "--platform=instagram", "--account=@test", "--caption=Test", "--trial=manual", "--ai-label=no", `--at=${later}`]).status === 0],
    ["refuses an unapproved post", posts(["check", "p1"]).status === 1],
    ["records approval", posts(["approve", "p1", "--by=test approval"]).status === 0],
    ["waits until it's due", posts(["check", "p1"]).status === 1],
    ["queues a due post", posts(["add", vid, "--platform=instagram", "--account=@test", "--caption=Test", "--ai-label=no", `--at=${earlier}`]).status === 0 && posts(["approve", "p2", "--by=test approval"]).status === 0],
    ["passes an approved, due, unchanged post", posts(["check", "p2"]).status === 0],
  ];
  appendFileSync(vid, Buffer.from([0]));
  steps.push(["refuses a file changed after approval", posts(["check", "p2"]).status === 1]);
  const short = join(TMP, "post-test-2s.mp4");
  ffmpeg(["-f", "lavfi", "-i", "color=c=0x1F1A15:s=360x640:d=2:r=30", "-pix_fmt", "yuv420p", "-c:v", "libx264", short]);
  steps.push(["refuses a 2 s TikTok", posts(["add", short, "--platform=tiktok", "--account=@t", "--caption=x"]).status === 1]);
  rmSync(vid, { force: true });
  rmSync(short, { force: true });
  const failed = steps.filter(([, ok]) => !ok).map(([what]) => what);
  record("posts", "approval queue", failed.length ? "fail" : "pass", failed.length ? `wrong: ${failed.join("; ")}` : `${steps.length} rules hold`);
}

// Caption library: the look-test edit in the classic look, once per caption style.
if (ready.has("look-test") && (want("frames") || want("captions"))) {
  const base = readJson(join("jobs", "look-test", ".edl.resolved.json"));
  for (const style of CAPTION_STYLES) {
    const file = join(TMP, `captions-${style}.json`);
    writeJson(file, { ...base, looks: [{ from: 0, to: base.durationInFrames, look: "classic" }], punches: [], orbit: [], inserts: [], captions: { ...base.captions, style } });
    JOBS[`captions-${style}`] = { comp: "FootageEdit-9x16", props: file, dur: base.durationInFrames, frames: [100], group: "captions" };
    ready.add(`captions-${style}`);
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
const frameJobs = [...ready].filter((job) => want("frames") || want(job) || (JOBS[job].group && want(JOBS[job].group)) || (JOBS[job].carousel && want("carousel")));
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
  const propsFile = cfg.comp ? cfg.props : join("jobs", job, ".edl.resolved.json");
  const p = propsFile ? readJson(propsFile) : {};
  const comp = cfg.comp || cfg.layoutComp || `FootageEdit-${readJson(join("jobs", job, "edl.json")).format}`;
  const fps = p.fps || 30;
  // Frames to compare: spread over the edit (or over the lyric cards).
  const dur = cfg.dur || p.durationInFrames || Math.round((Math.max(...p.phrases.map((ph) => (ph.start ?? 0) + ph.seconds)) + 1) * fps);
  const was = manifest.jobs[job];
  if (was && !UPDATE && was.durationInFrames !== dur) {
    record("frames", job, "fail", `length changed: ${was.durationInFrames} → ${dur} frames (re-run with --update if that was meant)`);
    continue;
  }
  const frames = !UPDATE && was?.frames ? was.frames : cfg.frames || [0.08, 0.3, 0.55, 0.8].map((f) => Math.round(f * dur));
  if (!ensureBundle()) break;
  mkdirSync(join(GOLD, job), { recursive: true });
  const fails = [];
  for (const f of frames) {
    const now = join(TMP, `${job}-f${f}.png`);
    const r = run("npx", ["remotion", "still", bundle, comp, now, ...(propsFile ? [`--props=${propsFile}`] : []), `--frame=${f}`, "--scale=0.5", "--image-format=png", "--log=error", ...BROWSER]);
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
    if (pct > Math.max(TOL, cfg.tol || 0)) {
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
    const comp = JOBS[job].layoutComp || `FootageEdit-${readJson(join("jobs", job, "edl.json")).format}`;
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

// ── the app, end to end (full, or --only=app) ───────────────────────────────
if (ONLY ? ONLY.has("app") : FULL) {
  const r = node("scripts/test/app.mjs", []);
  const lines = (r.stdout || "").split("\n").filter((l) => l.startsWith("RESULT\t"));
  for (const l of lines) {
    const [, status, name, note] = l.split("\t");
    record("app", name, status === "skip" ? "pass" : status, note || "");
  }
  if (!lines.length) record("app", "run", "fail", tail(r));
}

if (UPDATE || results.some((r) => r.status === "saved")) writeJson(MANIFEST, manifest);
const fails = results.filter((r) => r.status === "fail");
console.log(`\n${results.length - fails.length} of ${results.length} passed${fails.length ? `; ${fails.length} failed: ${fails.map((f) => `${f.area} ${f.name}`).join(", ")}` : "."}`);
process.exit(fails.length ? 1 : 0);
