import { AbsoluteFill, Audio, Series, staticFile } from "remotion";
import { Grade, Grain } from "../../lib";
import { DemoTitle } from "../Demo/DemoTitle";
import { AUDIO, EVENTS, f, SCENES } from "./beats";
import { ColdOpen } from "./ColdOpen";
import { EndCard } from "./EndCard";
import { Formats } from "./Formats";
import { SketchToScreen } from "./SketchToScreen";

// The demo job's launch teaser. "full" is the 20 s 16:9 piece; "cutdown" is the
// 16 s 9:16 version that starts on the title (audio trimmed to stay on the beat).
export const Teaser: React.FC<{ variant: "full" | "cutdown" }> = ({ variant }) => {
  const full = variant === "full";
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Grade look="film" vignette={0.3}>
        <Series>
          {full ? (
            <Series.Sequence durationInFrames={f(SCENES.coldOpen)}>
              <ColdOpen />
            </Series.Sequence>
          ) : null}
          <Series.Sequence durationInFrames={f(SCENES.title)}>
            <DemoTitle line="Design at the speed of thought" landOn={EVENTS.wordLandings.map(f)} />
          </Series.Sequence>
          <Series.Sequence durationInFrames={f(SCENES.sketch)}>
            <SketchToScreen />
          </Series.Sequence>
          <Series.Sequence durationInFrames={f(SCENES.formats)}>
            <Formats />
          </Series.Sequence>
          <Series.Sequence durationInFrames={f(SCENES.end)}>
            <EndCard />
          </Series.Sequence>
        </Series>
      </Grade>
      <Grain opacity={0.05} />
      <Audio src={staticFile(AUDIO)} trimBefore={full ? 0 : f(SCENES.coldOpen)} />
    </AbsoluteFill>
  );
};
