import { Composition } from "remotion";
import { StudioCheck } from "./videos/StudioCheck";

// Register each new video here: one <Composition> per video (and per format).
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
    </>
  );
};
