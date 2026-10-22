import {
  AbsoluteFill,
  CalculateMetadataFunction,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { Insert } from "../../inserts/Inserts";

// The terminal insert on its own, full frame: for how-to reels, product intros and
// b-roll. The same line grammar as the insert in edits ("$ cmd" is typed, "> out",
// "menu: A|B|C > 2", "count: label 128400", "approve: Label", "# comment").
// Generic by design: no platform's logo or interface.

export const terminalReelSchema = z.object({
  title: z.string().default("~/studio"),
  lines: z.array(z.string()),
  seconds: z.number().min(2).max(60).default(8),
  background: z.string().default("#0B0B0D"),
  glow: z.string().default("#E8B44A"),
  credit: z.string().nullable().default(null),
});
export type TerminalReelProps = z.infer<typeof terminalReelSchema>;

export const calcTerminalReel: CalculateMetadataFunction<TerminalReelProps> = ({
  props,
}) => ({ durationInFrames: Math.round(props.seconds * 30), fps: 30 });

export const TerminalReel: React.FC<TerminalReelProps> = (p) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const portrait = height > width;
  return (
    <AbsoluteFill style={{ backgroundColor: p.background }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, ${p.glow}22, transparent 62%)`,
        }}
      />
      <Insert
        kind="terminal"
        durationInFrames={durationInFrames}
        x={0.5}
        y={0.5}
        w={portrait ? 0.88 : width === height ? 0.84 : 0.6}
        credit={p.credit}
        data={{ title: p.title, lines: p.lines }}
      />
    </AbsoluteFill>
  );
};

export const terminalReelDefaults: TerminalReelProps = {
  title: "~/7-studios",
  lines: [
    "# a website, told as one shape",
    "$ npm run site-capture -- https://example.org lumen",
    "> 9 sections, 17 components, 5 states",
    "$ npm run sitemorph -- plan lumen --loop",
    "menu: 1x1|9x16|16x9 > 2",
    "count: frames rendered 900",
    "approve: Render the final",
  ],
  seconds: 9,
  background: "#0B0B0D",
  glow: "#E8B44A",
  credit: null,
};
