// This-Mac engine: Draw Things (drawthings.ai), a free app that runs image models on
// the Mac's own Apple chip. Free per image, private, and no account or credits. 7 Studios
// talks to its API server (Draw Things → Settings → API Server: HTTP, port 7860), which
// speaks the common Stable Diffusion web API:
//
//   GET  /                    the current settings, including the chosen model
//   POST /sdapi/v1/txt2img    a prompt → { images: [base64] }
//   POST /sdapi/v1/img2img    a prompt and init_images → { images: [base64] }
//
// The model, steps and sampler are whatever is chosen in Draw Things, so a preset's own
// numbers (tuned for other engines) are left out. Images and edits only: an edit here
// re-draws the picture guided by the words (strength 0.6 by default; params.strength).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { videoInfo } from "../lib/media.mjs";
import { GALLERY_DIR, IMAGE_SIZES, newId } from "./index.mjs";

const SETUP = "Open Draw Things and turn on its API Server (Settings → API Server: HTTP, port 7860). See engine/README.md.";

const api = (url) => {
  const base = url.replace(/\/$/, "");
  const call = async (path, body, timeout = 30000) => {
    let r;
    try {
      r = await fetch(`${base}${path}`, {
        ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      if (e.name === "TimeoutError" && body) throw new Error(`Draw Things took longer than ${Math.round(timeout / 60000)} minutes. Try a smaller or faster model in Draw Things.`);
      throw new Error(`Can't reach Draw Things at ${base} (${e.cause?.code || e.name}). ${SETUP}`);
    }
    if (!r.ok) throw new Error(`Draw Things answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  return { base, call };
};

export const status = async (cfg) => {
  try {
    const s = await api(cfg.mac.url).call("/", null, 5000);
    return { ok: true, url: cfg.mac.url, model: s.model || null };
  } catch (e) {
    return { ok: false, url: cfg.mac.url, error: e.message };
  }
};

export const run = async (job, cfg, onProgress) => {
  if (job.kind === "video") throw new Error("This Mac (Draw Things) makes images and edits. For video, choose another engine.");
  const { base, call } = api(cfg.mac.url);
  onProgress({ stage: "connecting", pct: 2, note: base });
  const settings = await call("/", null, 10000);
  const init = job.kind === "edit" && job.image ? readFileSync(job.image).toString("base64") : null;
  // An edit keeps the picture's shape, at about a megapixel in multiples of 64.
  const src = init ? videoInfo(job.image) : null;
  const k = src?.width && src?.height ? Math.sqrt((1024 * 1024) / (src.width * src.height)) : 0;
  const [w, h] = k ? [src.width, src.height].map((v) => Math.max(256, Math.round((v * k) / 64) * 64)) : IMAGE_SIZES[job.aspect] || IMAGE_SIZES["1x1"];
  const out = [];
  for (let i = 0; i < job.count; i++) {
    onProgress({ stage: "making", pct: Math.round(5 + (i / job.count) * 90), note: `image ${i + 1} of ${job.count} on this Mac${settings.model ? ` (${settings.model})` : ""}` });
    const body = { prompt: job.prompt, negative_prompt: job.negative, width: w, height: h, seed: job.seed + i, batch_size: 1 };
    if (init) Object.assign(body, { init_images: [init], denoising_strength: Number(job.params?.strength ?? 0.6) });
    // A laptop can take minutes per image with a large model.
    const res = await call(init ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img", body, 30 * 60 * 1000);
    const b64 = res.images?.[0];
    if (!b64) throw new Error("Draw Things finished without an image. Make one in Draw Things itself to check the model works.");
    const buf = Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ""), "base64");
    const id = newId("m");
    const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : "png";
    const file = join(GALLERY_DIR, `${id}.${ext}`);
    writeFileSync(file, buf);
    const { width, height } = videoInfo(file);
    out.push({ kind: "image", file: `gallery/${id}.${ext}`, width: width || w, height: height || h, model: settings.model || "draw-things", cost: { usd: 0, note: "this Mac" } });
  }
  onProgress({ stage: "done", pct: 100 });
  return out;
};
