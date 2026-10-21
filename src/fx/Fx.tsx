import { fitText } from "@remotion/layout-utils";
import { evolvePath } from "@remotion/paths";
import {
  AbsoluteFill,
  Easing,
  Img,
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
import { ease, font, onTwos, useBrand } from "../lib";

// The effects pack: "fx" in edl.json, timed from the transcript like everything
// else. Each effect is a short moment (default 2–3 s). Some change the footage
// itself (footageMods: blur, freeze, scale, swap the background), some draw behind
// the cut-out person (FxBehind), some in front (FxFront). Effects marked * need
// the cut-out (npm run matte); ** use the face (npm run track, or a faceBox).
//   clone*          copies of you pop up beside you, on your words
//   frame-break*    the shot shrinks into a card and you stay full size, out of it
//   god-rays*       the room dims and light breaks out from behind your head
//   rack-focus      focus pulls from you to a title, then back
//   vertigo*        you stay still while the room stretches away behind you
//   doodles*        you get a white outline and doodles draw themselves around you
//   freeze*         the picture freezes: you become a die-cut sticker with notes ("sticker"), or labels point at you ("labels")
//   green-screen*   you shrink to the bottom and the screen becomes what you're talking about (src)
//   callout**       cards tied to your head by lines, one per item, following you
//   checklist       each step ticks off as you say it
//   counter         a number rolls up digit by digit, like a mileage counter
//   chips           a pill pops in under the captions for each thing you list
//   before-after    a wipe line turns the raw clip (or src) into the edit
//   blackout        the lights cut on your line and snap back after
//   phone           a 3D phone flies in beside you, playing a screen (src)
//   cover*          your shot becomes a magazine cover, masthead behind your head
//   comment         a comment types itself and posts, then your reply lands (no platform look)
//   zoom-through**  the camera dives through you into the next shot (put it at a cut)

export const FX_KINDS = [
  "clone",
  "frame-break",
  "god-rays",
  "rack-focus",
  "vertigo",
  "doodles",
  "freeze",
  "green-screen",
  "callout",
  "checklist",
  "counter",
  "chips",
  "before-after",
  "blackout",
  "phone",
  "cover",
  "comment",
  "zoom-through",
] as const;
export type FxKind = (typeof FX_KINDS)[number];

export const fxSchema = z.object({
  kind: z.enum(FX_KINDS),
  from: z.number(),
  durationInFrames: z.number(),
  text: z.string().nullable().default(null),
  sub: z.string().nullable().default(null),
  // Items with the frame each lands on (from the effect's start), found in the transcript.
  items: z.array(z.object({ text: z.string(), f: z.number() })).default([]),
  value: z.number().nullable().default(null),
  prefix: z.string().default(""),
  suffix: z.string().default(""),
  src: z.string().nullable().default(null),
  x: z.number().nullable().default(null),
  y: z.number().nullable().default(null),
  side: z.enum(["left", "right"]).default("right"),
  color: z.string().nullable().default(null),
  style: z.string().nullable().default(null),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type Fx = z.infer<typeof fxSchema>;
export type Head = { x: number; y: number; w: number; h: number };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const env = (f: number, dur: number, inF = 8, outF = 8) =>
  interpolate(
    f,
    [0, inF, Math.max(inF + 1, dur - outF), Math.max(inF + 2, dur)],
    [0, 1, 1, 0],
    clamp,
  );
const active = (fx: Fx, frame: number) =>
  frame >= fx.from && frame < fx.from + fx.durationInFrames;

// ── what effects do to the footage ───────────────────────────────────────────
export type FootageMods = {
  bg: React.CSSProperties; // the background layer (the shot as filmed)
  person: React.CSSProperties; // the cut-out person drawn on top
  all: React.CSSProperties; // both, plus anything behind the person
  freezeAt: number | null; // composition frame to hold the footage on
  under: Fx | null; // green-screen content / frame-break backdrop
  needPerson: boolean;
};

export const footageMods = (
  list: Fx[],
  frame: number,
  W: number,
  H: number,
  head: Head,
): FootageMods => {
  const u = Math.min(W, H) / 1080;
  const m: FootageMods = {
    bg: {},
    person: {},
    all: {},
    freezeAt: null,
    under: null,
    needPerson: false,
  };
  const filters: string[] = [];
  const bgFilters: string[] = [];
  const personFilters: string[] = [];
  for (const fx of list) {
    if (!active(fx, frame)) continue;
    const l = frame - fx.from;
    const d = fx.durationInFrames;
    const e = env(l, d, 10, 10);
    switch (fx.kind) {
      case "clone":
      case "cover":
        m.needPerson = true;
        break;
      case "phone":
        if (fx.style === "behind") m.needPerson = true;
        break;
      case "frame-break":
        m.needPerson = true;
        m.under = fx;
        m.bg = {
          ...m.bg,
          // The card shrinks around the head, so the copy of the speaker inside it stays
          // hidden behind the full-size cut-out, whose shoulders and body break out of it.
          transform: `scale(${1 - 0.28 * e})`,
          transformOrigin: `${(head.x / W) * 100}% ${(head.y / H) * 100}%`,
          borderRadius: 44 * u * e,
          overflow: "hidden",
          boxShadow: `0 0 0 ${8 * u * e}px #fff, 0 ${30 * u}px ${60 * u}px rgba(0,0,0,${0.5 * e})`,
        };
        break;
      case "green-screen":
        m.needPerson = true;
        m.under = fx;
        m.bg = { ...m.bg, opacity: 1 - e };
        m.person = {
          ...m.person,
          transform: `translateY(${e * H * 0.04}px) scale(${1 - 0.4 * e})`,
          transformOrigin: "50% 100%",
        };
        break;
      case "vertigo": {
        m.needPerson = true;
        const p = interpolate(l, [0, d], [0, 1], {
          ...clamp,
          easing: ease.inOut,
        });
        m.bg = {
          ...m.bg,
          transform: `scale(${1 + 0.42 * p * interpolate(l, [d - 5, d], [1, 0], clamp)})`,
        };
        bgFilters.push(`blur(${p * 1.5 * u}px)`);
        break;
      }
      case "rack-focus":
        filters.push(`blur(${14 * u * e}px)`, `brightness(${1 - 0.28 * e})`);
        break;
      case "blackout":
        filters.push("brightness(0)");
        break;
      case "god-rays":
        m.needPerson = true;
        bgFilters.push(`brightness(${1 - 0.45 * e})`);
        break;
      case "doodles": {
        m.needPerson = true;
        const o = 5 * u * e;
        if (o > 0.2)
          personFilters.push(
            `drop-shadow(${o}px 0 0 #fff) drop-shadow(-${o}px 0 0 #fff) drop-shadow(0 ${o}px 0 #fff) drop-shadow(0 -${o}px 0 #fff)`,
          );
        break;
      }
      case "freeze": {
        m.needPerson = true;
        m.freezeAt = fx.from;
        bgFilters.push(
          `saturate(${1 - 0.55 * e})`,
          `brightness(${1 - 0.25 * e})`,
        );
        if ((fx.style ?? "sticker") === "sticker") {
          const lift =
            spring({
              frame: l,
              fps: 30,
              config: { damping: 12, stiffness: 160 },
              durationInFrames: 14,
            }) * interpolate(l, [d - 6, d], [1, 0], clamp);
          const o = 7 * u * lift;
          if (o > 0.2)
            personFilters.push(
              `drop-shadow(${o}px 0 0 #fff) drop-shadow(-${o}px 0 0 #fff) drop-shadow(0 ${o}px 0 #fff) drop-shadow(0 -${o}px 0 #fff) drop-shadow(0 ${16 * u}px ${20 * u}px rgba(0,0,0,${0.45 * lift}))`,
            );
          m.person = {
            ...m.person,
            transform: `rotate(${-3 * lift}deg) scale(${1 + 0.05 * lift})`,
            transformOrigin: `${(head.x / W) * 100}% ${(head.y / H) * 100}%`,
          };
        }
        break;
      }
      case "zoom-through": {
        const half = d / 2;
        const s =
          l < half
            ? interpolate(l, [0, half], [1, 2.8], { ...clamp, easing: ease.in })
            : interpolate(l, [half, d], [2, 1], { ...clamp, easing: ease.out });
        const b =
          l < half
            ? interpolate(l, [half - 4, half], [0, 10], clamp)
            : interpolate(l, [half, half + 5], [10, 0], clamp);
        m.all = {
          ...m.all,
          transform: `scale(${s})`,
          transformOrigin: `${(head.x / W) * 100}% ${(head.y / H) * 100}%`,
        };
        filters.push(`blur(${b * u}px)`);
        break;
      }
      default:
        break;
    }
  }
  if (filters.length) m.all = { ...m.all, filter: filters.join(" ") };
  if (bgFilters.length) m.bg = { ...m.bg, filter: bgFilters.join(" ") };
  if (personFilters.length)
    m.person = { ...m.person, filter: personFilters.join(" ") };
  return m;
};

// What sits under a shrunken shot or a cut-out person: the brand backdrop or the content.
export const FxUnder: React.FC<{ fx: Fx }> = ({ fx }) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const src = fx.src;
  return (
    <AbsoluteFill style={{ backgroundColor: brand.background }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${brand.accent}44, transparent 65%)`,
        }}
      />
      {fx.kind === "green-screen" && src ? (
        <AbsoluteFill
          style={{
            opacity: interpolate(frame - fx.from, [0, 8], [0, 1], clamp),
          }}
        >
          {/\.(mp4|mov|webm|m4v)$/i.test(src) ? (
            <Sequence from={fx.from} layout="none">
              <OffthreadVideo
                src={staticFile(src)}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Sequence>
          ) : (
            <Img
              src={staticFile(src)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.55) 100%)",
            }}
          />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// ── behind the person ────────────────────────────────────────────────────────
const GodRays: React.FC<{ fx: Fx; head: Head }> = ({ fx, head }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const brand = useBrand();
  const e = env(frame, fx.durationInFrames, 12, 12);
  const size = Math.max(width, height) * 2.2;
  const c = fx.color ?? "#FFF1C9";
  return (
    <div
      style={{
        position: "absolute",
        left: head.x - size / 2,
        top: head.y - size / 2,
        width: size,
        height: size,
        opacity: e,
        mixBlendMode: "screen",
        background: `repeating-conic-gradient(from ${frame * 0.35}deg, transparent 0deg 5deg, ${c}88 8deg 10deg, transparent 13deg 19deg)`,
        WebkitMaskImage:
          "radial-gradient(circle at center, #000 0%, rgba(0,0,0,0.6) 18%, transparent 46%)",
        maskImage:
          "radial-gradient(circle at center, #000 0%, rgba(0,0,0,0.6) 18%, transparent 46%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "35%",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${c} 0%, ${brand.punch}55 35%, transparent 70%)`,
        }}
      />
    </div>
  );
};

const Masthead: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const e = env(frame, fx.durationInFrames, 10, 10);
  const text = (fx.text ?? "Wait").toUpperCase();
  const { fontSize } = fitText({
    text,
    withinWidth: width * 0.92,
    fontFamily: font.serif,
    fontWeight: 700,
    validateFontIsLoaded: false,
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: height * 0.045,
        textAlign: "center",
        fontFamily: font.serif,
        fontWeight: 700,
        fontSize: Math.min(fontSize, height * 0.2),
        lineHeight: 0.9,
        letterSpacing: "-0.02em",
        color: fx.color ?? "#FFFFFF",
        opacity: e,
        transform: `translateY(${(1 - e) * -30}px)`,
      }}
    >
      {text}
    </div>
  );
};

const Phone: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const out = interpolate(
    frame,
    [fx.durationInFrames - 10, fx.durationInFrames],
    [0, 1],
    { ...clamp, easing: ease.in },
  );
  const ph = height * (height > width ? 0.4 : 0.7);
  const pw = ph / 2.05;
  const right = fx.side === "right";
  const x = (fx.x ?? (right ? 0.78 : 0.22)) * width;
  // Beside the chest on vertical frames, so it never covers the face.
  const y = (fx.y ?? (height > width ? 0.6 : 0.5)) * height;
  const ry =
    (right ? -1 : 1) * (interpolate(s, [0, 1], [70, 16]) + out * 50) +
    Math.sin(frame / 25) * 3;
  return (
    <div
      style={{
        position: "absolute",
        left: x - pw / 2,
        top: y - ph / 2,
        width: pw,
        height: ph,
        perspective: ph * 3,
        opacity: interpolate(s, [0, 0.3], [0, 1], clamp) * (1 - out),
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 52 * u,
          padding: 12 * u,
          background: "linear-gradient(145deg, #3A3A40, #0D0D10 60%)",
          boxShadow: `0 ${40 * u}px ${70 * u}px rgba(0,0,0,0.55), inset 0 0 0 ${2 * u}px #55555c`,
          transform: `translateY(${(1 - s) * 120 * u + Math.sin(frame / 18) * 6 * u}px) rotateY(${ry}deg) rotateX(6deg)`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 42 * u,
            overflow: "hidden",
            backgroundColor: "#111",
          }}
        >
          {fx.src ? (
            /\.(mp4|mov|webm|m4v)$/i.test(fx.src) ? (
              <OffthreadVideo
                src={staticFile(fx.src)}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Img
                src={staticFile(fx.src)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )
          ) : (
            <AbsoluteFill
              style={{
                background: "linear-gradient(160deg, #2B2340, #0E0C14)",
              }}
            />
          )}
          <div
            style={{
              position: "absolute",
              top: 14 * u,
              left: "50%",
              width: pw * 0.3,
              height: 26 * u,
              borderRadius: 999,
              backgroundColor: "#000",
              transform: "translateX(-50%)",
            }}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, transparent 35%)",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const FxBehind: React.FC<{ fx: Fx; head: Head }> = ({ fx, head }) => {
  if (fx.kind === "god-rays") return <GodRays fx={fx} head={head} />;
  if (fx.kind === "cover") return <Masthead fx={fx} />;
  if (fx.kind === "phone" && fx.style === "behind") return <Phone fx={fx} />;
  return null;
};

// ── in front ─────────────────────────────────────────────────────────────────
const glass: React.CSSProperties = {
  backgroundColor: "rgba(14,14,18,0.72)",
  backdropFilter: "blur(14px)",
  border: "1.5px solid rgba(255,255,255,0.16)",
};

const Checklist: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const brand = useBrand();
  const u = Math.min(width, height) / 1080;
  const e = env(frame, fx.durationInFrames, 8, 8);
  const w = width * (height > width ? 0.74 : 0.4);
  return (
    <div
      style={{
        position: "absolute",
        left: (fx.x ?? 0.5) * width - w / 2,
        top: (fx.y ?? 0.13) * height,
        width: w,
        padding: `${26 * u}px ${30 * u}px`,
        borderRadius: 28 * u,
        ...glass,
        opacity: e,
        transform: `translateY(${(1 - e) * 30 * u}px)`,
      }}
    >
      {fx.text ? (
        <div
          style={{
            fontFamily: font.mono,
            fontWeight: 500,
            fontSize: 24 * u,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: brand.punch,
            marginBottom: 14 * u,
          }}
        >
          {fx.text}
        </div>
      ) : null}
      {fx.items.map((it, i) => {
        const done = interpolate(frame, [it.f, it.f + 8], [0, 1], clamp);
        const tick = evolvePath(done, "M 4 13 L 10 19 L 22 5");
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18 * u,
              padding: `${10 * u}px 0`,
              opacity: interpolate(frame, [i * 3, i * 3 + 6], [0, 1], clamp),
            }}
          >
            <div
              style={{
                width: 44 * u,
                height: 44 * u,
                borderRadius: 12 * u,
                border: `${3 * u}px solid ${done > 0 ? brand.punch : "rgba(255,255,255,0.5)"}`,
                backgroundColor: done > 0 ? brand.punch : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${1 + 0.18 * Math.sin(done * Math.PI)})`,
              }}
            >
              <svg viewBox="0 0 26 24" width={30 * u} height={30 * u}>
                <path
                  d="M 4 13 L 10 19 L 22 5"
                  fill="none"
                  stroke="#111"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={tick.strokeDasharray}
                  strokeDashoffset={tick.strokeDashoffset}
                />
              </svg>
            </div>
            <div
              style={{
                fontFamily: font.display,
                fontWeight: 700,
                fontSize: 40 * u,
                color: "#fff",
                opacity: done > 0 ? 1 : 0.75,
              }}
            >
              {it.text}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Counter: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const brand = useBrand();
  const u = Math.min(width, height) / 1080;
  const e = env(frame, fx.durationInFrames, 8, 8);
  const digits = String(Math.round(Math.abs(fx.value ?? 0)));
  const dh = 150 * u;
  const n = digits.length;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: (fx.y ?? 0.16) * height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: e,
        transform: `scale(${interpolate(e, [0, 1], [0.9, 1])})`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8 * u,
          padding: `${14 * u}px ${18 * u}px`,
          borderRadius: 24 * u,
          ...glass,
        }}
      >
        {fx.prefix ? (
          <span
            style={{
              fontFamily: font.card,
              fontWeight: 800,
              fontSize: dh * 0.62,
              color: "#fff",
            }}
          >
            {fx.prefix}
          </span>
        ) : null}
        {[...digits].map((dg, k) => {
          // Each digit rolls up through the numbers, the higher places a few turns more, landing right to left.
          const target = Number(dg) + 10 * (n - 1 - k);
          const p = interpolate(
            frame,
            [4 + (n - 1 - k) * 3, 26 + (n - 1 - k) * 3],
            [0, 1],
            { ...clamp, easing: Easing.bezier(0.2, 0.8, 0.2, 1) },
          );
          const pos = p * target;
          return (
            <div
              key={k}
              style={{
                position: "relative",
                width: dh * 0.62,
                height: dh,
                overflow: "hidden",
                borderRadius: 10 * u,
                backgroundColor: "#0B0B0E",
                boxShadow:
                  "inset 0 10px 16px rgba(0,0,0,0.6), inset 0 -10px 16px rgba(0,0,0,0.6)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: -(pos % 10) * dh,
                }}
              >
                {Array.from({ length: 11 }, (_, j) => (
                  <div
                    key={j}
                    style={{
                      height: dh,
                      lineHeight: `${dh}px`,
                      textAlign: "center",
                      fontFamily: font.card,
                      fontWeight: 800,
                      fontSize: dh * 0.72,
                      color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {j % 10}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {fx.suffix ? (
          <span
            style={{
              fontFamily: font.card,
              fontWeight: 800,
              fontSize: dh * 0.62,
              color: brand.punch,
            }}
          >
            {fx.suffix}
          </span>
        ) : null}
      </div>
      {fx.text ? (
        <div
          style={{
            marginTop: 14 * u,
            fontFamily: font.mono,
            fontWeight: 500,
            fontSize: 28 * u,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#fff",
            textShadow: "0 2px 10px rgba(0,0,0,0.6)",
          }}
        >
          {fx.text}
        </div>
      ) : null}
    </div>
  );
};

const Chips: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const brand = useBrand();
  const u = Math.min(width, height) / 1080;
  const out = interpolate(
    frame,
    [fx.durationInFrames - 8, fx.durationInFrames],
    [1, 0],
    clamp,
  );
  return (
    <div
      style={{
        position: "absolute",
        left: width * 0.08,
        right: width * 0.08,
        top: (fx.y ?? 0.76) * height,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 12 * u,
        opacity: out,
      }}
    >
      {fx.items.map((it, i) => {
        const s = spring({
          frame: frame - it.f,
          fps,
          config: { damping: 12, stiffness: 220 },
          durationInFrames: 12,
        });
        if (frame < it.f) return null;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10 * u,
              padding: `${10 * u}px ${20 * u}px`,
              borderRadius: 999,
              ...glass,
              transform: `scale(${s})`,
              fontFamily: font.display,
              fontWeight: 700,
              fontSize: 30 * u,
              color: "#fff",
            }}
          >
            <span
              style={{
                width: 12 * u,
                height: 12 * u,
                borderRadius: 6 * u,
                backgroundColor: brand.punch,
              }}
            />
            {it.text}
          </div>
        );
      })}
    </div>
  );
};

const Comment: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const brand = useBrand();
  const u = Math.min(width, height) / 1080;
  const d = fx.durationInFrames;
  const name = String(fx.data.name ?? "someone");
  const text = fx.text ?? "";
  const replyName = String(fx.data.replyName ?? brand.wordmark ?? "you");
  const reply = fx.sub ?? "";
  const typed = text.slice(
    0,
    Math.round(interpolate(frame, [6, d * 0.35], [0, text.length], clamp)),
  );
  const posted = spring({
    frame: frame - Math.round(d * 0.38),
    fps,
    config: { damping: 12, stiffness: 200 },
    durationInFrames: 10,
  });
  const r = spring({
    frame: frame - Math.round(d * 0.55),
    fps,
    config: { damping: 14, stiffness: 160 },
  });
  const out = interpolate(frame, [d - 8, d], [1, 0], clamp);
  const w = width * (height > width ? 0.8 : 0.42);
  const card = (who: string, body: string, accent: boolean) => (
    <div
      style={{
        display: "flex",
        gap: 16 * u,
        padding: `${18 * u}px ${22 * u}px`,
        borderRadius: 26 * u,
        backgroundColor: "#FFFFFF",
        boxShadow: `0 ${16 * u}px ${36 * u}px rgba(0,0,0,0.35)`,
      }}
    >
      <div
        style={{
          flex: "none",
          width: 60 * u,
          height: 60 * u,
          borderRadius: 30 * u,
          backgroundColor: accent ? brand.accent : "#C9C3BA",
          color: "#fff",
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: 28 * u,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {who.replace(/^@/, "").slice(0, 1).toUpperCase()}
      </div>
      <div>
        <div
          style={{
            fontFamily: font.display,
            fontWeight: 800,
            fontSize: 26 * u,
            color: "#16151A",
          }}
        >
          {who}
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontWeight: 500,
            fontSize: 32 * u,
            lineHeight: 1.25,
            color: "#16151A",
            minHeight: 40 * u,
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left: (fx.x ?? 0.5) * width - w / 2,
        top: (fx.y ?? 0.12) * height,
        width: w,
        opacity: out,
      }}
    >
      <div
        style={{
          transform: `scale(${interpolate(posted, [0, 0.5, 1], [1, 1.04, 1])})`,
          transformOrigin: "left center",
          opacity: interpolate(frame, [0, 6], [0, 1], clamp),
        }}
      >
        {card(name, typed, false)}
      </div>
      {frame >= d * 0.55 ? (
        <div
          style={{
            marginTop: 14 * u,
            marginLeft: 70 * u,
            transform: `translateY(${(1 - r) * 40 * u}px)`,
            opacity: r,
          }}
        >
          {card(replyName, reply, true)}
        </div>
      ) : null}
    </div>
  );
};

const Callout: React.FC<{ fx: Fx; head: Head }> = ({ fx, head }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const brand = useBrand();
  const u = Math.min(width, height) / 1080;
  const out = interpolate(
    frame,
    [fx.durationInFrames - 8, fx.durationInFrames],
    [1, 0],
    clamp,
  );
  return (
    <AbsoluteFill style={{ opacity: out }}>
      {fx.items.map((it, i) => {
        const s = spring({
          frame: frame - it.f,
          fps,
          config: { damping: 14, stiffness: 180 },
          durationInFrames: 14,
        });
        if (frame < it.f) return null;
        const left = i % 2 === 0;
        const cx = left ? width * 0.04 : width * 0.96;
        const cy =
          head.y -
          head.h * 0.6 +
          Math.floor(i / 2) * 110 * u +
          (left ? 0 : 50 * u);
        const ax = head.x + (left ? -head.w * 0.5 : head.w * 0.5);
        const ay = head.y;
        const lineP = interpolate(frame, [it.f, it.f + 8], [0, 1], clamp);
        return (
          <div key={i}>
            <svg
              width={width}
              height={height}
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              <line
                x1={left ? cx + 300 * u : cx - 300 * u}
                y1={cy + 34 * u}
                x2={
                  (left ? cx + 300 * u : cx - 300 * u) +
                  (ax - (left ? cx + 300 * u : cx - 300 * u)) * lineP
                }
                y2={cy + 34 * u + (ay - cy - 34 * u) * lineP}
                stroke="#fff"
                strokeWidth={3 * u}
              />
              <circle cx={ax} cy={ay} r={7 * u * lineP} fill={brand.punch} />
            </svg>
            <div
              style={{
                position: "absolute",
                left: left ? cx : cx - 300 * u,
                top: cy,
                width: 300 * u,
                padding: `${12 * u}px ${16 * u}px`,
                borderRadius: 16 * u,
                ...glass,
                transform: `scale(${s})`,
                transformOrigin: left ? "left center" : "right center",
                fontFamily: font.display,
                fontWeight: 700,
                fontSize: 34 * u,
                color: "#fff",
                textAlign: "center",
              }}
            >
              {it.text}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const DOODLES = [
  "M 50 8 L 61 38 L 93 38 L 67 57 L 77 88 L 50 69 L 23 88 L 33 57 L 7 38 L 39 38 Z", // star
  "M 50 5 Q 54 46 95 50 Q 54 54 50 95 Q 46 54 5 50 Q 46 46 50 5 Z", // sparkle
  "M 10 80 Q 40 20 85 25 M 70 12 L 86 25 L 68 38", // arrow
  "M 50 50 m -5 0 a 5 5 0 1 0 10 0 a 12 12 0 1 0 -24 0 a 20 20 0 1 0 40 0 a 30 30 0 1 0 -60 0", // swirl
  "M 50 85 C 15 60 5 35 25 22 C 38 14 50 25 50 32 C 50 25 62 14 75 22 C 95 35 85 60 50 85 Z", // heart
  "M 10 75 L 18 30 L 35 55 L 50 20 L 65 55 L 82 30 L 90 75 Z", // crown
];
const Doodles: React.FC<{ fx: Fx; head: Head }> = ({ fx, head }) => {
  const raw = useCurrentFrame();
  const frame = onTwos(raw);
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const out = interpolate(
    raw,
    [fx.durationInFrames - 6, fx.durationInFrames],
    [1, 0],
    clamp,
  );
  const n = Math.max(3, fx.items.length);
  // Around the head, in half-head units from its centre.
  const spots = [
    [-1.35, -0.6],
    [1.3, -0.8],
    [0.1, -1.5],
    [-1.5, 0.5],
    [1.45, 0.4],
    [0.85, -1.35],
  ];
  const size = Math.min(Math.max(head.w * 0.34, 90 * u), 200 * u);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      {Array.from({ length: n }, (_, i) => {
        const at = fx.items[i]?.f ?? i * 6;
        const p = interpolate(frame, [at, at + 10], [0, 1], {
          ...clamp,
          easing: ease.out,
        });
        if (p <= 0) return null;
        const d =
          DOODLES[
            (i + Math.floor(random(`${fx.from}-d`) * 6)) % DOODLES.length
          ];
        const ev = evolvePath(p, d);
        const [sx, sy] = spots[i % spots.length];
        const wob = (random(`${i}-${Math.floor(raw / 2) % 3}`) - 0.5) * 4;
        return (
          <svg
            key={i}
            viewBox="0 0 100 100"
            width={size}
            height={size}
            style={{
              position: "absolute",
              left: Math.min(
                width - size * 0.8,
                Math.max(-size * 0.2, head.x + (sx * head.w) / 2 - size / 2),
              ),
              top: Math.max(0, head.y + (sy * head.h) / 2 - size / 2),
              overflow: "visible",
              transform: `rotate(${wob}deg)`,
            }}
          >
            <path
              d={d}
              fill="none"
              stroke={fx.color ?? "#fff"}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={ev.strokeDasharray}
              strokeDashoffset={ev.strokeDashoffset}
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}
            />
            {fx.items[i]?.text ? (
              <text
                x={50}
                y={118}
                textAnchor="middle"
                fontFamily={font.hand}
                fontWeight={700}
                fontSize={26}
                fill={fx.color ?? "#fff"}
                opacity={p}
                style={{
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.5)",
                  strokeWidth: 4,
                }}
              >
                {fx.items[i].text}
              </text>
            ) : null}
          </svg>
        );
      })}
    </AbsoluteFill>
  );
};

const FreezeNotes: React.FC<{ fx: Fx; head: Head }> = ({ fx, head }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const brand = useBrand();
  const u = Math.min(width, height) / 1080;
  const out = interpolate(
    frame,
    [fx.durationInFrames - 6, fx.durationInFrames],
    [1, 0],
    clamp,
  );
  const labels = (fx.style ?? "sticker") === "labels";
  return (
    <AbsoluteFill style={{ opacity: out }}>
      {fx.items.map((it, i) => {
        const at = it.f || 6 + i * 8;
        const p = interpolate(frame, [at, at + 10], [0, 1], {
          ...clamp,
          easing: ease.out,
        });
        if (p <= 0) return null;
        // Labels sit in the margins beside the head (wrapping to fit), arrows curve in to it.
        const left = i % 2 === 0;
        const room = Math.max(
          width * 0.26,
          left
            ? head.x - head.w / 2 - width * 0.06
            : width - (head.x + head.w / 2) - width * 0.06,
        );
        const tx = left ? width * 0.05 : width * 0.95;
        const ty = Math.max(
          height * 0.08,
          head.y - head.h * 0.45 + Math.floor(i / 2) * 150 * u,
        );
        const sx = left ? tx + room * 0.55 : tx - room * 0.55;
        const ex = head.x + (left ? -head.w * 0.42 : head.w * 0.42);
        const ey = head.y + head.h * (0.05 + Math.floor(i / 2) * 0.2);
        const path = `M ${sx} ${ty + 70 * u} Q ${(sx + ex) / 2} ${ty + 150 * u} ${ex} ${ey}`;
        const ev = evolvePath(p, path);
        return (
          <div key={i}>
            <svg
              width={width}
              height={height}
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              <path
                d={path}
                fill="none"
                stroke={labels ? brand.punch : "#fff"}
                strokeWidth={5 * u}
                strokeLinecap="round"
                strokeDasharray={ev.strokeDasharray}
                strokeDashoffset={ev.strokeDashoffset}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                left: left ? tx : undefined,
                right: left ? undefined : width - tx,
                top: ty,
                maxWidth: room,
                textAlign: left ? "left" : "right",
                transformOrigin: left ? "left center" : "right center",
                transform: `rotate(${left ? -4 : 4}deg) scale(${p})`,
                fontFamily: labels ? font.display : font.hand,
                fontWeight: 700,
                fontSize: (labels ? 30 : 46) * u,
                color: labels ? "#111" : "#fff",
                backgroundColor: labels ? brand.punch : undefined,
                padding: labels ? `${8 * u}px ${16 * u}px` : 0,
                borderRadius: labels ? 10 * u : 0,
                lineHeight: 1.05,
                textShadow: labels ? undefined : "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              {it.text}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const RackTitle: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const e = env(frame, fx.durationInFrames, 12, 12);
  const text = fx.text ?? "";
  const { fontSize } = fitText({
    text,
    withinWidth: width * 0.84,
    fontFamily: font.serif,
    fontWeight: 500,
    validateFontIsLoaded: false,
  });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: font.serif,
          fontWeight: 500,
          fontSize: Math.min(fontSize, height * 0.16),
          color: fx.color ?? "#fff",
          opacity: e,
          filter: `blur(${(1 - e) * 12}px)`,
          textAlign: "center",
          lineHeight: 1,
        }}
      >
        {text}
      </div>
      {fx.sub ? (
        <div
          style={{
            marginTop: 18,
            fontFamily: font.mono,
            fontSize: Math.min(width, height) * 0.024,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#fff",
            opacity: e,
          }}
        >
          {fx.sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const CoverLines: React.FC<{ fx: Fx }> = ({ fx }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const brand = useBrand();
  const u = Math.min(width, height) / 1080;
  const e = env(frame, fx.durationInFrames, 10, 10);
  return (
    <AbsoluteFill style={{ opacity: e }}>
      <div
        style={{
          position: "absolute",
          inset: 22 * u,
          border: `${3 * u}px solid rgba(255,255,255,0.85)`,
        }}
      />
      {fx.sub ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: height * 0.225,
            textAlign: "center",
            fontFamily: font.mono,
            fontWeight: 500,
            fontSize: 24 * u,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#fff",
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          {fx.sub}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 50 * u,
          bottom: height * 0.2,
          width: width * 0.46,
        }}
      >
        {fx.items.map((it, i) => (
          <div
            key={i}
            style={{
              marginTop: 16 * u,
              fontFamily: font.condensed,
              fontSize: 44 * u,
              lineHeight: 1,
              textTransform: "uppercase",
              color: "#fff",
              textShadow: "0 2px 10px rgba(0,0,0,0.6)",
              opacity: interpolate(
                frame,
                [8 + i * 4, 14 + i * 4],
                [0, 1],
                clamp,
              ),
            }}
          >
            <span style={{ color: brand.punch }}>{it.text.split(" ")[0]}</span>{" "}
            {it.text.split(" ").slice(1).join(" ")}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          right: 46 * u,
          bottom: height * 0.19,
          padding: 8 * u,
          backgroundColor: "#fff",
          display: "flex",
          gap: 2 * u,
          alignItems: "flex-end",
        }}
      >
        {Array.from({ length: 26 }, (_, i) => (
          <div
            key={i}
            style={{
              width: (random(`bar${i}`) > 0.5 ? 3 : 1.5) * u,
              height: 54 * u,
              backgroundColor: "#111",
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Blackout: React.FC<{ fx: Fx }> = ({ fx }) =>
  fx.text ? (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: 44,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color: "#fff",
        }}
      >
        {fx.text}
      </div>
    </AbsoluteFill>
  ) : null;

export const FxFront: React.FC<{ fx: Fx; head: Head }> = ({ fx, head }) => {
  switch (fx.kind) {
    case "checklist":
      return <Checklist fx={fx} />;
    case "counter":
      return <Counter fx={fx} />;
    case "chips":
      return <Chips fx={fx} />;
    case "comment":
      return <Comment fx={fx} />;
    case "callout":
      return <Callout fx={fx} head={head} />;
    case "doodles":
      return <Doodles fx={fx} head={head} />;
    case "freeze":
      return <FreezeNotes fx={fx} head={head} />;
    case "rack-focus":
      return <RackTitle fx={fx} />;
    case "cover":
      return <CoverLines fx={fx} />;
    case "blackout":
      return <Blackout fx={fx} />;
    case "phone":
      return fx.style === "behind" ? null : <Phone fx={fx} />;
    default:
      return null;
  }
};

// The wipe of before-after: a line sweeping left to right with its labels.
export const WipeLine: React.FC<{ fx: Fx; x: number }> = ({ x }) => {
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const tag = (t: string, right: boolean): React.CSSProperties => ({
    position: "absolute",
    top: height * 0.14,
    [right ? "left" : "right"]: right
      ? x * width + 18 * u
      : (1 - x) * width + 18 * u,
    padding: `${8 * u}px ${16 * u}px`,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
    fontFamily: font.mono,
    fontWeight: 500,
    fontSize: 24 * u,
    letterSpacing: "0.2em",
    color: "#fff",
    textTransform: "uppercase" as const,
    opacity: t ? 1 : 0,
  });
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: x * width - 3 * u,
          top: 0,
          bottom: 0,
          width: 6 * u,
          backgroundColor: "#fff",
          boxShadow: "0 0 18px rgba(255,255,255,0.8)",
        }}
      />
      {x > 0.12 ? <div style={tag("After", false)}>After</div> : null}
      {x < 0.88 ? <div style={tag("Before", true)}>Before</div> : null}
    </AbsoluteFill>
  );
};

// Where the face is in the output frame, from a segment's face box (source fractions).
export const headIn = (
  s:
    | {
        faceBox: number[] | null;
        srcW: number | null;
        srcH: number | null;
        focusX: number;
        focusY: number;
        zoom: number;
      }
    | undefined,
  W: number,
  H: number,
): Head => {
  if (!s || !s.faceBox)
    return { x: W * 0.5, y: H * 0.32, w: W * 0.28, h: H * 0.16 };
  const sw = s.srcW ?? W;
  const sh = s.srcH ?? H;
  const k = Math.max(W / sw, H / sh);
  const offX = (W - sw * k) * s.focusX;
  const offY = (H - sh * k) * s.focusY;
  const ox = s.focusX * W;
  const oy = s.focusY * H;
  const map = (px: number, py: number) => [
    ox + (offX + px * sw * k - ox) * s.zoom,
    oy + (offY + py * sh * k - oy) * s.zoom,
  ];
  const [x1, y1] = map(s.faceBox[0], s.faceBox[1]);
  const [x2, y2] = map(
    s.faceBox[0] + s.faceBox[2],
    s.faceBox[1] + s.faceBox[3],
  );
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 };
};
