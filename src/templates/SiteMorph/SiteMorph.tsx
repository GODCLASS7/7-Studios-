import { CameraMotionBlur } from "@remotion/motion-blur";
import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { font } from "../../lib";
import { brandSchema, BrandProvider } from "../../lib/brand";
import { colourTrack, springTracks } from "../../lib/motion";

// SiteMorph: a website told as one shape that never cuts. The shape morphs through
// the site's real components on a beat grid, driven by a cursor that clicks, toggles
// and drags; the camera zooms so each state fills the frame; as a loop, the last
// frame flows into the first with matching position and velocity. Built from a
// site capture (npm run site-capture) and a plan in jobs/<id>/sitemorph.json;
// rendered and checked with npm run sitemorph. 60 fps.
//
// Rules it keeps: real copy and colours only (from the capture); every value is a
// pure function of the frame; text enters ~0.1 s after the shape starts moving;
// one shared element (the indicator) carries across states.

const stateSchema = z.object({
  kind: z.enum([
    "button",
    "toggle",
    "tabs",
    "player",
    "slider",
    "card",
    "stat",
    "quote",
    "list",
    "image",
    "cta",
  ]),
  // The words, exactly as they appear on the site.
  title: z.string().nullable().default(null),
  body: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  value: z.string().nullable().default(null),
  items: z.array(z.string()).default([]),
  image: z.string().nullable().default(null),
  color: z.string().nullable().default(null),
  // Hold this state for extra beats (quotes and paragraphs need 4–6 s).
  beats: z.number().nullable().default(null),
});
export type MorphState = z.infer<typeof stateSchema>;

export const siteMorphSchema = z.object({
  bpm: z.number().default(120),
  beatsPerState: z.number().default(2),
  loop: z.boolean().default(false),
  states: z.array(stateSchema),
  theme: z.object({
    background: z.string().default("#101014"),
    surface: z.string().default("#1C1C22"),
    text: z.string().default("#F4F4F6"),
    muted: z.string().default("#9A9AA4"),
    accent: z.string().default("#E8B44A"),
    onAccent: z.string().default("#101014"),
    display: z.string().nullable().default(null),
  }),
  cursor: z.boolean().default(true),
  // Quiet UI clicks on each action (needs the sound pack: npm run sfx).
  sfx: z.boolean().default(false),
  // Per-frame motion blur for finals (several times slower to render).
  motionBlur: z.boolean().default(false),
  music: z
    .object({
      src: z.string(),
      volume: z.number().default(0.5),
      trimBefore: z.number().default(0),
    })
    .nullable()
    .default(null),
  brand: brandSchema,
});
export type SiteMorphProps = z.infer<typeof siteMorphSchema>;

export const calcSiteMorph: CalculateMetadataFunction<SiteMorphProps> = ({
  props,
}) => {
  const beat = 60 / props.bpm;
  const total = props.states.reduce(
    (t, s) => t + (s.beats ?? props.beatsPerState),
    0,
  );
  return {
    durationInFrames: Math.max(60, Math.round(total * beat * 60)),
    fps: 60,
  };
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// The shape each state takes (1080-based units) and where the cursor acts on it.
const layout = (s: MorphState) => {
  const L: Record<MorphState["kind"], { w: number; h: number; r: number }> = {
    button: { w: 430, h: 128, r: 64 },
    toggle: { w: 230, h: 124, r: 62 },
    tabs: { w: 780, h: 180, r: 26 },
    player: { w: 780, h: 320, r: 34 },
    slider: { w: 780, h: 176, r: 30 },
    card: { w: 780, h: 560, r: 36 },
    stat: { w: 620, h: 430, r: 34 },
    quote: { w: 840, h: 580, r: 36 },
    list: { w: 780, h: 580, r: 34 },
    image: { w: 840, h: 640, r: 30 },
    cta: { w: 580, h: 150, r: 75 },
  };
  // A card without a picture is only as tall as its words.
  if (s.kind === "card") return { ...L.card, h: s.image ? 620 : 330 };
  return L[s.kind];
};
// Where the indicator (the shared element) sits inside a state, as fractions of the shape.
const indicator = (s: MorphState, act: number) => {
  switch (s.kind) {
    case "toggle":
      return { x: 0.14 + 0.47 * act, y: 0.14, w: 0.39, h: 0.72, r: 999 };
    case "tabs":
      return {
        x: 0.06 + (act > 0.5 ? 0.5 : 0.17) * 0.9,
        y: 0.78,
        w: 0.26,
        h: 0.055,
        r: 999,
      };
    case "player":
      return {
        x: 0.075,
        y: 0.76,
        w: 0.85 * (0.25 + 0.6 * act),
        h: 0.05,
        r: 999,
      };
    case "slider":
      return { x: 0.075, y: 0.47, w: 0.85 * act, h: 0.09, r: 999 };
    case "stat":
      return { x: 0.09, y: 0.86, w: 0.3 + 0.4 * act, h: 0.025, r: 999 };
    case "list":
      return {
        x: 0.07,
        y: 0.14 + Math.min(2, Math.floor(act * 3)) * 0.14,
        w: 0.035,
        h: 0.06,
        r: 8,
      };
    default:
      return { x: 0.07, y: 0.85, w: 0.2, h: 0.03, r: 999 };
  }
};
// Where the cursor acts for a state (fractions of the shape).
const cursorTarget = (s: MorphState) =>
  s.kind === "toggle"
    ? { x: 0.65, y: 0.5 }
    : s.kind === "tabs"
      ? { x: 0.68, y: 0.5 }
      : s.kind === "slider"
        ? { x: 0.5, y: 0.5 }
        : s.kind === "player"
          ? { x: 0.14, y: 0.5 }
          : s.kind === "list"
            ? { x: 0.5, y: 0.3 }
            : { x: 0.62, y: 0.55 };

const Cursor: React.FC<{ x: number; y: number; press: number; u: number }> = ({
  x,
  y,
  press,
  u,
}) => (
  <div style={{ position: "absolute", left: x, top: y, zIndex: 40 }}>
    <svg
      width={34 * u}
      height={40 * u}
      viewBox="0 0 17 20"
      style={{
        transform: `scale(${1 - press * 0.18})`,
        transformOrigin: "3px 2px",
        filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.45))",
      }}
    >
      <path
        d="M 2.5 1 L 2.5 15.5 L 6.2 12.2 L 8.6 18 L 11.4 16.8 L 9 11.2 L 14 11 Z"
        fill="#fff"
        stroke="#1a1a1e"
        strokeWidth={1}
      />
    </svg>
    {press > 0.4 ? (
      <div
        style={{
          position: "absolute",
          left: -14 * u,
          top: -16 * u,
          width: 36 * u,
          height: 36 * u,
          borderRadius: "50%",
          border: `${2 * u}px solid rgba(255,255,255,0.7)`,
          transform: `scale(${0.6 + press})`,
          opacity: 1.4 - press,
        }}
      />
    ) : null}
  </div>
);

// The contents of one state, inside the shape (sized in shape-local units).
const StateFace: React.FC<{
  s: MorphState;
  theme: SiteMorphProps["theme"];
  u: number;
  act: number;
  // Seconds since this state began, and until it ends.
  since: number;
  left: number;
}> = ({ s, theme, u, act, since, left }) => {
  const d = layout(s);
  const W = d.w * u;
  const H = d.h * u;
  const pad = 42 * u;
  const disp = theme.display
    ? `"${theme.display}", ${font.display}`
    : font.display;
  // Text enters ~70 ms after the shape starts moving, exits faster, with a little blur.
  // Timed in seconds, so a long state (a quote) enters as fast as a short one.
  const enter = interpolate(since, [0.1, 0.34], [0, 1], clamp);
  const exitT = interpolate(-left, [-0.14, -0.03], [0, 1], clamp);
  const tx: React.CSSProperties = {
    opacity: enter * (1 - exitT),
    filter: `blur(${(1 - enter + exitT) * 3}px)`,
    transform: `scale(${0.965 + 0.035 * Math.min(enter, 1 - exitT * 0.5)})`,
    transformOrigin: "left center",
  };
  const title = s.title ?? s.label ?? "";
  switch (s.kind) {
    case "button":
    case "cta":
      return (
        <div
          style={{
            width: W,
            height: H,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...tx,
            transformOrigin: "center",
          }}
        >
          <span
            style={{
              fontFamily: disp,
              fontWeight: 700,
              fontSize: H * 0.38,
              color: theme.onAccent,
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
        </div>
      );
    case "toggle":
      return null;
    case "tabs":
      return (
        <div
          style={{
            width: W,
            height: H,
            display: "flex",
            gap: W * 0.06,
            alignItems: "center",
            padding: `0 ${W * 0.08}px`,
            ...tx,
          }}
        >
          {(s.items.length ? s.items : [s.label || "One", s.body || "Two"])
            .slice(0, 3)
            .map((it, i) => (
              <span
                key={i}
                style={{
                  fontFamily: disp,
                  fontWeight: 600,
                  fontSize: 40 * u,
                  color: (act > 0.5 ? i === 1 : i === 0)
                    ? theme.text
                    : theme.muted,
                }}
              >
                {it}
              </span>
            ))}
        </div>
      );
    case "player":
      return (
        <div style={{ width: W, height: H, padding: pad, ...tx }}>
          <div style={{ display: "flex", alignItems: "center", gap: 26 * u }}>
            <div
              style={{
                width: 92 * u,
                height: 92 * u,
                borderRadius: "50%",
                backgroundColor: theme.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width={34 * u} height={34 * u} viewBox="0 0 24 24">
                {act > 0.02 ? (
                  <path d="M7 4h4v16H7zM14 4h4v16h-4z" fill={theme.onAccent} />
                ) : (
                  <path d="M7 4l12 8-12 8z" fill={theme.onAccent} />
                )}
              </svg>
            </div>
            <div>
              <div
                style={{
                  fontFamily: disp,
                  fontWeight: 700,
                  fontSize: 42 * u,
                  color: theme.text,
                }}
              >
                {title}
              </div>
              {s.body ? (
                <div
                  style={{
                    fontFamily: font.body,
                    fontSize: 28 * u,
                    color: theme.muted,
                    marginTop: 6 * u,
                  }}
                >
                  {s.body}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      );
    case "slider":
      return (
        <div style={{ position: "absolute", left: pad, top: 18 * u, ...tx }}>
          <span
            style={{
              fontFamily: font.mono,
              fontSize: 24 * u,
              letterSpacing: "0.12em",
              color: theme.muted,
              textTransform: "uppercase",
            }}
          >
            {title}
          </span>
        </div>
      );
    case "card":
      return (
        <div style={{ width: W, height: H, padding: pad, ...tx }}>
          {s.image ? (
            <Img
              src={staticFile(s.image)}
              style={{
                width: "100%",
                height: 290 * u,
                objectFit: "cover",
                borderRadius: 20 * u,
                marginBottom: 28 * u,
                display: "block",
              }}
            />
          ) : null}
          <div
            style={{
              fontFamily: disp,
              fontWeight: 800,
              fontSize: 58 * u,
              lineHeight: 1.05,
              color: theme.text,
            }}
          >
            {title}
          </div>
          {s.body ? (
            <div
              style={{
                fontFamily: font.body,
                fontSize: 32 * u,
                lineHeight: 1.45,
                color: theme.muted,
                marginTop: 24 * u,
              }}
            >
              {s.body}
            </div>
          ) : null}
        </div>
      );
    case "stat":
      return (
        <div
          style={{
            width: W,
            height: H,
            padding: pad,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            ...tx,
          }}
        >
          <div
            style={{
              fontFamily: disp,
              fontWeight: 800,
              fontSize: 120 * u,
              color: theme.accent,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {s.value ?? ""}
          </div>
          <div
            style={{
              fontFamily: font.body,
              fontSize: 32 * u,
              color: theme.text,
              marginTop: 8 * u,
            }}
          >
            {title}
          </div>
        </div>
      );
    case "quote":
      return (
        <div
          style={{
            width: W,
            height: H,
            padding: pad,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            ...tx,
          }}
        >
          <div
            style={{
              fontFamily: theme.display
                ? `"${theme.display}", ${font.serif}`
                : font.serif,
              fontSize: 46 * u,
              lineHeight: 1.35,
              color: theme.text,
            }}
          >
            “{s.body ?? title}”
          </div>
          {s.label ? (
            <div
              style={{
                fontFamily: font.mono,
                fontSize: 26 * u,
                letterSpacing: "0.14em",
                color: theme.muted,
                marginTop: 28 * u,
                textTransform: "uppercase",
              }}
            >
              {s.label}
            </div>
          ) : null}
        </div>
      );
    case "list":
      return (
        <div style={{ width: W, height: H, padding: pad, ...tx }}>
          <div
            style={{
              fontFamily: disp,
              fontWeight: 800,
              fontSize: 48 * u,
              color: theme.text,
              marginBottom: 26 * u,
            }}
          >
            {title}
          </div>
          {s.items.slice(0, 4).map((it, i) => (
            <div
              key={i}
              style={{
                fontFamily: font.body,
                fontSize: 32 * u,
                color: i <= act * 3 ? theme.text : theme.muted,
                padding: `${12 * u}px 0 ${12 * u}px ${56 * u}px`,
              }}
            >
              {it}
            </div>
          ))}
        </div>
      );
    case "image":
      return (
        <div style={{ width: W, height: H, ...tx, transformOrigin: "center" }}>
          {s.image ? (
            <Img
              src={staticFile(s.image)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: layout(s).r * u,
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: layout(s).r * u,
                background: `linear-gradient(140deg, ${theme.accent}33, ${theme.accent}0D)`,
              }}
            />
          )}
          {title ? (
            <div
              style={{
                position: "absolute",
                left: pad,
                bottom: pad * 0.7,
                fontFamily: disp,
                fontWeight: 800,
                fontSize: 52 * u,
                color: "#fff",
                textShadow: "0 2px 18px rgba(0,0,0,0.55)",
              }}
            >
              {title}
            </div>
          ) : null}
        </div>
      );
  }
};

const Morph: React.FC<SiteMorphProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const t = frame / fps;
  const T = durationInFrames / fps;
  const beat = 60 / p.bpm;
  const n = p.states.length;
  // Each state's start time on the beat grid.
  const starts: number[] = [];
  let acc = 0;
  for (const s of p.states) {
    starts.push(acc);
    acc += (s.beats ?? p.beatsPerState) * beat;
  }
  const loopOpt = p.loop ? { loop: T } : {};
  // Shape keys: with a loop, the shape starts the period shaped as the LAST state and
  // springs to state 0 at t = 0, so the wrap is just another change.
  const geo = (s: MorphState) => {
    const d = layout(s);
    return { w: d.w * u, h: d.h * u, r: d.r * u };
  };
  const keys = p.states.map((s, i) => ({ t: starts[i], v: geo(s) }));
  const shapeKeys = p.loop
    ? [{ t: -beat, v: geo(p.states[n - 1]) }, ...keys]
    : keys;
  const shape = springTracks(t, shapeKeys, {
    omega: 13,
    zeta: 0.88,
    ...loopOpt,
  });
  let active = 0;
  for (let i = 0; i < n; i++) if (t >= starts[i]) active = i;
  const s = p.states[active];
  const stateLen = (s.beats ?? p.beatsPerState) * beat;
  const since = t - starts[active];
  const left = starts[active] + stateLen - t;
  // The accent states (button, toggle on, cta) fill with the accent colour.
  const fillOf = (st: MorphState) =>
    st.color ??
    (st.kind === "button" || st.kind === "cta"
      ? p.theme.accent
      : p.theme.surface);
  const fill = colourTrack(
    t,
    (p.loop
      ? [
          { t: -beat, c: fillOf(p.states[n - 1]) },
          ...p.states.map((st, i) => ({ t: starts[i], c: fillOf(st) })),
        ]
      : p.states.map((st, i) => ({ t: starts[i], c: fillOf(st) }))
    ).map((k) => ({ t: k.t, c: k.c })),
    { omega: 10 },
  );
  // The camera zooms so each state fills the frame (text at least ~30 px tall).
  const zoomOf = (st: MorphState) => {
    const d = layout(st);
    return Math.min((W * 0.78) / (d.w * u), (H * 0.6) / (d.h * u), 1.9);
  };
  const camKeys = p.states.map((st, i) => ({
    t: starts[i],
    v: { z: zoomOf(st) },
  }));
  const cam = springTracks(
    t,
    p.loop
      ? [{ t: -beat, v: { z: zoomOf(p.states[n - 1]) } }, ...camKeys]
      : camKeys,
    { omega: 9, zeta: 1, ...loopOpt },
  );
  // The action inside a state (toggle flips, progress fills, a drag): presses land ON the beat.
  const actionAt = starts[active] + Math.min(stateLen * 0.5, beat);
  const isDrag = s.kind === "slider";
  const act = isDrag
    ? interpolate(t, [actionAt, actionAt + beat * 0.9], [0.22, 0.74], {
        ...clamp,
        easing: (x) => x * x * (3 - 2 * x),
      })
    : s.kind === "player" || s.kind === "list" || s.kind === "stat"
      ? interpolate(
          t,
          [starts[active] + 0.12, starts[active] + stateLen * 0.85],
          [0, 1],
          clamp,
        )
      : springStepAct(t - actionAt);
  // The indicator: the one element that carries across every state.
  const indKeys = p.states.map((st, i) => {
    const g = geo(st);
    const stLen = (st.beats ?? p.beatsPerState) * beat;
    const stAct =
      i === active
        ? act
        : t > starts[i] + stLen * 0.5 || (p.loop && t < starts[i])
          ? 1
          : 0;
    const rel = indicator(st, i === active ? stAct : 1);
    return {
      t: starts[i],
      v: {
        x: rel.x * g.w - g.w / 2,
        y: rel.y * g.h - g.h / 2,
        w: rel.w * g.w,
        h: rel.h * g.h,
        r: rel.r === 999 ? Math.min(rel.w * g.w, rel.h * g.h) / 2 : rel.r * u,
      },
    };
  });
  // The active state's indicator moves with the action directly (a drag is a pure function
  // of the cursor), so only state CHANGES go through the spring.
  const indBase = springTracks(
    t,
    p.loop ? [{ t: -beat, v: indKeys[n - 1].v }, ...indKeys] : indKeys,
    { omega: 15, zeta: 0.9, ...loopOpt },
  );
  const indNow = (() => {
    const g = geo(s);
    const rel = indicator(s, act);
    const settled = interpolate(since, [0.18, 0.32], [0, 1], clamp);
    const target = {
      x: rel.x * g.w - g.w / 2,
      y: rel.y * g.h - g.h / 2,
      w: rel.w * g.w,
      h: rel.h * g.h,
      r: rel.r === 999 ? Math.min(rel.w * g.w, rel.h * g.h) / 2 : rel.r * u,
    };
    return {
      x: indBase.x + (target.x - indBase.x) * settled,
      y: indBase.y + (target.y - indBase.y) * settled,
      w: indBase.w + (target.w - indBase.w) * settled,
      h: indBase.h + (target.h - indBase.h) * settled,
      r: indBase.r + (target.r - indBase.r) * settled,
    };
  })();
  // The leading edge of a liquid indicator rides a stiffer spring than the trailing edge.
  // (springTracks above gives the body; stretch the width slightly while moving.)
  const stretch = Math.min(
    1.18,
    1 + Math.abs(indNow.x - indBase.x) / Math.max(60 * u, indNow.w),
  );
  // The cursor: a 4th-order step toward each state's target, pressing ~80 ms before the beat.
  const curKeys = p.states.map((st, i) => {
    const g = geo(st);
    const c = cursorTarget(st);
    return {
      t: Math.max(0.001, starts[i]) - beat * 0.45,
      v: { x: (c.x - 0.5) * g.w, y: (c.y - 0.5) * g.h },
    };
  });
  const cur = springTracks(
    t,
    p.loop
      ? [{ t: -beat - beat * 0.45, v: curKeys[n - 1].v }, ...curKeys]
      : curKeys,
    { shape: "step4", omega: 16, ...loopOpt },
  );
  // While dragging the slider, the knob is a pure function of the cursor.
  const dragX =
    isDrag && t >= actionAt && t <= actionAt + beat * 0.9 ? cur.x : null;
  const press = (() => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const at = Math.max(0.001, starts[i]);
      v = Math.max(
        v,
        interpolate(t, [at - 0.08, at, at + 0.14], [0, 1, 0], clamp),
      );
      if (p.loop)
        v = Math.max(
          v,
          interpolate(t - T, [at - 0.08, at, at + 0.14], [0, 1, 0], clamp),
        );
    }
    if (isDrag)
      v = Math.max(
        v,
        interpolate(
          t,
          [
            actionAt - 0.08,
            actionAt,
            actionAt + beat * 0.9,
            actionAt + beat * 0.9 + 0.1,
          ],
          [0, 1, 1, 0],
          clamp,
        ),
      );
    return v;
  })();
  const cx = W / 2;
  const cy = H / 2;
  return (
    <AbsoluteFill style={{ backgroundColor: p.theme.background }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 42%, ${p.theme.accent}14, transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{ transform: `scale(${cam.z})`, transformOrigin: "50% 50%" }}
      >
        {/* The one shape. */}
        <div
          style={{
            position: "absolute",
            left: cx - shape.w / 2,
            top: cy - shape.h / 2,
            width: shape.w,
            height: shape.h,
            borderRadius: shape.r,
            backgroundColor: fill,
            // A softer shadow on a light page, where a dark one would look heavy.
            boxShadow: `0 ${26 * u}px ${80 * u}px rgba(0,0,0,${isLight(p.theme.background) ? 0.13 : 0.45}), inset 0 0 0 1px ${isLight(p.theme.background) ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.07)"}`,
            overflow: "hidden",
          }}
        >
          {/* The indicator, in shape-local space. */}
          {s.kind !== "button" &&
          s.kind !== "cta" &&
          s.kind !== "quote" &&
          s.kind !== "image" &&
          s.kind !== "card" ? (
            <div
              style={{
                position: "absolute",
                left:
                  shape.w / 2 +
                  (dragX !== null
                    ? Math.min(indNow.x, dragX - indNow.w / 2)
                    : indNow.x) -
                  (stretch - 1) * indNow.w * 0.5,
                top: shape.h / 2 + indNow.y,
                width: indNow.w * stretch,
                height: indNow.h,
                borderRadius: indNow.r,
                backgroundColor: p.theme.accent,
              }}
            />
          ) : null}
          {/* Slider rail under the knob. */}
          {s.kind === "slider" ? (
            <div
              style={{
                position: "absolute",
                left: shape.w * 0.075,
                top: shape.h / 2 + indNow.y + indNow.h / 2 - 3 * u,
                width: shape.w * 0.85,
                height: 6 * u,
                borderRadius: 999,
                backgroundColor: `${p.theme.muted}44`,
                zIndex: -1,
              }}
            />
          ) : null}
        </div>
        {/* The active state's content, centred on the shape and clipped to it, so words
            never spill outside the shape while it is still growing. */}
        <div
          style={{
            position: "absolute",
            left: cx - shape.w / 2,
            top: cy - shape.h / 2,
            width: shape.w,
            height: shape.h,
            borderRadius: shape.r,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: shape.w / 2 - layout(s).w * u * 0.5,
              top: shape.h / 2 - layout(s).h * u * 0.5,
            }}
          >
            <StateFace
              s={s}
              theme={p.theme}
              u={u}
              act={act}
              since={since}
              left={left}
            />
          </div>
        </div>
        {p.cursor ? (
          <Cursor
            x={cx + cur.x}
            y={cy + cur.y}
            press={press}
            u={u / Math.max(0.9, cam.z)}
          />
        ) : null}
      </AbsoluteFill>
      {p.sfx
        ? starts.map((st, i) => (
            <Sequence
              key={i}
              from={Math.max(0, Math.round(st * fps) - 5)}
              layout="none"
            >
              <Audio src={staticFile("audio/sfx/click.wav")} volume={0.25} />
            </Sequence>
          ))
        : null}
      {p.music ? (
        <Audio
          src={staticFile(p.music.src)}
          trimBefore={p.music.trimBefore || undefined}
          volume={p.music.volume}
        />
      ) : null}
    </AbsoluteFill>
  );
};
// Is a hex colour light (relative luminance above one half)?
const isLight = (hex: string) => {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
};
// A quick settle for toggles and tabs (no overshoot).
const springStepAct = (dt: number) =>
  dt <= 0 ? 0 : 1 - Math.exp(-14 * dt) * (1 + 14 * dt);

export const SiteMorph: React.FC<SiteMorphProps> = (p) => {
  const inner = <Morph {...p} />;
  return (
    <BrandProvider brand={p.brand}>
      {p.motionBlur ? (
        <CameraMotionBlur samples={6} shutterAngle={180}>
          {inner}
        </CameraMotionBlur>
      ) : (
        inner
      )}
    </BrandProvider>
  );
};

// A sample run so the compositions open on something useful.
export const siteMorphDefaults: SiteMorphProps = {
  bpm: 120,
  beatsPerState: 2,
  loop: true,
  cursor: true,
  sfx: false,
  motionBlur: false,
  music: null,
  brand: null,
  theme: {
    background: "#101014",
    surface: "#1C1C22",
    text: "#F4F4F6",
    muted: "#9A9AA4",
    accent: "#E8B44A",
    onAccent: "#101014",
    display: null,
  },
  states: [
    {
      kind: "button",
      title: "Start a project",
      body: null,
      label: null,
      value: null,
      items: [],
      image: null,
      color: null,
      beats: null,
    },
    {
      kind: "player",
      title: "Sunday highlights",
      body: "4 min recap",
      label: null,
      value: null,
      items: [],
      image: null,
      color: null,
      beats: null,
    },
    {
      kind: "slider",
      title: "Volume",
      body: null,
      label: null,
      value: null,
      items: [],
      image: null,
      color: null,
      beats: null,
    },
    {
      kind: "toggle",
      title: null,
      body: null,
      label: null,
      value: null,
      items: [],
      image: null,
      color: null,
      beats: null,
    },
    {
      kind: "tabs",
      title: null,
      body: null,
      label: null,
      value: null,
      items: ["Plans", "Pricing", "FAQ"],
      image: null,
      color: null,
      beats: null,
    },
    {
      kind: "stat",
      title: "renders this month",
      body: null,
      label: null,
      value: "1,284",
      items: [],
      image: null,
      color: null,
      beats: null,
    },
    {
      kind: "card",
      title: "Everything is code",
      body: "Each frame is computed, so every export comes out the same.",
      label: null,
      value: null,
      items: [],
      image: null,
      color: null,
      beats: 3,
    },
    {
      kind: "cta",
      title: "Join free",
      body: null,
      label: null,
      value: null,
      items: [],
      image: null,
      color: null,
      beats: null,
    },
  ],
};
