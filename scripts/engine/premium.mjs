// Premium engine: a hosted model API with your own key, paid per use. Built for fal.ai's
// queue API (FAL_KEY in .env): submit to https://queue.fal.run/<endpoint>, poll the
// status URL, read the result. Models are listed in engine/models.json, each with its
// endpoint, how 7 Studios' fields map to the model's inputs, where the output URL is,
// and the price per run that you confirm on the provider's site (never guessed here).
//
// Untested against the live service from the cloud workspace: run one cheap image first.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ff, readJson, videoInfo } from "../lib/media.mjs";
import { GALLERY_DIR, newId } from "./index.mjs";

export const MODELS_PATH = join("engine", "models.json");
export const listModels = () => readJson(MODELS_PATH, { models: [] }).models;

// fal's named sizes for image models; other models take an aspect ratio string.
const SIZE_NAMES = { "1x1": "square_hd", "9x16": "portrait_16_9", "16x9": "landscape_16_9", "4x5": "portrait_4_3", "3x2": "landscape_4_3" };
const RATIO = { "1x1": "1:1", "9x16": "9:16", "16x9": "16:9", "4x5": "4:5", "3x2": "3:2" };
const dataUri = (file) => {
  const ext = file.split(".").pop().toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
};
const fill = (tpl, vals) => {
  if (typeof tpl === "string") {
    const m = tpl.match(/^\{(\w+)\}$/);
    if (m) return vals[m[1]];
    return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ""));
  }
  if (Array.isArray(tpl)) return tpl.map((x) => fill(x, vals));
  if (tpl && typeof tpl === "object") {
    const o = {};
    for (const [k, v] of Object.entries(tpl)) {
      const f = fill(v, vals);
      if (f !== undefined && f !== null && f !== "") o[k] = f;
    }
    return o;
  }
  return tpl;
};
const at = (obj, path) => {
  let cur = obj;
  for (const part of path.split(".")) {
    const m = part.match(/^(\w+)\[(\d+)\]$/);
    cur = m ? cur?.[m[1]]?.[Number(m[2])] : cur?.[part];
  }
  return cur;
};

export const run = async (job, cfg, onProgress) => {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("No premium key yet: add FAL_KEY to .env (Settings in the app, or edit the file). Never paste keys into a chat.");
  const modelId = job.model || cfg.premium[job.kind];
  const model = listModels().find((m) => m.id === modelId);
  if (!model) throw new Error(`Choose a premium model for ${job.kind} (engine/models.json)`);
  if (model.kind !== job.kind) throw new Error(`${model.id} is a ${model.kind} model`);
  if (model.needsImage && !job.image) throw new Error(`${model.name} needs a start image`);
  const out = [];
  for (let i = 0; i < job.count; i++) {
    const vals = {
      prompt: job.prompt,
      negative: job.negative,
      seed: job.seed + i,
      size_name: SIZE_NAMES[job.aspect] || "square_hd",
      ratio: RATIO[job.aspect] || "1:1",
      seconds: String(job.seconds),
      image: job.image ? dataUri(job.image) : null,
      end_image: job.endImage ? dataUri(job.endImage) : null,
    };
    const body = fill(model.input, vals);
    onProgress({ stage: "submitting", pct: 5, note: model.endpoint });
    const auth = { authorization: `Key ${key}`, "content-type": "application/json" };
    const sub = await fetch(`https://queue.fal.run/${model.endpoint}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
    if (!sub.ok) throw new Error(`${model.name}: the provider answered ${sub.status}: ${(await sub.text()).slice(0, 300)}`);
    const { status_url: statusUrl, response_url: responseUrl } = await sub.json();
    const t0 = Date.now();
    for (let n = 0; n < 1800; n++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await (await fetch(statusUrl, { headers: auth })).json();
      if (st.status === "COMPLETED") break;
      if (st.status === "FAILED" || st.error) throw new Error(`${model.name} failed: ${JSON.stringify(st).slice(0, 300)}`);
      onProgress({ stage: st.status === "IN_QUEUE" ? "queued" : "rendering", pct: Math.min(90, 10 + n), note: `${Math.round((Date.now() - t0) / 1000)} s` });
    }
    const res = await (await fetch(responseUrl, { headers: auth })).json();
    const url = at(res, model.output);
    if (!url) throw new Error(`${model.name}: no output at "${model.output}" in ${JSON.stringify(res).slice(0, 300)}`);
    const bin = Buffer.from(await (await fetch(url)).arrayBuffer());
    const isVideo = model.kind === "video";
    const ext = isVideo ? ".mp4" : /\.jpe?g(\?|$)/i.test(url) ? ".jpg" : /\.webp(\?|$)/i.test(url) ? ".webp" : ".png";
    const id = newId("p");
    const rel = `gallery/${id}${ext}`;
    writeFileSync(join(GALLERY_DIR, `${id}${ext}`), bin);
    const r = { kind: isVideo ? "video" : "image", file: rel, model: model.id, cost: { usd: model.price ?? null, note: model.price != null ? `${model.price} USD per run (from engine/models.json)` : "price not set: check the provider" } };
    try {
      const v = videoInfo(join("public", rel));
      Object.assign(r, { width: v.width, height: v.height });
      if (isVideo) {
        Object.assign(r, { seconds: v.duration, fps: v.fps });
        ff(["-i", join("public", rel), "-frames:v", "1", "-q:v", "4", join(GALLERY_DIR, `${id}.jpg`)]);
        r.thumb = `gallery/${id}.jpg`;
      }
    } catch {
      /* size unknown */
    }
    out.push(r);
  }
  return out;
};
