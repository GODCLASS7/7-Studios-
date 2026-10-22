// Open engine: ComfyUI running open models, on this Mac or a rented GPU.
//
// A workflow is a ComfyUI graph in API format (engine/workflows/<name>.json, under
// "prompt"). The nodes 7 Studios fills in carry a title starting "7S:" that names
// what to set, e.g. "7S:prompt", "7S:seed,steps,cfg", "7S:width,height,frames".
// "7S:image" is a start image the workflow needs; "7S:image?" is one it can do
// without (the node and its links are removed when there is none). Export your own
// workflow from ComfyUI (Workflow → Export (API)), add the titles, and drop it in.
//
// ComfyUI API used: POST /upload/image, POST /prompt, GET /history/<id>, GET /view,
// GET /object_info (for `npm run engine -- check`), GET /system_stats.

import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ff, readJson, videoInfo } from "../lib/media.mjs";
import { frameCount, GALLERY_DIR, IMAGE_SIZES, newId, VIDEO_SIZES, WORKFLOW_DIR } from "./index.mjs";

const INPUTS = {
  prompt: ["text", "prompt"],
  negative: ["text", "prompt"],
  seed: ["seed", "noise_seed"],
  steps: ["steps"],
  cfg: ["cfg"],
  shift: ["shift"],
  width: ["width"],
  height: ["height"],
  batch: ["batch_size"],
  frames: ["length", "frames", "num_frames", "video_frames"],
  fps: ["fps", "frame_rate"],
  image: ["image"],
  end_image: ["image"],
  prefix: ["filename_prefix"],
};

export const loadWorkflow = (name) => {
  const wf = readJson(join(WORKFLOW_DIR, `${name}.json`));
  if (!wf?.prompt) throw new Error(`Workflow "${name}" not found or not in API format (engine/workflows/${name}.json with a "prompt" graph)`);
  return wf;
};
const tagsOf = (node) => {
  const t = node._meta?.title || "";
  if (!t.startsWith("7S:")) return [];
  return t
    .slice(3)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
};

// Fill a workflow graph from the values, removing optional image nodes that have no image.
export const patchGraph = (graph, values) => {
  const g = structuredClone(graph);
  for (const [id, node] of Object.entries(g)) {
    for (const raw of tagsOf(node)) {
      const optional = raw.endsWith("?");
      const tag = raw.replace(/\?$/, "");
      const v = values[tag];
      if (v === undefined || v === null) {
        if ((tag === "image" || tag === "end_image") && optional) {
          delete g[id];
          for (const n of Object.values(g)) for (const [k, inp] of Object.entries(n.inputs || {})) if (Array.isArray(inp) && inp[0] === id) delete n.inputs[k];
        } else if (tag === "image" || tag === "end_image") throw new Error(`This workflow needs ${tag === "image" ? "a start image" : "an end image"}`);
        continue;
      }
      const key = (INPUTS[tag] || [tag]).find((k) => k in (node.inputs || {}));
      if (!key) throw new Error(`Workflow node ${id} (${node.class_type}) is tagged "${tag}" but has none of the inputs ${(INPUTS[tag] || [tag]).join(", ")}`);
      node.inputs[key] = v;
    }
  }
  return g;
};

const api = (url) => {
  const base = url.replace(/\/$/, "");
  const req = async (path, opts = {}) => {
    let r;
    try {
      r = await fetch(`${base}${path}`, { ...opts, signal: AbortSignal.timeout(opts.timeout || 30000) });
    } catch (e) {
      throw new Error(`Can't reach ComfyUI at ${base} (${e.cause?.code || e.message}). Is it running? See engine/README.md.`);
    }
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`ComfyUI ${path} answered ${r.status}: ${body.slice(0, 400)}`);
    }
    return r;
  };
  return {
    base,
    stats: async () => (await req("/system_stats", { timeout: 5000 })).json(),
    objectInfo: async () => (await req("/object_info", { timeout: 60000 })).json(),
    upload: async (file) => {
      const fd = new FormData();
      fd.append("image", new Blob([readFileSync(file)]), `7s-${Date.now()}-${basename(file)}`);
      fd.append("overwrite", "true");
      const j = await (await req("/upload/image", { method: "POST", body: fd, timeout: 120000 })).json();
      return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
    },
    queue: async (graph) => {
      const j = await (await req("/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph, client_id: "7studios" }) })).json();
      if (j.node_errors && Object.keys(j.node_errors).length) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(j.node_errors).slice(0, 500)}`);
      return j.prompt_id;
    },
    history: async (id) => (await req(`/history/${id}`)).json(),
    view: async (f) => Buffer.from(await (await req(`/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || "")}&type=${f.type || "output"}`, { timeout: 300000 })).arrayBuffer()),
  };
};

export const status = async (cfg) => {
  try {
    const s = await api(cfg.open.url).stats();
    const d = s.devices?.[0];
    return { ok: true, url: cfg.open.url, device: d ? `${d.name} (${d.type}${d.vram_total ? `, ${(d.vram_total / 1e9).toFixed(0)} GB` : ""})` : "unknown", version: s.system?.comfyui_version || null };
  } catch (e) {
    return { ok: false, url: cfg.open.url, error: e.message };
  }
};

// Which nodes and model files each workflow needs, against what this ComfyUI has.
export const check = async (cfg, names) => {
  const info = await api(cfg.open.url).objectInfo();
  return names.map((name) => {
    const wf = loadWorkflow(name);
    const missingNodes = [...new Set(Object.values(wf.prompt).map((n) => n.class_type))].filter((c) => !info[c]);
    const missingModels = [];
    for (const n of Object.values(wf.prompt)) {
      const def = info[n.class_type]?.input?.required || {};
      for (const [k, v] of Object.entries(n.inputs || {})) {
        if (typeof v !== "string" || !/\.(safetensors|ckpt|pt|pth|gguf|bin)$/i.test(v)) continue;
        const opts = Array.isArray(def[k]?.[0]) ? def[k][0] : null;
        if (opts && !opts.includes(v)) missingModels.push(v);
      }
    }
    return { name, ok: !missingNodes.length && !missingModels.length, missingNodes, missingModels: [...new Set(missingModels)], needs: wf._7s?.needs || [] };
  });
};

export const run = async (job, cfg, onProgress) => {
  const kind = job.kind;
  const wfName = job.model || cfg.open.workflows[kind]?.[job.quality] || cfg.open.workflows[kind]?.draft;
  const wf = loadWorkflow(wfName);
  const meta = wf._7s || {};
  const c = api(cfg.open.url);
  onProgress({ stage: "connecting", pct: 2, note: c.base });
  await c.stats();
  let image = null;
  if (job.image) {
    onProgress({ stage: "uploading", pct: 5 });
    image = await c.upload(job.image);
  }
  const out = [];
  for (let i = 0; i < job.count; i++) {
    const values = { prompt: job.prompt, negative: job.negative, seed: job.seed + i, image, prefix: `7studios/${job.id}-${i}`, batch: 1 };
    let fps = null;
    if (kind === "video") {
      const sizes = VIDEO_SIZES[job.quality] || VIDEO_SIZES.draft;
      const [w, h] = meta.sizes?.[job.aspect] || sizes[job.aspect] || sizes["9x16"];
      fps = meta.fps || 24;
      Object.assign(values, { width: w, height: h, frames: frameCount(job.seconds, fps), fps });
    } else if (kind === "image") {
      const [w, h] = meta.sizes?.[job.aspect] || IMAGE_SIZES[job.aspect] || IMAGE_SIZES["1x1"];
      Object.assign(values, { width: w, height: h });
    }
    for (const k of ["steps", "cfg", "shift"]) if (job.params?.[k] !== undefined) values[k] = job.params[k];
    const graph = patchGraph(wf.prompt, values);
    const t0 = Date.now();
    const promptId = await c.queue(graph);
    onProgress({ stage: "queued", pct: 10, note: `ComfyUI job ${promptId}` });
    let files = null;
    // Video on a laptop can take a long while; poll for up to two hours.
    for (let n = 0; n < 3600; n++) {
      await new Promise((r) => setTimeout(r, 2000));
      const h = (await c.history(promptId))[promptId];
      if (!h) {
        onProgress({ stage: "rendering", pct: Math.min(90, 10 + n), note: `${Math.round((Date.now() - t0) / 1000)} s` });
        continue;
      }
      if (h.status?.status_str === "error") throw new Error(`ComfyUI failed: ${JSON.stringify(h.status.messages?.slice(-1) || []).slice(0, 400)}`);
      files = Object.values(h.outputs || {}).flatMap((o) => [...(o.images || []), ...(o.gifs || []), ...(o.videos || []), ...(o.video || [])]).filter((f) => f?.filename);
      if (files.length) break;
    }
    if (!files?.length) throw new Error("ComfyUI finished without an output file (check the workflow's save node)");
    const f = files.find((x) => /\.(mp4|webm|mov)$/i.test(x.filename)) || files[0];
    const ext = (f.filename.match(/\.[a-z0-9]+$/i) || [".png"])[0].toLowerCase();
    const id = newId("o");
    const rel = `gallery/${id}${ext}`;
    writeFileSync(join(GALLERY_DIR, `${id}${ext}`), await c.view(f));
    const secs = (Date.now() - t0) / 1000;
    const cost = { usd: cfg.open.gpuHourly ? Number(((secs / 3600) * cfg.open.gpuHourly).toFixed(3)) : 0, gpuSeconds: Math.round(secs), note: cfg.open.gpuHourly ? `${Math.round(secs)} s of GPU time` : "your own machine" };
    const isVideo = /\.(mp4|webm|mov|gif)$/i.test(ext);
    const r = { kind: isVideo ? "video" : "image", file: rel, model: wfName, cost };
    const full = join("public", rel);
    try {
      const v = videoInfo(full);
      Object.assign(r, { width: v.width, height: v.height });
      if (isVideo) {
        Object.assign(r, { seconds: v.duration, fps: v.fps || fps });
        ff(["-i", full, "-frames:v", "1", "-q:v", "4", join(GALLERY_DIR, `${id}.jpg`)]);
        r.thumb = `gallery/${id}.jpg`;
      }
    } catch {
      /* size unknown */
    }
    out.push(r);
    onProgress({ stage: "saved", pct: Math.round(((i + 1) / job.count) * 100), note: rel });
  }
  return out;
};
