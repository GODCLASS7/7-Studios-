// Demo engine: placeholder results made with ffmpeg on this computer, so every studio
// can be tried before a real engine is set up. Nothing here is AI: an image is a
// gradient coloured from the prompt, an edit is a colour shift, a clip is a slow push
// into the start image (or a moving gradient). Every result is marked as a demo.

import { createHash } from "node:crypto";
import { join } from "node:path";
import { ff, videoInfo } from "../lib/media.mjs";
import { frameCount, GALLERY_DIR, IMAGE_SIZES, newId, VIDEO_SIZES } from "./index.mjs";

const colours = (text, seed) => {
  const h = createHash("sha256").update(`${text}|${seed}`).digest("hex");
  return [0, 6, 12].map((i) => `0x${h.slice(i, i + 6)}`);
};
const must = (r, what) => {
  if (r.status !== 0) throw new Error(`demo ${what} failed: ${(r.stderr || "").split("\n").slice(-3).join(" ")}`);
};

export const run = async (job, _cfg, onProgress) => {
  const out = [];
  for (let i = 0; i < job.count; i++) {
    const seed = job.seed + i;
    const id = newId("d");
    onProgress({ stage: "making", pct: Math.round((i / job.count) * 100), note: `demo ${i + 1} of ${job.count}` });
    if (job.kind === "image") {
      const [w, h] = IMAGE_SIZES[job.aspect] || IMAGE_SIZES["1x1"];
      const [c0, c1, c2] = colours(job.prompt, seed);
      const file = join(GALLERY_DIR, `${id}.png`);
      must(ff(["-f", "lavfi", "-i", `gradients=s=${w}x${h}:c0=${c0}:c1=${c1}:c2=${c2}:n=3:seed=${seed % 100000}:d=1`, "-frames:v", "1", file]), "image");
      out.push({ kind: "image", file: `gallery/${id}.png`, width: w, height: h, model: "demo", cost: { usd: 0, note: "demo" } });
    } else if (job.kind === "edit") {
      const file = join(GALLERY_DIR, `${id}.png`);
      const hue = (seed % 120) + 30;
      must(ff(["-i", job.image, "-vf", `hue=h=${hue}:s=1.15,vignette=PI/5`, "-frames:v", "1", file]), "edit");
      const { width, height } = videoInfo(file);
      out.push({ kind: "image", file: `gallery/${id}.png`, width, height, model: "demo", cost: { usd: 0, note: "demo" } });
    } else {
      const sizes = VIDEO_SIZES[job.quality] || VIDEO_SIZES.draft;
      const [w, h] = sizes[job.aspect] || sizes["9x16"];
      const fps = 24;
      const frames = frameCount(job.seconds, fps);
      const file = join(GALLERY_DIR, `${id}.mp4`);
      if (job.image) {
        // A slow push into the start image (the "image-to-video" stand-in).
        must(
          ff([
            "-loop", "1", "-i", job.image,
            "-vf", `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=z='min(1+0.0015*on,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps},format=yuv420p`,
            "-frames:v", String(frames), "-c:v", "libx264", "-crf", "20", file,
          ]),
          "video",
        );
      } else {
        const [c0, c1, c2] = colours(job.prompt, seed);
        must(ff(["-f", "lavfi", "-i", `gradients=s=${w}x${h}:c0=${c0}:c1=${c1}:c2=${c2}:n=3:speed=0.02:seed=${seed % 100000}:r=${fps}:d=${frames / fps}`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", file]), "video");
      }
      const thumb = join(GALLERY_DIR, `${id}.jpg`);
      ff(["-i", file, "-frames:v", "1", "-q:v", "4", thumb]);
      out.push({ kind: "video", file: `gallery/${id}.mp4`, thumb: `gallery/${id}.jpg`, width: w, height: h, seconds: frames / fps, fps, model: "demo", cost: { usd: 0, note: "demo" } });
    }
  }
  onProgress({ stage: "done", pct: 100 });
  return out;
};
