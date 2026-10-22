#!/usr/bin/env node
// A stand-in for ComfyUI's API, for testing the open engine without a GPU. It accepts
// the same calls (system_stats, object_info, upload/image, prompt, history, view),
// checks each graph is complete (every link points at a node that exists, nothing
// tagged "7S:" left unfilled), and answers with a small test image or clip made by ffmpeg.
//
//   node scripts/test/mock-comfy.mjs [--port=8199] [--log=production/tmp/test/mock-comfy.json]
//
// It also writes every graph it received to the log file, for the tests to inspect.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { parseArgs, readJson } from "../lib/media.mjs";

const { opt } = parseArgs(process.argv.slice(2));
const PORT = Number(opt.port || 8199);
const LOG = opt.log || join("production", "tmp", "test", "mock-comfy.json");
const DIR = join("production", "tmp", "test", "mock-comfy");
mkdirSync(DIR, { recursive: true });
const received = [];
const history = {};

// object_info: every node class our workflows use, with the model files as loader options.
const workflows = readdirSync(join("engine", "workflows")).map((f) => readJson(join("engine", "workflows", f)));
const info = {};
for (const wf of workflows)
  for (const n of Object.values(wf.prompt)) {
    info[n.class_type] ??= { input: { required: {} } };
    for (const [k, v] of Object.entries(n.inputs))
      if (typeof v === "string" && /\.(safetensors|ckpt)$/.test(v)) {
        const opts = (info[n.class_type].input.required[k] ??= [[]]);
        if (!opts[0].includes(v)) opts[0].push(v);
      }
  }
if (opt["drop-model"]) for (const def of Object.values(info)) for (const v of Object.values(def.input.required)) v[0] = v[0].filter((m) => m !== opt["drop-model"]);

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const read = (req) =>
  new Promise((ok) => {
    const parts = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => ok(Buffer.concat(parts)));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/system_stats") return json(res, 200, { system: { comfyui_version: "mock" }, devices: [{ name: "mock-gpu", type: "cuda", vram_total: 24e9 }] });
  if (url.pathname === "/object_info") return json(res, 200, info);
  if (url.pathname === "/upload/image" && req.method === "POST") {
    const body = await read(req);
    const name = (body.toString("latin1").match(/filename="([^"]+)"/) || [])[1] || "upload.png";
    writeFileSync(join(DIR, name), body);
    return json(res, 200, { name, subfolder: "", type: "input" });
  }
  if (url.pathname === "/prompt" && req.method === "POST") {
    const { prompt } = JSON.parse((await read(req)).toString());
    const errors = [];
    for (const [id, n] of Object.entries(prompt)) {
      for (const [k, v] of Object.entries(n.inputs || {})) if (Array.isArray(v) && !prompt[v[0]]) errors.push(`${id}.${k} links to missing node ${v[0]}`);
      if (n.class_type === "CLIPTextEncode" && /7S:prompt/.test(n._meta?.title || "") && !n.inputs.text) errors.push(`${id} prompt is empty`);
    }
    if (errors.length) return json(res, 400, { error: "invalid prompt", node_errors: { mock: errors } });
    const id = `mock-${received.length + 1}`;
    received.push({ id, prompt });
    writeFileSync(LOG, JSON.stringify(received, null, 1));
    const isVideo = Object.values(prompt).some((n) => n.class_type === "SaveVideo");
    const size = Object.values(prompt).find((n) => n.inputs?.width && n.inputs?.height)?.inputs || { width: 512, height: 512 };
    const file = `${id}.${isVideo ? "mp4" : "png"}`;
    const w = Math.round(size.width / 2) * 2;
    const h = Math.round(size.height / 2) * 2;
    const args = isVideo
      ? ["-f", "lavfi", "-i", `testsrc2=s=${w}x${h}:r=16:d=1`, "-pix_fmt", "yuv420p", "-c:v", "libx264", join(DIR, file)]
      : ["-f", "lavfi", "-i", `testsrc2=s=${w}x${h}:d=1`, "-frames:v", "1", join(DIR, file)];
    spawnSync("ffmpeg", ["-v", "error", "-y", ...args]);
    const save = Object.entries(prompt).find(([, n]) => /^Save(Image|Video)$/.test(n.class_type));
    history[id] = { status: { status_str: "success", completed: true }, outputs: { [save[0]]: { images: [{ filename: file, subfolder: "", type: "output" }], animated: [isVideo] } } };
    return json(res, 200, { prompt_id: id, number: received.length, node_errors: {} });
  }
  const h = url.pathname.match(/^\/history\/(.+)$/);
  if (h) return json(res, 200, history[h[1]] ? { [h[1]]: history[h[1]] } : {});
  if (url.pathname === "/view") {
    res.writeHead(200);
    return res.end(readFileSync(join(DIR, url.searchParams.get("filename"))));
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock ComfyUI on http://127.0.0.1:${PORT}`));
