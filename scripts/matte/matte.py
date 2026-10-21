"""Cut the speaker out of the background: a person layer with transparency.

    python scripts/matte/matte.py <in.mp4> <out.webm> --model <selfie_multiclass_256x256.tflite>
                                  [--work 540] [--smooth 0.5] [--feather 1.5] [--grow 0] [--mask-out mask.mp4]

MediaPipe's selfie multiclass segmenter (Apache 2.0), run directly with the
LiteRT runtime on the CPU: no GPU or graphics libraries needed. Every frame:
  1. the model reads it at 256×256 and scores six classes; everything except
     background (hair, face, body, clothes, accessories) counts as the person;
  2. the mask is scaled to the working size and refined with a guided filter
     against the frame itself, so edges follow the real hair and shoulders
     instead of the model's coarse 256-pixel grid;
  3. it is smoothed over time (no flicker), sharpened, and holes inside the
     silhouette are filled;
  4. ffmpeg scales it to full size, feathers it and merges it with the original
     frames as alpha: VP9 WebM with transparency, which Remotion plays with
     <OffthreadVideo transparent>.

Called by scripts/matte.mjs, which sets up the environment and the model.
"""

import argparse
import json
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, binary_fill_holes, label
from ai_edge_litert.interpreter import Interpreter


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate", "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True,
    ).stdout
    j = json.loads(out)
    s = j["streams"][0]
    n, d = (int(x) for x in s["avg_frame_rate"].split("/"))
    return s["width"], s["height"], n / d if d else 30.0, float(j["format"]["duration"])


def box(x, r):
    """Mean over a (2r+1)² window, via summed-area tables."""
    c = np.cumsum(np.cumsum(np.pad(x, ((r + 1, r), (r + 1, r)), mode="edge"), 0), 1)
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def guided(guide, src, r=8, eps=1e-3):
    """He et al.'s guided filter: the mask takes on the guide's edges."""
    mI, mp = box(guide, r), box(src, r)
    cov = box(guide * src, r) - mI * mp
    var = box(guide * guide, r) - mI * mI
    a = cov / (var + eps)
    b = mp - a * mI
    return box(a, r) * guide + box(b, r)


def fill_holes(m):
    """Holes and faint patches inside the silhouette (a dark collar, a shadow)
    become solid person, so text placed behind the speaker never shows through
    their body. Only the outer edge (about 6 px at working size) stays soft.
    Small detached specks are dropped."""
    solid = binary_fill_holes(m > 0.5)
    core = binary_erosion(solid, iterations=6)
    out = m.copy()
    out[core] = 1.0
    # Detached specks (a lamp, a poster face) under 1.5% of the frame are not the speaker.
    labels, n = label(m > 0.2)
    if n > 1:
        sizes = np.bincount(labels.ravel())
        small = np.isin(labels, np.nonzero(sizes < 0.015 * m.size)[0]) & (labels > 0)
        out[small] = 0.0
    out[out < 0.12] = 0.0  # no faint haze or outlines left in the background
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--model", required=True)
    ap.add_argument("--work", type=int, default=540, help="working width for edge refinement")
    ap.add_argument("--smooth", type=float, default=0.5, help="temporal smoothing: 0 = none, 0.9 = heavy")
    ap.add_argument("--feather", type=float, default=1.5, help="edge softness in full-size pixels")
    ap.add_argument("--grow", type=float, default=0.0, help="move the edge out (+) or in (-), up to 0.3")
    ap.add_argument("--mask-out", help="also write the black-and-white mask as a video (for checking)")
    a = ap.parse_args()

    W, H, fps, dur = probe(a.src)
    ww = a.work - a.work % 2
    wh = int(round(H * ww / W / 2)) * 2

    it = Interpreter(model_path=a.model)
    it.allocate_tensors()
    inp = it.get_input_details()[0]["index"]
    outp = it.get_output_details()[0]["index"]

    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", a.src, "-vf", f"scale={ww}:{wh}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    feather = f",gblur=sigma={a.feather}" if a.feather > 0 else ""
    split = "split=2[m][mk]" if a.mask_out else "null[m]"
    cmd = [
        "ffmpeg", "-v", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{ww}x{wh}", "-r", f"{fps}", "-i", "-",
        "-i", a.src,
        "-filter_complex", f"[0:v]scale={W}:{H}:flags=bicubic{feather},format=gray,{split};[1:v]format=yuva420p[v];[v][m]alphamerge,format=yuva420p[o]",
        "-map", "[o]", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30",
        "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-auto-alt-ref", "0", a.out,
    ]
    if a.mask_out:
        cmd += ["-map", "[mk]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", a.mask_out]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    size = ww * wh * 3
    prev = None
    i = 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(wh, ww, 3)
        x = np.asarray(Image.fromarray(frame).resize((256, 256), Image.BILINEAR), np.float32) / 255.0
        it.set_tensor(inp, x[None])
        it.invoke()
        logits = it.get_tensor(outp)[0]
        e = np.exp(logits - logits.max(-1, keepdims=True))
        person = 1.0 - e[..., 0] / e.sum(-1)
        person = np.asarray(Image.fromarray(person.astype(np.float32), mode="F").resize((ww, wh), Image.BILINEAR))
        gray = frame.astype(np.float32).mean(-1) / 255.0
        person = np.clip(guided(gray, person), 0, 1)
        prev = person if prev is None else a.smooth * prev + (1 - a.smooth) * person
        m = fill_holes(np.clip((prev - 0.5 + a.grow) * 2.5 + 0.5, 0, 1))
        enc.stdin.write((m * 255).astype(np.uint8).tobytes())
        i += 1
        if i % 90 == 0:
            print(f"  {i / fps:5.1f} / {dur:.1f} s", file=sys.stderr, flush=True)

    enc.stdin.close()
    dec.wait()
    if enc.wait() != 0:
        sys.exit("encoding the person layer failed")
    print(f"frames={i}")


if __name__ == "__main__":
    main()
