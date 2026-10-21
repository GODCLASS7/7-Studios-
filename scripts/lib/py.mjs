// The Python side of the footage tools (cutout, face tracking): one venv and
// one model, set up on first use.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const VENV = join("production", "matte-venv");
export const PY = join(VENV, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
export const MODEL = join("production", "models", "selfie_multiclass_256x256.tflite");
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";

export const run = (cmd, args, label) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`✖ ${label} failed.`);
    process.exit(1);
  }
};

// MediaPipe's selfie multiclass segmenter (Apache 2.0), run with LiteRT: no GPU or graphics libraries needed.
export const ensurePython = async () => {
  if (!existsSync(PY)) {
    console.log("Setting up the footage-analysis environment (once): python venv + LiteRT…");
    const py = process.platform === "win32" ? "python" : "python3";
    run(py, ["-m", "venv", VENV], "Creating the Python environment (needs Python 3.10+)");
    run(PY, ["-m", "pip", "install", "-q", "ai-edge-litert", "numpy", "pillow", "scipy"], "pip install ai-edge-litert numpy pillow scipy");
  }
  if (!existsSync(MODEL)) {
    console.log("Downloading the segmentation model (once, 16 MB)…");
    mkdirSync(join("production", "models"), { recursive: true });
    const res = await fetch(MODEL_URL);
    if (!res.ok) {
      console.error(`✖ Model download failed (${res.status}). On a locked-down network, allow storage.googleapis.com or place the model at ${MODEL}.`);
      process.exit(1);
    }
    writeFileSync(MODEL, Buffer.from(await res.arrayBuffer()));
  }
};
