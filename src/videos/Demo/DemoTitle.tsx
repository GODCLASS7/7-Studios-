import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, ease, Grade, Grain, KineticTitle, type } from "../../lib";

// Demo scene for the sample job: the "Title slam" panel built with the design system.
export const DemoTitle: React.FC<{ line: string }> = ({ line }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const rule = interpolate(frame, [1.2 * fps, 2 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease.inOut,
  });

  return (
    <Grade look="film" vignette={0.45}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 40%, #1F1D1A 0%, ${color.bg} 70%)`,
          justifyContent: "center",
          alignItems: "center",
          padding: "0 160px",
        }}
      >
        {/* Width chosen so the line breaks into two balanced lines with no orphan word. */}
        <div style={{ maxWidth: 1300 }}>
          <KineticTitle text={line} startFrame={4} staggerFrames={5} size={type.hero} feel="snappy" highlight={{ word: 3, color: color.accent }} />
        </div>
        <div style={{ marginTop: 48, height: 8, width: width * 0.32 * rule, backgroundColor: color.accent, borderRadius: 4 }} />
      </AbsoluteFill>
      <Grain opacity={0.07} />
    </Grade>
  );
};
