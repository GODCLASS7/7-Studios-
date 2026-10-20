import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { color, ease, font } from "../../lib";
import { EVENTS, f } from "./beats";

// Scene 1: a dark studio of floating screens; a warm beam sweeps across and
// lights each screen as it passes; everything pulses on the first kick.

type Screen = { x: number; y: number; w: number; h: number; seed: number };

const landscapeScreens: Screen[] = [
  { x: 0.08, y: 0.18, w: 0.24, h: 0.24, seed: 1 },
  { x: 0.38, y: 0.12, w: 0.24, h: 0.24, seed: 2 },
  { x: 0.68, y: 0.18, w: 0.24, h: 0.24, seed: 3 },
  { x: 0.2, y: 0.5, w: 0.24, h: 0.24, seed: 4 },
  { x: 0.56, y: 0.5, w: 0.24, h: 0.24, seed: 5 },
];
const portraitScreens: Screen[] = [
  { x: 0.08, y: 0.14, w: 0.4, h: 0.13, seed: 1 },
  { x: 0.52, y: 0.2, w: 0.4, h: 0.13, seed: 2 },
  { x: 0.08, y: 0.36, w: 0.4, h: 0.13, seed: 3 },
  { x: 0.52, y: 0.42, w: 0.4, h: 0.13, seed: 4 },
  { x: 0.3, y: 0.58, w: 0.4, h: 0.13, seed: 5 },
];

const ScreenUI: React.FC<{ seed: number; glow: number }> = ({ seed, glow }) => {
  const bars = [0.7, 0.45, 0.85, 0.55].map((v, i) => ((v + seed * 0.13 + i * 0.07) % 0.6) + 0.3);
  return (
    <div style={{ position: "absolute", inset: "12%", display: "flex", flexDirection: "column", gap: "9%" }}>
      <div style={{ height: "12%", width: "45%", borderRadius: 6, backgroundColor: seed % 2 ? color.accent : color.text, opacity: 0.25 + glow * 0.6 }} />
      {seed % 2 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: "6%" }}>
          {bars.map((b, i) => (
            <div key={i} style={{ flex: 1, height: `${b * 100}%`, borderRadius: 4, backgroundColor: color.muted, opacity: 0.2 + glow * 0.5 }} />
          ))}
        </div>
      ) : (
        [0.9, 0.75, 0.6].map((w, i) => (
          <div key={i} style={{ height: "8%", width: `${w * 100}%`, borderRadius: 4, backgroundColor: color.muted, opacity: 0.15 + glow * 0.45 }} />
        ))
      )}
    </div>
  );
};

export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const portrait = height > width;
  const screens = portrait ? portraitScreens : landscapeScreens;
  const u = Math.min(width, height) / 1080;

  const beamX = interpolate(frame, [0.3 * fps, 3.3 * fps], [-0.35 * width, 1.35 * width], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease.inOut,
  });
  const kick = f(EVENTS.firstKick);
  const pulse = frame >= kick ? Math.exp(-(frame - kick) / 5) : 0;
  const push = interpolate(frame, [0, durationInFrames], [1, 1.1], { easing: ease.inOut });
  const textIn = interpolate(frame, [1.2 * fps, 1.8 * fps, 3.3 * fps, 3.5 * fps], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeIn = interpolate(frame, [0, 0.6 * fps], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#050506", opacity: fadeIn }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {screens.map((s, i) => {
          const cx = (s.x + s.w / 2) * width;
          const glow = Math.exp(-Math.pow((cx - beamX) / (0.22 * width), 2));
          const lit = Math.min(1, glow + pulse);
          const bob = Math.sin((frame / fps) * 0.9 + i * 1.7) * 8 * u;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: s.x * width,
                top: s.y * height + bob,
                width: s.w * width,
                height: s.h * height,
                borderRadius: 18 * u,
                backgroundColor: color.surface,
                border: `${2 * u}px solid ${pulse > 0.05 ? color.accent : color.line}`,
                boxShadow: `0 0 ${80 * u * lit}px rgba(232,180,74,${0.35 * lit})`,
                filter: `brightness(${0.55 + lit * 0.8})`,
                overflow: "hidden",
              }}
            >
              <ScreenUI seed={s.seed} glow={lit} />
            </div>
          );
        })}
        {/* The light beam. */}
        <AbsoluteFill
          style={{
            mixBlendMode: "screen",
            background: `linear-gradient(100deg, transparent ${(beamX / width) * 100 - 18}%, rgba(255,196,110,0.22) ${(beamX / width) * 100}%, transparent ${(beamX / width) * 100 + 18}%)`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: (portrait ? 330 : 120) * u }}>
        <div
          style={{
            fontFamily: font.body,
            fontWeight: 600,
            fontSize: (portrait ? 34 : 36) * u,
            letterSpacing: "0.32em",
            color: color.muted,
            opacity: textIn,
            textAlign: "center",
            padding: `0 ${60 * u}px`,
          }}
        >
          A DESIGN STUDIO THAT RUNS ON CLAUDE
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: color.accent, opacity: pulse * 0.12, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};
