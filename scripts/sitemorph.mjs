#!/usr/bin/env node
// SiteMorph from a site capture: plan the states, render, and check the beats and loop.
//
//   npm run sitemorph -- plan <job> [--states=8] [--bpm=120] [--beats-per-state=2] [--loop]
//                                   [--music=<audio>] [--sfx]
//   npm run sitemorph -- render <job> [--format=1x1|9x16|16x9] [--preset=review]
//   npm run sitemorph -- check <job> <render.mp4>
//
// plan reads jobs/<job>/site/inventory.json (npm run site-capture) and writes
// jobs/<job>/sitemorph.json (the props) and sitemorph-plan.md (the plan to approve).
// The story runs hero button → headline → numbers → features → demo → proof → final
// call; every word is the site's own, placeholder copy is left out, and states with
// more to read hold for more beats. With --music the tempo and first downbeat come
// from the track (npm run beats), so every press lands on a beat.
//
// check writes a beat sheet (each state mid-morph, on its press and settled) and, for
// a loop, checks the seam (npm run loopcheck).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { diskPath, ff, labelFont, parseArgs, publicRel, readJson, videoInfo, writeJson } from "./lib/media.mjs";
import { findBeats } from "./lib/beats.mjs";
import { loopCheck } from "./lib/loop.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [cmd, job, file] = pos;
const usage = "Usage: npm run sitemorph -- plan <job> [--states=8 --bpm=120 --loop --music=<audio>] | render <job> [--format=1x1] [--preset=review] | check <job> <render.mp4>";
if (!["plan", "render", "check"].includes(cmd) || !job) {
  console.error(usage);
  process.exit(1);
}
const propsPath = join("jobs", job, "sitemorph.json");
const FORMATS = ["1x1", "9x16", "16x9"];

if (cmd === "plan") {
  const invPath = join("jobs", job, "site", "inventory.json");
  if (!existsSync(invPath)) {
    console.error(`No capture yet: npm run site-capture -- <url> ${job}`);
    process.exit(1);
  }
  const inv = readJson(invPath);
  const secs = inv.sections;
  const all = secs.flatMap((s) => s.components.map((c) => ({ ...c, section: s })));
  const usable = all.filter((c) => !c.placeholder);
  const unquote = (t) => t.replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, "");
  const words = (t) => (t ? t.split(/\s+/).filter(Boolean).length : 0);

  // Candidates in story order, each with a priority (1 = keep first when trimming).
  const cands = [];
  const hero = secs.find((s) => s.kind === "hero") || secs.find((s) => s.headings.some((h) => h.level <= 2));
  const heroBtn = usable.find((c) => c.kind === "button" && c.filled && c.section === hero) || usable.find((c) => c.kind === "button" && c.filled);
  if (heroBtn) cands.push({ p: 1, from: heroBtn.id, s: { kind: "button", title: heroBtn.title } });
  const h1 = hero?.headings.find((h) => h.level === 1) || hero?.headings[0];
  if (h1) {
    const lede = hero.paragraphs.find((x) => !inv.placeholders.some((f) => x.startsWith(f.text.replace(/…$/, ""))));
    // A long lede is for reading on the site; in motion the headline carries it alone.
    cands.push({ p: 2, from: `section ${hero.n} headline`, s: { kind: "card", title: h1.text, body: lede && words(lede) <= 14 ? lede : null } });
  }
  const heroImg = usable.find((c) => c.kind === "image" && c.section === hero && c.shot);
  if (heroImg) cands.push({ p: 6, from: heroImg.id, s: { kind: "image", image: heroImg.shot } });
  usable
    .filter((c) => c.kind === "stat" && c.section.kind !== "pricing" && c.label)
    .slice(0, 2)
    .forEach((c, i) => cands.push({ p: i ? 7 : 3, from: c.id, s: { kind: "stat", value: c.value, title: c.label } }));
  const tabs = usable.find((c) => c.kind === "tabs" && c.items.length >= 2);
  if (tabs) cands.push({ p: 4, from: tabs.id, s: { kind: "tabs", items: tabs.items.slice(0, 4) } });
  const list = usable.find((c) => c.kind === "list");
  if (list) cands.push({ p: 8, from: list.id, s: { kind: "list", title: list.section.headings[0]?.text ?? null, items: list.items.slice(0, 4) } });
  const player = usable.find((c) => c.kind === "player" && c.title);
  if (player) cands.push({ p: 5, from: player.id, s: { kind: "player", title: player.title, body: player.body } });
  const slider = usable.find((c) => c.kind === "slider" && c.label);
  if (slider) cands.push({ p: 10, from: slider.id, s: { kind: "slider", title: slider.label } });
  const toggle = usable.find((c) => c.kind === "toggle");
  if (toggle) cands.push({ p: 9, from: toggle.id, s: { kind: "toggle", label: toggle.label || null } });
  const quote = usable.find((c) => c.kind === "quote" && c.body);
  if (quote) cands.push({ p: 5, from: quote.id, s: { kind: "quote", body: unquote(quote.body), label: quote.cite } });
  const plan = usable.find((c) => c.kind === "card" && c.section.kind === "pricing");
  if (plan) cands.push({ p: 11, from: plan.id, s: { kind: "card", title: plan.title, body: plan.body } });
  const lastBtn = [...usable].reverse().find((c) => c.kind === "button" && c.filled && c !== heroBtn);
  const finalBtn = lastBtn || heroBtn;
  if (finalBtn) cands.push({ p: 2, from: finalBtn.id, s: { kind: "cta", title: finalBtn.title } });

  const want = Number(opt.states || 8);
  const keep = new Set([...cands].sort((a, b) => a.p - b.p).slice(0, want));
  const picked = cands.filter((c) => keep.has(c));
  if (picked.length < 3) {
    console.error(`Only ${picked.length} usable components in the capture: not enough for a SiteMorph. Check INVENTORY.md.`);
    process.exit(1);
  }

  // Tempo: from the music if given, else --bpm.
  let bpm = Number(opt.bpm || 120);
  let music = null;
  if (opt.music) {
    const src = diskPath(String(opt.music));
    if (!existsSync(src)) {
      console.error(`Not found: ${opt.music}`);
      process.exit(1);
    }
    const r = findBeats(src);
    if (!r) {
      console.error("The track is too short to find a beat.");
      process.exit(1);
    }
    bpm = r.bpm;
    const first = (r.downbeats[0] ?? r.beats[0]) || 0;
    music = { src: publicRel(src), volume: 0.5, trimBefore: Math.round(first * 60) };
    console.log(`Music: ${r.bpm} BPM (confidence ${r.confidence}), starting on the downbeat at ${first} s${r.confidence < 0.3 ? " ⚠ weak pulse: presses may not land on audible beats" : ""}`);
  }
  const beat = 60 / bpm;
  const bps = Number(opt["beats-per-state"] || 2);
  // States with more to read hold for more beats (about 3 words a second, plus a second).
  const hold = (s) => {
    const n = s.kind === "quote" ? words(s.body) : s.kind === "card" ? words(s.title) + words(s.body) : s.kind === "list" ? 3 * s.items.length : 0;
    if (!n) return null;
    const secs = 1 + n / 3;
    const b = Math.max(bps, 2 * Math.ceil(secs / beat / 2)); // whole pairs of beats
    return b > bps ? b : null;
  };
  const font = inv.fonts?.display?.family;
  const bundled = ["Inter", "Fraunces", "Plus Jakarta Sans", "DM Mono", "Caveat", "Anton"];
  const props = {
    bpm,
    beatsPerState: bps,
    loop: !!opt.loop,
    states: picked.map((c) => ({
      kind: c.s.kind,
      title: c.s.title ?? null,
      body: c.s.body ?? null,
      label: c.s.label ?? null,
      value: c.s.value ?? null,
      items: c.s.items ?? [],
      image: c.s.image ?? null,
      color: null,
      beats: hold(c.s),
    })),
    theme: {
      background: inv.palette.background,
      surface: inv.palette.surface,
      text: inv.palette.text,
      muted: inv.palette.muted,
      accent: inv.palette.accent,
      onAccent: inv.palette.onAccent,
      display: font && bundled.includes(font) ? font : null,
    },
    cursor: true,
    sfx: !!opt.sfx,
    motionBlur: false,
    music,
    brand: null,
  };
  writeJson(propsPath, props);
  const total = props.states.reduce((t, s) => t + (s.beats ?? bps), 0) * beat;
  const show = (s) => [s.value, s.title, s.label, s.body, s.items.join(" · "), s.image].filter(Boolean).map((x) => `"${x}"`).join(", ");
  const md = `# SiteMorph plan: ${job}

From \`${inv.url}\` (${inv.meta.title || "untitled"}). ${props.states.length} states at ${bpm} BPM, ${total.toFixed(1)} s${props.loop ? ", looping" : ""}.
Theme from the site: background \`${props.theme.background}\`, surface \`${props.theme.surface}\`, text \`${props.theme.text}\`, accent \`${props.theme.accent}\`.
${font && !bundled.includes(font) ? `\nThe site's display font (${font}) isn't bundled, so the video uses Inter. Add the font files to use it (check the licence).\n` : ""}
| # | State | Words (exactly as on the site) | Beats | From |
|---|---|---|---|---|
${props.states.map((s, i) => `| ${i + 1} | ${s.kind} | ${show(s) || "—"} | ${s.beats ?? bps} | ${picked[i].from} |`).join("\n")}

Left out: ${inv.placeholders.length ? `${inv.placeholders.length} placeholder${inv.placeholders.length > 1 ? "s" : ""} (see site/INVENTORY.md)` : "nothing flagged"}${cands.length > picked.length ? `; ${cands.length - picked.length} more component${cands.length - picked.length > 1 ? "s" : ""} for a longer cut (--states=${cands.length})` : ""}.

Next: \`npm run sitemorph -- render ${job} --format=1x1\` (also 9x16, 16x9), then \`npm run sitemorph -- check ${job} <render>\`.
`;
  writeFileSync(join("jobs", job, "sitemorph-plan.md"), md);
  console.log(md);
  process.exit(0);
}

if (!existsSync(propsPath)) {
  console.error(`No plan yet: npm run sitemorph -- plan ${job}`);
  process.exit(1);
}
const props = readJson(propsPath);

if (cmd === "render") {
  const fmt = String(opt.format || "1x1");
  if (!FORMATS.includes(fmt)) {
    console.error(`--format must be one of ${FORMATS.join(", ")}`);
    process.exit(1);
  }
  const preset = String(opt.preset || "review");
  const out = join("out", job, `sitemorph-${fmt}-${preset}.mp4`);
  mkdirSync(join("out", job), { recursive: true });
  const r = spawnSync("node", ["scripts/render.mjs", `SiteMorph-${fmt}`, preset, `--props=${propsPath}`, `--out=${out}`], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`next: npm run sitemorph -- check ${job} ${out}`);
  process.exit(0);
}

// check
if (!file || !existsSync(file)) {
  console.error(usage);
  process.exit(1);
}
const info = videoInfo(file);
const beat = 60 / props.bpm;
const starts = [];
let acc = 0;
for (const s of props.states) {
  starts.push(acc);
  acc += (s.beats ?? props.beatsPerState) * beat;
}
const results = [];
const add = (name, ok, note) => results.push({ name, ok, note });
add("Frame rate", Math.abs(info.fps - 60) < 0.5, `${info.fps.toFixed(2)} fps (SiteMorph is made at 60)`);
add("Length", Math.abs(info.duration - acc) < 0.1, `${info.duration.toFixed(2)} s; the plan is ${acc.toFixed(2)} s`);

// Beat sheet: each state mid-morph, on its press (the beat) and settled.
const moments = props.states.flatMap((s, i) => {
  const len = (s.beats ?? props.beatsPerState) * beat;
  return [
    [starts[i] + 0.12, `${i + 1} ${s.kind} morph`],
    [starts[i] + Math.min(len * 0.5, beat), `${i + 1} press (beat)`],
    [starts[i] + len - 0.2, `${i + 1} settled`],
  ];
});
const tmp = join("production", "tmp", `sm-${job}`);
mkdirSync(tmp, { recursive: true });
const lf = labelFont();
moments.forEach(([t, label], k) => {
  const draw = lf ? `,drawtext=fontfile='${lf}':text='${label.replace(/'/g, "")}':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6` : "";
  ff(["-ss", Math.max(0, Math.min(t, info.duration - 0.02)).toFixed(3), "-i", file, "-frames:v", "1", "-vf", `scale=360:-2${draw}`, join(tmp, `m-${String(k).padStart(3, "0")}.jpg`)]);
});
const sheet = join("out", job, `sitemorph-beats.jpg`);
mkdirSync(join("out", job), { recursive: true });
const r = ff(["-framerate", "1", "-i", join(tmp, "m-%03d.jpg"), "-vf", `tile=3x${props.states.length}:padding=4:color=0x000000`, "-frames:v", "1", sheet]);
add("Beat sheet", r.status === 0, r.status === 0 ? `${sheet} (one row per state: morphing, on the beat, settled)` : "could not draw");
if (props.loop) {
  const lc = loopCheck(file);
  add("Loop seam", !!lc?.pass, lc ? lc.why : "too few frames");
}
for (const x of results) console.log(`${x.ok ? "✔ PASS" : "✘ FAIL"}  ${x.name}: ${x.note}`);
writeJson(join("jobs", job, "sitemorph-check.json"), { file, at: new Date().toISOString(), results });
process.exit(results.every((x) => x.ok) ? 0 : 1);
