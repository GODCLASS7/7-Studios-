import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { evolvePath } from "@remotion/paths";

// Illustrated, hand-made motion (Ben Marriott-style): paper texture, cut-out
// strips that move on twos like stop motion, ink that bleeds in, and a
// hand-drawn underline. Everything is deterministic (seeded), so renders match.

/** Hold each drawing for `n` frames, like stop motion animated "on twos". */
export const onTwos = (frame: number, n = 2) => Math.floor(frame / n) * n;

export const PAPER = {
  page: "#EFE6D6",
  strip: "#F8F2E6",
  ink: "#1F1A15",
  accent: "#B4442F",
  shadow: "rgba(60,40,20,0.35)",
} as const;

/** A warm paper page: fibres, grain and a soft vignette. */
export const PaperTexture: React.FC<{ color?: string; seed?: number }> = ({ color = PAPER.page, seed = 7 }) => (
  <AbsoluteFill style={{ backgroundColor: color }}>
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", opacity: 0.55 }}>
      <filter id={`fibres-${seed}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves={3} seed={seed} />
        <feColorMatrix type="matrix" values="0 0 0 0 0.55  0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0.35 0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#fibres-${seed})`} />
    </svg>
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", opacity: 0.35 }}>
      <filter id={`grain-${seed}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed + 1} />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
    </svg>
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(70,45,20,0.28) 100%)" }} />
  </AbsoluteFill>
);

/** Torn-edge polygon for a cut-out strip, deterministic per seed. */
const tornEdge = (seed: string, jitter = 1.2, steps = 14) => {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) pts.push(`${(i / steps) * 100}% ${random(`${seed}-t${i}`) * jitter}%`);
  for (let i = 0; i <= steps; i++) pts.push(`${100 - random(`${seed}-r${i}`) * jitter * 0.6}% ${(i / steps) * 100}%`);
  for (let i = steps; i >= 0; i--) pts.push(`${(i / steps) * 100}% ${100 - random(`${seed}-b${i}`) * jitter}%`);
  for (let i = steps; i >= 0; i--) pts.push(`${random(`${seed}-l${i}`) * jitter * 0.6}% ${(i / steps) * 100}%`);
  return `polygon(${pts.join(",")})`;
};

/**
 * A paper strip that pops in and out like stop motion (positions held on twos).
 * `inAt`/`outAt` are frames relative to the parent sequence.
 */
export const CutoutStrip: React.FC<{
  seed: string;
  inAt: number;
  outAt: number;
  tilt?: number;
  color?: string;
  padding?: string;
  children: React.ReactNode;
}> = ({ seed, inAt, outAt, tilt = -1.5, color = PAPER.strip, padding = "0.55em 0.9em", children }) => {
  const frame = onTwos(useCurrentFrame());
  const enter = interpolate(frame, [inAt, inAt + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(frame, [outAt - 6, outAt], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // A little overshoot on the way in, like a hand placing the paper.
  const settle = enter < 1 ? Math.sin(enter * Math.PI) * 0.06 : 0;
  // Pulled away up and off, the way a hand removes a paper cut-out; no cross-fade.
  const y = interpolate(enter, [0, 1], [70, 0]) + interpolate(exit, [0, 1], [0, -420], { easing: (t) => t * t });
  const rot = tilt + interpolate(enter, [0, 1], [-7, 0]) + interpolate(exit, [0, 1], [0, 9]) + (random(`${seed}-${frame}`) - 0.5) * 0.4;
  const opacity = Math.min(enter * 3, exit > 0.8 ? (1 - exit) * 5 : 1);
  return (
    <div
      style={{
        transform: `translateY(${y}px) rotate(${rot}deg) scale(${1 + settle})`,
        opacity,
        filter: `drop-shadow(0 10px 14px ${PAPER.shadow})`,
      }}
    >
      <div style={{ backgroundColor: color, clipPath: tornEdge(seed), padding }}>{children}</div>
    </div>
  );
};

/** SVG filter that roughens ink edges; the seed changes on twos so the edge "boils". */
export const InkFilter: React.FC<{ id: string; strength: number; seed: number }> = ({ id, strength, seed }) => (
  <svg width="0" height="0" style={{ position: "absolute" }}>
    <filter id={id} x="-5%" y="-20%" width="110%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={strength} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

/**
 * Text that soaks in like ink: characters arrive one after another, blurred and
 * spreading, then firm up; edges stay slightly rough and boil on twos.
 * `emphasis` words get the accent colour and a hand-drawn underline.
 */
export const InkText: React.FC<{
  id: string;
  text: string;
  startAt: number;
  charFrames?: number;
  emphasis?: string[];
  color?: string;
  accent?: string;
  style?: React.CSSProperties;
}> = ({ id, text, startAt, charFrames = 1, emphasis = [], color = PAPER.ink, accent = PAPER.accent, style }) => {
  const raw = useCurrentFrame();
  const frame = onTwos(raw);
  const lines = text.split("\n");
  const total = text.replace(/\n/g, "").length;
  const settled = interpolate(frame, [startAt, startAt + total * charFrames + 14], [9, 1.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const seed = Math.floor(raw / 2) % 4;
  const isEmph = (w: string) => emphasis.some((e) => w.replace(/[^\p{L}']/gu, "").toLowerCase() === e.toLowerCase());
  let charIndex = 0;

  return (
    <div style={{ position: "relative", color, ...style }}>
      <InkFilter id={`ink-${id}`} strength={settled} seed={seed} />
      <div style={{ filter: `url(#ink-${id})` }}>
        {lines.map((line, li) => (
          <div key={li}>
            {line.split(/(\s+)/).map((word, wi) => {
              if (/^\s+$/.test(word)) {
                charIndex += word.length;
                return <span key={wi}>{word}</span>;
              }
              const emph = isEmph(word);
              const wordStart = charIndex;
              const chars = [...word].map((ch, ci) => {
                const at = startAt + (wordStart + ci) * charFrames;
                const p = interpolate(frame, [at, at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                return (
                  <span
                    key={ci}
                    style={{
                      display: "inline-block",
                      opacity: p,
                      filter: `blur(${(1 - p) * 6}px)`,
                      transform: `scale(${1 + (1 - p) * 0.18})`,
                    }}
                  >
                    {ch}
                  </span>
                );
              });
              charIndex += word.length;
              const wordEnd = startAt + charIndex * charFrames;
              return (
                <span key={wi} style={{ position: "relative", display: "inline-block", color: emph ? accent : undefined }}>
                  {chars}
                  {emph ? <HandUnderline id={`${id}-${wi}`} startAt={wordEnd + 6} color={accent} /> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/** A hand-drawn underline that draws itself, wobbling slightly on twos. */
export const HandUnderline: React.FC<{ id: string; startAt: number; color?: string }> = ({ id, startAt, color = PAPER.accent }) => {
  const raw = useCurrentFrame();
  const frame = onTwos(raw);
  const p = interpolate(frame, [startAt, startAt + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const j = (k: string) => (random(`${id}-${k}-${Math.floor(raw / 2) % 3}`) - 0.5) * 3;
  const d = `M 2 ${12 + j("a")} C 30 ${6 + j("b")}, 70 ${16 + j("c")}, 98 ${8 + j("d")}`;
  if (p <= 0) return null;
  const { strokeDasharray, strokeDashoffset } = evolvePath(p, d);
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" style={{ position: "absolute", left: "-3%", width: "106%", bottom: "-0.15em", height: "0.2em", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={5.5} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
    </svg>
  );
};
