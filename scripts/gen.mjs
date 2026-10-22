#!/usr/bin/env node
// 7 Studios generation from the command line (the app's Image and Video studios use the
// same engine). Every result lands in the gallery: production/gallery.json + public/gallery/.
//
//   npm run gen -- image "<prompt>" [--preset=cinematic-portrait] [--engine=demo|open|premium|claude]
//                  [--model=…] [--aspect=1x1|9x16|16x9|4x5] [--count=1-4] [--seed=…] [--quality=draft|final] [--character=<id>]
//   npm run gen -- edit <image> "<instruction>" [--preset=edit-background] [--engine=…]
//   npm run gen -- video [<start image>] "<prompt>" [--preset=dolly-in] [--seconds=5] [--end=<image>] [--engine=…]
//   npm run gen -- presets [--kind=image|edit|video]
//   npm run gen -- list [--limit=20]
//   npm run gen -- import <file|url> [--request=<id>] [--model=…] [--credits=…] [--prompt="…"]   (results Claude made)
//   npm run gen -- requests                      (what's waiting for Claude)
//   npm run gen -- engine                        (status of each engine)
//   npm run gen -- engine check [workflow…]      (is ComfyUI ready for these workflows?)
//   npm run gen -- engine set default=open open.url=http://127.0.0.1:8188 open.gpuHourly=0 premium.video=fal-kling-i2v
//   npm run gen -- character add "<name>" --consent=self|permission|fictional [--note="…"] [--description="…"] --refs=a.jpg,b.jpg
//   npm run gen -- character list
//
// <image> is a gallery id (g…) or a path under public/. Engines: engine/README.md.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { ff, loadEnv, parseArgs, videoInfo } from "./lib/media.mjs";
import * as E from "./engine/index.mjs";

loadEnv();
const { opt, pos } = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = pos;
const fail = (m) => {
  console.error(`✖ ${m}`);
  process.exit(1);
};
process.on("uncaughtException", (e) => fail(e.message));
process.on("unhandledRejection", (e) => fail(e?.message || String(e)));

const isMedia = (x) => {
  if (!x) return false;
  if (E.loadGallery().items.some((i) => i.id === x)) return true;
  return /\.(png|jpe?g|webp)$/i.test(x) && (existsSync(x) || existsSync(join("public", x)));
};
const progress = (p) => process.stdout.write(`\r  ${p.stage}${p.pct != null ? ` ${p.pct}%` : ""}${p.note ? ` · ${p.note}` : ""}`.padEnd(70));
const show = (res) => {
  process.stdout.write("\n");
  for (const it of res.items) {
    if (it.pending) console.log(`⏳ ${it.note}`);
    else console.log(`✔ ${it.id}  public/${it.file}  ${it.width || "?"}×${it.height || "?"}${it.seconds ? ` ${it.seconds.toFixed(1)} s` : ""}  ${it.engine}/${it.model || "-"}${it.demo ? "  (demo: not AI)" : ""}${it.cost?.usd ? `  ~$${it.cost.usd}` : ""}`);
  }
};
const base = () => ({ preset: opt.preset, engine: opt.engine, model: opt.model, aspect: opt.aspect, count: opt.count, seed: opt.seed, quality: opt.quality, character: opt.character, negative: opt.negative });

if (cmd === "image") {
  const prompt = rest.join(" ");
  show(await E.generate({ kind: "image", prompt, ...base() }, progress));
} else if (cmd === "edit") {
  const [image, ...words] = rest;
  if (!isMedia(image)) fail("Usage: npm run gen -- edit <image> \"<instruction>\" (a gallery id or a path under public/)");
  show(await E.generate({ kind: "edit", image, prompt: words.join(" "), ...base() }, progress));
} else if (cmd === "video") {
  const image = isMedia(rest[0]) ? rest.shift() : null;
  show(await E.generate({ kind: "video", image, endImage: opt.end, prompt: rest.join(" "), seconds: opt.seconds, ...base() }, progress));
} else if (cmd === "presets") {
  for (const p of E.listPresets().filter((x) => !opt.kind || x.kind === opt.kind)) console.log(`${p.kind.padEnd(6)} ${p.category.padEnd(10)} ${p.id.padEnd(22)} ${p.name}`);
} else if (cmd === "list") {
  const items = E.loadGallery().items.slice(0, Number(opt.limit || 20));
  if (!items.length) console.log("The gallery is empty.");
  for (const i of items) console.log(`${i.id}  ${i.kind.padEnd(5)} ${(i.engine + "/" + (i.model || "-")).padEnd(28)} ${i.createdAt.slice(0, 16).replace("T", " ")}  ${(i.userPrompt || i.prompt || "").slice(0, 60)}`);
} else if (cmd === "import") {
  const [src] = rest;
  if (!src) fail("Usage: npm run gen -- import <file|url> [--request=<id>] [--model=…] [--credits=…]");
  mkdirSync(E.GALLERY_DIR, { recursive: true });
  const id = E.newId();
  let ext = (extname(src.split("?")[0]) || ".png").toLowerCase();
  if (!/^\.(png|jpe?g|webp|mp4|mov|webm)$/.test(ext)) ext = opt.kind === "video" ? ".mp4" : ".png";
  const dest = join(E.GALLERY_DIR, `${id}${ext}`);
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(src);
    if (!r.ok) fail(`Download failed: ${r.status}`);
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  } else copyFileSync(existsSync(src) ? src : join("public", src), dest);
  const isVideo = /\.(mp4|mov|webm)$/.test(ext);
  const v = videoInfo(dest);
  let thumb = null;
  if (isVideo) {
    ff(["-i", dest, "-frames:v", "1", "-q:v", "4", join(E.GALLERY_DIR, `${id}.jpg`)]);
    thumb = `gallery/${id}.jpg`;
  }
  const req = opt.request ? (await import("./engine/claude.mjs")).listRequests().find((r) => r.id === opt.request) : null;
  if (opt.request && !req) fail(`No request ${opt.request}`);
  const item = E.addToGallery({
    id,
    kind: isVideo ? "video" : "image",
    file: `gallery/${id}${ext}`,
    thumb,
    width: v.width,
    height: v.height,
    seconds: isVideo ? v.duration : null,
    fps: isVideo ? v.fps : null,
    prompt: opt.prompt || req?.prompt || "",
    userPrompt: req?.userPrompt || opt.prompt || "",
    preset: req?.preset || null,
    character: req?.character || null,
    engine: opt.engine || "claude",
    model: opt.model || null,
    seed: opt.seed ? Number(opt.seed) : null,
    aspect: req?.aspect || null,
    quality: req?.quality || null,
    source: { image: req?.image || null, endImage: req?.endImage || null, from: /^https?:/.test(src) ? new URL(src).host : basename(src) },
    cost: opt.credits ? { credits: Number(opt.credits), note: `${opt.credits} credits` } : null,
    demo: false,
    createdAt: new Date().toISOString(),
    favorite: false,
    tags: [],
  });
  if (req) (await import("./engine/claude.mjs")).updateRequest(req.id, { status: "done", galleryId: item.id, doneAt: new Date().toISOString() });
  console.log(`✔ ${item.id}  public/${item.file}${req ? `  (request ${req.id} done)` : ""}`);
} else if (cmd === "requests") {
  const { listRequests } = await import("./engine/claude.mjs");
  const rs = listRequests().filter((r) => opt.all || r.status === "waiting");
  if (!rs.length) console.log("Nothing waiting for Claude.");
  for (const r of rs) console.log(`${r.id}  ${r.status.padEnd(8)} ${r.kind.padEnd(5)} ${r.aspect || ""} ${r.seconds ? `${r.seconds}s ` : ""}${r.wanted !== "any" ? `[${r.wanted}] ` : ""}${r.image ? `from ${r.image} ` : ""}"${(r.prompt || "").slice(0, 90)}"`);
} else if (cmd === "engine") {
  const sub = rest[0];
  const cfg = E.loadConfig();
  if (sub === "set") {
    const patch = {};
    for (const kv of rest.slice(1)) {
      const [k, ...v] = kv.split("=");
      const val = v.join("=");
      const num = val !== "" && !Number.isNaN(Number(val)) ? Number(val) : val;
      const [a, b] = k.split(".");
      if (b) patch[a] = { ...(patch[a] || {}), [b]: num };
      else patch[a] = num;
    }
    if (patch.default && !E.ENGINES.includes(patch.default)) fail(`default must be one of ${E.ENGINES.join(", ")}`);
    E.saveConfig(patch);
    console.log(`✔ saved ${E.CONFIG_PATH}`);
  } else if (sub === "check") {
    const { check } = await import("./engine/open.mjs");
    const names = rest.slice(1).length ? rest.slice(1) : [...new Set(Object.values(cfg.open.workflows).flatMap((w) => Object.values(w)))];
    const res = await check(cfg, names);
    for (const r of res) {
      console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
      if (r.missingNodes.length) console.log(`   missing nodes: ${r.missingNodes.join(", ")} (update ComfyUI)`);
      for (const m of r.missingModels) {
        const need = r.needs.find((x) => x.file === m);
        console.log(`   missing model: ${m}${need ? ` → ComfyUI/${need.folder}/ (from ${need.from})` : ""}`);
      }
    }
    if (res.some((r) => !r.ok)) process.exit(1);
  } else {
    const { status } = await import("./engine/open.mjs");
    const st = await status(cfg);
    const { listModels } = await import("./engine/premium.mjs");
    console.log(`Default engine: ${cfg.default}`);
    console.log(`  demo     ready (placeholders, not AI)`);
    console.log(`  open     ${st.ok ? `ready: ComfyUI ${st.version || ""} at ${st.url}, ${st.device}` : `not reachable at ${st.url} (${st.error.split(". ")[0]})`}`);
    console.log(`  premium  ${process.env.FAL_KEY ? "key set" : "no key (FAL_KEY in .env)"}; ${listModels().length} models in engine/models.json (${listModels().filter((m) => m.verified).length} verified)`);
    console.log(`  claude   ${(await import("./engine/claude.mjs")).listRequests().filter((r) => r.status === "waiting").length} request(s) waiting; Claude runs them through Higgsfield after a credit quote`);
    console.log(`Presets: ${E.listPresets().length} · characters: ${E.listCharacters().length} · gallery: ${E.loadGallery().items.length}`);
  }
} else if (cmd === "character") {
  const sub = rest[0];
  if (sub === "add") {
    const name = rest.slice(1).join(" ");
    const refs = String(opt.refs || "")
      .split(",")
      .filter(Boolean);
    const c = E.saveCharacter({ name, description: opt.description, consent: { kind: opt.consent, note: opt.note } });
    const dir = join("public", "characters", c.id);
    mkdirSync(dir, { recursive: true });
    const saved = refs.map((r, i) => {
      const from = existsSync(r) ? r : join("public", r);
      if (!existsSync(from)) fail(`Reference not found: ${r}`);
      const to = join(dir, `ref-${i + 1}${extname(from).toLowerCase()}`);
      copyFileSync(from, to);
      return to.replace(/^public\//, "");
    });
    E.saveCharacter({ ...c, refs: saved });
    console.log(`✔ character ${c.id} (${saved.length} reference${saved.length === 1 ? "" : "s"}), consent: ${c.consent.kind}`);
  } else {
    const cs = E.listCharacters();
    if (!cs.length) console.log("No characters yet.");
    for (const c of cs) console.log(`${c.id.padEnd(18)} ${c.consent?.kind?.padEnd(10) || ""} ${c.refs.length} refs  ${c.description || ""}`);
  }
} else {
  console.error("Usage: npm run gen -- image|edit|video|presets|list|import|requests|engine|character … (see the top of scripts/gen.mjs)");
  process.exit(1);
}
