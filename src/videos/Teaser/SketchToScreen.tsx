import { AbsoluteFill, Freeze, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, ease, font, springs } from "../../lib";
import { PanelArt } from "../../storyboard/PanelArt";
import type { Panel } from "../../storyboard/schema";
import { DemoTitle } from "../Demo/DemoTitle";
import { EVENTS, f } from "./beats";

// Scene 3: the storyboard sketch of the title gets stamped APPROVED on the beat,
// then wipes to the actual rendered frame. The studio's pipeline in five seconds.

const sketch: Panel = {
  id: "2",
  title: "Title slam",
  seconds: 3,
  action: "",
  draw: [
    { type: "text", x: 50, y: 42, text: "DESIGN AT THE", size: 10 },
    { type: "text", x: 50, y: 56, text: "SPEED OF THOUGHT", size: 10 },
    { type: "rect", x: 34, y: 66, w: 32, h: 1.5, fill: "#2B2B30" },
    { type: "text", x: 18, y: 84, text: "gold rule", size: 5, weight: 600 },
    { type: "arrow", x1: 24, y1: 79, x2: 33, y2: 69 },
  ],
};

const Stamp: React.FC<{ text: string; tone: string; scale: number; opacity: number; u: number }> = ({ text, tone, scale, opacity, u }) => (
  <div
    style={{
      position: "absolute",
      top: -26 * u,
      right: -20 * u,
      transform: `rotate(-8deg) scale(${scale})`,
      opacity,
      border: `${6 * u}px solid ${tone}`,
      color: tone,
      backgroundColor: "rgba(11,11,13,0.85)",
      fontFamily: font.display,
      fontWeight: 900,
      fontSize: 40 * u,
      letterSpacing: "0.14em",
      padding: `${10 * u}px ${24 * u}px`,
      borderRadius: 10 * u,
    }}
  >
    {text}
  </div>
);

export const SketchToScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;

  const boxW = portrait ? width * 0.86 : width * 0.6;
  const boxH = (boxW * 9) / 16;
  const enter = spring({ frame, fps, config: springs.smooth });
  const pan = interpolate(frame, [0, durationInFrames], [24, -24], { easing: ease.inOut }) * u;

  const stampAt = f(EVENTS.stamp);
  const approved = frame >= stampAt;
  const stampPop = approved ? spring({ frame: frame - stampAt, fps, config: springs.punch }) : 0;
  const pendingIn = interpolate(frame, [0.4 * fps, 0.7 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const [w0, w1] = EVENTS.wipe;
  const wipe = interpolate(frame, [f(w0), f(w1)], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.inOut });
  const stampOut = interpolate(frame, [f(w1), f(w1) + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badge = spring({ frame: frame - f(w1), fps, config: springs.snappy });

  const steps = [
    { label: "Storyboard", at: 0.2 },
    { label: "Approval", at: EVENTS.stamp },
    { label: "4K", at: w1 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color.bg,
        backgroundImage: `linear-gradient(${color.line}55 1px, transparent 1px), linear-gradient(90deg, ${color.line}55 1px, transparent 1px)`,
        backgroundSize: `${60 * u}px ${60 * u}px`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ transform: `translateX(${pan}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 56 * u }}>
        <div
          style={{
            position: "relative",
            width: boxW,
            height: boxH,
            transform: `scale(${interpolate(enter, [0, 1], [0.94, 1])})`,
            opacity: enter,
          }}
        >
          <div style={{ position: "absolute", inset: 0, borderRadius: 14 * u, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>
            <PanelArt panel={sketch} aspect={16 / 9} showCamera={false} showTags={false} />
            <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - wipe}% 0 0)` }}>
              <div style={{ width: 1920, height: 1080, transform: `scale(${boxW / 1920})`, transformOrigin: "top left" }}>
                <Freeze frame={75}>
                  <DemoTitle line="Design at the speed of thought" orientation="landscape" />
                </Freeze>
              </div>
            </div>
            {wipe > 0 && wipe < 100 ? (
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${wipe}%`, width: 4 * u, backgroundColor: color.accent, boxShadow: `0 0 ${30 * u}px ${color.accent}` }} />
            ) : null}
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: stampOut }}>
            {approved ? (
              <Stamp text="APPROVED" tone="#2FBF85" scale={interpolate(stampPop, [0, 1], [1.7, 1])} opacity={Math.min(1, stampPop * 2)} u={u} />
            ) : (
              <Stamp text="FOR APPROVAL" tone="#E8692E" scale={1} opacity={pendingIn} u={u} />
            )}
          </div>
          <div
            style={{
              position: "absolute",
              right: 18 * u,
              bottom: 18 * u,
              transform: `scale(${badge})`,
              backgroundColor: color.accent,
              color: color.bg,
              fontFamily: font.body,
              fontWeight: 800,
              fontSize: 26 * u,
              padding: `${8 * u}px ${18 * u}px`,
              borderRadius: 999,
            }}
          >
            3840 × 2160 · 4K
          </div>
        </div>
        <div style={{ display: "flex", gap: 28 * u, alignItems: "center", fontFamily: font.display, fontWeight: 800, fontSize: (portrait ? 58 : 54) * u }}>
          {steps.map((s, i) => {
            const on = interpolate(frame, [f(s.at), f(s.at) + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 28 * u }}>
                {i > 0 ? <span style={{ color: color.muted, opacity: 0.3 + on * 0.7 }}>→</span> : null}
                <span style={{ color: i === steps.length - 1 && on > 0.5 ? color.accent : color.text, opacity: 0.25 + on * 0.75 }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
