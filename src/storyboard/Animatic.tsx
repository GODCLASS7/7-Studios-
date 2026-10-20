import { AbsoluteFill, CalculateMetadataFunction, interpolate, Series, useCurrentFrame, useVideoConfig } from "remotion";
import { video } from "../lib/formats";
import { font } from "../lib/tokens";
import { PanelArt } from "./PanelArt";
import { ASPECT, Camera, Panel, startTimes, Storyboard, timecode, totalSeconds } from "./schema";

// The storyboard played back in real time with simulated camera moves:
// a timing preview to approve before anything expensive is built or generated.

export const calcAnimatic: CalculateMetadataFunction<Storyboard> = ({ props }) => {
  const size = video[props.format];
  return {
    width: size.width,
    height: size.height,
    fps: props.fps,
    durationInFrames: Math.max(1, Math.round(totalSeconds(props.panels) * props.fps)),
  };
};

const move = (camera: Camera, t: number): string => {
  switch (camera) {
    case "push-in":
      return `scale(${interpolate(t, [0, 1], [1, 1.18])})`;
    case "pull-out":
      return `scale(${interpolate(t, [0, 1], [1.18, 1])})`;
    case "pan-left":
      return `scale(1.15) translateX(${interpolate(t, [0, 1], [-5, 5])}%)`;
    case "pan-right":
      return `scale(1.15) translateX(${interpolate(t, [0, 1], [5, -5])}%)`;
    case "tilt-up":
    case "crane-up":
      return `scale(1.15) translateY(${interpolate(t, [0, 1], [-5, 5])}%)`;
    case "tilt-down":
      return `scale(1.15) translateY(${interpolate(t, [0, 1], [5, -5])}%)`;
    case "orbit":
      return `scale(1.1) perspective(1200px) rotateY(${interpolate(t, [0, 1], [-6, 6])}deg)`;
    case "handheld":
      return `scale(1.05) translate(${Math.sin(t * 23) * 0.6}%, ${Math.cos(t * 17) * 0.5}%)`;
    default:
      return "none";
  }
};

const AnimaticPanel: React.FC<{ panel: Panel; aspect: number; start: number }> = ({ panel, aspect, start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.max(1, Math.round(panel.seconds * fps));
  const t = interpolate(frame, [0, dur], [0, 1], { extrapolateRight: "clamp" });
  const { height } = useVideoConfig();
  const u = height / 1080;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: move(panel.camera ?? "static", t) }}>
        <PanelArt panel={panel} aspect={aspect} showCamera={false} showTags={false} />
      </AbsoluteFill>
      {panel.onScreenText ? (
        <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 70 * u }}>
          <div style={{ fontFamily: font.display, fontWeight: 900, fontSize: 54 * u, color: "#1C1C1F", backgroundColor: "rgba(247,245,240,0.85)", padding: `${8 * u}px ${24 * u}px`, borderRadius: 8 * u }}>
            “{panel.onScreenText}”
          </div>
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 24 * u,
            backgroundColor: "rgba(20,20,24,0.88)",
            color: "#F4EFE6",
            fontFamily: font.body,
            fontSize: 28 * u,
            padding: `${18 * u}px ${32 * u}px`,
          }}
        >
          <span style={{ fontWeight: 800 }}>
            {panel.id} · {panel.title}
          </span>
          <span style={{ opacity: 0.8, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{panel.action}</span>
          <span style={{ fontWeight: 700, color: "#E8B44A" }}>{timecode(start + frame / fps)}</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const StoryboardAnimatic: React.FC<Storyboard> = (sb) => {
  const starts = startTimes(sb.panels);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {sb.panels.map((p, i) => (
          <Series.Sequence key={p.id} durationInFrames={Math.max(1, Math.round(p.seconds * sb.fps))}>
            <AnimaticPanel panel={p} aspect={ASPECT[sb.format]} start={starts[i]} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
