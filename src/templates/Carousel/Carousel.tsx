import { fitTextOnNLines } from "@remotion/layout-utils";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Img,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import {
  BrandProvider,
  brandSchema,
  font,
  PAPER,
  PaperTexture,
  useBrand,
} from "../../lib";

// Carousel posts (Instagram, LinkedIn, TikTok photo posts): one slide per frame,
// rendered to numbered JPEGs by `npm run carousel -- <id> render`. Eight looks,
// eight slide kinds. Titles fit themselves; *word* sets a word in the accent
// colour (italic in the serif looks). Slides can carry a photo, a still from the
// video, or a cut-out of the speaker (`npm run carousel -- <id> frames … --cutout`).
//   glow       dark, a glowing horizon, the speaker cut out over it (tips, hooks)
//   paper      warm paper, ink serif, taped photos (stories, ministry)
//   poster     Swiss poster: condensed caps that fill the width, an accent bar
//   editorial  cream page, serif with italic accents, arched photo (quiet luxury)
//   bold       big caps over full-bleed photos (strong opinions)
//   soft       blush and cream, soft serif, rounded photos (wellness, calm)
//   pop        bright colour blocks, heavy rounded type, sticker photos (playful)
//   scripture  ink on paper for verses, small-caps references

export const CAROUSEL_LOOKS = [
  "glow",
  "paper",
  "poster",
  "editorial",
  "bold",
  "soft",
  "pop",
  "scripture",
] as const;
export type CarouselLook = (typeof CAROUSEL_LOOKS)[number];

const slideSchema = z.object({
  kind: z.enum([
    "cover",
    "point",
    "list",
    "quote",
    "stat",
    "scripture",
    "image",
    "cta",
  ]),
  title: z.string().nullable().default(null),
  body: z.string().nullable().default(null),
  kicker: z.string().nullable().default(null),
  items: z.array(z.string()).default([]),
  value: z.string().nullable().default(null),
  reference: z.string().nullable().default(null),
  image: z.string().nullable().default(null),
  cutout: z.boolean().default(false),
});
export type Slide = z.infer<typeof slideSchema>;

export const carouselSchema = z.object({
  look: z.enum(CAROUSEL_LOOKS),
  handle: z.string().nullable().default(null),
  slides: z.array(slideSchema),
  // Override any colour or font of the look (a custom look saved with the brand).
  theme: z
    .object({
      background: z.string().optional(),
      text: z.string().optional(),
      accent: z.string().optional(),
      punch: z.string().optional(),
      display: z.string().optional(),
      serif: z.string().optional(),
    })
    .nullable()
    .default(null),
  swipeHint: z.boolean().default(true),
  pageNumbers: z.boolean().default(true),
  brand: brandSchema,
});
export type CarouselProps = z.infer<typeof carouselSchema>;

export const calcCarousel: CalculateMetadataFunction<CarouselProps> = ({
  props,
}) => ({
  durationInFrames: Math.max(1, props.slides.length),
  fps: 30,
});

type Theme = {
  background: string;
  text: string;
  accent: string;
  punch: string;
  display: string;
  serif: string;
  weight: number;
  upper: boolean;
  italicAccent: boolean;
};

const useTheme = (look: CarouselLook, o: CarouselProps["theme"]): Theme => {
  const b = useBrand();
  const base: Record<CarouselLook, Theme> = {
    glow: {
      background: "#09090D",
      text: "#FFFFFF",
      accent: b.accent,
      punch: b.punch,
      display: font.display,
      serif: font.serif,
      weight: 900,
      upper: false,
      italicAccent: false,
    },
    paper: {
      background: PAPER.page,
      text: PAPER.ink,
      accent: PAPER.accent,
      punch: PAPER.accent,
      display: font.serif,
      serif: font.serif,
      weight: 600,
      upper: false,
      italicAccent: true,
    },
    poster: {
      background: "#F1EEE7",
      text: "#111111",
      accent: b.accent,
      punch: b.punch,
      display: font.condensed,
      serif: font.serif,
      weight: 400,
      upper: true,
      italicAccent: false,
    },
    editorial: {
      background: "#F3EEE6",
      text: "#2A2420",
      accent: "#8C6A4F",
      punch: "#8C6A4F",
      display: font.serif,
      serif: font.serif,
      weight: 400,
      upper: false,
      italicAccent: true,
    },
    bold: {
      background: "#0B0B0D",
      text: "#FFFFFF",
      accent: b.punch,
      punch: b.punch,
      display: font.condensed,
      serif: font.serif,
      weight: 400,
      upper: true,
      italicAccent: false,
    },
    soft: {
      background: "#F6E9E4",
      text: "#4A3A36",
      accent: "#C4807E",
      punch: "#C4807E",
      display: font.serif,
      serif: font.serif,
      weight: 400,
      upper: false,
      italicAccent: true,
    },
    pop: {
      background: "#FFE14D",
      text: "#141414",
      accent: "#FF4FB8",
      punch: "#3D7BFF",
      display: font.card,
      serif: font.serif,
      weight: 800,
      upper: false,
      italicAccent: false,
    },
    scripture: {
      background: PAPER.page,
      text: PAPER.ink,
      accent: PAPER.accent,
      punch: PAPER.accent,
      display: font.serif,
      serif: font.serif,
      weight: 500,
      upper: false,
      italicAccent: true,
    },
  };
  return { ...base[look], ...(o ?? {}) } as Theme;
};

// "*word*" → accent (italic in serif looks).
const Rich: React.FC<{ text: string; th: Theme }> = ({ text, th }) => (
  <>
    {text.split(/(\*[^*]+\*)/).map((part, i) =>
      part.startsWith("*") && part.endsWith("*") ? (
        <span
          key={i}
          style={{
            color: th.accent,
            fontStyle: th.italicAccent ? "italic" : undefined,
          }}
        >
          {part.slice(1, -1)}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    )}
  </>
);

const Title: React.FC<{
  text: string;
  th: Theme;
  width: number;
  lines: number;
  max: number;
  align?: "left" | "center";
  color?: string;
}> = ({ text, th, width, lines, max, align = "left", color }) => {
  const plain = text.replace(/\*/g, "");
  const { fontSize } = fitTextOnNLines({
    text: th.upper ? plain.toUpperCase() : plain,
    maxLines: lines,
    maxBoxWidth: width,
    fontFamily: th.display,
    fontWeight: th.weight,
    maxFontSize: max,
    validateFontIsLoaded: false,
  });
  return (
    <div
      style={{
        width,
        fontFamily: th.display,
        fontWeight: th.weight,
        fontSize: fontSize * 0.97,
        lineHeight: th.upper ? 0.95 : 1.06,
        letterSpacing: th.upper ? "0.005em" : "-0.015em",
        textTransform: th.upper ? "uppercase" : "none",
        textAlign: align,
        color: color ?? th.text,
      }}
    >
      <Rich text={text} th={th} />
    </div>
  );
};

const Photo: React.FC<{
  src: string;
  mode: "full" | "arch" | "round" | "taped" | "sticker" | "inset";
  w: number;
  h: number;
  seed: string;
  th: Theme;
  u: number;
}> = ({ src, mode, w, h, seed, th, u }) => {
  const img = (
    <Img
      src={staticFile(src)}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
  if (mode === "full") return <AbsoluteFill>{img}</AbsoluteFill>;
  const tilt = (random(seed) - 0.5) * 6;
  const radius =
    mode === "arch"
      ? `${w / 2}px ${w / 2}px ${12 * u}px ${12 * u}px`
      : mode === "round"
        ? 36 * u
        : mode === "sticker"
          ? 28 * u
          : 6 * u;
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        transform:
          mode === "taped" || mode === "sticker"
            ? `rotate(${tilt}deg)`
            : undefined,
        padding: mode === "taped" ? 14 * u : mode === "sticker" ? 10 * u : 0,
        backgroundColor:
          mode === "taped"
            ? "#FBF8F2"
            : mode === "sticker"
              ? "#FFFFFF"
              : undefined,
        borderRadius: mode === "sticker" ? 34 * u : undefined,
        boxShadow:
          mode === "inset"
            ? undefined
            : `0 ${14 * u}px ${30 * u}px rgba(0,0,0,0.22)`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: radius,
        }}
      >
        {img}
      </div>
      {mode === "taped" ? (
        <div
          style={{
            position: "absolute",
            top: -16 * u,
            left: "50%",
            width: 120 * u,
            height: 36 * u,
            transform: `translateX(-50%) rotate(${-tilt * 1.5}deg)`,
            backgroundColor: `${th.accent}55`,
          }}
        />
      ) : null}
    </div>
  );
};

const Decor: React.FC<{
  look: CarouselLook;
  th: Theme;
  W: number;
  H: number;
  index: number;
}> = ({ look, th, W, H, index }) => {
  if (look === "paper" || look === "scripture")
    return <PaperTexture seed={7 + index} />;
  if (look === "glow")
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 90% 45% at 50% 108%, ${th.punch} 0%, ${th.accent} 28%, transparent 70%), radial-gradient(ellipse 60% 30% at 50% 100%, #ffffff55 0%, transparent 60%)`,
          opacity: 0.95,
        }}
      />
    );
  if (look === "poster")
    return (
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${th.text}10 1px, transparent 1px), linear-gradient(90deg, ${th.text}10 1px, transparent 1px)`,
          backgroundSize: `${W / 6}px ${H / 8}px`,
        }}
      />
    );
  if (look === "pop") {
    const blocks = ["#FFE14D", "#FF8FC8", "#7FD4FF", "#B8F27C"];
    return (
      <AbsoluteFill
        style={{ backgroundColor: blocks[index % blocks.length] }}
      />
    );
  }
  if (look === "editorial")
    return (
      <AbsoluteFill style={{ padding: 36 * (W / 1080) }}>
        <div
          style={{
            flex: 1,
            border: `${1.5 * (W / 1080)}px solid ${th.text}55`,
            outline: `${1.5 * (W / 1080)}px solid ${th.text}22`,
            outlineOffset: -12 * (W / 1080),
          }}
        />
      </AbsoluteFill>
    );
  if (look === "soft")
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 20% 10%, #ffffff99, transparent 55%), radial-gradient(ellipse at 90% 90%, ${th.accent}33, transparent 55%)`,
        }}
      />
    );
  return null;
};

const SlideView: React.FC<{
  s: Slide;
  p: CarouselProps;
  index: number;
  total: number;
}> = ({ s, p, index, total }) => {
  const { width: W, height: H } = useVideoConfig();
  const th = useTheme(p.look, p.theme);
  const brand = useBrand();
  const u = W / 1080;
  const P = 84 * u;
  const inner = W - P * 2;
  const look = p.look;
  const pointIndex = p.slides
    .slice(0, index + 1)
    .filter((x) => x.kind === "point").length;
  const dark = look === "glow" || look === "bold";
  const small: React.CSSProperties = {
    fontFamily: font.mono,
    fontWeight: 500,
    fontSize: 24 * u,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: th.text,
    opacity: 0.75,
  };
  const body: React.CSSProperties = {
    fontFamily:
      look === "editorial" ||
      look === "soft" ||
      look === "paper" ||
      look === "scripture"
        ? th.serif
        : font.body,
    fontWeight: look === "pop" ? 600 : 400,
    fontSize: 44 * u,
    lineHeight: 1.36,
    color: th.text,
    opacity: 0.92,
  };
  const photoMode: Record<
    CarouselLook,
    "full" | "arch" | "round" | "taped" | "sticker" | "inset"
  > = {
    glow: "round",
    paper: "taped",
    poster: "inset",
    editorial: "arch",
    bold: "full",
    soft: "round",
    pop: "sticker",
    scripture: "taped",
  };
  const kicker = s.kicker ? (
    <div
      style={{ ...small, color: th.accent, opacity: 1, marginBottom: 22 * u }}
    >
      {s.kicker}
    </div>
  ) : null;
  let content: React.ReactNode = null;

  if (s.kind === "cover") {
    const cut = s.image && s.cutout;
    if (look === "bold" && s.image && !cut) {
      content = (
        <>
          <Photo
            src={s.image}
            mode="full"
            w={W}
            h={H}
            seed={`c${index}`}
            th={th}
            u={u}
          />
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.85) 100%)",
            }}
          />
          <div style={{ position: "absolute", left: P, bottom: P * 1.6 }}>
            {kicker}
            <Title
              text={s.title ?? ""}
              th={th}
              width={inner}
              lines={4}
              max={170 * u}
            />
          </div>
        </>
      );
    } else if (cut) {
      content = (
        <>
          <div style={{ position: "absolute", left: P, top: P * 1.4 }}>
            {kicker}
            <Title
              text={s.title ?? ""}
              th={th}
              width={inner}
              lines={3}
              max={120 * u}
            />
          </div>
          <Img
            src={staticFile(s.image!)}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 0,
              height: H * 0.68,
              transform: "translateX(-50%)",
              objectFit: "contain",
            }}
          />
        </>
      );
    } else {
      const ph = s.image ? H * (look === "poster" ? 0.3 : 0.4) : 0;
      content = (
        <div
          style={{
            position: "absolute",
            left: P,
            right: P,
            top: P * 1.4,
            bottom: P * 1.6,
            display: "flex",
            flexDirection: "column",
            justifyContent: s.image ? "space-between" : "center",
            alignItems:
              look === "editorial" || look === "soft" || look === "scripture"
                ? "center"
                : "flex-start",
          }}
        >
          {s.image ? (
            <Photo
              src={s.image}
              mode={photoMode[look]}
              w={look === "editorial" ? inner * 0.62 : inner}
              h={ph}
              seed={`c${index}`}
              th={th}
              u={u}
            />
          ) : null}
          <div
            style={{
              textAlign:
                look === "editorial" || look === "soft" || look === "scripture"
                  ? "center"
                  : "left",
            }}
          >
            {kicker}
            <Title
              text={s.title ?? ""}
              th={th}
              width={inner}
              lines={look === "poster" ? 4 : 3}
              max={(look === "poster" ? 190 : 130) * u}
              align={
                look === "editorial" || look === "soft" || look === "scripture"
                  ? "center"
                  : "left"
              }
            />
            {look === "poster" ? (
              <div
                style={{
                  width: inner * 0.42,
                  height: 26 * u,
                  backgroundColor: th.accent,
                  marginTop: 26 * u,
                }}
              />
            ) : null}
            {s.body ? (
              <div style={{ ...body, marginTop: 26 * u }}>{s.body}</div>
            ) : null}
          </div>
        </div>
      );
    }
  } else if (s.kind === "point" || s.kind === "stat") {
    content = (
      <div
        style={{
          position: "absolute",
          left: P,
          right: P,
          top: P * 1.4,
          bottom: P * 1.6,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: s.kind === "stat" ? font.card : th.display,
            fontWeight: s.kind === "stat" ? 800 : th.weight,
            fontSize: (s.kind === "stat" ? 220 : 150) * u,
            lineHeight: 0.9,
            color: th.accent,
            letterSpacing: "-0.03em",
            marginBottom: 28 * u,
          }}
        >
          {s.kind === "stat" ? s.value : String(pointIndex).padStart(2, "0")}
        </div>
        {kicker}
        {s.title ? (
          <Title text={s.title} th={th} width={inner} lines={3} max={92 * u} />
        ) : null}
        {s.body ? (
          <div style={{ ...body, marginTop: 28 * u }}>{s.body}</div>
        ) : null}
        {s.image ? (
          <div style={{ marginTop: 36 * u }}>
            <Photo
              src={s.image}
              mode={photoMode[look] === "full" ? "round" : photoMode[look]}
              w={inner}
              h={H * 0.24}
              seed={`p${index}`}
              th={th}
              u={u}
            />
          </div>
        ) : null}
      </div>
    );
  } else if (s.kind === "list") {
    content = (
      <div
        style={{
          position: "absolute",
          left: P,
          right: P,
          top: P * 1.4,
          bottom: P * 1.6,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {kicker}
        {s.title ? (
          <Title text={s.title} th={th} width={inner} lines={2} max={88 * u} />
        ) : null}
        <div
          style={{
            marginTop: 40 * u,
            display: "flex",
            flexDirection: "column",
            gap: 26 * u,
          }}
        >
          {s.items.map((it, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 24 * u, alignItems: "flex-start" }}
            >
              <div
                style={{
                  flex: "none",
                  width: 58 * u,
                  height: 58 * u,
                  borderRadius: look === "poster" ? 0 : 29 * u,
                  backgroundColor: th.accent,
                  color: dark ? "#000" : "#fff",
                  fontFamily: font.card,
                  fontWeight: 800,
                  fontSize: 30 * u,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  ...body,
                  fontSize: 42 * u,
                  lineHeight: 1.25,
                  paddingTop: 4 * u,
                }}
              >
                <Rich text={it} th={th} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (s.kind === "quote" || s.kind === "scripture") {
    const serif = s.kind === "scripture" || look !== "pop";
    content = (
      <div
        style={{
          position: "absolute",
          left: P,
          right: P,
          top: P * 1.4,
          bottom: P * 1.6,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {s.kind === "quote" ? (
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 220 * u,
              lineHeight: 0.6,
              color: th.accent,
              height: 110 * u,
            }}
          >
            “
          </div>
        ) : (
          kicker
        )}
        <div
          style={{
            fontFamily: serif ? th.serif : th.display,
            fontStyle: s.kind === "quote" && serif ? "italic" : "normal",
            fontWeight: 400,
            fontSize:
              (s.kind === "scripture" ? 62 : 66) *
              u *
              Math.min(1, Math.sqrt(140 / Math.max(60, (s.body ?? "").length))),
            lineHeight: 1.22,
            color: th.text,
          }}
        >
          <Rich text={s.body ?? ""} th={th} />
        </div>
        {s.reference ? (
          <div
            style={{
              ...small,
              marginTop: 40 * u,
              color: th.accent,
              opacity: 1,
              letterSpacing: "0.24em",
            }}
          >
            {s.reference}
          </div>
        ) : null}
      </div>
    );
  } else if (s.kind === "image") {
    content = (
      <>
        {s.image ? (
          look === "bold" || look === "glow" ? (
            <Photo
              src={s.image}
              mode="full"
              w={W}
              h={H}
              seed={`i${index}`}
              th={th}
              u={u}
            />
          ) : (
            <div style={{ position: "absolute", left: P, top: P * 1.4 }}>
              <Photo
                src={s.image}
                mode={photoMode[look]}
                w={inner}
                h={H * 0.56}
                seed={`i${index}`}
                th={th}
                u={u}
              />
            </div>
          )
        ) : null}
        {look === "bold" || look === "glow" ? (
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.85) 100%)",
            }}
          />
        ) : null}
        <div
          style={{ position: "absolute", left: P, right: P, bottom: P * 1.6 }}
        >
          {kicker}
          {s.title ? (
            <Title
              text={s.title}
              th={th}
              width={inner}
              lines={3}
              max={84 * u}
            />
          ) : null}
          {s.body ? (
            <div style={{ ...body, marginTop: 18 * u, fontSize: 34 * u }}>
              {s.body}
            </div>
          ) : null}
        </div>
      </>
    );
  } else {
    // cta
    content = (
      <div
        style={{
          position: "absolute",
          left: P,
          right: P,
          top: P * 1.4,
          bottom: P * 1.6,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {kicker}
        <Title
          text={s.title ?? "Save this for later"}
          th={th}
          width={inner}
          lines={3}
          max={110 * u}
          align="center"
        />
        {s.body ? (
          <div style={{ ...body, marginTop: 28 * u }}>{s.body}</div>
        ) : null}
        {p.handle ? (
          <div
            style={{
              marginTop: 48 * u,
              padding: `${16 * u}px ${36 * u}px`,
              borderRadius: 999,
              backgroundColor: th.accent,
              color:
                dark || look === "paper" || look === "scripture"
                  ? "#fff"
                  : "#fff",
              fontFamily: font.card,
              fontWeight: 800,
              fontSize: 40 * u,
            }}
          >
            {p.handle}
          </div>
        ) : null}
        {brand.wordmark ? (
          <div style={{ ...small, marginTop: 40 * u, letterSpacing: "0.3em" }}>
            {brand.wordmark}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AbsoluteFill
      style={{ backgroundColor: th.background, overflow: "hidden" }}
    >
      <Decor look={look} th={th} W={W} H={H} index={index} />
      {content}
      <div
        style={{
          position: "absolute",
          left: P,
          right: P,
          bottom: P * 0.6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          ...small,
          textShadow: "0 1px 6px rgba(0,0,0,0.45)",
          color:
            s.kind === "cover" && look === "bold" && s.image ? "#fff" : th.text,
        }}
      >
        <span>{p.handle ?? ""}</span>
        <span>
          {index === 0 && p.swipeHint && total > 1
            ? "Swipe →"
            : p.pageNumbers
              ? `${index + 1}/${total}`
              : ""}
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const Carousel: React.FC<CarouselProps> = (p) => {
  const frame = useCurrentFrame();
  const i = Math.min(p.slides.length - 1, Math.max(0, frame));
  return (
    <BrandProvider brand={p.brand}>
      {p.slides.length ? (
        <SlideView s={p.slides[i]} p={p} index={i} total={p.slides.length} />
      ) : null}
    </BrandProvider>
  );
};

// A sample deck (one of each kind), so the compositions open on something useful.
export const carouselDefaults: CarouselProps = {
  look: "glow",
  handle: "@thewaitculture",
  theme: null,
  swipeHint: true,
  pageNumbers: true,
  brand: null,
  slides: [
    {
      kind: "cover",
      kicker: "The Wait Culture",
      title: "Waiting is *not* wasting",
      body: null,
      items: [],
      value: null,
      reference: null,
      image: null,
      cutout: false,
    },
    {
      kind: "point",
      kicker: null,
      title: "Name what you're waiting for",
      body: "Write it down. A wait you can name is a wait you can carry.",
      items: [],
      value: null,
      reference: null,
      image: null,
      cutout: false,
    },
    {
      kind: "list",
      kicker: null,
      title: "Three things to do *while you wait*",
      body: null,
      items: [
        "Keep showing up",
        "Stay close to people",
        "Write down what changes",
      ],
      value: null,
      reference: null,
      image: null,
      cutout: false,
    },
    {
      kind: "scripture",
      kicker: null,
      title: null,
      body: "But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles.",
      items: [],
      value: null,
      reference: "Isaiah 40:31 · KJV",
      image: null,
      cutout: false,
    },
    {
      kind: "quote",
      kicker: null,
      title: null,
      body: "God is working in the wait.",
      items: [],
      value: null,
      reference: "The Wait Culture",
      image: null,
      cutout: false,
    },
    {
      kind: "cta",
      kicker: null,
      title: "Save this for *your* season",
      body: "Share it with someone who's waiting.",
      items: [],
      value: null,
      reference: null,
      image: null,
      cutout: false,
    },
  ],
};
