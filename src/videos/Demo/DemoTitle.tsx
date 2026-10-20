import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, ease, Grade, Grain, KineticTitle, type } from "../../lib";

// "Title slam" scene. Used on its own (style frame / demo) and inside the teaser,
// where `landOn` locks each word to the beat grid.
export const DemoTitle: React.FC<{
  line: string;
  landOn?: number[];
  orientation?: "landscape" | "portrait";
}> = ({ line, landOn, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = (orientation ?? (height > width ? "portrait" : "landscape")) === "portrait";
  const ruleStart = landOn ? landOn[landOn.length - 1] + 3 : 1.2 * fps;
  const rule = interpolate(frame, [ruleStart, ruleStart + 0.7 * fps], [0, 1], {
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
          padding: portrait ? "0 70px" : "0 160px",
        }}
      >
        {/* Width chosen so the line breaks into balanced lines with no orphan word. */}
        <div style={{ maxWidth: portrait ? 900 : 1300 }}>
          <KineticTitle
            text={line}
            startFrame={4}
            staggerFrames={5}
            landOn={landOn}
            size={portrait ? 104 : type.hero}
            feel="snappy"
            highlight={{ word: 3, color: color.accent }}
          />
        </div>
        <div style={{ marginTop: 48, height: 8, width: (portrait ? 620 : 615) * rule, backgroundColor: color.accent, borderRadius: 4 }} />
      </AbsoluteFill>
      <Grain opacity={0.07} />
    </Grade>
  );
};
