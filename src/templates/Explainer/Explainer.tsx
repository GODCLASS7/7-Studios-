import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { clamp01, enter, fade, feelOf, feelSchema, readingSeconds, typefaceOf, typefaceSchema } from "../../lib/feel";
import { springTracks } from "../../lib/motion";

// One idea explained in a few beats (usually three: the situation, how it's solved, the
// outcome), readable without sound. Each beat's words stay on screen long enough to read
// (worked out from the word count), and the picture is one set of tiles that turns each
// idea into a visible action: scattered, sorted into a plan, gathered into a check,
// growing into a chart, linked in a circle, stacked, or your own image.

const VISUALS = ["scatter", "sort", "check", "grow", "connect", "stack", "image", "none"] as const;
type VisualKind = (typeof VISUALS)[number];

export const explainerSchema = z.object({
  beats: z
    .array(
      z.object({
        kicker: z.string().default(""),
        text: z.string(),
        visual: z.enum(VISUALS).default("scatter"),
        image: z.string().default("").describe("For the image visual: a file under public/"),
        /** 0 = worked out from the word count. */
        seconds: z.number().min(0).max(12).default(0),
      }),
    )
    .min(1)
    .max(5),
  end: z.string().default("").describe("Optional closing line, shown on its own"),
  background: z.string().default("#FBF9F4"),
  text: z.string().default("#17130D"),
  muted: z.string().default("#8E8574"),
  accent: z.string().default("#D6A33B"),
  tile: z.string().default("#FFFFFF"),
  typeface: typefaceSchema,
  feel: feelSchema,
  reducedMotion: z.boolean().default(false),
});
export type ExplainerProps = z.infer<typeof explainerSchema>;

const beatLength = (b: ExplainerProps["beats"][number]) => b.seconds || readingSeconds(`${b.kicker} ${b.text}`, 3);
const END = 2.6;
const timeline = (p: ExplainerProps) => {
  let at = 0.3;
  const starts = p.beats.map((b) => {
    const s = at;
    at += beatLength(b);
    return s;
  });
  return { starts, endAt: at, total: at + (p.end ? END : 0.4) };
};

export const calcExplainer: CalculateMetadataFunction<ExplainerProps> = ({ props }) => ({
  durationInFrames: Math.round(timeline(props).total * 30),
  fps: 30,
});

type Tile = { x: number; y: number; w: number; h: number; r: number; o: number };
const N = 7;
const SCATTER = [
  [0.2, 0.22, -14],
  [0.64, 0.16, 9],
  [0.84, 0.44, -7],
  [0.32, 0.56, 12],
  [0.72, 0.76, -11],
  [0.16, 0.82, 6],
  [0.5, 0.36, -4],
];
const pose = (v: VisualKind, i: number): Tile => {
  switch (v) {
    case "sort":
      return { x: 0.08 + i * 0.14, y: 0.5, w: 0.115, h: 0.5, r: 0, o: 1 };
    case "check":
      return { x: 0.5 + (i - 3) * 0.006, y: 0.5 + (i - 3) * 0.006, w: 0.52, h: 0.52, r: (i - 3) * 1.2, o: 1 };
    case "grow": {
      const h = 0.14 + i * 0.1;
      return { x: 0.11 + i * 0.13, y: 0.88 - h / 2, w: 0.095, h, r: 0, o: 1 };
    }
    case "connect": {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      return { x: 0.5 + Math.cos(a) * 0.34, y: 0.5 + Math.sin(a) * 0.34, w: 0.15, h: 0.15, r: 0, o: 1 };
    }
    case "stack":
      return { x: 0.5, y: 0.72 - i * 0.075, w: 0.62 - (i % 2) * 0.04, h: 0.1, r: (i % 2 ? 1.5 : -1.5), o: 1 };
    case "image":
    case "none":
      return { x: 0.5, y: 0.5, w: 0.1, h: 0.1, r: 0, o: 0 };
    default: {
      const [x, y, r] = SCATTER[i];
      return { x, y, w: 0.24, h: 0.17, r, o: 1 };
    }
  }
};

export const Explainer: React.FC<ExplainerProps> = (p) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const f = feelOf(p.feel);
  const reduced = p.reducedMotion;
  const font = typefaceOf(p.typeface);
  const portrait = height > width * 1.2;
  const landscape = width > height * 1.2;
  const u = Math.min(width, height) / 1080;
  const { starts, endAt } = timeline(p);
  const idx = Math.max(0, starts.filter((s) => t >= s).length - 1);
  const beat = p.beats[idx];
  const inEnd = !!p.end && t >= endAt;

  // The stage the tiles move on.
  const S = portrait ? width * 0.78 : landscape ? Math.min(width * 0.4, height * 0.72) : height * 0.5;
  const stageX = portrait ? (width - S) / 2 : landscape ? width * 0.08 : (width - S) / 2;
  const stageY = portrait ? height * 0.12 : landscape ? (height - S) / 2 : height * 0.07;

  // Tiles: each spring from one beat's pose to the next (a short fade with reduced motion).
  const keys = (i: number) => [
    { t: 0, v: { ...pose(p.beats[0].visual, i), o: 0 } },
    ...p.beats.map((b, k) => ({ t: starts[k] + (k === 0 ? 0 : 0.12), v: pose(b.visual, i) })),
    ...(p.end ? [{ t: endAt, v: { ...pose(p.beats[p.beats.length - 1].visual, i), o: 0 } }] : []),
  ];
  const tiles = Array.from({ length: N }, (_, i) => {
    if (reduced) {
      const v = inEnd ? { ...pose(beat.visual, i), o: 0 } : pose(beat.visual, i);
      const since = t - (inEnd ? endAt : starts[idx]);
      return { ...v, o: v.o * clamp01(since / 0.25) };
    }
    return springTracks(t, keys(i).map((k, j) => ({ ...k, t: k.t + (j > 0 ? i * 0.03 * f.pace : 0) })), { omega: f.omega * 0.8, zeta: f.zeta });
  });

  const beatT = t - starts[idx];
  const beatEnd = (idx + 1 < starts.length ? starts[idx + 1] : endAt) - t;
  const showCheck = beat.visual === "check" && !inEnd;
  const checkDraw = showCheck ? clamp01((beatT - 0.45 * f.pace) / 0.5) : 0;
  const showLinks = beat.visual === "connect" && !inEnd ? clamp01((beatT - 0.5) / 0.6) : 0;

  // Words: the kicker, then the line rising in; out quickly before the next beat.
  const kIn = fade(t, starts[idx] + 0.05, 0.3);
  const tIn = enter(t, starts[idx] + 0.18, p.feel, reduced);
  const out = idx + 1 < starts.length || p.end ? clamp01((0.28 - beatEnd) / 0.22) : 0;
  const textSize = (portrait ? 78 : landscape ? 64 : 62) * u * (beat.text.length > 70 ? 0.86 : 1);

  const textBox: React.CSSProperties = portrait
    ? { left: width * 0.08, right: width * 0.08, top: stageY + S + height * 0.06 }
    : landscape
      ? { left: width * 0.54, right: width * 0.07, top: height * 0.5, transform: "translateY(-50%)" }
      : { left: width * 0.08, right: width * 0.08, top: stageY + S + height * 0.05 };

  return (
    <AbsoluteFill style={{ backgroundColor: p.background }}>
      <div style={{ position: "absolute", left: stageX, top: stageY, width: S, height: S }}>
        {showLinks > 0 ? (
          <svg width={S} height={S} style={{ position: "absolute", inset: 0 }}>
            {tiles.map((a, i) => {
              const b = tiles[(i + 1) % N];
              return <line key={i} x1={a.x * S} y1={a.y * S} x2={b.x * S} y2={b.y * S} stroke={p.accent} strokeWidth={4 * u} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - showLinks} opacity={0.8} />;
            })}
          </svg>
        ) : null}
        {tiles.map((tl, i) => {
          const hot = beat.visual === "check" ? i === N - 1 : i % 3 === 0;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: (tl.x - tl.w / 2) * S,
                top: (tl.y - tl.h / 2) * S,
                width: Math.max(0, tl.w * S),
                height: Math.max(0, tl.h * S),
                transform: `rotate(${tl.r}deg)`,
                opacity: clamp01(tl.o),
                borderRadius: Math.min(tl.w, tl.h) * S * 0.18,
                background: hot ? p.accent : p.tile,
                boxShadow: `0 ${10 * u}px ${26 * u}px -${12 * u}px rgba(60,45,20,0.4), 0 0 0 ${1.5 * u}px rgba(0,0,0,0.06)`,
              }}
            />
          );
        })}
        {showCheck ? (
          <svg width={S * 0.3} height={S * 0.3} viewBox="0 0 24 24" style={{ position: "absolute", left: S * 0.35, top: S * 0.35 }}>
            <path d="M4.5 12.5 L9.6 17.4 L19.5 6.8" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - checkDraw} />
          </svg>
        ) : null}
        {beat.visual === "image" && beat.image && !inEnd ? (
          <Img
            src={staticFile(beat.image)}
            style={{
              position: "absolute",
              inset: 0,
              width: S,
              height: S,
              objectFit: "cover",
              borderRadius: 28 * u,
              opacity: clamp01(enter(t, starts[idx] + 0.1, p.feel, reduced)) * (1 - out),
            }}
          />
        ) : null}
      </div>

      {!inEnd ? (
        <div style={{ position: "absolute", ...textBox, opacity: 1 - out }}>
          {beat.kicker ? (
            <div style={{ fontFamily: typefaceOf("inter"), fontSize: 30 * u, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: p.accent, opacity: kIn, marginBottom: 22 * u }}>
              {beat.kicker}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: font,
              fontSize: textSize,
              fontWeight: 650,
              lineHeight: 1.12,
              letterSpacing: "-0.01em",
              color: p.text,
              opacity: clamp01(tIn),
              transform: reduced || tIn >= 1 ? "none" : `translateY(${(1 - tIn) * 40 * u * f.travel}px)`,
            }}
          >
            {beat.text}
          </div>
        </div>
      ) : (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: width * 0.1 }}>
          <div
            style={{
              fontFamily: font,
              fontSize: (portrait ? 92 : 84) * u,
              fontWeight: 700,
              lineHeight: 1.08,
              textAlign: "center",
              color: p.text,
              opacity: clamp01(enter(t, endAt + 0.15, p.feel, reduced)),
            }}
          >
            {p.end}
          </div>
        </AbsoluteFill>
      )}

      {p.beats.length > 1 && !inEnd ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: (portrait ? 110 : 60) * u, display: "flex", justifyContent: "center", gap: 14 * u }}>
          {p.beats.map((_, i) => (
            <div key={i} style={{ width: (i === idx ? 44 : 14) * u, height: 14 * u, borderRadius: 7 * u, background: i === idx ? p.accent : p.muted, opacity: i === idx ? 1 : 0.4 }} />
          ))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const explainerDefaults: ExplainerProps = {
  beats: [
    { kicker: "The problem", text: "Ideas, clips and posts end up scattered across apps.", visual: "scatter", image: "", seconds: 0 },
    { kicker: "How 7 Studios helps", text: "Seven studios in one place, on your own computer.", visual: "sort", image: "", seconds: 0 },
    { kicker: "The outcome", text: "Every image, edit and reel ready, and nothing posted without your yes.", visual: "check", image: "", seconds: 0 },
  ],
  end: "Making dreams, creating realities.",
  background: "#FBF9F4",
  text: "#17130D",
  muted: "#8E8574",
  accent: "#D6A33B",
  tile: "#FFFFFF",
  typeface: "fraunces",
  feel: "precise",
  reducedMotion: false,
};
