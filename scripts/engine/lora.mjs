#!/usr/bin/env node
// LoRA training kit: turn footage or photos you own into a training set for a small
// add-on to an open video model (your look, a camera move, a product, a character
// who agreed to it), then train it on a rented GPU.
//
//   node scripts/engine/lora.mjs prepare <name> <video or image files…> [--seconds=3] [--size=832x480]
//                                [--fps=16] [--max-clips=60] [--trigger=<word>]
//   node scripts/engine/lora.mjs status <name>
//
// prepare writes production/lora/<name>/:
//   dataset/clip-NNN.mp4 (or img-NNN.jpg)  cut, scaled and set to the model's frame rate
//   dataset/clip-NNN.txt                    one caption per clip, starting with the trigger word
//                                           (left as "<trigger>, " for Claude to finish from the sheet)
//   sheet.jpg                               every clip's middle frame, numbered, for writing captions
//   dataset.toml                            a dataset config for a Wan LoRA trainer (musubi-tuner style)
//   TRAIN.md                                the rented-GPU steps
// Training itself runs on the rented machine; nothing here trains. The config follows
// the trainer's documented format as of writing: check it against the trainer's README.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { duration, ff, parseArgs } from "../lib/media.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [cmd, name, ...files] = pos;
const usage = "Usage: node scripts/engine/lora.mjs prepare <name> <files…> [--seconds=3] [--size=832x480] [--trigger=word] | status <name>";
if (!["prepare", "status"].includes(cmd) || !name || !/^[a-z0-9-]+$/.test(name)) {
  console.error(usage);
  process.exit(1);
}
const dir = join("production", "lora", name);
const ds = join(dir, "dataset");

if (cmd === "status") {
  if (!existsSync(ds)) {
    console.error(`No dataset ${name} yet.`);
    process.exit(1);
  }
  const all = readdirSync(ds);
  const media = all.filter((f) => /\.(mp4|jpg)$/.test(f));
  const { readFileSync } = await import("node:fs");
  const empty = media.filter((f) => {
    const t = join(ds, f.replace(/\.(mp4|jpg)$/, ".txt"));
    return !existsSync(t) || readFileSync(t, "utf8").trim().split(",").slice(1).join(",").trim().length < 10;
  });
  console.log(`${name}: ${media.length} items, ${media.length - empty.length} captioned${empty.length ? `; still to caption: ${empty.slice(0, 10).join(", ")}${empty.length > 10 ? "…" : ""}` : ""}`);
  process.exit(0);
}

const [w, h] = String(opt.size || "832x480").split("x").map(Number);
const seconds = Number(opt.seconds || 3);
const fps = Number(opt.fps || 16);
const max = Number(opt["max-clips"] || 60);
const trigger = String(opt.trigger || name.replace(/-/g, ""));
mkdirSync(ds, { recursive: true });
let n = 0;
const made = [];
for (const f of files) {
  const src = existsSync(f) ? f : join("public", f);
  if (!existsSync(src)) {
    console.error(`Not found: ${f}`);
    process.exit(1);
  }
  const isImage = /\.(png|jpe?g|webp)$/i.test(src);
  if (isImage) {
    const out = join(ds, `img-${String(++n).padStart(3, "0")}.jpg`);
    ff(["-i", src, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, "-q:v", "2", out]);
    made.push(out);
    continue;
  }
  const len = duration(src);
  for (let t = 0; t + seconds <= len + 0.01 && made.length < max; t += seconds) {
    const out = join(ds, `clip-${String(++n).padStart(3, "0")}.mp4`);
    ff(["-ss", t.toFixed(3), "-t", String(seconds), "-i", src, "-an", "-vf", `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", out]);
    made.push(out);
  }
}
for (const m of made) {
  const txt = m.replace(/\.(mp4|jpg)$/, ".txt");
  if (!existsSync(txt)) writeFileSync(txt, `${trigger}, `);
}
// A numbered contact sheet of every clip's middle frame, for writing the captions.
const thumbs = join(dir, "thumbs");
mkdirSync(thumbs, { recursive: true });
made.forEach((m, i) => {
  const at = m.endsWith(".mp4") ? ["-ss", String(seconds / 2)] : [];
  ff([...at, "-i", m, "-frames:v", "1", "-vf", `scale=320:-2,pad=iw:ih+28:0:28:color=0x111111`, join(thumbs, `${String(i + 1).padStart(3, "0")}.jpg`)]);
});
const cols = Math.min(6, made.length);
ff(["-framerate", "1", "-i", join(thumbs, "%03d.jpg"), "-vf", `tile=${cols}x${Math.ceil(made.length / cols)}:padding=4:color=0x000000`, "-frames:v", "1", join(dir, "sheet.jpg")]);

writeFileSync(
  join(dir, "dataset.toml"),
  `# Dataset config for a Wan LoRA trainer (musubi-tuner style). Check the field names
# against the trainer's README before training. Paths are on the GPU machine.
[general]
resolution = [${w}, ${h}]
caption_extension = ".txt"
batch_size = 1
enable_bucket = true
bucket_no_upscale = false

[[datasets]]
${made.some((m) => m.endsWith(".mp4")) ? `video_directory = "/workspace/lora/${name}/dataset"\ncache_directory = "/workspace/lora/${name}/cache"\ntarget_frames = [1, ${Math.round((seconds * fps) / 4) * 4 + 1}]\nframe_extraction = "head"` : `image_directory = "/workspace/lora/${name}/dataset"\ncache_directory = "/workspace/lora/${name}/cache"`}
`,
);
writeFileSync(
  join(dir, "TRAIN.md"),
  `# Training the "${name}" LoRA on a rented GPU

Trigger word: \`${trigger}\`. ${made.length} items at ${w}×${h}${made.some((m) => m.endsWith(".mp4")) ? `, ${seconds} s clips at ${fps} fps` : ""}.

1. **Captions.** Every \`dataset/*.txt\` starts with the trigger word. Finish each one from
   \`sheet.jpg\` (numbered in the same order): what is in frame, the camera move, the light. Ask
   Claude to do it from the sheet. \`node scripts/engine/lora.mjs status ${name}\` lists any left.
2. **Rights.** Only footage you own or have permission for; a real person only with their
   recorded agreement (see characters/).
3. **Rent a GPU** with 24 GB or more (48–80 GB is faster and allows 720p). Get a quote of the
   hourly price first; training a small video LoRA takes roughly a few hours.
4. **On the GPU machine:** install the trainer (for Wan: musubi-tuner or diffusion-pipe, per their
   README), download the base model the open engine uses, copy \`production/lora/${name}/\` to
   \`/workspace/lora/${name}/\`, and train with \`dataset.toml\`.
5. **Use it:** put the LoRA file in ComfyUI's \`models/loras/\`, add a LoraLoaderModelOnly node to
   the video workflow (engine/workflows/), and use the trigger word in prompts.
6. **Switch the GPU off** when it's done.
`,
);
console.log(`✔ ${made.length} items in ${ds}\n  sheet: ${join(dir, "sheet.jpg")} (write the captions from it)\n  next: ${join(dir, "TRAIN.md")}`);


