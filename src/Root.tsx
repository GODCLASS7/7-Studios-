import { Composition, Still } from "remotion";
import { StudioCheck } from "./videos/StudioCheck";
import { DemoTitle } from "./videos/Demo/DemoTitle";
import { calcAnimatic, StoryboardAnimatic } from "./storyboard/Animatic";
import { sampleStoryboard } from "./storyboard/sample";
import { storyboardSchema } from "./storyboard/schema";
import { calcSheet, StoryboardSheet } from "./storyboard/StoryboardSheet";

// Register each new video here: one <Composition> per video (and per format).
// Register each still graphic as a <Still>.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StudioCheck"
        component={StudioCheck}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Demo job (jobs/demo): the "Title slam" scene built with src/lib. */}
      <Composition
        id="DemoTitle"
        component={DemoTitle}
        defaultProps={{ line: "Design at the speed of thought" }}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* Studio pipeline: storyboard approval sheet + timed animatic. */}
      <Still
        id="StoryboardSheet"
        component={StoryboardSheet}
        schema={storyboardSchema}
        defaultProps={sampleStoryboard}
        calculateMetadata={calcSheet}
        width={2400}
        height={2000}
      />
      <Composition
        id="StoryboardAnimatic"
        component={StoryboardAnimatic}
        schema={storyboardSchema}
        defaultProps={sampleStoryboard}
        calculateMetadata={calcAnimatic}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
