"""Track the speaker's face and head through a video.

    python scripts/matte/track.py <in.mp4> <out.json> --model <selfie_multiclass_256x256.tflite> [--rate 5]

The same MediaPipe segmenter as the cutout (Apache 2.0, run with LiteRT on the
CPU) labels face skin and hair. On each sample (5 per second by default):
  - face = the largest patch of face skin;
  - head = face skin plus the hair touching it.
Boxes are [x, y, w, h] as fractions of the source frame, smoothed over time
(median of 5 samples) so framing never jitters. A sample with no face is null.

Called by scripts/track.mjs, which sets up the environment and the model.
"""

import argparse
import json
import subprocess

import numpy as np
from PIL import Image
from ai_edge_litert.interpreter import Interpreter
from scipy.ndimage import binary_dilation, label


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    j = json.loads(out)
    return j["streams"][0]["width"], j["streams"][0]["height"], float(j["format"]["duration"])


def bbox(mask):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    h, w = mask.shape
    return [xs.min() / w, ys.min() / h, (xs.max() - xs.min() + 1) / w, (ys.max() - ys.min() + 1) / h]


def largest(mask):
    lab, n = label(mask)
    if n == 0:
        return None
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    k = sizes.argmax()
    return lab == k if sizes[k] > 0.002 * mask.size else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--model", required=True)
    ap.add_argument("--rate", type=float, default=5.0)
    a = ap.parse_args()

    W, H, dur = probe(a.src)
    it = Interpreter(model_path=a.model)
    it.allocate_tensors()
    inp = it.get_input_details()[0]["index"]
    outp = it.get_output_details()[0]["index"]

    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", a.src, "-vf", f"fps={a.rate},scale=256:256", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    raw = []
    i = 0
    while True:
        buf = dec.stdout.read(256 * 256 * 3)
        if len(buf) < 256 * 256 * 3:
            break
        x = np.frombuffer(buf, np.uint8).reshape(256, 256, 3).astype(np.float32) / 255.0
        it.set_tensor(inp, x[None])
        it.invoke()
        cls = it.get_tensor(outp)[0].argmax(-1)
        face = largest(cls == 3)
        head = None
        if face is not None:
            # Hair counts when it touches the face (not someone else's hair in the background).
            hair = cls == 1
            lab, _ = label(hair | face)
            ids = np.unique(lab[binary_dilation(face, iterations=2)])
            head = np.isin(lab, ids[ids > 0])
        raw.append({"t": round(i / a.rate, 3), "face": bbox(face) if face is not None else None, "head": bbox(head) if head is not None else None})
        i += 1
    dec.wait()

    # Median over 5 samples for each coordinate, skipping gaps.
    def smooth(key):
        vals = [r[key] for r in raw]
        out = []
        for k in range(len(vals)):
            win = [v for v in vals[max(0, k - 2): k + 3] if v is not None]
            out.append([round(float(np.median([w[j] for w in win])), 4) for j in range(4)] if win and vals[k] is not None else None)
        return out

    faces, heads = smooth("face"), smooth("head")
    samples = [{"t": r["t"], "face": f, "head": h} for r, f, h in zip(raw, faces, heads)]
    found = sum(1 for s in samples if s["face"])
    with open(a.out, "w") as f:
        json.dump({"source": a.src, "width": W, "height": H, "duration": dur, "rate": a.rate, "samples": samples}, f)
    print(f"samples={len(samples)} with_face={found}")


if __name__ == "__main__":
    main()
