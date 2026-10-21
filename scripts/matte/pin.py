"""Follow one spot in a video, so a title or graphic can stay stuck to it.

    python pin.py <video> <out.json> --at=<seconds> --point=<x>,<y> [--box=0.08] [--work=640]

--point is the spot at --at, as fractions of the frame (0-1). The tracker takes
the corners and texture in a box around it (--box, fraction of the frame width),
follows them with pyramidal Lucas-Kanade optical flow frame by frame, forward to
the end and backward to the start, keeps only points that track the same way in
both directions, and moves the pin by their median motion. When too few points
survive (a turn, a blur, something passing in front) it finds new ones around the
pin. Output: one sample per frame, [t, x, y, ok] with x/y as fractions of the
frame; ok = 0 where the pin was held rather than tracked.
"""

import json
import sys

import cv2
import numpy as np


def arg(name, default=None):
    for a in sys.argv[3:]:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


video, out = sys.argv[1], sys.argv[2]
at = float(arg("at", "0"))
px, py = (float(v) for v in arg("point", "0.5,0.5").split(","))
box_frac = float(arg("box", "0.08"))
work = int(arg("work", "640"))

cap = cv2.VideoCapture(video)
fps = cap.get(cv2.CAP_PROP_FPS) or 30
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
scale = min(1.0, work / W)
w, h = int(round(W * scale)), int(round(H * scale))
frames = []
while True:
    ok, f = cap.read()
    if not ok:
        break
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    frames.append(cv2.resize(g, (w, h), interpolation=cv2.INTER_AREA) if scale < 1 else g)
cap.release()
n = len(frames)
if n == 0:
    sys.exit(f"Could not read {video}")

lk = dict(winSize=(21, 21), maxLevel=3, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
half = max(8, int(box_frac * w / 2))


def features(img, cx, cy):
    mask = np.zeros_like(img)
    x0, y0 = int(max(0, cx - half)), int(max(0, cy - half))
    x1, y1 = int(min(w, cx + half)), int(min(h, cy + half))
    mask[y0:y1, x0:x1] = 255
    pts = cv2.goodFeaturesToTrack(img, maxCorners=60, qualityLevel=0.005, minDistance=3, mask=mask, blockSize=5)
    return pts if pts is not None else np.empty((0, 1, 2), np.float32)


def run(start, step):
    """Track from frame `start` in direction `step` (+1 or -1); returns {frame: (x, y, ok)}."""
    cx, cy = px * w, py * h
    pts = features(frames[start], cx, cy)
    res = {start: (cx, cy, 1)}
    i = start
    while 0 <= i + step < n:
        a, b = frames[i], frames[i + step]
        ok = 0
        if len(pts) >= 4:
            nxt, st, _ = cv2.calcOpticalFlowPyrLK(a, b, pts, None, **lk)
            back, st2, _ = cv2.calcOpticalFlowPyrLK(b, a, nxt, None, **lk)
            fb = np.linalg.norm((back - pts).reshape(-1, 2), axis=1)
            good = (st.ravel() == 1) & (st2.ravel() == 1) & (fb < 1.0)
            if good.sum() >= 4:
                d = np.median((nxt - pts).reshape(-1, 2)[good], axis=0)
                cx, cy = cx + d[0], cy + d[1]
                pts = nxt[good].reshape(-1, 1, 2)
                ok = 1
        # Keep the cloud of points centred on the pin and refill it when it thins out.
        if len(pts) < 12:
            pts = features(b, cx, cy)
        else:
            dist = np.linalg.norm(pts.reshape(-1, 2) - np.array([cx, cy]), axis=1)
            pts = pts[dist < half * 1.6].reshape(-1, 1, 2)
        i += step
        res[i] = (cx, cy, ok)
    return res


start = int(min(n - 1, max(0, round(at * fps))))
track = {**run(start, -1), **run(start, 1)}
samples = []
for i in range(n):
    x, y, ok = track[i]
    samples.append([round(i / fps, 4), round(float(x) / w, 5), round(float(y) / h, 5), int(ok)])
held = sum(1 for s in samples if not s[3])
json.dump(
    {"video": video, "width": W, "height": H, "fps": fps, "at": at, "point": [px, py], "box": box_frac, "samples": samples},
    open(out, "w"),
)
print(f"{n} frames, tracked {n - held}, held {held}")
