import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { font } from "../lib";

// The 7 Studios logo sting: the tile and ring draw, the 7 draws itself, a light sweeps
// across, the wordmark rises letter by letter and the motto arrives. White and gold
// (or gold on black with theme "dark"). The app opens with the same motion.

export const logoIntroSchema = z.object({
  wordmark: z.string().default("7 Studios"),
  motto: z
    .array(z.string())
    .default(["Making", "dreams,", "creating", "realities."]),
  theme: z.enum(["light", "dark"]).default("light"),
  seconds: z.number().min(3).max(10).default(5),
});
export type LogoIntroProps = z.infer<typeof logoIntroSchema>;

export const calcLogoIntro: CalculateMetadataFunction<LogoIntroProps> = ({
  props,
}) => ({ durationInFrames: Math.round(props.seconds * 30), fps: 30 });

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
const out = Easing.bezier(0.22, 1, 0.36, 1);
const GOLD = ["#F8E3A2", "#E8B44A", "#B98722"];

export const LogoIntro: React.FC<LogoIntroProps> = ({
  wordmark,
  motto,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const dark = theme === "dark";
  const t = (s: number) => s * fps;
  const draw = (from: number, to: number) =>
    interpolate(frame, [t(from), t(to)], [1, 0], { ...clamp, easing: out });
  const markIn = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 120, mass: 0.8 },
  });
  const glow = spring({ frame, fps, config: { damping: 200 }, durationInFrames: t(1.4) });
  const shine = interpolate(frame, [t(1.25), t(2.4)], [-160, 260], {
    ...clamp,
    easing: out,
  });
  const exit = interpolate(
    frame,
    [durationInFrames - t(0.5), durationInFrames],
    [0, 1],
    clamp,
  );
  const goldFlow = (frame / fps) * 40;
  const goldText: React.CSSProperties = {
    backgroundImage: dark
      ? `linear-gradient(100deg, #b98722 0%, #e7b54b 30%, #f6d98a 50%, #e1ab3f 70%, #a87a1c 100%)`
      : `linear-gradient(100deg, #8f6514 0%, #c18b25 30%, #dfa83c 50%, #c18b25 70%, #8f6514 100%)`,
    backgroundSize: "200% 100%",
    backgroundPosition: `${-goldFlow}% 0`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
  return (
    <AbsoluteFill
      style={{
        background: dark
          ? "radial-gradient(circle at 50% 46%, #1b160e 0%, #0b0a08 70%)"
          : "radial-gradient(circle at 50% 46%, #fffdf7 0%, #fbf6ea 55%, #f5ecd6 100%)",
        opacity: 1 - exit,
      }}
    >
      <AbsoluteFill
        style={{
          background: `repeating-conic-gradient(from ${frame * 0.25}deg, rgba(214,163,59,${dark ? 0.12 : 0.09}) 0deg 4deg, transparent 4deg 16deg)`,
          maskImage: "radial-gradient(circle, #000 14%, transparent 52%)",
          WebkitMaskImage: "radial-gradient(circle, #000 14%, transparent 52%)",
          opacity: interpolate(frame, [t(0.3), t(1.4)], [0, 1], clamp),
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: 700 * u,
            height: 700 * u,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(240,199,102,${dark ? 0.35 : 0.55}), transparent 62%)`,
            transform: `scale(${0.3 + glow * 0.7 + Math.sin(frame / 20) * 0.03})`,
            opacity: glow,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 26 * u,
            transform: `scale(${1 + exit * 0.05})`,
          }}
        >
          <svg
            width={230 * u}
            height={230 * u}
            viewBox="0 0 512 512"
            style={{
              transform: `scale(${0.6 + markIn * 0.4}) rotate(${(1 - markIn) * -12}deg)`,
              opacity: Math.min(1, markIn * 1.5),
              filter: `drop-shadow(0 ${18 * u}px ${30 * u}px rgba(150,105,20,0.35))`,
            }}
          >
            <defs>
              <linearGradient id="li-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={GOLD[0]} />
                <stop offset="0.45" stopColor={GOLD[1]} />
                <stop offset="1" stopColor={GOLD[2]} />
              </linearGradient>
              <clipPath id="li-c">
                <rect x="20" y="20" width="472" height="472" rx="112" />
              </clipPath>
            </defs>
            <rect
              x="20"
              y="20"
              width="472"
              height="472"
              rx="112"
              fill={dark ? "#14110b" : "#FFFFFF"}
            />
            <rect
              x="34"
              y="34"
              width="444"
              height="444"
              rx="100"
              fill="none"
              stroke="url(#li-g)"
              strokeWidth="8"
              strokeDasharray={1800}
              strokeDashoffset={1800 * draw(0.15, 1.35)}
            />
            <path
              d="M150 150 H362 L246 372"
              fill="none"
              stroke="url(#li-g)"
              strokeWidth="54"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={700}
              strokeDashoffset={700 * draw(0.55, 1.45)}
            />
            <path
              d="M196 262 H316"
              stroke="url(#li-g)"
              strokeWidth="30"
              strokeLinecap="round"
              strokeDasharray={200}
              strokeDashoffset={200 * draw(1.05, 1.55)}
            />
            <g clipPath="url(#li-c)">
              <rect
                x="0"
                y="-40"
                width="110"
                height="600"
                fill="#FFFFFF"
                opacity={dark ? 0.25 : 0.65}
                transform={`translate(${(shine / 100) * 512} 0) skewX(-20)`}
              />
            </g>
          </svg>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 124 * u,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              color: dark ? "#F7F1E3" : "#17130D",
              display: "flex",
            }}
          >
            {wordmark.split("").map((c, i) => {
              const p = spring({
                frame: frame - t(0.85) - i * 1.7,
                fps,
                config: { damping: 200 },
                durationInFrames: t(0.9),
              });
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    transform: `translateY(${(1 - p) * 60}%)`,
                    opacity: p,
                    filter: `blur(${(1 - p) * 8 * u}px)`,
                    fontVariationSettings: `"wght" ${Math.round(200 + p * 260)}, "opsz" 144`,
                    whiteSpace: "pre",
                  }}
                >
                  {c === " " ? "\u00a0\u00a0" : c}
                </span>
              );
            })}
          </div>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 40 * u,
              color: dark ? "#d9cfbd" : "#453D32",
              display: "flex",
              gap: `0 ${10 * u}px`,
              fontVariationSettings: `"opsz" 72`,
            }}
          >
            {motto.map((w, i) => {
              const p = spring({
                frame: frame - t(1.45) - i * t(0.16),
                fps,
                config: { damping: 200 },
                durationInFrames: t(0.8),
              });
              const golden = i % 2 === 1;
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    opacity: p,
                    transform: `translateY(${(1 - p) * 10 * u}px)`,
                    filter: `blur(${(1 - p) * 6 * u}px)`,
                    letterSpacing: `${(1 - p) * 0.2}em`,
                    fontStyle: golden ? "italic" : "normal",
                    ...(golden ? goldText : {}),
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
          <div
            style={{
              width: 340 * u,
              height: 3 * u,
              borderRadius: 3 * u,
              background: "rgba(214,163,59,0.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "100%",
                transformOrigin: "left",
                transform: `scaleX(${interpolate(frame, [t(0.2), t(2.8)], [0, 1], { ...clamp, easing: out })})`,
                background: `linear-gradient(90deg, ${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]})`,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const logoIntroDefaults: LogoIntroProps = {
  wordmark: "7 Studios",
  motto: ["Making", "dreams,", "creating", "realities."],
  theme: "light",
  seconds: 5,
};
