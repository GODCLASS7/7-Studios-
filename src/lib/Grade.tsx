import { AbsoluteFill } from "remotion";

// Look presets applied to a whole scene: a CSS filter for tone plus an
// optional vignette. For a true LUT grade, render a master and apply the
// .cube with ffmpeg (see the finishing skill).
export const LOOKS = {
  neutral: "none",
  warm: "contrast(1.06) saturate(1.08) sepia(0.12) brightness(1.02)",
  cool: "contrast(1.05) saturate(0.95) hue-rotate(-8deg) brightness(1.01)",
  punchy: "contrast(1.15) saturate(1.2)",
  film: "contrast(1.08) saturate(0.88) sepia(0.08) brightness(0.98)",
  noir: "grayscale(1) contrast(1.25) brightness(0.95)",
  faded: "contrast(0.9) saturate(0.85) brightness(1.06)",
  // Worship / atmosphere: warm, soft contrast, lifted shadows (one house look for a whole series).
  worship: "contrast(0.94) saturate(0.92) sepia(0.16) brightness(1.03)",
  // Food: warm and appetising, rich reds and browns.
  food: "contrast(1.1) saturate(1.22) sepia(0.08) brightness(1.02)",
} as const;

export type Look = keyof typeof LOOKS;

export const Grade: React.FC<{
  look?: Look;
  vignette?: number;
  children: React.ReactNode;
}> = ({ look = "neutral", vignette = 0, children }) => {
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: LOOKS[look] }}>{children}</AbsoluteFill>
      {vignette > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${vignette}) 100%)`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
