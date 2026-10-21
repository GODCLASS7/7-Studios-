import { evolvePath } from "@remotion/paths";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import {
  BrandEndCard,
  BrandProvider,
  ease,
  font,
  Grade,
  LOOKS,
  type Look,
  onTwos,
  useBrand,
} from "../../lib";
import {
  footageEditSchema,
  type FootageEditProps,
} from "../FootageEdit/FootageEdit";

// Tutorial reels: the presenter plus screen recordings. While a recording is on,
// the frame splits ("stack": presenter on top, screen below, a step band between)
// or the presenter shrinks into a corner ("pip"); between recordings the presenter
// has the whole frame. The screen's camera eases in to each click and back out,
// clicks ripple (with an optional smooth cursor), and hand-drawn circles, boxes,
// underlines and arrows point at things. Captions sit in a dark pill with the
// spoken word highlighted. Built from the same edit list as FootageEdit
// (transcript cuts, voice track, sound), with "tutorial" set in edl.json.

const tutorialSpec = z.object({
  style: z.enum(["stack", "pip"]),
  split: z.number(),
  banner: z.string().nullable(),
  color: z.string().nullable(),
  steps: z.array(
    z.object({ from: z.number(), n: z.number(), text: z.string() }),
  ),
  screens: z.array(
    z.object({
      src: z.string(),
      from: z.number(),
      durationInFrames: z.number(),
      trimBefore: z.number(),
      width: z.number(),
      height: z.number(),
      cursor: z.boolean(),
      clicks: z.array(
        z.object({
          f: z.number(),
          x: z.number(),
          y: z.number(),
          zoom: z.number(),
          hold: z.number(),
        }),
      ),
      notes: z.array(
        z.object({
          kind: z.enum(["circle", "box", "underline", "arrow"]),
          f: z.number(),
          durationInFrames: z.number(),
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number(),
          text: z.string().nullable(),
          side: z.string(),
        }),
      ),
    }),
  ),
});
export const tutorialSchema = footageEditSchema.extend({
  tutorial: tutorialSpec.nullable().default(null),
});
export type TutorialProps = z.infer<typeof tutorialSchema>;
type Screen = z.infer<typeof tutorialSpec>["screens"][number];
type Rect = { x: number; y: number; w: number; h: number };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  w: a.w + (b.w - a.w) * t,
  h: a.h + (b.h - a.h) * t,
});

// One presenter segment, cover-fitted into a panel with the face centred (eyes ~38% down).
const PresenterShot: React.FC<{
  s: FootageEditProps["segments"][number];
  rect: Rect;
}> = ({ s, rect }) => {
  const frame = useCurrentFrame();
  const sw = s.srcW ?? 1080;
  const sh = s.srcH ?? 1920;
  const fb = s.faceBox;
  const sc = Math.max(rect.w / sw, rect.h / sh);
  const dw = sw * sc;
  const dh = sh * sc;
  const cx = fb ? fb[0] + fb[2] / 2 : s.focusX;
  const ey = fb ? fb[1] + fb[3] * 0.4 : s.focusY;
  const px =
    dw > rect.w + 1 ? clamp01((rect.w / 2 - cx * dw) / (rect.w - dw)) : 0.5;
  const py =
    dh > rect.h + 1 ? clamp01((0.38 * rect.h - ey * dh) / (rect.h - dh)) : 0.4;
  const zoom = s.zoom + s.push * (frame / Math.max(1, s.durationInFrames));
  const origin = `${px * 100}% ${py * 100}%`;
  return (
    <AbsoluteFill
      style={{ transform: `scale(${zoom})`, transformOrigin: origin }}
    >
      <OffthreadVideo
        src={staticFile(s.src)}
        trimBefore={s.trimBefore}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: origin,
        }}
      />
    </AbsoluteFill>
  );
};

// The screen camera: keyframes [frame, x, y, zoom] from the clicks. It glides to a
// click just before it lands, holds, then eases back out unless the next click is close.
const cameraKeys = (sc: Screen, rest: number) => {
  const keys: number[][] = [[0, 0.5, 0.5, rest]];
  const push = (k: number[]) => {
    const last = keys[keys.length - 1];
    keys.push([Math.max(k[0], last[0] + 1), k[1], k[2], k[3]]);
  };
  sc.clicks.forEach((c, i) => {
    const last = keys[keys.length - 1];
    push([Math.max(last[0] + 1, c.f - 20), last[1], last[2], last[3]]);
    push([c.f - 3, c.x, c.y, Math.max(c.zoom, rest * 1.25)]);
    const next = sc.clicks[i + 1];
    push([c.f + c.hold, c.x, c.y, Math.max(c.zoom, rest * 1.25)]);
    if (!next || next.f - (c.f + c.hold) > 36)
      push([c.f + c.hold + 20, 0.5, 0.5, rest]);
  });
  return keys;
};
const atKeys = (keys: number[][], f: number, k: number) =>
  keys.length < 2
    ? keys[0][k]
    : interpolate(
        f,
        keys.map((x) => x[0]),
        keys.map((x) => x[k]),
        { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) },
      );

// A rough, hand-drawn path for a note, wobbling on twos.
const roughPath = (
  kind: string,
  b: Rect,
  seed: string,
  tick: number,
  tail: [number, number],
) => {
  const j = (k: string, amt: number) =>
    (random(`${seed}-${k}-${tick % 3}`) - 0.5) * amt;
  const { x, y, w, h } = b;
  if (kind === "circle") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = (w / 2) * 1.18;
    const ry = (h / 2) * 1.45;
    const pts: string[] = [];
    for (let i = 0; i <= 28; i++) {
      const a = -2.2 + (i / 28) * Math.PI * 2.15;
      const r = 1 + j(`r${i}`, 0.08);
      pts.push(
        `${i ? "L" : "M"} ${cx + Math.cos(a) * rx * r} ${cy + Math.sin(a) * ry * r}`,
      );
    }
    return pts.join(" ");
  }
  if (kind === "box") {
    const p = (px: number, py: number, k: string) =>
      `${px + j(k + "x", w * 0.03)} ${py + j(k + "y", h * 0.12)}`;
    const m = Math.min(w, h) * 0.12;
    return `M ${p(x - m, y - m, "a")} L ${p(x + w + m, y - m, "b")} L ${p(x + w + m, y + h + m, "c")} L ${p(x - m, y + h + m, "d")} L ${p(x - m * 0.6, y - m * 1.4, "e")}`;
  }
  if (kind === "underline") {
    const yy = y + h * 1.15;
    return `M ${x - w * 0.03} ${yy + j("a", h * 0.2)} C ${x + w * 0.3} ${yy + h * 0.18 + j("b", h * 0.2)}, ${x + w * 0.7} ${yy - h * 0.1 + j("c", h * 0.2)}, ${x + w * 1.03} ${yy + j("d", h * 0.2)}`;
  }
  // arrow: from the tail, curving into the edge of the box
  const [tx, ty] = tail;
  const ex = tx < x ? x - w * 0.06 : tx > x + w ? x + w * 1.06 : x + w / 2;
  const ey = ty < y ? y - h * 0.15 : ty > y + h ? y + h * 1.15 : y + h / 2;
  const mx = (tx + ex) / 2 + (ty - ey) * 0.25;
  const my = (ty + ey) / 2 - (tx - ex) * 0.25;
  return `M ${tx} ${ty} Q ${mx + j("m", w * 0.05)} ${my + j("n", h * 0.2)} ${ex} ${ey}`;
};

const Note: React.FC<{
  n: Screen["notes"][number];
  rw: number;
  rh: number;
  z: number;
  color: string;
  id: string;
}> = ({ n, rw, rh, z, color, id }) => {
  const raw = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const frame = onTwos(raw);
  const draw = interpolate(frame, [0, 12], [0, 1], {
    ...clamp,
    easing: ease.out,
  });
  const out = interpolate(
    raw,
    [n.durationInFrames - 6, n.durationInFrames],
    [1, 0],
    clamp,
  );
  const b = { x: n.x * rw, y: n.y * rh, w: n.w * rw, h: n.h * rh };
  const off = rw * 0.14;
  const tail: [number, number] =
    n.side === "right"
      ? [b.x + b.w + off, b.y + b.h + off * 0.6]
      : n.side === "top"
        ? [b.x + b.w / 2 - off * 0.4, b.y - off]
        : n.side === "bottom"
          ? [b.x + b.w / 2 + off * 0.4, b.y + b.h + off]
          : [b.x - off, b.y + b.h + off * 0.6];
  const d = roughPath(n.kind, b, id, Math.floor(raw / 2), tail);
  const ev = evolvePath(draw, d);
  const sw = (6 * u) / z;
  // Arrowhead at the end of the arrow, once it's drawn.
  let head = null;
  if (n.kind === "arrow" && draw > 0.95) {
    const m = d.match(/Q ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)/);
    if (m) {
      const [qx, qy, ex, ey] = m.slice(1).map(Number);
      const a = Math.atan2(ey - qy, ex - qx);
      const L = (26 * u) / z;
      head = `M ${ex - L * Math.cos(a - 0.5)} ${ey - L * Math.sin(a - 0.5)} L ${ex} ${ey} L ${ex - L * Math.cos(a + 0.5)} ${ey - L * Math.sin(a + 0.5)}`;
    }
  }
  const labelAt: [number, number] =
    n.kind === "arrow"
      ? tail
      : n.side === "right"
        ? [b.x + b.w * 1.25, b.y + b.h / 2]
        : [b.x + b.w / 2, b.y + b.h * 1.6 + 30 / z];
  return (
    <svg
      width={rw}
      height={rh}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        overflow: "visible",
        opacity: out,
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={ev.strokeDasharray}
        strokeDashoffset={ev.strokeDashoffset}
        style={{
          filter: `drop-shadow(0 ${2 / z}px ${4 / z}px rgba(0,0,0,0.35))`,
        }}
      />
      {head ? (
        <path
          d={head}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {n.text ? (
        <text
          x={labelAt[0]}
          y={labelAt[1]}
          textAnchor={
            n.kind === "arrow"
              ? tail[0] < b.x
                ? "end"
                : "start"
              : n.side === "right"
                ? "start"
                : "middle"
          }
          dominantBaseline="middle"
          fontFamily={font.hand}
          fontWeight={700}
          fontSize={(48 * u) / z}
          fill={color}
          opacity={interpolate(frame, [6, 14], [0, 1], clamp)}
          style={{
            paintOrder: "stroke",
            stroke: "rgba(0,0,0,0.55)",
            strokeWidth: (6 * u) / z,
          }}
        >
          {n.text}
        </text>
      ) : null}
    </svg>
  );
};

const ScreenPanel: React.FC<{
  sc: Screen;
  rect: Rect;
  accent: string;
  noteColor: string;
  id: string;
}> = ({ sc, rect, accent, noteColor, id }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const pad = Math.min(rect.w, rect.h) * 0.05;
  const fit = Math.min(
    (rect.w - pad * 2) / sc.width,
    (rect.h - pad * 2) / sc.height,
  );
  const rw = sc.width * fit;
  const rh = sc.height * fit;
  const ox = (rect.w - rw) / 2;
  const oy = (rect.h - rh) / 2;
  // At rest a wide recording in a tall panel is shown bigger than "fit" (up to 1.6×),
  // cropping its sides, so it isn't a thin strip; the camera pans from there.
  const rest = Math.min(1.6, Math.max(1, (rect.h * 0.8) / rh));
  const keys = cameraKeys(sc, rest);
  const z = atKeys(keys, frame, 3);
  const cx = atKeys(keys, frame, 1);
  const cy = atKeys(keys, frame, 2);
  // Put the camera's point at the panel centre; while the zoomed recording is still
  // smaller than the panel it stays centred, and once bigger it never shows past its edges.
  const span = (panel: number, o: number, size: number, c: number) => {
    const zs = z * size;
    if (zs <= panel) return (panel - zs) / 2 - o;
    return Math.min(-o, Math.max(panel - o - zs, panel / 2 - o - z * c * size));
  };
  const tx = span(rect.w, ox, rw, cx);
  const ty = span(rect.h, oy, rh, cy);
  // Cursor: glides from click to click, arriving 3 frames early.
  let cur: [number, number] | null = null;
  if (sc.cursor && sc.clicks.length) {
    const pts = [
      [
        Math.max(0, sc.clicks[0].f - 30),
        sc.clicks[0].x - 0.08,
        sc.clicks[0].y + 0.1,
      ],
      ...sc.clicks.map((c) => [c.f - 3, c.x, c.y]),
    ];
    const fr = pts
      .map((p) => p[0])
      .map((v, i, a) => (i && v <= a[i - 1] ? a[i - 1] + 1 : v));
    cur = [
      interpolate(
        frame,
        fr,
        pts.map((p) => p[1]),
        { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) },
      ),
      interpolate(
        frame,
        fr,
        pts.map((p) => p[2]),
        { ...clamp, easing: Easing.bezier(0.45, 0, 0.2, 1) },
      ),
    ];
  }
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${accent}22, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: ox,
          top: oy,
          width: rw,
          height: rh,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${z})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 18 * u,
            overflow: "hidden",
            boxShadow: `0 ${20 * u}px ${50 * u}px rgba(0,0,0,0.5)`,
          }}
        >
          <OffthreadVideo
            src={staticFile(sc.src)}
            trimBefore={sc.trimBefore || undefined}
            muted
            style={{ width: "100%", height: "100%" }}
          />
        </div>
        {sc.clicks.map((c, i) => {
          const r = interpolate(frame, [c.f, c.f + 14], [0, 1], clamp);
          if (frame < c.f || r >= 1) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: c.x * rw,
                top: c.y * rh,
                width: (90 * u * r) / z,
                height: (90 * u * r) / z,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                border: `${(5 * u) / z}px solid ${accent}`,
                opacity: 1 - r,
              }}
            />
          );
        })}
        {sc.notes.map((n, i) => (
          <Sequence
            key={i}
            from={n.f}
            durationInFrames={n.durationInFrames}
            layout="none"
          >
            <Note
              n={n}
              rw={rw}
              rh={rh}
              z={z}
              color={noteColor}
              id={`${id}-n${i}`}
            />
          </Sequence>
        ))}
        {cur ? (
          <svg
            width={(40 * u) / z}
            height={(56 * u) / z}
            viewBox="0 0 20 28"
            style={{
              position: "absolute",
              left: cur[0] * rw,
              top: cur[1] * rh,
              overflow: "visible",
              filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.4))",
            }}
          >
            <path
              d="M1 1 L1 22 L6.5 17 L10.5 26 L14 24.5 L10 15.8 L17 15.8 Z"
              fill="#fff"
              stroke="#111"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
};

const circled = (n: number) =>
  n >= 1 && n <= 20 ? String.fromCharCode(0x245f + n) : `${n}.`;

const PillCaptions: React.FC<{
  cues: FootageEditProps["cues"];
  y: number;
  highlight: string;
}> = ({ cues, y, highlight }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const ms = (frame / fps) * 1000;
  const cue = cues.find((q) => ms >= q.startMs && ms < q.endMs);
  if (!cue) return null;
  const pop = spring({
    frame: frame - Math.round((cue.startMs / 1000) * fps),
    fps,
    config: { damping: 18, stiffness: 240 },
    durationInFrames: 8,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y,
        display: "flex",
        justifyContent: "center",
        transform: "translateY(-50%)",
      }}
    >
      <div
        style={{
          maxWidth: width * 0.86,
          textAlign: "center",
          padding: `${10 * u}px ${22 * u}px`,
          borderRadius: 20 * u,
          backgroundColor: "rgba(10,10,12,0.82)",
          fontFamily: font.display,
          fontWeight: 900,
          fontSize: 50 * u,
          lineHeight: 1.1,
          textTransform: "uppercase",
          color: "#fff",
          transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})`,
          opacity: pop,
        }}
      >
        {cue.words.map((w, i) => {
          const on =
            ms >= w.startMs && ms < (cue.words[i + 1]?.startMs ?? cue.endMs);
          return (
            <span
              key={i}
              style={{ margin: "0 0.14em", color: on ? highlight : "#fff" }}
            >
              {w.text.replace(/[.,;:]+$/, "")}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const Tutorial: React.FC<TutorialProps> = (p) => (
  <BrandProvider brand={p.brand}>
    <TutorialInner {...p} />
  </BrandProvider>
);

const TutorialInner: React.FC<TutorialProps> = (p) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const T = p.tutorial ?? {
    style: "stack" as const,
    split: 0.4,
    banner: null,
    color: null,
    steps: [],
    screens: [],
  };
  const accent = T.color ?? brand.punch;
  const portrait = H > W;
  // 0 = the presenter has the frame, 1 = split with a recording (eased over ~8 frames).
  const on = Math.max(
    0,
    ...T.screens.map((s) =>
      interpolate(
        frame,
        [
          s.from - 8,
          s.from + 2,
          s.from + s.durationInFrames - 2,
          s.from + s.durationInFrames + 8,
        ],
        [0, 1, 1, 0],
        { ...clamp, easing: ease.inOut },
      ),
    ),
  );
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  const band = (portrait ? 0.075 : 0.09) * H;
  const pipW = portrait ? W * 0.4 : W * 0.24;
  const pres =
    T.style === "stack"
      ? lerpRect(full, { x: 0, y: 0, w: W, h: H * T.split }, on)
      : lerpRect(
          full,
          {
            x: W - pipW - 36 * u,
            y: H - pipW * 1.15 - 36 * u,
            w: pipW,
            h: pipW * 1.15,
          },
          on,
        );
  const screenRect: Rect =
    T.style === "stack"
      ? { x: 0, y: H * T.split + band, w: W, h: H * (1 - T.split) - band }
      : full;
  const step = [...T.steps].reverse().find((s) => frame >= s.from);
  const stepIn = step
    ? spring({
        frame: frame - step.from,
        fps,
        config: { damping: 200 },
        durationInFrames: 10,
      })
    : 0;
  const look = (p.grade in LOOKS ? p.grade : "neutral") as Look;
  const endFrames = p.brand?.endCard
    ? Math.round(p.brand.endCard.seconds * fps)
    : 0;
  const capY =
    T.style === "stack" && on > 0.5
      ? pres.h - 70 * u
      : H * (portrait ? 0.7 : 0.82);
  const radius = T.style === "pip" ? 28 * u * on : 0;
  const bandContent = step ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18 * u,
        transform: `translateY(${(1 - stepIn) * 30 * u}px)`,
        opacity: stepIn,
      }}
    >
      <span
        style={{
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: band * 0.62,
          color: accent,
        }}
      >
        {circled(step.n)}
      </span>
      <span
        style={{
          fontFamily: font.hand,
          fontWeight: 700,
          fontSize: band * 0.72,
          color: "#fff",
          whiteSpace: "nowrap",
        }}
      >
        {step.text}
      </span>
    </div>
  ) : T.banner ? (
    <span
      style={{
        fontFamily: font.condensed,
        fontSize: band * 0.5,
        color: "#fff",
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
    >
      {T.banner}
    </span>
  ) : null;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.background }}>
      {T.screens.map((sc, i) => (
        // Each recording runs on its own clock (clicks and notes are timed from its start).
        <Sequence
          key={`sc${i}`}
          from={sc.from}
          durationInFrames={sc.durationInFrames}
          layout="none"
        >
          <ScreenPanel
            sc={sc}
            rect={screenRect}
            accent={accent}
            noteColor="#FFFFFF"
            id={`sc${i}`}
          />
        </Sequence>
      ))}
      <div
        style={{
          position: "absolute",
          left: pres.x,
          top: pres.y,
          width: pres.w,
          height: pres.h,
          overflow: "hidden",
          borderRadius: radius,
          boxShadow:
            T.style === "pip" && on > 0
              ? `0 ${16 * u}px ${40 * u}px rgba(0,0,0,0.5)`
              : undefined,
        }}
      >
        <Grade look={look} vignette={look === "neutral" ? 0 : 0.2}>
          {p.segments.map((s, i) => (
            <Sequence
              key={i}
              from={s.from}
              durationInFrames={s.durationInFrames}
              layout="none"
            >
              <PresenterShot s={s} rect={pres} />
            </Sequence>
          ))}
        </Grade>
      </div>
      {T.style === "stack" && on > 0 && bandContent ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: H * T.split + (band * (1 - on)) / 2,
            height: band * on,
            overflow: "hidden",
            backgroundColor: accent === brand.punch ? brand.accent : accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {bandContent}
        </div>
      ) : null}
      {T.style === "pip" && on > 0 && bandContent ? (
        <div
          style={{
            position: "absolute",
            left: 40 * u,
            top: 40 * u,
            padding: `${8 * u}px ${24 * u}px`,
            borderRadius: 999,
            backgroundColor: "rgba(10,10,12,0.8)",
            opacity: on,
          }}
        >
          {bandContent}
        </div>
      ) : null}
      <PillCaptions cues={p.cues} y={capY} highlight={brand.punch} />
      {p.voice ? <Audio src={staticFile(p.voice)} /> : null}
      {p.sfx.map((x, i) => (
        <Sequence key={`sfx${i}`} from={x.from} layout="none">
          <Audio src={staticFile(x.src)} volume={x.volume} />
        </Sequence>
      ))}
      {p.music ? (
        <Audio
          src={staticFile(p.music.src)}
          trimBefore={p.music.trimBefore || undefined}
          loop
          volume={(f) =>
            p.music!.volume *
            (p.speech.some(([a, b]) => f >= a - 6 && f <= b + 6)
              ? p.music!.duck
              : 1) *
            interpolate(
              f,
              [0, 6, p.durationInFrames - 0.8 * fps, p.durationInFrames - 1],
              [0, 1, 1, 0],
              clamp,
            )
          }
        />
      ) : null}
      {endFrames ? (
        <Sequence
          from={p.durationInFrames - endFrames}
          durationInFrames={endFrames}
          layout="none"
        >
          <BrandEndCard durationInFrames={endFrames} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

export const calcTutorial = ({ props }: { props: TutorialProps }) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
});
