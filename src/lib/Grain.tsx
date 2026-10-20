import { AbsoluteFill, useCurrentFrame } from "remotion";

// Animated film grain. Breaks up gradient banding in 4K encodes and adds a
// photographic texture. The seed changes per frame, so it is deterministic.
export const Grain: React.FC<{
  opacity?: number;
  scale?: number;
  animated?: boolean;
}> = ({ opacity = 0.06, scale = 0.9, animated = true }) => {
  const frame = useCurrentFrame();
  const seed = animated ? frame % 64 : 0;
  const id = `grain-${seed}`;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency={scale} numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};
