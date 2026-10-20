import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ease } from "./tokens";

// One shot of footage (AI-generated, stock or filmed) or a still image, fitted
// to the frame with an optional slow camera move (Ken Burns).
// `src` is a path inside public/, e.g. "jobs/acme/footage/shot-01.mp4".
export const FootageShot: React.FC<{
  src: string;
  kind?: "video" | "image";
  trimBeforeSeconds?: number;
  playbackRate?: number;
  muted?: boolean;
  move?: { fromScale?: number; toScale?: number; fromX?: number; toX?: number; fromY?: number; toY?: number };
  fit?: "cover" | "contain";
}> = ({ src, kind = "video", trimBeforeSeconds = 0, playbackRate = 1, muted = true, move, fit = "cover" }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease.inOut,
  });
  const s = interpolate(t, [0, 1], [move?.fromScale ?? 1, move?.toScale ?? 1]);
  const x = interpolate(t, [0, 1], [move?.fromX ?? 0, move?.toX ?? 0]);
  const y = interpolate(t, [0, 1], [move?.fromY ?? 0, move?.toY ?? 0]);

  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: fit,
    transform: `translate(${x}%, ${y}%) scale(${s})`,
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "black" }}>
      {kind === "image" ? (
        <Img src={staticFile(src)} style={style} />
      ) : (
        <OffthreadVideo
          src={staticFile(src)}
          trimBefore={Math.round(trimBeforeSeconds * fps)}
          playbackRate={playbackRate}
          muted={muted}
          style={style}
        />
      )}
    </AbsoluteFill>
  );
};
