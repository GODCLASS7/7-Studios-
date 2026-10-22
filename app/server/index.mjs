#!/usr/bin/env node
// 7 Studios: the app. A small web server on this computer only (127.0.0.1), serving
// the studio's interface and an API over the same scripts and engine Claude uses.
//
//   npm run app                 build the interface if needed, start, open the browser
//   npm run app -- --port=7777 --no-open
//
// Nothing here is reachable from other computers. Requests must come from the app's
// own page (Host and Origin checks, plus a header the page adds), files are served
// only from public/, out/ and the built interface, and the only things it can run are
// the tasks in tasks.mjs. API keys go into .env and are never sent back.

import { spawn, spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(ROOT);
const { loadEnv, parseArgs, readJson } = await import("../../scripts/lib/media.mjs");
const engine = await import("../../scripts/engine/index.mjs");
const { TASKS, TaskError, COMPOSITIONS, inside } = await import("./tasks.mjs");
loadEnv();

const { opt } = parseArgs(process.argv.slice(2));
const PORT = Number(opt.port || process.env.SEVEN_PORT || 7777);
const DIST = join(ROOT, "app", "ui", "dist");
const KEYS = ["FAL_KEY", "ELEVENLABS_API_KEY"];
const VERSION = readJson("package.json", {}).version || "0.0.0";

// ── the interface: build it when it's missing or older than its source ───────
const newest = (dir) => {
  let t = 0;
  if (!existsSync(dir)) return 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
};
if (!opt["no-build"]) {
  const built = existsSync(join(DIST, "index.html")) ? statSync(join(DIST, "index.html")).mtimeMs : 0;
  const src = Math.max(newest(join(ROOT, "app", "ui", "src")), newest(join(ROOT, "src")), statSync(join(ROOT, "app", "ui", "index.html")).mtimeMs);
  if (built < src) {
    console.log("Building the 7 Studios interface (about a minute, only after changes)…");
    const r = spawnSync(process.execPath, [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "app/ui/vite.config.mjs", "--logLevel", "warn"], { stdio: "inherit" });
    if (r.status !== 0) {
      console.error("The interface didn't build. Fix the error above, or run: npm run app:dev");
      process.exit(1);
    }
  }
}

// ── small helpers ────────────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".pdf": "application/pdf", ".webmanifest": "application/manifest+json", ".map": "application/json",
};
const UPLOAD_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".srt", ".lrc", ".txt", ".json", ".woff2", ".ttf", ".otf"]);
const send = (res, code, body, headers = {}) => {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json" : "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
  res.end(data);
};
const readBody = (req, limit = 2e6) =>
  new Promise((ok, bad) => {
    let n = 0;
    const chunks = [];
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        bad(new TaskError("Request too large."));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        bad(new TaskError("Couldn't read the request."));
      }
    });
    req.on("error", bad);
  });
// Serve one file from inside a root folder, with byte ranges (video seeking).
const serveFile = (req, res, root, rel) => {
  let p;
  try {
    p = resolve(root, normalize(decodeURIComponent(rel)).replace(/^([/\\])+/, ""));
  } catch {
    return send(res, 400, "Bad path");
  }
  if (p !== root && !p.startsWith(root + sep)) return send(res, 403, "Forbidden");
  if (!existsSync(p) || !statSync(p).isFile()) return send(res, 404, "Not found");
  const size = statSync(p).size;
  const type = MIME[extname(p).toLowerCase()] || "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-cache", "x-content-type-options": "nosniff" };
  if (range && size) {
    let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] !== "" && range[2] !== "" ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return send(res, 416, "", { "content-range": `bytes */${size}` });
    res.writeHead(206, { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    if (req.method === "HEAD") return res.end();
    return createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...base, "content-length": size });
  if (req.method === "HEAD") return res.end();
  createReadStream(p).pipe(res);
};

// ── live events (server-sent) ────────────────────────────────────────────────
const listeners = new Set();
const emit = (ev) => {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const r of listeners) r.write(line);
};
setInterval(() => {
  for (const r of listeners) r.write(": ping\n\n");
}, 20000).unref();

// ── runs: studio scripts, one heavy one at a time ────────────────────────────
const runs = [];
const queue = [];
let busy = false;
const RUNS_LOG = join("production", "app", "runs.json");
const persist = () => {
  mkdirSync(dirname(RUNS_LOG), { recursive: true });
  writeFileSync(RUNS_LOG, JSON.stringify(runs.slice(-100).map(({ child, ...r }) => ({ ...r, log: r.log.slice(-200) })), null, 1));
};
for (const r of readJson(RUNS_LOG, [])) runs.push({ ...r, status: r.status === "running" || r.status === "queued" ? "stopped" : r.status });
const publicRun = ({ child, ...r }) => r;
const startRun = (run) => {
  run.status = "running";
  run.startedAt = new Date().toISOString();
  emit({ type: "run", run: publicRun(run) });
  const child = spawn(process.execPath, run.argv, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: "0" } });
  run.child = child;
  const onLine = (stream) => (buf) => {
    for (const raw of buf.toString("utf8").split(/\r?\n|\r/)) {
      const line = raw.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
      if (!line) continue;
      run.log.push(line);
      if (run.log.length > 2000) run.log.splice(0, run.log.length - 2000);
      emit({ type: "log", id: run.id, line, stream });
    }
  };
  child.stdout.on("data", onLine("out"));
  child.stderr.on("data", onLine("err"));
  child.on("close", (code) => {
    run.code = code;
    run.status = run.status === "cancelled" ? "cancelled" : code === 0 ? "done" : "failed";
    run.endedAt = new Date().toISOString();
    run.outputs = (run.outputs || []).filter((o) => existsSync(o));
    delete run.child;
    if (run.heavy) busy = false;
    persist();
    emit({ type: "run", run: publicRun(run) });
    next();
  });
};
const next = () => {
  if (busy || !queue.length) return;
  const run = queue.shift();
  busy = true;
  startRun(run);
};
const addRun = (task, args) => {
  const t = TASKS[task];
  if (!t) throw new TaskError("Unknown task.");
  const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const { argv, outputs = [] } = t.build(args || {}, id);
  const run = { id, task, label: t.label, args, argv, heavy: !!t.heavy, status: "queued", createdAt: new Date().toISOString(), log: [], outputs };
  runs.push(run);
  if (runs.length > 300) runs.splice(0, runs.length - 300);
  emit({ type: "run", run: publicRun(run) });
  if (run.heavy) {
    queue.push(run);
    next();
  } else startRun(run);
  return publicRun(run);
};

// ── generations (the engine runs in this process) ───────────────────────────
const gens = [];
const generateNow = (req) => {
  const cfg = engine.loadConfig();
  const eng = req.engine || cfg.default;
  if (eng === "premium" && !req.confirmPaid) throw new TaskError("Premium generations are paid on your fal.ai account: confirm the cost first.");
  if (eng === "premium" && !process.env.FAL_KEY) throw new TaskError("Add your fal.ai key in Settings first.");
  const g = { id: `g${Date.now().toString(36)}`, req: { ...req, confirmPaid: undefined }, engine: eng, status: "running", stage: "starting", pct: 0, items: [], error: null, createdAt: new Date().toISOString() };
  gens.unshift(g);
  if (gens.length > 100) gens.pop();
  emit({ type: "gen", gen: g });
  engine
    .generate({ ...req, engine: eng }, (p) => {
      Object.assign(g, { stage: p.stage || g.stage, pct: p.pct ?? g.pct, note: p.note || g.note });
      emit({ type: "gen", gen: g });
    })
    .then(({ items }) => {
      g.items = items;
      g.status = items.some((i) => i.pending) ? "waiting" : "done";
      g.pct = 1;
    })
    .catch((e) => {
      g.status = "failed";
      g.error = String(e.message || e).split("\n")[0];
    })
    .finally(() => emit({ type: "gen", gen: g }));
  return g;
};

// An engine check that failed on what the user entered: show its message as is.
const userError = (fn) => {
  try {
    return fn();
  } catch (e) {
    throw new TaskError(String(e.message || e));
  }
};

// ── .env: keys are written, never read back ─────────────────────────────────
const setKey = (name, value) => {
  if (!KEYS.includes(name)) throw new TaskError("Unknown key.");
  const v = String(value ?? "").trim();
  if (v && (!/^[\x21-\x7e]{8,400}$/.test(v) || /["'`$\\]/.test(v))) throw new TaskError("That doesn't look like a key (no spaces or quotes).");
  const lines = existsSync(".env") ? readFileSync(".env", "utf8").split(/\r?\n/) : [];
  const out = lines.filter((l) => !l.startsWith(`${name}=`));
  while (out.length && out[out.length - 1] === "") out.pop();
  if (v) out.push(`${name}=${v}`);
  writeFileSync(".env", `${out.join("\n")}\n`, { mode: 0o600 });
  if (v) process.env[name] = v;
  else delete process.env[name];
};

// ── reading the studio's folders ────────────────────────────────────────────
const listJobs = () =>
  existsSync("jobs")
    ? readdirSync("jobs", { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const j = readJson(join("jobs", d.name, "job.json"), {});
          const has = (f) => existsSync(join("jobs", d.name, f));
          return {
            id: d.name,
            title: j.title || j.name || d.name,
            format: j.format || null,
            updated: statSync(join("jobs", d.name)).mtimeMs,
            has: { takes: has("takes.json"), edl: has(".edl.resolved.json"), carousel: has("carousel.json"), site: has(join("site", "inventory.json")), sitemorph: has("sitemorph.json"), variants: has("variants.json") },
          };
        })
        .sort((a, b) => b.updated - a.updated)
    : [];
const filesIn = (dir, exts) => {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!exts || exts.includes(extname(e.name).toLowerCase())) out.push({ path: p.split(sep).join("/"), size: statSync(p).size, mtime: statSync(p).mtimeMs });
    }
  };
  walk(dir);
  return out.sort((a, b) => b.mtime - a.mtime);
};
const MEDIA = [".mp4", ".mov", ".webm", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp3", ".wav", ".m4a"];
const status = () => {
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  const cfg = engine.loadConfig();
  return {
    name: "7 Studios",
    version: VERSION,
    ffmpeg: ff.status === 0 ? ff.stdout.split("\n")[0].replace("ffmpeg version ", "").split(" ")[0] : null,
    node: process.versions.node,
    platform: process.platform,
    engine: { ...engine.summary(), workflows: cfg.open.workflows, gpuHourly: cfg.open.gpuHourly, premium: cfg.premium },
    keys: Object.fromEntries(KEYS.map((k) => [k, Boolean(process.env[k])])),
    compositions: COMPOSITIONS,
  };
};

// ── routes ──────────────────────────────────────────────────────────────────
const api = async (req, res, path, q) => {
  const m = req.method;
  const seg = path.split("/").filter(Boolean); // ["api", …]
  const [, a, b, c] = seg;
  if (m === "GET" && a === "status") return send(res, 200, status());
  if (m === "GET" && a === "events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    listeners.add(res);
    req.on("close", () => listeners.delete(res));
    return;
  }
  // Gallery
  if (a === "gallery") {
    if (m === "GET") return send(res, 200, engine.loadGallery());
    if (m === "PATCH" && b) {
      const body = await readBody(req);
      const patch = {};
      if (typeof body.favorite === "boolean") patch.favorite = body.favorite;
      if (Array.isArray(body.tags)) patch.tags = body.tags.map(String).slice(0, 20);
      return send(res, 200, userError(() => engine.updateGalleryItem(b, patch)));
    }
    if (m === "DELETE" && b) {
      // The files go too, but only ones the engine made (in public/gallery/).
      const item = engine.loadGallery().items.find((x) => x.id === b);
      if (!item) return send(res, 404, { error: "Not found" });
      for (const f of [item.file, item.thumb].filter(Boolean)) {
        const p = resolve(ROOT, "public", f);
        if (p.startsWith(resolve(ROOT, engine.GALLERY_DIR) + sep) && existsSync(p)) unlinkSync(p);
      }
      engine.removeGalleryItem(b);
      return send(res, 200, { removed: true });
    }
  }
  if (m === "GET" && a === "presets") return send(res, 200, engine.listPresets().filter((p) => !q.get("kind") || p.kind === q.get("kind")));
  if (a === "characters") {
    if (m === "GET") return send(res, 200, engine.listCharacters());
    if (m === "POST") {
      const body = await readBody(req);
      const refs = (body.refs || []).slice(0, 8).map((r) => inside(r, ["public"]).replace(/^public\//, ""));
      return send(res, 200, userError(() => engine.saveCharacter({ ...body, refs })));
    }
  }
  if (a === "generate" && m === "POST") return send(res, 200, generateNow(await readBody(req)));
  if (a === "generations" && m === "GET") return send(res, 200, gens);
  if (a === "requests" && m === "GET") {
    const { listRequests } = await import("../../scripts/engine/claude.mjs");
    return send(res, 200, listRequests());
  }
  if (a === "models" && m === "GET") {
    const { listModels } = await import("../../scripts/engine/premium.mjs");
    return send(res, 200, listModels());
  }
  if (a === "engine") {
    if (m === "GET") return send(res, 200, { config: engine.loadConfig(), workflows: readdirSync(engine.WORKFLOW_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) });
    if (m === "POST") {
      const body = await readBody(req);
      const patch = {};
      if (engine.ENGINES.includes(body.default)) patch.default = body.default;
      if (body.mac && typeof body.mac.url === "string" && /^https?:\/\/[^\s]+$/.test(body.mac.url)) patch.mac = { url: body.mac.url };
      if (body.open) {
        patch.open = {};
        if (typeof body.open.url === "string" && /^https?:\/\/[^\s]+$/.test(body.open.url)) patch.open.url = body.open.url;
        if (Number.isFinite(Number(body.open.gpuHourly))) patch.open.gpuHourly = Math.max(0, Number(body.open.gpuHourly));
        if (body.open.workflows && typeof body.open.workflows === "object") patch.open.workflows = body.open.workflows;
      }
      if (body.premium && typeof body.premium === "object") patch.premium = body.premium;
      engine.saveConfig(patch);
      return send(res, 200, { config: engine.loadConfig() });
    }
  }
  if (a === "keys") {
    if (m === "GET") return send(res, 200, Object.fromEntries(KEYS.map((k) => [k, Boolean(process.env[k])])));
    if (m === "POST") {
      const body = await readBody(req);
      setKey(String(body.name), body.value);
      return send(res, 200, { [body.name]: Boolean(process.env[body.name]) });
    }
  }
  // Runs
  if (a === "runs") {
    if (m === "GET" && !b) return send(res, 200, runs.slice(-60).reverse().map((r) => ({ ...publicRun(r), log: r.log.slice(-40) })));
    if (m === "GET" && b) {
      const r = runs.find((x) => x.id === b);
      return r ? send(res, 200, publicRun(r)) : send(res, 404, { error: "No such run" });
    }
    if (m === "POST" && !b) {
      const body = await readBody(req);
      return send(res, 200, addRun(String(body.task), body.args));
    }
    if (m === "POST" && b && c === "cancel") {
      const r = runs.find((x) => x.id === b);
      if (!r) return send(res, 404, { error: "No such run" });
      if (r.status === "queued") {
        queue.splice(queue.indexOf(r), 1);
        r.status = "cancelled";
        emit({ type: "run", run: publicRun(r) });
      } else if (r.child) {
        r.status = "cancelled";
        r.child.kill("SIGTERM");
      }
      return send(res, 200, publicRun(r));
    }
  }
  // Jobs and files
  if (a === "jobs" && m === "GET") {
    if (!b) return send(res, 200, listJobs());
    if (!/^[a-z0-9][a-z0-9-]*$/.test(b)) return send(res, 400, { error: "Bad job id" });
    const read = (f, d = null) => readJson(join("jobs", b, f), d);
    if (c === "takes") return send(res, 200, read("takes.json"));
    if (c === "inventory") return send(res, 200, read(join("site", "inventory.json")));
    if (c === "sitemorph") return send(res, 200, { props: read("sitemorph.json"), check: read("sitemorph-check.json") });
    if (c === "carousel") return send(res, 200, { carousel: read("carousel.json"), frames: read("carousel-frames.json") });
    if (c === "variants") return send(res, 200, read("variants.json"));
    if (c === "edl") return send(res, 200, read(".edl.resolved.json"));
    return send(res, 200, {
      job: read("job.json", {}),
      media: filesIn(join("public", "jobs", b), MEDIA).slice(0, 200).map((f) => ({ ...f, path: f.path.replace(/^public\//, "") })),
      renders: filesIn(join("out", b), MEDIA).slice(0, 200),
      docs: existsSync(join("jobs", b)) ? readdirSync(join("jobs", b)).filter((f) => /\.(md|json)$/.test(f)) : [],
    });
  }
  if (a === "jobs" && m === "PUT" && b && c === "carousel") {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(b) || !existsSync(join("jobs", b))) return send(res, 404, { error: "No such job" });
    const body = await readBody(req);
    if (!body || !Array.isArray(body.slides)) throw new TaskError("A carousel needs slides.");
    writeFileSync(join("jobs", b, "carousel.json"), JSON.stringify(body, null, 2));
    return send(res, 200, { saved: true });
  }
  if (a === "jobs" && m === "PUT" && b && c === "sitemorph") {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(b) || !existsSync(join("jobs", b))) return send(res, 404, { error: "No such job" });
    const body = await readBody(req);
    if (!body || !Array.isArray(body.states)) throw new TaskError("A SiteMorph needs states.");
    writeFileSync(join("jobs", b, "sitemorph.json"), JSON.stringify(body, null, 2));
    return send(res, 200, { saved: true });
  }
  if (a === "renders" && m === "GET") return send(res, 200, filesIn("out", [".mp4", ".mov", ".webm", ".png", ".jpg"]).slice(0, 300));
  // The same queue posts.mjs uses (POSTS_QUEUE points it elsewhere in tests).
  if (a === "posts" && m === "GET") return send(res, 200, readJson(process.env.POSTS_QUEUE || join("production", "posts.json"), { posts: [] }));
  if (a === "text" && m === "GET") {
    // A job document or a check's text output, for reading in the app.
    const f = inside(q.get("path") || "", ["jobs", "out", "production/lora"]);
    if (!/\.(md|json|txt)$/.test(f)) throw new TaskError("Only documents can be read here.");
    return send(res, 200, readFileSync(f, "utf8").slice(0, 400000));
  }
  if (a === "upload" && m === "POST") {
    // Streamed straight to disk: public/uploads/<name>, or a job's footage/audio/screen/stills folder.
    const name = basename(q.get("name") || "").replace(/[^\w.-]+/g, "-").replace(/^-+/, "").slice(0, 120);
    if (!name || !UPLOAD_EXT.has(extname(name).toLowerCase())) throw new TaskError("That kind of file can't be added here.");
    const jobId = q.get("job");
    const kind = q.get("into") || "uploads";
    let dir;
    if (jobId) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(jobId) || !["footage", "audio", "screen", "stills", "brand"].includes(kind)) throw new TaskError("Bad destination.");
      dir = join("public", "jobs", jobId, kind);
    } else dir = join("public", "uploads");
    mkdirSync(dir, { recursive: true });
    let dest = join(dir, name);
    for (let i = 2; existsSync(dest); i++) dest = join(dir, `${basename(name, extname(name))}-${i}${extname(name)}`);
    const limit = 8 * 1024 ** 3;
    let n = 0;
    const ws = createWriteStream(dest);
    await new Promise((ok, bad) => {
      req.on("data", (chunk) => {
        n += chunk.length;
        if (n > limit) {
          req.destroy();
          ws.destroy();
          bad(new TaskError("File too large (8 GB at most)."));
        }
      });
      req.pipe(ws);
      ws.on("finish", ok);
      ws.on("error", bad);
      req.on("error", bad);
    }).catch((e) => {
      try {
        unlinkSync(dest);
      } catch {
        /* already gone */
      }
      throw e;
    });
    return send(res, 200, { path: dest.split(sep).join("/").replace(/^public\//, ""), size: n });
  }
  return send(res, 404, { error: "No such endpoint" });
};

const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const server = createServer(async (req, res) => {
  // Only this computer, only this app's page: blocks other sites and DNS-rebinding tricks.
  if (!allowedHosts.has(req.headers.host || "")) return send(res, 403, "This app only answers on this computer.");
  const u = new URL(req.url, `http://${req.headers.host}`);
  const path = u.pathname;
  try {
    if (path.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.origin;
        if (req.headers["x-7s"] !== "1" || (origin && !allowedHosts.has(origin.replace(/^https?:\/\//, "")))) return send(res, 403, { error: "Requests must come from the 7 Studios app." });
      }
      return await api(req, res, path, u.searchParams);
    }
    if (path.startsWith("/static/")) return serveFile(req, res, join(ROOT, "public"), path.slice(8));
    if (path.startsWith("/out/")) return serveFile(req, res, join(ROOT, "out"), path.slice(5));
    const asset = path === "/" ? "index.html" : path.slice(1);
    if (existsSync(join(DIST, asset)) && statSync(join(DIST, asset)).isFile()) return serveFile(req, res, DIST, asset);
    return serveFile(req, res, DIST, "index.html");
  } catch (e) {
    if (e instanceof TaskError) return send(res, 400, { error: e.message });
    console.error(e);
    return send(res, 500, { error: "Something went wrong in the app. The details are in the terminal." });
  }
});
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`Port ${PORT} is in use. Is 7 Studios already open? Or start on another: npm run app -- --port=${PORT + 1}`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, "127.0.0.1", () => {
  const link = `http://127.0.0.1:${PORT}`;
  console.log(`\n  7 Studios is running on this computer: ${link}\n  (Ctrl+C to stop. Nothing is shared with other computers.)\n`);
  if (!opt["no-open"]) {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    try {
      spawn(cmd, [link], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    } catch {
      /* no browser to open: the link above works */
    }
  }
});
const stop = () => {
  for (const r of runs) r.child?.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
