import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { clamp01, enter, fade, feelOf, feelSchema, typefaceOf, typefaceSchema } from "../../lib/feel";
import { step4 } from "../../lib/motion";

// Your own logo, revealed once and held: one entrance, a settled position, a hold.
// The logo file is used as it is (proportions and colours untouched, never redrawn),
// and the last frame is the clean static logo, usable as a still. A transparent
// background renders as an overlay with the alpha presets.

export const logoRevealSchema = z.object({
  logo: z.string().describe("Your logo: a file under public/, SVG or a PNG with a transparent background"),
  /** Logo width as a share of the frame's shorter side. */
  size: z.number().min(0.1).max(0.9).default(0.34),
  reveal: z.enum(["mask", "fade", "scale", "rise"]).default("mask"),
  tagline: z.string().default(""),
  background: z.string().default("#FBF9F4").describe('A colour, or "transparent" for an overlay'),
  textColor: z.string().default("#17130D"),
  accent: z.string().default("#D6A33B"),
  typeface: typefaceSchema,
  seconds: z.number().min(1.5).max(8).default(3),
  feel: feelSchema,
  reducedMotion: z.boolean().default(false),
});
export type LogoRevealProps = z.infer<typeof logoRevealSchema>;

export const calcLogoReveal: CalculateMetadataFunction<LogoRevealProps> = ({ props }) => ({
  durationInFrames: Math.round(props.seconds * 30),
  fps: 30,
});

export const LogoReveal: React.FC<LogoRevealProps> = (p) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const f = feelOf(p.feel);
  const short = Math.min(width, height);
  const u = short / 1080;
  const box = short * p.size;
  const start = 0.15 * f.pace;
  const reduced = p.reducedMotion;

  // The entrance: a spring in the brand's feel (a wipe for the mask).
  const e = enter(t, start, p.feel, reduced);
  const wipeDur = 0.7 * f.pace;
  // A 4th-order step that is within 0.3% of done at 1.15 × wipeDur, then exactly done.
  const wipe = reduced ? 1 : t >= start + wipeDur * 1.15 ? 1 : step4(t - start, 10 / wipeDur);
  let opacity = clamp01(e);
  let transform = "none";
  let clip: string | undefined;
  if (!reduced && e < 1) {
    if (p.reveal === "scale") transform = `scale(${1 - (1 - e) * 0.18 * f.travel})`;
    if (p.reveal === "rise") transform = `translateY(${(1 - e) * 0.09 * box * f.travel}px)`;
  }
  if (!reduced && p.reveal === "mask") {
    opacity = 1;
    clip = wipe < 1 ? `inset(0 ${(1 - wipe) * 100}% 0 0)` : undefined;
    // A touch of settle as the wipe completes, then the logo is exactly still.
    const s = enter(t, start + wipeDur * 0.55, p.feel);
    transform = s < 1 ? `scale(${1.035 - 0.035 * s})` : "none";
  }

  // The accent line that leads the mask wipe, gone once the logo is revealed.
  const edge = !reduced && p.reveal === "mask" && wipe > 0 && wipe < 1;
  const tagStart = start + (p.reveal === "mask" ? wipeDur : 0.45 * f.pace) + 0.1;
  const tagIn = enter(t, tagStart, p.feel, reduced);

  return (
    <AbsoluteFill style={{ backgroundColor: p.background === "transparent" ? undefined : p.background }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 34 * u }}>
        <div style={{ position: "relative", width: box }}>
          <div style={{ opacity, transform, clipPath: clip, transformOrigin: "center" }}>
            <Img src={staticFile(p.logo)} style={{ width: box, height: "auto", display: "block" }} />
          </div>
          {edge ? (
            <div
              style={{
                position: "absolute",
                top: -box * 0.04,
                bottom: -box * 0.04,
                left: `${wipe * 100}%`,
                width: 4 * u,
                marginLeft: -2 * u,
                background: p.accent,
                borderRadius: 4 * u,
                opacity: 1 - fade(wipe, 0.85, 0.15),
              }}
            />
          ) : null}
        </div>
        {p.tagline ? (
          <div
            style={{
              fontFamily: typefaceOf(p.typeface),
              fontSize: 44 * u * Math.min(1.25, Math.max(0.8, width / height)),
              fontWeight: 500,
              letterSpacing: "0.01em",
              color: p.textColor,
              opacity: clamp01(tagIn),
              transform: reduced || tagIn >= 1 ? "none" : `translateY(${(1 - tagIn) * 16 * u * f.travel}px)`,
              textAlign: "center",
              maxWidth: width * 0.84,
            }}
          >
            {p.tagline}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const logoRevealDefaults: LogoRevealProps = {
  logo: "brand/7studios-mark.svg",
  size: 0.34,
  reveal: "mask",
  tagline: "Making dreams, creating realities.",
  background: "#FBF9F4",
  textColor: "#17130D",
  accent: "#D6A33B",
  typeface: "fraunces",
  seconds: 3,
  feel: "precise",
  reducedMotion: false,
};
