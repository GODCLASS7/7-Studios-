import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font, springs, type } from "./tokens";

// Word-by-word title. Each word finishes landing on its frame in `landOn`
// (e.g. beat frames from a music track); otherwise words are staggered.
export const KineticTitle: React.FC<{
  text: string;
  startFrame?: number;
  staggerFrames?: number;
  landOn?: number[];
  size?: number;
  weight?: number;
  textColor?: string;
  highlight?: { word: number; color: string };
  align?: "left" | "center" | "right";
  feel?: keyof typeof springs;
}> = ({
  text,
  startFrame = 0,
  staggerFrames = 4,
  landOn,
  size = type.h1,
  weight = 900,
  textColor = color.text,
  highlight,
  align = "center",
  feel = "smooth",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/);
  // Springs with damping 200 settle in roughly 0.6 s; start early so they land on the beat.
  const travel = Math.round(0.45 * fps);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : align === "left" ? "flex-start" : "flex-end",
        gap: `0 ${size * 0.28}px`,
        fontFamily: font.display,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.05,
        letterSpacing: "-0.01em",
        color: textColor,
        textAlign: align,
      }}
    >
      {words.map((w, i) => {
        const land = landOn?.[i] ?? startFrame + travel + i * staggerFrames;
        const p = spring({ frame: frame - (land - travel), fps, config: springs[feel] });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
              transform: `translateY(${interpolate(p, [0, 1], [size * 0.5, 0])}px)`,
              color: highlight?.word === i ? highlight.color : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};
