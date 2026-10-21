import { Composition, Still } from "remotion";
import { StudioCheck } from "./videos/StudioCheck";
import { DemoTitle } from "./videos/Demo/DemoTitle";
import { Teaser } from "./videos/Teaser/Teaser";
import { TeaserThumb } from "./videos/Teaser/Thumbnail";
import { f, SCENES } from "./videos/Teaser/beats";
import { calcFootageEdit, FootageEdit, footageEditDefaults, footageEditSchema } from "./templates/FootageEdit/FootageEdit";
import { calcScripture, isaiah4031, ScriptureLyric, scriptureSchema } from "./templates/ScriptureLyric/ScriptureLyric";
import { calcAnimatic, StoryboardAnimatic } from "./storyboard/Animatic";
import { sampleStoryboard } from "./storyboard/sample";
import { storyboardSchema } from "./storyboard/schema";
import { calcSheet, StoryboardSheet } from "./storyboard/StoryboardSheet";
import { TimelineView, timelineDefaults, timelineSchema } from "./storyboard/TimelineView";

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

      {/* Demo job showcase: launch teaser 16:9 (20 s), 9:16 cut-down (16 s), YouTube thumbnail. */}
      <Composition
        id="Teaser-16x9"
        component={Teaser}
        defaultProps={{ variant: "full" as const }}
        durationInFrames={f(SCENES.coldOpen + SCENES.title + SCENES.sketch + SCENES.formats + SCENES.end)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Teaser-9x16"
        component={Teaser}
        defaultProps={{ variant: "cutdown" as const }}
        durationInFrames={f(SCENES.title + SCENES.sketch + SCENES.formats + SCENES.end)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Still id="TeaserThumb" component={TeaserThumb} width={1280} height={720} />

      {/* Template: animated scripture / lyric (style recipe "illustrated-type"). Pass any verse or lyric with --props. */}
      <Composition id="ScriptureLyric-9x16" component={ScriptureLyric} schema={scriptureSchema} defaultProps={isaiah4031} calculateMetadata={calcScripture} durationInFrames={600} fps={30} width={1080} height={1920} />
      <Composition id="ScriptureLyric-16x9" component={ScriptureLyric} schema={scriptureSchema} defaultProps={isaiah4031} calculateMetadata={calcScripture} durationInFrames={600} fps={30} width={1920} height={1080} />
      <Still id="ScriptureCard-4x5" component={ScriptureLyric} schema={scriptureSchema} defaultProps={{ ...isaiah4031, stillPhrase: 0 }} width={1080} height={1350} />

      {/* Template: footage edit (talking heads, interviews, testimonies) from a resolved edit list. Props: jobs/<job>/.edl.resolved.json */}
      <Composition id="FootageEdit-9x16" component={FootageEdit} schema={footageEditSchema} defaultProps={footageEditDefaults} calculateMetadata={calcFootageEdit} durationInFrames={90} fps={30} width={1080} height={1920} />
      <Composition id="FootageEdit-16x9" component={FootageEdit} schema={footageEditSchema} defaultProps={footageEditDefaults} calculateMetadata={calcFootageEdit} durationInFrames={90} fps={30} width={1920} height={1080} />
      <Composition id="FootageEdit-1x1" component={FootageEdit} schema={footageEditSchema} defaultProps={footageEditDefaults} calculateMetadata={calcFootageEdit} durationInFrames={90} fps={30} width={1080} height={1080} />
      <Composition id="FootageEdit-4x5" component={FootageEdit} schema={footageEditSchema} defaultProps={footageEditDefaults} calculateMetadata={calcFootageEdit} durationInFrames={90} fps={30} width={1080} height={1350} />

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
      {/* Edit tools: filmstrip + waveform + words for a stretch of footage (scripts/timeline.mjs). */}
      <Still id="TimelineView" component={TimelineView} schema={timelineSchema} defaultProps={timelineDefaults} width={2400} height={900} />
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
