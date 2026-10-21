import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font, useBrand } from "../lib";

// Caption styles for edits ("captions": { "style": … } in edl.json). "pop" and
// "line" live in FootageEdit; these are the rest. Every style reads the same cues
// (2–3 words each, from the transcript), so switching style never changes timing.
//   pill        dark rounded pill, active word in the punch colour
//   box         a coloured box jumps to each word as it's said
//   karaoke     the whole line shows; words fill with colour as they're spoken
//   typewriter  letters type on in mono, with a cursor
//   serif       calm italic serif, lowercase, words fade up
//   minimal     small lowercase sans, no highlight
//   outline     hollow capitals; the spoken word fills
//   stack       one word at a time, big and centred
//   subtitle    film subtitles: small yellow sentence case with a black edge
//   neon        glowing words; the spoken one burns brightest
//   marker      handwriting with a highlighter swipe behind the spoken word
//   bubble      a white speech bubble per line
//   gradient    heavy words filled with the brand gradient
//   stamp       condensed capitals that slam in, one by one

export const CAPTION_STYLES = [
  "pill",
  "box",
  "karaoke",
  "typewriter",
  "serif",
  "minimal",
  "outline",
  "stack",
  "subtitle",
  "neon",
  "marker",
  "bubble",
  "gradient",
  "stamp",
] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

type Word = { text: string; startMs: number; endMs: number };
type Cue = { startMs: number; endMs: number; words: Word[] };
const strip = (t: string) => t.replace(/[.,;:]+$/, "");
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const StyledCaptions: React.FC<{
  cues: Cue[];
  style: CaptionStyle;
  position: number;
  size: number;
  uppercase: boolean;
  highlight: string;
  emphasis: string[];
}> = ({ cues, style, position, size, uppercase, highlight, emphasis }) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const cue = cues.find((q) => ms >= q.startMs && ms < q.endMs);
  if (!cue) return null;
  const u = Math.min(width, height) / 1080;
  const portrait = height > width;
  const base = (portrait ? 68 : 54) * u * size;
  const cueIn = spring({
    frame: frame - Math.round((cue.startMs / 1000) * fps),
    fps,
    config: { damping: 18, stiffness: 220 },
    durationInFrames: 8,
  });
  const words = cue.words.map((w, i) => {
    const next = cue.words[i + 1]?.startMs ?? cue.endMs;
    return {
      ...w,
      t: strip(w.text),
      active: ms >= w.startMs && ms < next,
      said: ms >= w.startMs,
      p: interpolate(
        ms,
        [w.startMs, Math.max(w.startMs + 1, w.endMs)],
        [0, 1],
        clamp,
      ),
      pop: spring({
        frame: frame - Math.round((w.startMs / 1000) * fps),
        fps,
        config: { damping: 12, stiffness: 200 },
        durationInFrames: 10,
      }),
      emph: emphasis.some(
        (e) => e.toLowerCase() === strip(w.text).toLowerCase(),
      ),
    };
  });
  const up = (t: string) => (uppercase ? t.toUpperCase() : t);
  const shadow = `0 ${3 * u}px ${14 * u}px rgba(0,0,0,0.55)`;
  const row: React.CSSProperties = {
    maxWidth: width * (portrait ? 0.84 : 0.72),
    textAlign: "center",
    lineHeight: 1.12,
  };
  const wrap = (children: React.ReactNode, extra: React.CSSProperties = {}) => (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: height * position - base * 0.6,
      }}
    >
      <div style={{ ...row, ...extra }}>{children}</div>
    </AbsoluteFill>
  );
  const sp = { display: "inline-block", margin: "0 0.14em" } as const;

  switch (style) {
    case "pill":
      return wrap(
        <span
          style={{
            display: "inline-block",
            padding: `${10 * u}px ${22 * u}px`,
            borderRadius: 20 * u,
            backgroundColor: "rgba(10,10,12,0.82)",
            transform: `scale(${interpolate(cueIn, [0, 1], [0.9, 1])})`,
            opacity: cueIn,
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                ...sp,
                fontFamily: brand.displayFont,
                fontWeight: 900,
                fontSize: base * 0.74,
                textTransform: "uppercase",
                color: w.active || w.emph ? brand.punch : "#fff",
              }}
            >
              {w.t}
            </span>
          ))}
        </span>,
      );
    case "box":
      return wrap(
        words.map((w, i) => (
          <span
            key={i}
            style={{
              ...sp,
              padding: `${2 * u}px ${12 * u}px`,
              borderRadius: 8 * u,
              backgroundColor: w.active ? highlight : "transparent",
              color: w.active ? "#111" : "#fff",
              fontFamily: brand.displayFont,
              fontWeight: 900,
              fontSize: base,
              textTransform: "uppercase",
              textShadow: w.active ? "none" : shadow,
              transform: `rotate(${w.active ? (i % 2 ? 2 : -2) : 0}deg) scale(${w.active ? interpolate(w.pop, [0, 1], [1.15, 1]) : 1})`,
            }}
          >
            {w.t}
          </span>
        )),
      );
    case "karaoke":
      return wrap(
        words.map((w, i) => (
          <span
            key={i}
            style={{
              ...sp,
              fontFamily: brand.displayFont,
              fontWeight: 900,
              fontSize: base * 0.9,
              textTransform: uppercase ? "uppercase" : "none",
              backgroundImage: `linear-gradient(90deg, ${highlight} ${w.p * 100}%, #FFFFFF ${w.p * 100}%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              // A tight dark edge, then a soft shadow, so white and colour both read on bright footage.
              filter: `drop-shadow(0 0 ${1.5 * u}px rgba(0,0,0,0.9)) drop-shadow(0 ${3 * u}px ${8 * u}px rgba(0,0,0,0.6))`,
            }}
          >
            {w.t}
          </span>
        )),
        { opacity: cueIn },
      );
    case "typewriter": {
      const text = words.map((w) => w.t).join(" ");
      let shown = 0;
      let acc = 0;
      words.forEach((w, i) => {
        const len = w.t.length + (i ? 1 : 0);
        if (w.said)
          shown = acc + Math.round(len * Math.min(1, w.p * 1.6 + 0.2));
        acc += len;
      });
      return wrap(
        <span
          style={{
            display: "inline-block",
            padding: `${8 * u}px ${16 * u}px`,
            backgroundColor: "rgba(0,0,0,0.72)",
            fontFamily: font.mono,
            fontWeight: 500,
            fontSize: base * 0.62,
            color: "#fff",
            whiteSpace: "pre-wrap",
            textAlign: "left",
          }}
        >
          {up(text.slice(0, shown))}
          <span
            style={{
              backgroundColor: highlight,
              color: highlight,
              opacity: Math.floor(frame / 8) % 2 ? 1 : 0.25,
            }}
          >
            _
          </span>
        </span>,
      );
    }
    case "serif":
      return wrap(
        words.map((w, i) => (
          <span
            key={i}
            style={{
              ...sp,
              fontFamily: brand.serifFont,
              fontStyle: "italic",
              fontWeight: 400,
              fontSize: base * 1.05,
              color: w.emph ? highlight : "#fff",
              textShadow: shadow,
              opacity: interpolate(w.pop, [0, 1], [0, 1]),
              transform: `translateY(${(1 - w.pop) * 14 * u}px)`,
            }}
          >
            {w.t.toLowerCase()}
          </span>
        )),
      );
    case "minimal":
      return wrap(
        <span
          style={{
            fontFamily: brand.displayFont,
            fontWeight: 500,
            fontSize: base * 0.66,
            color: "#fff",
            textShadow: `0 ${2 * u}px ${8 * u}px rgba(0,0,0,0.7)`,
            opacity: cueIn,
          }}
        >
          {words.map((w) => w.t.toLowerCase()).join(" ")}
        </span>,
      );
    case "outline":
      return wrap(
        words.map((w, i) => (
          <span
            key={i}
            style={{
              ...sp,
              fontFamily: brand.displayFont,
              fontWeight: 900,
              fontSize: base,
              textTransform: "uppercase",
              // Hollow letters keep a faint dark fill and edge, so the stroke reads on light footage.
              color: w.said ? highlight : "rgba(0,0,0,0.3)",
              WebkitTextStroke: `${3 * u}px ${w.said ? highlight : "#fff"}`,
              filter: `drop-shadow(0 0 ${1.5 * u}px rgba(0,0,0,0.85)) drop-shadow(0 ${2 * u}px ${6 * u}px rgba(0,0,0,0.5))`,
            }}
          >
            {w.t}
          </span>
        )),
      );
    case "stack": {
      const w = words.find((x) => x.active) ?? words[words.length - 1];
      return (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingTop: (position - 0.5) * height * 2,
          }}
        >
          <div
            style={{
              fontFamily: brand.displayFont,
              fontWeight: 900,
              fontSize: base * 1.7,
              letterSpacing: "-0.02em",
              textTransform: uppercase ? "uppercase" : "none",
              color: w.emph ? highlight : "#fff",
              textShadow: shadow,
              transform: `scale(${interpolate(w.pop, [0, 1], [0.7, 1])})`,
              opacity: w.pop,
            }}
          >
            {w.t}
          </div>
        </AbsoluteFill>
      );
    }
    case "subtitle":
      return (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: height * Math.max(position, portrait ? 0.74 : 0.84),
          }}
        >
          <div
            style={{
              ...row,
              fontFamily: font.body,
              fontWeight: 600,
              fontSize: base * 0.64,
              color: "#FFE14D",
              WebkitTextStroke: `${1.2 * u}px #000`,
              paintOrder: "stroke fill",
              textShadow: `0 0 ${4 * u}px #000`,
            }}
          >
            {words.map((w) => w.t).join(" ")}
          </div>
        </AbsoluteFill>
      );
    case "neon":
      return wrap(
        words.map((w, i) => (
          <span
            key={i}
            style={{
              ...sp,
              fontFamily: font.hand,
              fontWeight: 700,
              fontSize: base * 1.15,
              color: "#FFF6F0",
              opacity: w.said ? 1 : 0.7,
              // The glow, over a dark halo so the tube still reads on bright footage.
              textShadow: `0 0 ${3 * u}px #fff, 0 0 ${10 * u}px ${highlight}, 0 0 ${24 * u}px ${highlight}${w.active ? `, 0 0 ${48 * u}px ${highlight}` : ""}, 0 ${2 * u}px ${10 * u}px rgba(0,0,0,0.75)`,
            }}
          >
            {w.t}
          </span>
        )),
      );
    case "marker":
      return wrap(
        words.map((w, i) => (
          <span
            key={i}
            style={{
              ...sp,
              position: "relative",
              isolation: "isolate",
              fontFamily: font.hand,
              fontWeight: 700,
              fontSize: base * 1.1,
              color: "#fff",
              textShadow: shadow,
            }}
          >
            {w.said ? (
              <span
                style={{
                  position: "absolute",
                  left: "-6%",
                  right: `${106 - 112 * Math.min(1, w.p * 2 + 0.15)}%`,
                  top: "38%",
                  bottom: "6%",
                  backgroundColor: highlight,
                  opacity: 0.7,
                  borderRadius: 6 * u,
                  transform: "rotate(-2deg)",
                  zIndex: -1,
                }}
              />
            ) : null}
            <span style={{ position: "relative" }}>{w.t}</span>
          </span>
        )),
      );
    case "bubble":
      return wrap(
        <span
          style={{
            position: "relative",
            display: "inline-block",
            padding: `${14 * u}px ${26 * u}px`,
            borderRadius: 34 * u,
            backgroundColor: "#fff",
            boxShadow: `0 ${8 * u}px ${20 * u}px rgba(0,0,0,0.3)`,
            transform: `scale(${interpolate(cueIn, [0, 1], [0.6, 1])})`,
            transformOrigin: "20% 100%",
          }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              style={{
                ...sp,
                fontFamily: brand.displayFont,
                fontWeight: 800,
                fontSize: base * 0.66,
                color: w.active ? brand.accent : "#111",
                opacity: w.said ? 1 : 0.35,
              }}
            >
              {w.t}
            </span>
          ))}
          <span
            style={{
              position: "absolute",
              left: 40 * u,
              bottom: -16 * u,
              width: 0,
              height: 0,
              borderLeft: `${14 * u}px solid transparent`,
              borderRight: `${14 * u}px solid transparent`,
              borderTop: `${18 * u}px solid #fff`,
            }}
          />
        </span>,
      );
    case "gradient":
      return wrap(
        words.map((w, i) => (
          <span
            key={i}
            style={{
              ...sp,
              fontFamily: brand.displayFont,
              fontWeight: 900,
              fontSize: base * (w.active ? 1.08 : 1),
              textTransform: "uppercase",
              backgroundImage: `linear-gradient(180deg, ${brand.punch}, ${brand.accent})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: `drop-shadow(0 0 ${1.5 * u}px rgba(0,0,0,0.9)) drop-shadow(0 ${3 * u}px ${6 * u}px rgba(0,0,0,0.55))`,
              opacity: w.said ? 1 : 0.75,
            }}
          >
            {w.t}
          </span>
        )),
      );
    case "stamp":
    default:
      return wrap(
        words.map((w, i) =>
          w.said ? (
            <span
              key={i}
              style={{
                ...sp,
                fontFamily: font.condensed,
                fontSize: base * 1.15,
                textTransform: "uppercase",
                color: w.emph || w.active ? highlight : "#fff",
                textShadow: shadow,
                transform: `scale(${interpolate(w.pop, [0, 1], [1.8, 1])}) rotate(${(i % 2 ? 1 : -1) * interpolate(w.pop, [0, 1], [6, 0])}deg)`,
                opacity: interpolate(w.pop, [0, 0.3], [0, 1], clamp),
              }}
            >
              {w.t}
            </span>
          ) : null,
        ),
      );
  }
};
