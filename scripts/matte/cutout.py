"""Cut the person out of still images (carousel covers, stickers, thumbnails).

    python cutout.py --model=<tflite> <in.jpg> <out.png> [<in2.jpg> <out2.png> …]

Same engine as matte.py (MediaPipe selfie multiclass segmenter via LiteRT, then a
guided filter that snaps the edge to hair and shoulders), on one frame at a time:
writes an RGBA PNG at the image's full size with the background transparent.
"""

import sys

import numpy as np
from PIL import Image
from ai_edge_litert.interpreter import Interpreter

from matte import fill_holes, guided

model = next(a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--model="))
paths = [a for a in sys.argv[1:] if not a.startswith("--")]
it = Interpreter(model_path=model)
it.allocate_tensors()
inp = it.get_input_details()[0]["index"]
outp = it.get_output_details()[0]["index"]

for src, dst in zip(paths[0::2], paths[1::2]):
    img = Image.open(src).convert("RGB")
    W, H = img.size
    ww = 720
    wh = int(round(H * ww / W))
    work = np.asarray(img.resize((ww, wh), Image.BILINEAR))
    x = np.asarray(Image.fromarray(work).resize((256, 256), Image.BILINEAR), np.float32) / 255.0
    it.set_tensor(inp, x[None])
    it.invoke()
    logits = it.get_tensor(outp)[0]
    e = np.exp(logits - logits.max(-1, keepdims=True))
    person = 1.0 - e[..., 0] / e.sum(-1)
    person = np.asarray(Image.fromarray(person.astype(np.float32), mode="F").resize((ww, wh), Image.BILINEAR))
    person = np.clip(guided(work.astype(np.float32).mean(-1) / 255.0, person), 0, 1)
    m = fill_holes(np.clip((person - 0.5) * 2.5 + 0.5, 0, 1))
    alpha = Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
    out = img.copy()
    out.putalpha(alpha)
    # Trim to the person (with a little margin) so layouts can place it by its own size.
    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        mx, my = int(W * 0.02), int(H * 0.02)
        out = out.crop((max(0, bbox[0] - mx), max(0, bbox[1] - my), min(W, bbox[2] + mx), H if bbox[3] > H * 0.9 else min(H, bbox[3] + my)))
    out.save(dst)
    print(f"{dst} {out.size[0]}x{out.size[1]}")
