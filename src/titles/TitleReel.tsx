import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
} from "remotion";
import { z } from "zod";
import { BrandProvider, color } from "../lib";
import { TitleFX, titleSchema, TITLE_STYLES } from "./TitleFX";

// Titles on their own: over a colour, an image or a video, or on transparency
// ("transparent") to drop onto footage in another editor. Render transparent
// titles with the webm-alpha (web, CapCut) or alpha (ProRes 4444, Premiere,
// Resolve, Final Cut) preset. Each title is timed by its own from/durationInFrames.

export const titleReelSchema = z.object({
  durationInFrames: z.number(),
  fps: z.number().default(30),
  background: z.object({
    kind: z.enum(["transparent", "color", "image", "video"]),
    color: z.string().default(color.bg),
    src: z.string().nullable().default(null),
  }),
  titles: z.array(titleSchema),
  brand: z
    .object({
      name: z.string(),
      accent: z.string(),
      punch: z.string(),
      text: z.string(),
      background: z.string(),
      displayFont: z.string(),
      serifFont: z.string(),
      fonts: z.array(
        z.object({
          family: z.string(),
          src: z.string(),
          weight: z.string().optional(),
          style: z.string().optional(),
        }),
      ),
      logo: z.string().nullable(),
      wordmark: z.string(),
      endCard: z
        .object({ seconds: z.number(), line: z.string(), sub: z.string() })
        .nullable(),
    })
    .nullable()
    .default(null),
});
export type TitleReelProps = z.infer<typeof titleReelSchema>;

export const calcTitleReel: CalculateMetadataFunction<TitleReelProps> = ({
  props,
}) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
});

export const TitleReel: React.FC<TitleReelProps> = (p) => {
  const bg = p.background;
  return (
    <BrandProvider brand={p.brand}>
      <AbsoluteFill
        style={{
          backgroundColor: bg.kind === "transparent" ? undefined : bg.color,
        }}
      >
        {bg.kind === "color" ? (
          <AbsoluteFill
            style={{
              background: `radial-gradient(ellipse at 50% 35%, rgba(255,255,255,0.08), rgba(0,0,0,0) 60%)`,
            }}
          />
        ) : null}
        {bg.kind === "image" && bg.src ? (
          <Img
            src={staticFile(bg.src)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        {bg.kind === "video" && bg.src ? (
          <OffthreadVideo
            src={staticFile(bg.src)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        {p.titles.map((t, i) => (
          <Sequence
            key={i}
            from={t.from}
            durationInFrames={t.durationInFrames}
            layout="none"
          >
            <TitleFX t={t} id={`reel-${i}`} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </BrandProvider>
  );
};

// The showcase: every style for 2 s, so the compositions open on something useful.
const SAMPLE: Record<
  (typeof TITLE_STYLES)[number],
  { text: string; sub?: string }
> = {
  cutout: { text: "Magazine" },
  editorial: { text: "Monday *mood*", sub: "Issue 07" },
  inflate: { text: "Pynk" },
  neon: { text: "Bread & Butter", sub: "Open late" },
  extrude: { text: "New York" },
  poster: { text: "Motion|Design|Week", sub: "21–27 October · Accra" },
  outline: { text: "Waiting" },
  tag: { text: "Studio B", sub: "Recording" },
};
export const titleReelDefaults: TitleReelProps = {
  durationInFrames: TITLE_STYLES.length * 60,
  fps: 30,
  background: { kind: "color", color: "#141218", src: null },
  brand: null,
  titles: TITLE_STYLES.map((style, i) => ({
    style,
    text: SAMPLE[style].text,
    sub: SAMPLE[style].sub ?? null,
    from: i * 60,
    durationInFrames: 60,
    x: 0.5,
    y: 0.45,
    size: 1,
    rotate: 0,
    color: null,
    accent: null,
    pin: null,
    layer: "front" as const,
  })),
};
