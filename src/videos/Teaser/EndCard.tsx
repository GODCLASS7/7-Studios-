import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, ease, font, springs } from "../../lib";

// Scene 5: the wordmark punches in on the final hit, the gold rule draws,
// the CTA arrives, and the piece fades to black.
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;

  const hit = spring({ frame, fps, config: springs.snappy });
  const pull = interpolate(frame, [0, durationInFrames], [1.08, 1], { easing: ease.out });
  const flash = interpolate(frame, [0, 8], [0.5, 0], { extrapolateRight: "clamp" });
  const rule = interpolate(frame, [0.4 * fps, 1.0 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.inOut });
  const cta = spring({ frame: frame - Math.round(1.0 * fps), fps, config: springs.smooth });
  const sub = interpolate(frame, [1.4 * fps, 1.9 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationInFrames - 0.6 * fps, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{
          opacity: out,
          transform: `scale(${pull})`,
          background: `radial-gradient(ellipse at 50% 45%, #1F1D1A 0%, ${color.bg} 65%)`,
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontFamily: font.display,
            fontWeight: 900,
            fontSize: (portrait ? 104 : 140) * u,
            color: color.text,
            letterSpacing: `${interpolate(hit, [0, 1], [0.45, 0.06])}em`,
            transform: `scale(${interpolate(hit, [0, 1], [1.15, 1])})`,
            opacity: Math.min(1, hit * 2),
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          {portrait ? (
            <>
              MOTION
              <br />
              STUDIO
            </>
          ) : (
            "MOTION STUDIO"
          )}
        </div>
        <div style={{ height: 8 * u, width: (portrait ? 520 : 760) * u * rule, backgroundColor: color.accent, borderRadius: 4 * u, marginTop: 40 * u }} />
        <div
          style={{
            marginTop: 56 * u,
            transform: `translateY(${interpolate(cta, [0, 1], [30 * u, 0])}px)`,
            opacity: cta,
            backgroundColor: color.accent,
            color: color.bg,
            fontFamily: font.body,
            fontWeight: 800,
            fontSize: 44 * u,
            padding: `${18 * u}px ${44 * u}px`,
            borderRadius: 999,
          }}
        >
          Start your first job →
        </div>
        <div style={{ marginTop: 34 * u, opacity: sub, fontFamily: font.body, fontWeight: 600, fontSize: 28 * u, letterSpacing: "0.2em", color: color.muted, textAlign: "center", padding: `0 ${60 * u}px` }}>
          {portrait ? (
            <>
              BRIEF → STORYBOARD → 4K
              <br />
              POWERED BY CLAUDE
            </>
          ) : (
            "BRIEF → STORYBOARD → 4K · POWERED BY CLAUDE"
          )}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: color.accent, opacity: flash * out, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
