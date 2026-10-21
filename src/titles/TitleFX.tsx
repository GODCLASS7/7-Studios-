import { measureText } from "@remotion/layout-utils";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { ease, font, onTwos, useBrand } from "../lib";

// Cinematic titles for any footage (behind or in front of the person, or on
// transparency for other editors). Eight styles, each with its own entrance, hold
// and exit, all driven by the frame so every render matches:
//   cutout     magazine cut-out letters on coloured paper, placed one by one
//   editorial  a huge serif word that rises out of a mask and tightens
//   inflate    puffy 3D bubble letters that drop in and bounce (lit, glossy)
//   neon       a glowing tube sign that flickers on
//   extrude    solid 3D block letters that swing in on a perspective camera
//   poster     stacked condensed lines, each filling the width, with an accent bar
//   outline    letters drawn as a stroke, then filled
//   tag        a sticky label that pops on; pinned, a leader line runs to the spot it follows
// "|" in the text breaks the line. In editorial, *word* sets a word in the accent
// colour, in italic. Colours default to the job's brand kit.

export const TITLE_STYLES = [
  "cutout",
  "editorial",
  "inflate",
  "neon",
  "extrude",
  "poster",
  "outline",
  "tag",
] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number];

export const titleSchema = z.object({
  style: z.enum(TITLE_STYLES),
  text: z.string(),
  sub: z.string().nullable().default(null),
  from: z.number(),
  durationInFrames: z.number(),
  // Centre of the title (fractions of the frame); with a pin, the offset from the pinned spot.
  x: z.number().default(0.5),
  y: z.number().default(0.4),
  size: z.number().default(1),
  rotate: z.number().default(0),
  color: z.string().nullable().default(null),
  accent: z.string().nullable().default(null),
  // Pinned spot per frame: [frame from the title's start, x, y] (scripts/pin.mjs via edl).
  pin: z.array(z.array(z.number())).nullable().default(null),
  layer: z.enum(["behind", "front"]).default("front"),
});
export type TitleSpec = z.infer<typeof titleSchema>;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const lines = (t: string) => t.split("|").map((l) => l.trim());

// Largest font size for n lines to stay within 55% of the frame height.
const capH = (n: number, H: number, lineHeight = 1.1) =>
  (H * 0.55) / (n * lineHeight);

// Font size that fits the longest line in `maxW`, up to `base`.
const fit = (
  ls: string[],
  base: number,
  maxW: number,
  fontFamily: string,
  fontWeight: number,
  letterSpacing = "0em",
  upper = false,
) => {
  const widest = Math.max(
    ...ls.map(
      (l) =>
        measureText({
          text: upper ? l.toUpperCase() : l,
          fontFamily,
          fontSize: 100,
          fontWeight,
          letterSpacing,
          validateFontIsLoaded: false,
        }).width,
    ),
  );
  return Math.min(base, (100 * maxW) / Math.max(1, widest));
};

const hexRgb = (h: string) => {
  const s = h.replace("#", "");
  const f =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
};
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hexRgb(a), hexRgb(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};
const isLight = (h: string) => {
  const [r, g, b] = hexRgb(h);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

// Entrance (0→1 over `inS` seconds) and exit (0→1 over the last `outS` seconds).
const useLife = (dur: number, inS = 0.6, outS = 0.4) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = interpolate(frame, [0, inS * fps], [0, 1], {
    ...clamp,
    easing: ease.out,
  });
  const exit = interpolate(frame, [dur - outS * fps, dur], [0, 1], {
    ...clamp,
    easing: ease.in,
  });
  return { frame, fps, enter, exit };
};

type StyleProps = {
  t: TitleSpec;
  u: number;
  W: number;
  H: number;
  c: string;
  a: string;
  id: string;
};

const Cutout: React.FC<StyleProps> = ({ t, u, W, H, c, a, id }) => {
  const brand = useBrand();
  const { frame: raw, fps } = useLife(t.durationInFrames);
  const frame = onTwos(raw);
  const ls = lines(t.text);
  const fs = fit(
    ls,
    Math.min(150 * u * t.size, capH(ls.length, H, 1.3)),
    W * 0.8,
    font.serif,
    800,
    "0.12em",
  );
  const palette = [a, c, "#F7F1E6", "#1C1C1F", "#FFFFFF", brand.background];
  const fams = [
    font.serif,
    font.condensed,
    font.display,
    font.mono,
    font.serif,
  ];
  const total = ls.join("").length;
  let k = 0;
  return (
    <div style={{ textAlign: "center", lineHeight: 1.18 }}>
      {ls.map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {[...line].map((ch, ci) => {
            if (ch === " ")
              return (
                <span
                  key={ci}
                  style={{ display: "inline-block", width: fs * 0.32 }}
                />
              );
            const n = k++;
            const r = (s: string) => random(`${id}-${n}-${s}`);
            const bg = palette[Math.floor(r("b") * palette.length)];
            const fi = Math.floor(r("f") * fams.length);
            const inAt = n * 2;
            const outAt =
              t.durationInFrames - Math.round(0.45 * fps) + (total - n);
            const pop = spring({
              frame: frame - inAt,
              fps,
              config: { damping: 11, stiffness: 220 },
              durationInFrames: 10,
            });
            const gone = interpolate(raw, [outAt - 6, outAt], [0, 1], clamp);
            const jag = (s: string) => `${(r(s) * 6).toFixed(1)}%`;
            return (
              <span
                key={ci}
                style={{
                  display: "inline-block",
                  margin: `0 ${fs * 0.02}px`,
                  padding: `${fs * 0.02}px ${fs * 0.07}px`,
                  backgroundColor: bg,
                  color: isLight(bg) ? "#1C1C1F" : "#F7F1E6",
                  fontFamily: fams[fi],
                  fontWeight: fi === 3 ? 500 : r("w") > 0.5 ? 900 : 600,
                  fontStyle: fi === 4 ? "italic" : "normal",
                  fontSize: fs * (0.86 + r("s") * 0.3),
                  textTransform: r("u") > 0.45 ? "uppercase" : "none",
                  clipPath: `polygon(${jag("a")} ${jag("b")}, calc(100% - ${jag("c")}) 0%, 100% calc(100% - ${jag("d")}), 0% 100%)`,
                  boxShadow: `0 ${6 * u}px ${12 * u}px rgba(0,0,0,0.35)`,
                  transform: `translateY(${(r("y") - 0.5) * fs * 0.14 + gone * fs * 3}px) rotate(${(r("r") - 0.5) * 14 + gone * (r("q") - 0.5) * 90}deg) scale(${pop})`,
                  opacity: pop > 0.01 ? 1 - gone : 0,
                  verticalAlign: "middle",
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const Editorial: React.FC<StyleProps> = ({ t, u, W, H, c, a }) => {
  const { frame, fps, exit } = useLife(t.durationInFrames, 0.8, 0.5);
  const ls = lines(t.text);
  const plain = ls.map((l) => l.replace(/\*/g, ""));
  const fs = fit(
    plain,
    Math.min(320 * u * t.size, capH(ls.length + (t.sub ? 0.3 : 0), H)),
    W * 0.9,
    font.serif,
    500,
    "-0.02em",
  );
  return (
    <div
      style={{
        textAlign: "center",
        color: c,
        opacity: 1 - exit,
        filter: exit > 0 ? `blur(${exit * 8 * u}px)` : undefined,
      }}
    >
      {t.sub ? (
        <div
          style={{
            fontFamily: font.display,
            fontWeight: 600,
            fontSize: Math.max(22 * u, fs * 0.09),
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            marginBottom: fs * 0.06,
            opacity: interpolate(frame, [0.3 * fps, 0.8 * fps], [0, 1], clamp),
          }}
        >
          {t.sub}
        </div>
      ) : null}
      {ls.map((line, li) => {
        const p = interpolate(frame, [li * 4, li * 4 + 0.75 * fps], [0, 1], {
          ...clamp,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });
        return (
          <div
            key={li}
            style={{ overflow: "hidden", paddingBottom: fs * 0.06 }}
          >
            <div
              style={{
                fontFamily: font.serif,
                fontWeight: 500,
                fontSize: fs,
                lineHeight: 0.95,
                whiteSpace: "nowrap",
                letterSpacing: `${interpolate(p, [0, 1], [0.12, -0.02]) + exit * 0.08}em`,
                transform: `translateY(${(1 - p) * 105}%)`,
                textShadow: `0 ${4 * u}px ${30 * u}px rgba(0,0,0,0.25)`,
              }}
            >
              {line.split(/(\*[^*]+\*)/).map((part, pi) =>
                part.startsWith("*") ? (
                  <span key={pi} style={{ fontStyle: "italic", color: a }}>
                    {part.slice(1, -1)}
                  </span>
                ) : (
                  <span key={pi}>{part}</span>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Inflate: React.FC<StyleProps> = ({ t, u, W, H, c, id }) => {
  const { frame, fps, exit } = useLife(t.durationInFrames, 0.6, 0.35);
  const ls = lines(t.text);
  const fam = font.display;
  const fs = fit(
    ls,
    Math.min(230 * u * t.size, capH(ls.length, H, 1.2)),
    W * 0.82,
    fam,
    900,
    "0.02em",
    true,
  );
  const fid = `inflate-${id}`;
  const lineH = fs * 1.08;
  const pad = fs * 0.3;
  return (
    <div style={{ position: "relative" }}>
      {ls.map((line, li) => {
        const up = line.toUpperCase();
        const w = measureText({
          text: up,
          fontFamily: fam,
          fontSize: fs,
          fontWeight: 900,
          letterSpacing: "0.02em",
          validateFontIsLoaded: false,
        }).width;
        let k = 0;
        return (
          <svg
            key={li}
            width={w + pad * 2}
            height={lineH + pad}
            style={{
              display: "block",
              margin: "0 auto",
              overflow: "visible",
              filter: `drop-shadow(0 ${14 * u}px ${18 * u}px rgba(0,0,0,0.35))`,
            }}
          >
            {li === 0 ? (
              <defs>
                <filter
                  id={fid}
                  x="-20%"
                  y="-30%"
                  width="140%"
                  height="160%"
                  colorInterpolationFilters="sRGB"
                >
                  <feGaussianBlur
                    in="SourceAlpha"
                    stdDeviation={fs * 0.045}
                    result="b"
                  />
                  <feDiffuseLighting
                    in="b"
                    surfaceScale={fs * 0.05}
                    diffuseConstant={1.05}
                    lightingColor="#fff"
                    result="d"
                  >
                    <feDistantLight azimuth={235} elevation={48} />
                  </feDiffuseLighting>
                  <feSpecularLighting
                    in="b"
                    surfaceScale={fs * 0.05}
                    specularConstant={0.9}
                    specularExponent={26}
                    lightingColor="#fff"
                    result="s"
                  >
                    <feDistantLight azimuth={225} elevation={38} />
                  </feSpecularLighting>
                  <feComposite
                    in="SourceGraphic"
                    in2="d"
                    operator="arithmetic"
                    k1={1.3}
                    k2={0}
                    k3={0}
                    k4={0}
                    result="shaded"
                  />
                  <feComposite
                    in="s"
                    in2="SourceAlpha"
                    operator="in"
                    result="sIn"
                  />
                  <feComposite
                    in="shaded"
                    in2="sIn"
                    operator="arithmetic"
                    k1={0}
                    k2={1}
                    k3={0.85}
                    k4={0}
                    result="lit"
                  />
                  <feComposite in="lit" in2="SourceAlpha" operator="in" />
                </filter>
              </defs>
            ) : null}
            <g filter={`url(#${fid})`}>
              {[...up].map((ch, ci) => {
                const x0 =
                  pad +
                  measureText({
                    text: up.slice(0, ci),
                    fontFamily: fam,
                    fontSize: fs,
                    fontWeight: 900,
                    letterSpacing: "0.02em",
                    validateFontIsLoaded: false,
                  }).width;
                const cw = measureText({
                  text: ch,
                  fontFamily: fam,
                  fontSize: fs,
                  fontWeight: 900,
                  validateFontIsLoaded: false,
                }).width;
                if (ch === " ") return null;
                const n = li * 20 + k++;
                const s = spring({
                  frame: frame - n * 2,
                  fps,
                  config: { damping: 7, stiffness: 160 },
                  durationInFrames: 26,
                });
                const drop = (1 - Math.min(1, s)) * -fs * 1.2;
                // Squash on landing, stretch on the rebound.
                const sy = 1 + (s - 1) * 0.9;
                const sx = 1 - (s - 1) * 0.6;
                const bob = Math.sin((frame - n * 3) / 9) * fs * 0.015;
                const deflate = 1 - exit;
                const cx = x0 + cw / 2;
                const base = lineH * 0.82 + pad * 0.5;
                return (
                  <g
                    key={ci}
                    transform={`translate(${cx} ${base + drop + bob}) scale(${sx * deflate} ${sy * deflate}) translate(${-cx} ${-base})`}
                    opacity={s > 0.02 ? 1 : 0}
                  >
                    <text
                      x={x0}
                      y={base}
                      fontFamily={fam}
                      fontWeight={900}
                      fontSize={fs}
                      fill={c}
                      stroke={c}
                      strokeWidth={fs * 0.09}
                      strokeLinejoin="round"
                    >
                      {ch}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        );
      })}
    </div>
  );
};

const Neon: React.FC<StyleProps> = ({ t, u, W, H, c, id }) => {
  const { frame, fps, exit } = useLife(t.durationInFrames, 0.7, 0.35);
  const ls = lines(t.text);
  const fs = fit(
    ls,
    Math.min(210 * u * t.size, capH(ls.length + (t.sub ? 0.3 : 0), H)),
    W * 0.82,
    font.hand,
    700,
  );
  // Flickers on (and off at the end), then hums.
  const step = Math.floor(frame / 2);
  const onP = interpolate(frame, [0, 0.7 * fps], [0, 1], clamp);
  const lit =
    exit > 0
      ? random(`${id}-off-${step}`) > exit
      : onP >= 1 || random(`${id}-on-${step}`) < onP * 1.15;
  const hum = 0.93 + 0.07 * Math.sin(frame * 0.8) * Math.sin(frame * 0.23);
  const glow = lit ? hum : 0.12;
  const hue = c.startsWith("#") ? c : "#FF4FB8";
  const tube = mix(hue, "#FFFFFF", 0.78);
  return (
    <div style={{ position: "relative", textAlign: "center" }}>
      <div
        style={{
          position: "absolute",
          inset: `-${fs * 0.6}px -${fs * 0.4}px`,
          background: `radial-gradient(ellipse at center, ${c} 0%, transparent 65%)`,
          opacity: 0.3 * glow,
        }}
      />
      {ls.map((line, li) => (
        <div key={li} style={{ position: "relative" }}>
          {/* The bloom: a blurred copy in the tube's colour, behind the glass. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              fontFamily: font.hand,
              fontWeight: 600,
              fontSize: fs,
              lineHeight: 1,
              whiteSpace: "nowrap",
              color: hue,
              filter: `blur(${14 * u}px)`,
              opacity: lit ? 0.95 * glow : 0,
            }}
          >
            {line}
          </div>
          <div
            style={{
              position: "relative",
              fontFamily: font.hand,
              fontWeight: 600,
              fontSize: fs,
              lineHeight: 1,
              whiteSpace: "nowrap",
              color: lit ? tube : mix(hue, "#000000", 0.6),
              textShadow: lit
                ? `0 0 ${1.5 * u}px #fff, 0 0 ${4 * u}px ${tube}, 0 0 ${9 * u}px ${hue}, 0 0 ${18 * u}px ${hue}, 0 0 ${34 * u}px ${hue}, 0 0 ${60 * u}px ${hue}, 0 0 ${100 * u}px ${hue}`
                : "none",
              opacity: 0.35 + 0.65 * glow,
            }}
          >
            {line}
          </div>
        </div>
      ))}
      {t.sub ? (
        <div
          style={{
            position: "relative",
            fontFamily: font.display,
            fontWeight: 700,
            fontSize: fs * 0.16,
            letterSpacing: "0.5em",
            textTransform: "uppercase",
            color: tube,
            marginTop: fs * 0.1,
            textShadow: lit ? `0 0 ${10 * u}px ${c}` : "none",
            opacity: 0.35 + 0.65 * glow,
          }}
        >
          {t.sub}
        </div>
      ) : null}
    </div>
  );
};

const Extrude: React.FC<StyleProps> = ({ t, u, W, H, c, a }) => {
  const { frame, fps, exit } = useLife(t.durationInFrames, 0.8, 0.4);
  const ls = lines(t.text);
  const fs = fit(
    ls,
    Math.min(240 * u * t.size, capH(ls.length, H, 1.05)),
    W * 0.78,
    font.condensed,
    400,
    "0.02em",
    true,
  );
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 90 } });
  const ry =
    interpolate(s, [0, 1], [-70, -24]) + Math.sin(frame / 40) * 5 + exit * 60;
  const rx = interpolate(s, [0, 1], [26, 13]) + exit * -20;
  const layers = 26;
  const step = fs * 0.018;
  const side = mix(a, "#000000", 0.55);
  const text = (
    <>
      {ls.map((l, i) => (
        <div key={i}>{l.toUpperCase()}</div>
      ))}
    </>
  );
  const base: React.CSSProperties = {
    fontFamily: font.condensed,
    fontSize: fs,
    lineHeight: 0.98,
    letterSpacing: "0.02em",
    textAlign: "center",
    whiteSpace: "nowrap",
  };
  return (
    <div
      style={{
        perspective: fs * 9,
        opacity: interpolate(s, [0, 0.2], [0, 1], clamp) * (1 - exit),
      }}
    >
      <div
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${interpolate(s, [0, 1], [0.7, 1])})`,
        }}
      >
        {Array.from({ length: layers }, (_, i) => layers - i).map((i) => (
          <div
            key={i}
            style={{
              ...base,
              position: "absolute",
              inset: 0,
              color: mix(a, "#000000", 0.15 + (i / layers) * 0.5),
              transform: `translateZ(${-i * step}px)`,
            }}
          >
            {text}
          </div>
        ))}
        <div
          style={{
            ...base,
            position: "relative",
            background: `linear-gradient(180deg, ${mix(c, "#FFFFFF", 0.45)} 0%, ${c} 55%, ${mix(c, a, 0.35)} 100%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            WebkitTextStroke: `${1.5 * u}px ${side}`,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};

const Poster: React.FC<StyleProps> = ({ t, u, W, H, c, a }) => {
  const { frame, fps, exit } = useLife(t.durationInFrames, 0.7, 0.4);
  const ls = lines(t.text).map((l) => l.toUpperCase());
  const fullW = Math.min(W * 0.84, 900 * u * t.size);
  // Every line fills the block width, like a Swiss poster; the block shrinks if that's too tall.
  const sizes = ls.map((l) => fit([l], 400 * u, fullW, font.condensed, 400));
  const k = Math.min(
    1,
    (H * 0.62) / sizes.reduce((sum, v) => sum + v * 0.92, 0),
  );
  const blockW = fullW * k;
  return (
    <div style={{ width: blockW, opacity: 1 - exit }}>
      {ls.map((l, i) => {
        const fs = sizes[i] * k;
        const p = interpolate(frame, [i * 3, i * 3 + 0.55 * fps], [0, 1], {
          ...clamp,
          easing: Easing.bezier(0.7, 0, 0.2, 1),
        });
        const accentLine = i === 1 || ls.length === 1;
        const bar = interpolate(
          frame,
          [i * 3 + 4, i * 3 + 0.5 * fps + 4],
          [0, 1],
          { ...clamp, easing: ease.inOut },
        );
        return (
          <div
            key={i}
            style={{
              position: "relative",
              overflow: "hidden",
              lineHeight: 0.92,
            }}
          >
            {accentLine ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "8%",
                  bottom: "4%",
                  width: `${bar * 100}%`,
                  backgroundColor: a,
                }}
              />
            ) : null}
            <div
              style={{
                position: "relative",
                fontFamily: font.condensed,
                fontSize: fs,
                whiteSpace: "nowrap",
                color: accentLine ? (isLight(a) ? "#1C1C1F" : "#F7F1E6") : c,
                transform: `translateX(${(1 - p) * (i % 2 ? 105 : -105) + exit * (i % 2 ? -30 : 30)}%)`,
              }}
            >
              {l}
            </div>
          </div>
        );
      })}
      {t.sub ? (
        <div
          style={{
            marginTop: 18 * u,
            paddingTop: 14 * u,
            borderTop: `${3 * u}px solid ${c}`,
            width: `${interpolate(frame, [0.3 * fps, 0.9 * fps], [0, 100], { ...clamp, easing: ease.out })}%`,
            fontFamily: font.mono,
            fontWeight: 500,
            fontSize: 26 * u,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: c,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {t.sub}
        </div>
      ) : null}
    </div>
  );
};

const Outline: React.FC<StyleProps> = ({ t, u, W, H, c }) => {
  const { frame, fps, exit } = useLife(t.durationInFrames, 1, 0.4);
  const ls = lines(t.text).map((l) => l.toUpperCase());
  const fam = font.display;
  const fs = fit(
    ls,
    Math.min(230 * u * t.size, capH(ls.length, H, 1.05)),
    W * 0.86,
    fam,
    900,
    "0.01em",
  );
  const draw = interpolate(frame, [0, 0.9 * fps], [0, 1], {
    ...clamp,
    easing: ease.inOut,
  });
  const fill =
    interpolate(frame, [0.6 * fps, 1.1 * fps], [0, 1], clamp) * (1 - exit);
  const undraw = 1 - exit;
  const dash = fs * 7;
  return (
    <div>
      {ls.map((l, i) => {
        const w = measureText({
          text: l,
          fontFamily: fam,
          fontSize: fs,
          fontWeight: 900,
          letterSpacing: "0.01em",
          validateFontIsLoaded: false,
        }).width;
        return (
          <svg
            key={i}
            width={w + fs * 0.2}
            height={fs * 1.02}
            style={{ display: "block", margin: "0 auto", overflow: "visible" }}
          >
            <text
              x="50%"
              y={fs * 0.84}
              textAnchor="middle"
              fontFamily={fam}
              fontWeight={900}
              fontSize={fs}
              letterSpacing="0.01em"
              fill={c}
              fillOpacity={fill}
              stroke={c}
              strokeWidth={Math.max(2, fs * 0.022)}
              strokeDasharray={`${dash} ${dash}`}
              strokeDashoffset={dash * (1 - draw * undraw)}
              style={{
                filter: `drop-shadow(0 ${3 * u}px ${12 * u}px rgba(0,0,0,0.35))`,
              }}
            >
              {l}
            </text>
          </svg>
        );
      })}
    </div>
  );
};

// A sticky label. Pinned, the label sits at the offset (x, y) from the tracked
// spot and a leader line with a dot runs back to it, so it reads as "this, here".
const Tag: React.FC<StyleProps> = ({ t, u, W, H, a }) => {
  const { frame, fps, exit } = useLife(t.durationInFrames, 0.4, 0.3);
  const pop = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 190 },
    durationInFrames: 14,
  });
  const line = interpolate(frame, [2, 10], [0, 1], {
    ...clamp,
    easing: ease.out,
  });
  const pinned = Boolean(t.pin && t.pin.length > 1);
  const dx = -t.x * W;
  const dy = -t.y * H;
  const fs = 40 * u * t.size;
  return (
    <div style={{ position: "relative", opacity: 1 - exit }}>
      {pinned ? (
        <svg
          width={1}
          height={1}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            overflow: "visible",
          }}
        >
          <line
            x1={0}
            y1={0}
            x2={dx * line}
            y2={dy * line}
            stroke="#fff"
            strokeWidth={3 * u}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.5))" }}
          />
          <circle
            cx={dx}
            cy={dy}
            r={9 * u * line}
            fill={a}
            stroke="#fff"
            strokeWidth={3 * u}
          />
        </svg>
      ) : null}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 14 * u,
          padding: `${14 * u * t.size}px ${24 * u * t.size}px`,
          borderRadius: 16 * u * t.size,
          backgroundColor: "#FFFFFF",
          boxShadow: `0 ${10 * u}px ${26 * u}px rgba(0,0,0,0.35)`,
          transform: `scale(${pop}) rotate(${-2 + 2 * (1 - pop)}deg)`,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 16 * u * t.size,
            height: 16 * u * t.size,
            borderRadius: 999,
            backgroundColor: a,
            flex: "none",
          }}
        />
        <div>
          <div
            style={{
              fontFamily: font.display,
              fontWeight: 800,
              fontSize: fs,
              lineHeight: 1.05,
              color: "#141418",
            }}
          >
            {lines(t.text).join(" ")}
          </div>
          {t.sub ? (
            <div
              style={{
                fontFamily: font.mono,
                fontWeight: 500,
                fontSize: fs * 0.5,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#6A6560",
                marginTop: 4 * u,
              }}
            >
              {t.sub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const STYLES: Record<TitleStyle, React.FC<StyleProps>> = {
  cutout: Cutout,
  editorial: Editorial,
  inflate: Inflate,
  neon: Neon,
  extrude: Extrude,
  poster: Poster,
  outline: Outline,
  tag: Tag,
};

/** One title, placed (or pinned) in the frame. Put it in a <Sequence> of its own length. */
export const TitleFX: React.FC<{ t: TitleSpec; id: string }> = ({ t, id }) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const pinAt = (k: 1 | 2) =>
    interpolate(
      frame,
      t.pin!.map((p) => p[0]),
      t.pin!.map((p) => p[k]),
      clamp,
    );
  const hasPin = Boolean(t.pin && t.pin.length > 1);
  const x = hasPin ? pinAt(1) + t.x : t.x;
  const y = hasPin ? pinAt(2) + t.y : t.y;
  // Defaults per style from the brand: text colour for type, the accent or punch colour for colour-led styles.
  const c =
    t.color ??
    (t.style === "inflate"
      ? brand.punch
      : t.style === "neon"
        ? brand.accent
        : brand.text);
  const a = t.accent ?? (t.style === "inflate" ? brand.accent : brand.punch);
  const Style = STYLES[t.style];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: x * W,
          top: y * H,
          transform: `translate(-50%, -50%) rotate(${t.rotate}deg)`,
        }}
      >
        <Style t={t} u={u} W={W} H={H} c={c} a={a} id={id} />
      </div>
    </AbsoluteFill>
  );
};
