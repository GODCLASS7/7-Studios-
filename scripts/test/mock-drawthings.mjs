#!/usr/bin/env node
// A stand-in for Draw Things' API server, for testing the "mac" engine without a Mac.
// It answers GET / with settings and POST /sdapi/v1/txt2img and /img2img with a small
// test image made by ffmpeg (base64), the way Draw Things does.
//
//   node scripts/test/mock-drawthings.mjs [--port=7861] [--log=production/tmp/test/mock-drawthings.json]
//
// It also writes every request it received (without image data) to the log file.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { parseArgs } from "../lib/media.mjs";

const { opt } = parseArgs(process.argv.slice(2));
const PORT = Number(opt.port || 7861);
const LOG = opt.log || join("production", "tmp", "test", "mock-drawthings.json");
const DIR = join("production", "tmp", "test", "mock-drawthings");
mkdirSync(DIR, { recursive: true });
const received = [];

const image = (w, h, seed) => {
  const f = join(DIR, `${seed}.png`);
  spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc2=s=${w}x${h}`, "-frames:v", "1", f]);
  return readFileSync(f).toString("base64");
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const json = (code, body) => (res.writeHead(code, { "content-type": "application/json" }), res.end(JSON.stringify(body)));
  if (req.method === "GET" && req.url === "/") return json(200, { model: "mock_flux_1_schnell_q5p.ckpt", steps: 4, sampler: "Euler A Trailing" });
  if (req.method === "POST" && /^\/sdapi\/v1\/(txt2img|img2img)$/.test(req.url)) {
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    const { init_images, ...rest } = body;
    received.push({ path: req.url, ...rest, init_images: init_images ? init_images.length : 0 });
    writeFileSync(LOG, JSON.stringify(received, null, 2));
    if (!body.prompt) return json(400, { error: "no prompt" });
    const w = Math.round((body.width || 512) / 64) * 64;
    const h = Math.round((body.height || 512) / 64) * 64;
    return json(200, { images: [image(Math.min(w, 512), Math.min(h, 512), body.seed ?? 0)], parameters: rest });
  }
  json(404, { error: "not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock Draw Things on http://127.0.0.1:${PORT}`));
