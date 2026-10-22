// The only things the app can run: each task is a studio script with arguments built
// from checked values. Nothing reaches a shell; every path must sit inside the project's
// public/ or out/ folders; job ids, URLs and option values are validated here.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";

const ROOT = process.cwd();
const JOB = /^[a-z0-9][a-z0-9-]{0,60}$/;
const FORMATS_VIDEO = ["9x16", "16x9", "1x1", "4x5"];
const PRESETS = ["draft", "review", "hd", "4k", "4k-hevc", "master", "alpha", "webm-alpha", "still", "still-4k"];
const EXT = { master: "mov", alpha: "mov", "webm-alpha": "webm", still: "png", "still-4k": "png" };
// Compositions the Motion studio can render (and their formats).
export const COMPOSITIONS = {
  ArtStyles: ["9x16", "16x9"],
  Titles: ["9x16", "16x9", "1x1"],
  Cards: ["9x16", "16x9", "1x1", "4x5"],
  SiteMorph: ["1x1", "9x16", "16x9"],
  Terminal: ["9x16", "16x9", "1x1"],
  LogoIntro: ["16x9", "9x16", "1x1"],
  ScriptureLyric: ["9x16", "16x9"],
  Carousel: ["4x5", "1x1", "9x16"],
  FootageEdit: ["9x16", "16x9", "1x1", "4x5"],
  Tutorial: ["9x16", "16x9"],
};

export class TaskError extends Error {}
const fail = (m) => {
  throw new TaskError(m);
};
const job = (v) => (typeof v === "string" && JOB.test(v) ? v : fail("A job id is lowercase letters, numbers and hyphens."));
const oneOf = (v, list, what) => (list.includes(v) ? v : fail(`${what} must be one of ${list.join(", ")}.`));
const int = (v, lo, hi, d) => {
  if (v === undefined || v === null || v === "") return d;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fail(`Expected a whole number from ${lo} to ${hi}.`);
};
const num = (v, lo, hi, d) => {
  if (v === undefined || v === null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fail(`Expected a number from ${lo} to ${hi}.`);
};
// A file inside one of the allowed top folders, given relative to the project (or to public/).
export const inside = (p, roots = ["public", "out"]) => {
  if (typeof p !== "string" || !p || p.includes("\0")) fail("Missing file.");
  const clean = normalize(p).replace(/^([/\\])+/, "");
  for (const r of roots) {
    const base = resolve(ROOT, r);
    for (const cand of [resolve(ROOT, clean), resolve(base, clean)]) {
      if ((cand === base || cand.startsWith(base + sep)) && existsSync(cand)) return cand.slice(ROOT.length + 1);
    }
  }
  return fail(`Not found inside ${roots.join(" or ")}: ${p}`);
};
const url = (v) => {
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* fall through */
  }
  return fail("Enter a web address starting with http:// or https://");
};
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
const writeProps = (id, props) => {
  if (!props || typeof props !== "object") return null;
  const dir = join("production", "app", "props");
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `${id}.json`);
  writeFileSync(f, JSON.stringify(props, null, 2));
  return f;
};

// Each task: { label, heavy (queued one at a time), build(args, runId) → { argv, outputs } }.
export const TASKS = {
  "new-job": {
    label: "New job",
    build: (a) => ({
      argv: ["scripts/new-job.mjs", job(a.job), String(a.title || "Untitled project").slice(0, 120), `--format=${oneOf(a.format || "9x16", ["9x16", "16x9", "1x1", "4x5", "21x9"], "Format")}`],
    }),
  },
  render: {
    label: "Render",
    heavy: true,
    build: (a, id) => {
      const [name, fmt] = String(a.comp || "").split("-");
      if (!COMPOSITIONS[name] || !COMPOSITIONS[name].includes(fmt)) fail("Unknown composition.");
      const preset = oneOf(a.preset || "review", PRESETS, "Preset");
      const props = a.propsFile ? inside(a.propsFile, ["jobs", "production"]) : writeProps(id, a.props);
      const folder = a.job ? join("out", job(a.job)) : join("out", "app");
      mkdirSync(folder, { recursive: true });
      const out = join(folder, `${a.comp}-${preset}-${stamp()}.${EXT[preset] || "mp4"}`);
      const argv = ["scripts/render.mjs", a.comp, preset, `--out=${out}`];
      if (props) argv.push(`--props=${props}`);
      if (preset.startsWith("still")) argv.push(`--frame=${int(a.frame, 0, 100000, 0)}`);
      return { argv, outputs: [out] };
    },
  },
  "site-capture": {
    label: "Capture a website",
    heavy: true,
    build: (a) => ({ argv: ["scripts/site-capture.mjs", url(a.url), job(a.job), `--max=${int(a.max, 3, 30, 12)}`] }),
  },
  "sitemorph-plan": {
    label: "Plan a SiteMorph",
    build: (a) => {
      const argv = ["scripts/sitemorph.mjs", "plan", job(a.job), `--states=${int(a.states, 3, 14, 8)}`, `--bpm=${num(a.bpm, 60, 200, 120)}`, `--beats-per-state=${int(a.beatsPerState, 1, 8, 2)}`];
      if (a.loop) argv.push("--loop");
      if (a.sfx) argv.push("--sfx");
      if (a.music) argv.push(`--music=${inside(a.music, ["public"])}`);
      return { argv, outputs: [join("jobs", a.job, "sitemorph.json")] };
    },
  },
  "sitemorph-render": {
    label: "Render a SiteMorph",
    heavy: true,
    build: (a) => {
      const fmt = oneOf(a.format || "1x1", ["1x1", "9x16", "16x9"], "Format");
      const preset = oneOf(a.preset || "review", ["draft", "review", "hd", "4k"], "Preset");
      return { argv: ["scripts/sitemorph.mjs", "render", job(a.job), `--format=${fmt}`, `--preset=${preset}`], outputs: [join("out", a.job, `sitemorph-${fmt}-${preset}.mp4`)] };
    },
  },
  "sitemorph-check": {
    label: "Check a SiteMorph",
    build: (a) => ({ argv: ["scripts/sitemorph.mjs", "check", job(a.job), inside(a.file, ["out"])], outputs: [join("out", a.job, "sitemorph-beats.jpg")] }),
  },
  loopcheck: { label: "Loop check", build: (a) => ({ argv: ["scripts/loopcheck.mjs", inside(a.file)] }) },
  beats: {
    label: "Find the beat",
    build: (a) => {
      const f = inside(a.file, ["public"]);
      const argv = ["scripts/beats.mjs", f];
      if (a.grid) argv.push(`--grid=${num(a.grid, 40, 220)}`);
      return { argv, outputs: [`${f}.beats.json`] };
    },
  },
  transcribe: {
    label: "Transcribe",
    heavy: true,
    build: (a) => {
      const engine = oneOf(a.engine || "whisper", ["whisper", "elevenlabs"], "Engine");
      if (engine === "elevenlabs" && !a.confirmPaid) fail("ElevenLabs is paid per minute of audio: confirm first.");
      const files = (Array.isArray(a.media) ? a.media : [a.media]).slice(0, 12).map((m) => inside(m, ["public"]));
      return { argv: ["scripts/transcribe.mjs", job(a.job), ...files, `--engine=${engine}`] };
    },
  },
  pack: { label: "Read the takes", build: (a) => ({ argv: ["scripts/pack.mjs", job(a.job)], outputs: [join("jobs", a.job, "takes.json")] }) },
  autocut: {
    label: "Cut from the takes",
    build: (a) => {
      const keep = String(a.keep || "");
      if (!/^[A-Z]\.\d+(-[A-Z]?\.?\d+)?(,[A-Z]\.\d+(-[A-Z]?\.?\d+)?)*$/.test(keep)) fail("Pick the phrases to keep.");
      return { argv: ["scripts/autocut.mjs", job(a.job), `--keep=${keep}`, `--format=${oneOf(a.format || "9x16", FORMATS_VIDEO, "Format")}`], outputs: [join("jobs", a.job, "edl.json")] };
    },
  },
  edl: { label: "Build the edit", build: (a) => ({ argv: ["scripts/edl.mjs", job(a.job)], outputs: [join("jobs", a.job, ".edl.resolved.json")] }) },
  "render-edit": {
    label: "Render the edit",
    heavy: true,
    build: (a) => {
      const fmt = oneOf(a.format || "9x16", FORMATS_VIDEO, "Format");
      const preset = oneOf(a.preset || "review", ["draft", "review", "hd", "4k"], "Preset");
      const out = join("out", job(a.job), `edit-${fmt}-${preset}-${stamp()}.mp4`);
      return { argv: ["scripts/render.mjs", `FootageEdit-${fmt}`, preset, `--props=${inside(join("jobs", a.job, ".edl.resolved.json"), ["jobs"])}`, `--out=${out}`], outputs: [out] };
    },
  },
  cutcheck: { label: "Cut check", heavy: true, build: (a) => ({ argv: ["scripts/cutcheck.mjs", job(a.job), inside(a.file, ["out"])] }) },
  "carousel-frames": {
    label: "Pick carousel frames",
    heavy: true,
    build: (a) => {
      const argv = ["scripts/carousel.mjs", job(a.job), "frames", inside(a.video, ["public", "out"]), `--count=${int(a.count, 2, 20, 8)}`];
      if (a.cutout) argv.push("--cutout");
      return { argv, outputs: [join("jobs", a.job, "carousel-frames.json")] };
    },
  },
  "carousel-render": {
    label: "Render a carousel",
    heavy: true,
    build: (a) => ({ argv: ["scripts/carousel.mjs", job(a.job), "render", `--format=${oneOf(a.format || "4x5", ["4x5", "1x1", "9x16"], "Format")}`], outputs: [join("out", a.job, "carousel", "sheet.jpg")] }),
  },
  "variants-plan": { label: "Plan versions", build: (a) => ({ argv: ["scripts/variants.mjs", job(a.job), "plan", `--auto=${int(a.auto, 2, 8, 4)}`] }) },
  "variants-build": {
    label: "Build versions",
    heavy: true,
    build: (a) => ({ argv: ["scripts/variants.mjs", job(a.job), "build", ...(a.render ? ["--render"] : [])], outputs: [join("out", a.job, "variants", "sheet.jpg")] }),
  },
  "review-page": {
    label: "Review page",
    build: (a) => ({ argv: ["scripts/review-page.mjs", job(a.job), inside(a.file, ["out"]), `--label=${String(a.label || "v1").replace(/[^\w.-]/g, "").slice(0, 20) || "v1"}`] }),
  },
  phone: { label: "Phone copy", heavy: true, build: (a) => ({ argv: ["scripts/phone-copy.mjs", inside(a.file, ["out"])] }) },
  "posts-add": {
    label: "Queue a post",
    build: (a) => {
      const platform = oneOf(a.platform, ["instagram", "tiktok"], "Platform");
      const account = String(a.account || "");
      if (!/^@?[\w.]{2,40}$/.test(account)) fail("Account is a handle like @yourname.");
      const caption = String(a.caption || "").replace(/\r/g, "");
      if (!caption.trim() || caption.length > 2200) fail("Write a caption (2,200 characters at most).");
      const argv = ["scripts/posts.mjs", "add", inside(a.file, ["out"]), `--platform=${platform}`, `--account=${account.startsWith("@") ? account : `@${account}`}`, `--caption=${caption}`];
      if (a.trial) argv.push(`--trial=${oneOf(a.trial, ["manual", "auto"], "Trial")}`);
      if (a.aiLabel !== undefined && a.aiLabel !== null) argv.push(`--ai-label=${a.aiLabel ? "yes" : "no"}`);
      if (a.at) {
        const d = new Date(String(a.at));
        if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) fail("The post time must be in the future.");
        argv.push(`--at=${d.toISOString()}`);
      }
      if (a.job) argv.push(`--job=${job(a.job)}`);
      return { argv };
    },
  },
  "posts-approve": {
    label: "Approve a post",
    build: (a) => {
      if (!/^p\d{1,6}$/.test(String(a.id || ""))) fail("Unknown post.");
      if (!a.confirm) fail("Approve only after reading the whole post card.");
      return { argv: ["scripts/posts.mjs", "approve", a.id, `--by=${String(a.by || "Approved in the 7 Studios app").replace(/[\r\n]/g, " ").slice(0, 200)}`] };
    },
  },
  "posts-cancel": {
    label: "Cancel a post",
    build: (a) => (/^p\d{1,6}$/.test(String(a.id || "")) ? { argv: ["scripts/posts.mjs", "cancel", a.id] } : fail("Unknown post.")),
  },
  "engine-check": { label: "Check the engines", build: () => ({ argv: ["scripts/gen.mjs", "engine", "check"] }) },
  doctor: { label: "Is this computer ready?", heavy: true, build: () => ({ argv: ["scripts/doctor.mjs"] }) },
  "lora-prepare": {
    label: "Prepare a LoRA training set",
    heavy: true,
    build: (a) => {
      const name = job(a.name);
      const files = (Array.isArray(a.files) ? a.files : [a.files]).slice(0, 50).map((f) => inside(f, ["public"]));
      const argv = ["scripts/engine/lora.mjs", "prepare", name, ...files, `--seconds=${num(a.seconds, 1, 10, 3)}`];
      if (a.trigger) argv.push(`--trigger=${String(a.trigger).replace(/[^\w-]/g, "").slice(0, 30)}`);
      return { argv, outputs: [join("production", "lora", name, "sheet.jpg")] };
    },
  },
  spec: { label: "Master spec", heavy: true, build: (a) => ({ argv: ["scripts/spec.mjs", job(a.job)] }) },
};
