import { interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Speed ramp (Daniel Schiffer-style): fast action that drops into slow motion and back.
// Remaps time frame by frame: `ramp` is a list of [outputSeconds, sourceSeconds]
// keyframes, e.g. [[0, 0], [0.4, 1.2], [2.4, 1.8], [3, 3]] = 3x speed, then 0.3x, then 3x.
// Each output frame shows the exact source frame (OffthreadVideo is frame-accurate),
// so ramps are smooth and deterministic. Audio is muted: put sound design on its own track.
export const SpeedRamp: React.FC<{
  src: string;
  ramp: [number, number][];
  style?: React.CSSProperties;
}> = ({ src, ramp, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const sourceSeconds = interpolate(
    t,
    ramp.map(([out]) => out),
    ramp.map(([, source]) => source),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // Shift a Sequence so the video's own frame equals the source frame we want.
  // (<Freeze> can't reach past the composition's last frame, so it can't show late source frames.)
  const target = Math.round(sourceSeconds * fps);
  return (
    <Sequence from={frame - target} layout="absolute-fill">
      <OffthreadVideo
        src={staticFile(src)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover", ...style }}
      />
    </Sequence>
  );
};
