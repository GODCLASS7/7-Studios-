import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// A 4-second test card that proves the studio renders. Safe to delete.
export const StudioCheck: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();

  const lineProgress = interpolate(frame, [0, 0.8 * fps], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  });
  const titleIn = spring({ frame: frame - 0.6 * fps, fps, config: { damping: 200 } });
  const subIn = spring({ frame: frame - 1.4 * fps, fps, config: { damping: 200 } });
  const out = interpolate(frame, [durationInFrames - 0.5 * fps, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  const lineWidth = width * 0.5 * lineProgress;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0B0B0D",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Helvetica, Arial, sans-serif",
        opacity: out,
      }}
    >
      <div
        style={{
          color: "#F4EFE6",
          fontSize: 140,
          fontWeight: 900,
          letterSpacing: `${interpolate(titleIn, [0, 1], [0.6, 0.08])}em`,
          opacity: titleIn,
          transform: `translateY(${interpolate(titleIn, [0, 1], [40, 0])}px)`,
        }}
      >
        MOTION STUDIO
      </div>
      <div
        style={{
          height: 6,
          width: lineWidth,
          backgroundColor: "#E8B44A",
          marginTop: 36,
          borderRadius: 3,
        }}
      />
      <div
        style={{
          color: "#9A958C",
          fontSize: 44,
          fontWeight: 600,
          letterSpacing: "0.3em",
          marginTop: 36,
          opacity: subIn,
        }}
      >
        READY TO RENDER
      </div>
    </AbsoluteFill>
  );
};
