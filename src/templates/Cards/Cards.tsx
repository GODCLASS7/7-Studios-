import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  Easing,
  Img,
  interpolate,
  OffthreadVideo,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { BrandProvider, ease, font, Grain, useBrand } from "../../lib";

// Kinetic 3D cards: a line-up that slides past a perspective camera (speakers,
// campuses, products, stats, event line-ups). Each card has a gradient border that
// turns, an image or video (or generated art), a label, a big title and a number
// that counts up when the card lands. Two moves:
//   carousel  cards slide sideways on a curved track, turning as they pass
//   stack     cards come forward out of depth; the one before flips up and away
// Cards land every `secondsPerCard`, or on the frames in `landOn` (beats from
// `npm run beats`). Colours come from the brand kit unless a card sets its own.

const brandSchema = z
  .object({
    name: z.string(),
    accent: z.string(),
    punch: z.string(),
    text: z.string(),
    background: z.string(),
    displayFont: z.string(),
    serifFont: z.string(),
    fonts: z.array(
      z.object({
        family: z.string(),
        src: z.string(),
        weight: z.string().optional(),
        style: z.string().optional(),
      }),
    ),
    logo: z.string().nullable(),
    wordmark: z.string(),
    endCard: z
      .object({ seconds: z.number(), line: z.string(), sub: z.string() })
      .nullable(),
  })
  .nullable()
  .default(null);

export const cardsSchema = z.object({
  fps: z.number().default(30),
  title: z.string().nullable().default(null),
  kicker: z.string().nullable().default(null),
  mode: z.enum(["carousel", "stack"]).default("carousel"),
  secondsPerCard: z.number().default(1.6),
  // Frames where each card should land (e.g. music beats); overrides secondsPerCard.
  landOn: z.array(z.number()).nullable().default(null),
  cards: z.array(
    z.object({
      label: z.string().nullable().default(null),
      title: z.string(),
      sub: z.string().nullable().default(null),
      value: z.number().nullable().default(null),
      prefix: z.string().default(""),
      suffix: z.string().default(""),
      valueLabel: z.string().nullable().default(null),
      // A photo or video under public/ (cover-fitted), or generated art when null.
      image: z.string().nullable().default(null),
      colors: z.array(z.string()).nullable().default(null),
    }),
  ),
  background: z.string().nullable().default(null),
  music: z
    .object({ src: z.string(), volume: z.number().default(0.5) })
    .nullable()
    .default(null),
  brand: brandSchema,
});
export type CardsProps = z.infer<typeof cardsSchema>;

const INTRO = 0.7; // seconds before the first card lands
const OUTRO = 1.4; // seconds the last card holds
const MOVE = 0.55; // seconds a move between cards takes

const landFrames = (p: CardsProps) =>
  p.landOn && p.landOn.length >= p.cards.length
    ? p.landOn.slice(0, p.cards.length)
    : p.cards.map((_, i) => Math.round((INTRO + i * p.secondsPerCard) * p.fps));

export const calcCards: CalculateMetadataFunction<CardsProps> = ({ props }) => {
  const lands = landFrames(props);
  return {
    durationInFrames: Math.max(
      1,
      (lands[lands.length - 1] ?? 0) + Math.round(OUTRO * props.fps),
    ),
    fps: props.fps,
  };
};

// Where the line-up is at a frame: 2.0 = card 3 centred; 1.5 = halfway from card 2 to 3.
const positionAt = (frame: number, lands: number[], move: number) => {
  let pos = -1;
  for (let i = 0; i < lands.length; i++) {
    const p = interpolate(frame, [lands[i] - move, lands[i]], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.77, 0, 0.18, 1),
    });
    pos += p;
  }
  return pos;
};

const Art: React.FC<{
  colors: string[];
  seed: string;
  index: number;
  w: number;
  h: number;
}> = ({ colors, seed, index, w, h }) => {
  const frame = useCurrentFrame();
  const blobs = [0, 1, 2].map((k) => {
    const x =
      20 +
      random(`${seed}-x${k}`) * 60 +
      Math.sin(frame / (50 + k * 13) + k) * 8;
    const y =
      15 +
      random(`${seed}-y${k}`) * 70 +
      Math.cos(frame / (60 + k * 11) + k) * 8;
    return `radial-gradient(circle at ${x}% ${y}%, ${colors[k % colors.length]} 0%, transparent ${45 + k * 8}%)`;
  });
  return (
    <AbsoluteFill
      style={{
        background: `${blobs.join(", ")}, linear-gradient(160deg, #15131A, #050507)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -w * 0.06,
          bottom: h * 0.18,
          fontFamily: font.condensed,
          fontSize: h * 0.62,
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: `${Math.max(1.5, w * 0.004)}px rgba(255,255,255,0.22)`,
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
    </AbsoluteFill>
  );
};

const Card: React.FC<{
  c: CardsProps["cards"][number];
  i: number;
  land: number;
  w: number;
  h: number;
  u: number;
  active: number;
}> = ({ c, i, land, w, h, u, active }) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors =
    c.colors && c.colors.length
      ? c.colors
      : [brand.accent, brand.punch, "#7B5CFF"];
  const r = 30 * u;
  const spin = (frame * 2.2 + i * 40) % 360;
  const count = interpolate(frame, [land - 2, land + 0.9 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease.out,
  });
  const sheen = interpolate(frame, [land - 4, land + 0.6 * fps], [-0.6, 1.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const value =
    c.value === null
      ? null
      : `${c.prefix}${(Number.isInteger(c.value) ? Math.round(c.value * count) : (c.value * count).toFixed(1)).toLocaleString("en-US")}${c.suffix}`;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        padding: 4 * u,
        background: `conic-gradient(from ${spin}deg, ${colors.join(", ")}, ${colors[0]})`,
        boxShadow: `0 ${30 * u}px ${70 * u}px rgba(0,0,0,0.55), 0 0 ${40 * u * active}px ${colors[0]}55`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: r - 4 * u,
          overflow: "hidden",
          backgroundColor: "#0C0B10",
        }}
      >
        {c.image ? (
          <AbsoluteFill style={{ transform: `scale(${1.12 - 0.08 * active})` }}>
            {/\.(mp4|mov|webm|m4v)$/i.test(c.image) ? (
              <OffthreadVideo
                src={staticFile(c.image)}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Img
                src={staticFile(c.image)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </AbsoluteFill>
        ) : (
          <Art colors={colors} seed={`card-${i}`} index={i} w={w} h={h} />
        )}
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.85) 100%)",
          }}
        />
        <AbsoluteFill
          style={{
            background: `linear-gradient(115deg, transparent ${sheen * 100 - 18}%, rgba(255,255,255,0.22) ${sheen * 100}%, transparent ${sheen * 100 + 18}%)`,
          }}
        />
        {c.label ? (
          <div
            style={{
              position: "absolute",
              top: 28 * u,
              left: 30 * u,
              fontFamily: font.mono,
              fontWeight: 500,
              fontSize: 22 * u,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#fff",
              padding: `${6 * u}px ${12 * u}px`,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.35)",
              border: `${1.5 * u}px solid rgba(255,255,255,0.35)`,
            }}
          >
            {c.label}
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 30 * u,
            right: 30 * u,
            bottom: 30 * u,
            color: "#fff",
          }}
        >
          {value !== null ? (
            <div
              style={{
                opacity: interpolate(frame, [land - 8, land], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                display: "flex",
                alignItems: "baseline",
                gap: 12 * u,
                marginBottom: 6 * u,
              }}
            >
              <div
                style={{
                  fontFamily: font.card,
                  fontWeight: 800,
                  fontSize: Math.min(120 * u, w * 0.26),
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {value}
              </div>
              {c.valueLabel ? (
                <div
                  style={{
                    fontFamily: font.mono,
                    fontSize: 22 * u,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    opacity: 0.85,
                  }}
                >
                  {c.valueLabel}
                </div>
              ) : null}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: font.condensed,
              fontSize: Math.min(84 * u, w * 0.15),
              lineHeight: 0.98,
              textTransform: "uppercase",
              letterSpacing: "0.01em",
            }}
          >
            {c.title}
          </div>
          {c.sub ? (
            <div
              style={{
                fontFamily: font.body,
                fontWeight: 500,
                fontSize: 26 * u,
                marginTop: 8 * u,
                opacity: 0.8,
              }}
            >
              {c.sub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const Cards: React.FC<CardsProps> = (p) => (
  <BrandProvider brand={p.brand}>
    <CardsInner {...p} />
  </BrandProvider>
);

const CardsInner: React.FC<CardsProps> = (p) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps, width: W, height: H, durationInFrames } = useVideoConfig();
  const u = Math.min(W, H) / 1080;
  const portrait = H > W;
  const lands = landFrames(p);
  const pos = positionAt(frame, lands, Math.round(MOVE * fps));
  const cw = portrait ? W * 0.66 : Math.min(W * 0.3, H * 0.52);
  const ch = Math.min(cw * 1.42, H * (portrait ? 0.56 : 0.66));
  const head = p.title || p.kicker;
  const headIn = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: Math.round(0.6 * fps),
  });
  const exit = interpolate(
    frame,
    [durationInFrames - 0.4 * fps, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.in },
  );
  const centreY = portrait ? H * 0.56 : H * (head ? 0.58 : 0.5);
  const current = Math.max(0, Math.min(p.cards.length - 1, Math.round(pos)));
  const order = p.cards
    .map((_, i) => i)
    .sort((a, b) => Math.abs(b - pos) - Math.abs(a - pos));
  return (
    <AbsoluteFill
      style={{
        backgroundColor: p.background ?? brand.background,
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% ${(centreY / H) * 100}%, ${brand.accent}33 0%, transparent 55%)`,
        }}
      />
      {head ? (
        <div
          style={{
            position: "absolute",
            top: portrait ? H * 0.11 : H * 0.08,
            left: 0,
            right: 0,
            textAlign: "center",
            color: brand.text,
            opacity: headIn * (1 - exit),
            transform: `translateY(${(1 - headIn) * 30 * u}px)`,
          }}
        >
          {p.kicker ? (
            <div
              style={{
                fontFamily: font.mono,
                fontWeight: 500,
                fontSize: 24 * u,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: brand.punch,
                marginBottom: 10 * u,
              }}
            >
              {p.kicker}
            </div>
          ) : null}
          {p.title ? (
            <div
              style={{
                fontFamily: font.condensed,
                fontSize: (portrait ? 110 : 96) * u,
                lineHeight: 0.95,
                textTransform: "uppercase",
              }}
            >
              {p.title}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          perspective: cw * 3.2,
          perspectiveOrigin: `50% ${(centreY / H) * 100}%`,
        }}
      >
        {order.map((i) => {
          const d = i - pos;
          const ad = Math.abs(d);
          const appear = interpolate(
            frame,
            [lands[i] - 1.6 * fps, lands[i] - 0.9 * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );
          const t =
            p.mode === "carousel"
              ? {
                  x:
                    Math.sign(d) *
                    Math.min(ad, 3) *
                    cw *
                    (portrait ? 0.74 : 0.92),
                  y: 0,
                  z: -Math.min(ad, 3) * cw * 0.55,
                  ry: Math.max(-62, Math.min(62, -d * 34)),
                  rx: 0,
                  o: interpolate(ad, [0, 2.2, 3], [1, 1, 0], {
                    extrapolateRight: "clamp",
                  }),
                }
              : d >= 0
                ? {
                    x: d * cw * 0.04,
                    y: -d * ch * 0.07,
                    z: -d * cw * 0.42,
                    ry: d * -4,
                    rx: 0,
                    o: interpolate(d, [0, 3, 3.6], [1, 1, 0], {
                      extrapolateRight: "clamp",
                    }),
                  }
                : {
                    x: 0,
                    y: d * ch * 1.1,
                    z: -d * cw * 0.15,
                    ry: 0,
                    rx: -d * 70,
                    o: interpolate(d, [-0.8, -0.35], [0, 1], {
                      extrapolateLeft: "clamp",
                    }),
                  };
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: W / 2 - cw / 2,
                top: centreY - ch / 2,
                transform: `translate3d(${t.x}px, ${t.y + (1 - appear) * 80 * u + exit * 60 * u}px, ${t.z}px) rotateY(${t.ry}deg) rotateX(${t.rx}deg)`,
                opacity: t.o * appear * (1 - exit),
                filter: `brightness(${1 - Math.min(0.55, ad * 0.28)})`,
              }}
            >
              <Card
                c={p.cards[i]}
                i={i}
                land={lands[i]}
                w={cw}
                h={ch}
                u={u}
                active={Math.max(0, 1 - ad)}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: portrait ? H * 0.12 : H * 0.06,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 10 * u,
          opacity: headIn * (1 - exit),
        }}
      >
        {p.cards.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === current ? 34 * u : 10 * u,
              height: 10 * u,
              borderRadius: 999,
              backgroundColor: i === current ? brand.punch : `${brand.text}55`,
            }}
          />
        ))}
      </div>
      <Grain opacity={0.035} />
      {p.music ? (
        <Audio
          src={staticFile(p.music.src)}
          volume={(f) =>
            p.music!.volume *
            interpolate(
              f,
              [0, 6, durationInFrames - 0.8 * fps, durationInFrames - 1],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};

// Placeholder line-up (facts about the studio itself), so the compositions open on something real.
export const cardsDefaults: CardsProps = {
  fps: 30,
  title: "7 Studios",
  kicker: "What's inside",
  mode: "carousel",
  secondsPerCard: 1.6,
  landOn: null,
  background: null,
  music: null,
  brand: null,
  cards: [
    {
      label: "Titles",
      title: "Cinematic type",
      sub: null,
      value: 7,
      prefix: "",
      suffix: "",
      valueLabel: "styles",
      image: null,
      colors: null,
    },
    {
      label: "Looks",
      title: "Talking heads",
      sub: null,
      value: 4,
      prefix: "",
      suffix: "",
      valueLabel: "looks",
      image: null,
      colors: ["#7B5CFF", "#22C1C3", "#F2C14E"],
    },
    {
      label: "Effects",
      title: "Premium accents",
      sub: null,
      value: 3,
      prefix: "",
      suffix: "",
      valueLabel: "effects",
      image: null,
      colors: ["#FF4FB8", "#7B5CFF", "#FFB86B"],
    },
    {
      label: "Formats",
      title: "Every platform",
      sub: null,
      value: 4,
      prefix: "",
      suffix: "",
      valueLabel: "aspect ratios",
      image: null,
      colors: ["#22C55E", "#3D7BFF", "#E8B44A"],
    },
    {
      label: "Finishing",
      title: "Render presets",
      sub: null,
      value: 11,
      prefix: "",
      suffix: "",
      valueLabel: "presets",
      image: null,
      colors: ["#EF4444", "#F97316", "#E8B44A"],
    },
  ],
};
