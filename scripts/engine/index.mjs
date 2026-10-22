// The 7 Studios generation engine: one interface for every way an image or clip
// gets made, used by the app (Image and Video studios, Library) and `npm run gen`.
//
// Engines (engine/README.md has the setup for each):
//   demo     placeholder results made locally with ffmpeg, clearly marked as demos,
//            so the app can be tried before any engine is set up. Free, instant.
//   open     ComfyUI running open models (Qwen-Image, FLUX schnell, Qwen-Image-Edit,
//            Wan 2.2): on this Mac for drafts, or on a rented GPU. Free per use.
//   premium  a hosted model API with your own key (FAL_KEY in .env). Paid per use.
//   claude   a request Claude runs in chat through the Higgsfield connector
//            (Seedance, Kling, Veo…), after quoting the credits and getting approval.
//
// Every result goes into the gallery (production/gallery.json, files in
// public/gallery/) with its prompt, preset, engine, model, seed, size and cost.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { readJson, writeJson } from "../lib/media.mjs";

export const CONFIG_PATH = join("production", "engine.json");
export const GALLERY_PATH = join("production", "gallery.json");
export const GALLERY_DIR = join("public", "gallery");
export const REQUESTS_PATH = join("production", "claude-requests.json");
export const PRESET_DIR = join("presets", "generate");
export const CHAR_DIR = "characters";
export const WORKFLOW_DIR = join("engine", "workflows");

export const ENGINES = ["demo", "open", "premium", "claude"];
export const KINDS = ["image", "edit", "video"];

const DEFAULT_CONFIG = {
  // Which engine a request uses when it doesn't name one.
  default: "demo",
  open: {
    // ComfyUI's address: this Mac (http://127.0.0.1:8188) or a rented GPU's URL.
    url: "http://127.0.0.1:8188",
    // Workflow per kind and quality (files in engine/workflows/).
    workflows: {
      image: { draft: "image-flux-schnell", final: "image-qwen" },
      edit: { draft: "edit-qwen", final: "edit-qwen" },
      video: { draft: "video-wan22-5b", final: "video-wan22-14b-i2v" },
    },
    // What the GPU costs per hour, to estimate each generation's cost (0 on your own machine).
    gpuHourly: 0,
  },
  premium: {
    // Models are listed in engine/models.json; the key is FAL_KEY in .env.
    image: null,
    edit: null,
    video: null,
  },
};

export const loadConfig = () => {
  const c = readJson(CONFIG_PATH, {});
  // OPEN_ENGINE_URL (environment or .env) points the open engine elsewhere without editing the config.
  if (process.env.OPEN_ENGINE_URL) c.open = { ...(c.open || {}), url: process.env.OPEN_ENGINE_URL };
  return {
    ...DEFAULT_CONFIG,
    ...c,
    open: { ...DEFAULT_CONFIG.open, ...(c.open || {}), workflows: { ...DEFAULT_CONFIG.open.workflows, ...(c.open?.workflows || {}) } },
    premium: { ...DEFAULT_CONFIG.premium, ...(c.premium || {}) },
  };
};
export const saveConfig = (patch) => {
  const now = readJson(CONFIG_PATH, {});
  const next = { ...now, ...patch };
  for (const k of ["open", "premium"]) if (patch[k]) next[k] = { ...(now[k] || {}), ...patch[k] };
  writeJson(CONFIG_PATH, next);
  return loadConfig();
};

// ── sizes ────────────────────────────────────────────────────────────────────
// Multiples of 16 near one megapixel for images; the open video models' native sizes for clips.
export const IMAGE_SIZES = { "1x1": [1024, 1024], "9x16": [768, 1344], "16x9": [1344, 768], "4x5": [896, 1120], "3x2": [1216, 816] };
export const VIDEO_SIZES = {
  draft: { "9x16": [480, 832], "16x9": [832, 480], "1x1": [640, 640], "4x5": [544, 672] },
  final: { "9x16": [704, 1280], "16x9": [1280, 704], "1x1": [960, 960], "4x5": [768, 960] },
};
// Wan-family models take 4n+1 frames.
export const frameCount = (seconds, fps) => Math.max(5, Math.round((seconds * fps) / 4) * 4 + 1);

// ── presets ──────────────────────────────────────────────────────────────────
export const listPresets = () =>
  existsSync(PRESET_DIR)
    ? readdirSync(PRESET_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => readJson(join(PRESET_DIR, f)))
        .sort((a, b) => (a.kind + a.category + a.name).localeCompare(b.kind + b.category + b.name))
    : [];
export const getPreset = (id) => (id ? listPresets().find((p) => p.id === id) || null : null);

// ── characters ───────────────────────────────────────────────────────────────
// characters/<id>/character.json: { name, description, consent: { kind, note, date }, refs: ["characters/<id>/ref-1.jpg"] }
// Images live in public/characters/<id>/. A real person needs their recorded agreement.
export const listCharacters = () =>
  existsSync(CHAR_DIR)
    ? readdirSync(CHAR_DIR)
        .filter((d) => existsSync(join(CHAR_DIR, d, "character.json")))
        .map((d) => ({ id: d, ...readJson(join(CHAR_DIR, d, "character.json")) }))
    : [];
export const getCharacter = (id) => (id ? listCharacters().find((c) => c.id === id) || null : null);
export const saveCharacter = (c) => {
  const id = (c.id || c.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!id) throw new Error("A character needs a name");
  if (!c.consent?.kind) throw new Error('Record consent: { kind: "self" | "permission" | "fictional", note }');
  if (c.consent.kind === "permission" && !c.consent.note) throw new Error("Permission needs a note: who agreed, and when");
  mkdirSync(join(CHAR_DIR, id), { recursive: true });
  const data = { name: c.name, description: c.description || "", consent: { ...c.consent, date: c.consent.date || new Date().toISOString().slice(0, 10) }, refs: c.refs || [] };
  writeJson(join(CHAR_DIR, id, "character.json"), data);
  return { id, ...data };
};

// ── prompts ──────────────────────────────────────────────────────────────────
const DEFAULT_NEGATIVE = {
  image: "blurry, low quality, jpeg artifacts, deformed hands, extra fingers, distorted face, text, watermark, logo, signature, oversaturated",
  edit: "blurry, low quality, distorted, artifacts, text, watermark",
  video: "blurry, low quality, flicker, jitter, warping, distorted face, deformed hands, extra limbs, morphing, text, watermark, logo, static frame, oversaturated",
};
// The user's words go where the preset says {subject}; a character's description joins them.
export const buildPrompt = (req, preset, character) => {
  const subject = [character?.description, req.prompt].filter(Boolean).join(", ").trim();
  const template = preset?.prompt || "{subject}";
  const prompt = (template.includes("{subject}") ? template.replace("{subject}", subject || "the subject") : `${subject}. ${template}`).replace(/\s+/g, " ").trim();
  const negative = [preset?.negative ?? DEFAULT_NEGATIVE[req.kind] ?? "", req.negative].filter(Boolean).join(", ");
  return { prompt, negative };
};

// ── gallery ──────────────────────────────────────────────────────────────────
export const loadGallery = () => readJson(GALLERY_PATH, { items: [] });
export const saveGallery = (g) => writeJson(GALLERY_PATH, g);
export const newId = (prefix = "g") => `${prefix}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
export const addToGallery = (item) => {
  const g = loadGallery();
  g.items.unshift(item);
  saveGallery(g);
  return item;
};
export const updateGalleryItem = (id, patch) => {
  const g = loadGallery();
  const it = g.items.find((x) => x.id === id);
  if (!it) throw new Error(`No gallery item ${id}`);
  Object.assign(it, patch);
  saveGallery(g);
  return it;
};
export const removeGalleryItem = (id) => {
  const g = loadGallery();
  g.items = g.items.filter((x) => x.id !== id);
  saveGallery(g);
};
// A gallery id, a path under public/ or an absolute file → a file on disk.
export const resolveMedia = (ref) => {
  if (!ref) return null;
  const item = loadGallery().items.find((x) => x.id === ref);
  if (item) return join("public", item.file);
  if (existsSync(ref)) return ref;
  if (existsSync(join("public", ref))) return join("public", ref);
  throw new Error(`Can't find the image "${ref}" (a gallery id, or a path under public/)`);
};

export const seedFrom = (s) => (s === undefined || s === null || s === "" ? Number.parseInt(randomBytes(4).toString("hex"), 16) % 2147483647 : Number(s));
export const hashOf = (file) => createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
export const extOf = (f) => extname(f).toLowerCase();
export const sizeOf = (f) => (existsSync(f) ? statSync(f).size : 0);

// ── generate ─────────────────────────────────────────────────────────────────
// req: { kind: image|edit|video, prompt, negative, preset, engine, model, aspect, count,
//        seed, image (gallery id or public path), endImage, character, seconds, quality: draft|final }
// onProgress({ stage, pct, note }) is called as the engine works.
export const generate = async (req, onProgress = () => {}) => {
  if (!KINDS.includes(req.kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}`);
  const cfg = loadConfig();
  const engine = req.engine || cfg.default;
  if (!ENGINES.includes(engine)) throw new Error(`engine must be one of ${ENGINES.join(", ")}`);
  const preset = getPreset(req.preset);
  if (req.preset && !preset) throw new Error(`No preset "${req.preset}" in presets/generate/`);
  if (preset && preset.kind !== (req.kind === "edit" ? "edit" : req.kind) && !(preset.kind === "image" && req.kind === "edit")) throw new Error(`Preset "${preset.id}" is for ${preset.kind}, not ${req.kind}`);
  const character = getCharacter(req.character);
  if (req.character && !character) throw new Error(`No character "${req.character}" in characters/`);
  if (req.kind === "edit" && !req.image && !character?.refs?.length) throw new Error("An edit needs an image to edit");
  if (req.kind !== "video" && !req.prompt) throw new Error("Write a prompt");
  const aspect = req.aspect || preset?.aspect || (req.kind === "video" ? "9x16" : "1x1");
  const quality = req.quality === "final" ? "final" : "draft";
  const seconds = Number(req.seconds || preset?.params?.seconds || 5);
  const { prompt, negative } = buildPrompt(req, preset, character);
  const image = req.image ? resolveMedia(req.image) : req.kind === "edit" && character?.refs?.[0] ? resolveMedia(character.refs[0]) : null;
  const endImage = req.endImage ? resolveMedia(req.endImage) : null;
  const job = {
    id: newId("j"),
    kind: req.kind,
    engine,
    aspect,
    quality,
    seconds,
    count: Math.max(1, Math.min(4, Number(req.count || 1))),
    seed: seedFrom(req.seed),
    prompt,
    negative,
    userPrompt: req.prompt || "",
    preset: preset?.id || null,
    character: character ? req.character : null,
    image,
    endImage,
    params: { ...(preset?.params || {}), ...(req.params || {}) },
    model: req.model || null,
  };
  mkdirSync(GALLERY_DIR, { recursive: true });
  const mod = await import(`./${engine}.mjs`);
  const started = Date.now();
  const results = await mod.run(job, cfg, onProgress);
  const items = results.map((r, i) =>
    r.pending
      ? r
      : addToGallery({
          id: newId(),
          kind: r.kind || (job.kind === "video" ? "video" : "image"),
          file: r.file,
          thumb: r.thumb || null,
          width: r.width,
          height: r.height,
          seconds: r.seconds || null,
          fps: r.fps || null,
          prompt: job.prompt,
          userPrompt: job.userPrompt,
          negative: job.negative,
          preset: job.preset,
          character: job.character,
          engine,
          model: r.model || job.model,
          seed: job.seed + i,
          aspect,
          quality,
          source: { image: req.image || null, endImage: req.endImage || null },
          cost: r.cost || null,
          demo: engine === "demo",
          createdAt: new Date().toISOString(),
          ms: Date.now() - started,
          favorite: false,
          tags: preset?.tags || [],
        }),
  );
  return { job, items };
};

export const summary = () => {
  const cfg = loadConfig();
  return {
    default: cfg.default,
    engines: ENGINES,
    presets: listPresets().length,
    characters: listCharacters().length,
    gallery: loadGallery().items.length,
    openUrl: cfg.open.url,
    premiumKey: Boolean(process.env.FAL_KEY),
  };
};
