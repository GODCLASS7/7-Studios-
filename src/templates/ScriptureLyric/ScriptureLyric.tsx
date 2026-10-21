import { AbsoluteFill, Audio, CalculateMetadataFunction, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { CutoutStrip, font, Grain, InkText, onTwos, PAPER, PaperTexture } from "../../lib";

// Animated scripture / lyric video in an illustrated, hand-made style
// (studio-styles recipe "illustrated-type", after Ben Marriott): paper page,
// cut-out strips placed on twos, ink-bleed type, hand-drawn underlines on the
// key words, and an end card with the reference.
//
// Text: "\n" always breaks a line; "|" marks the preferred break, used in portrait
// (9:16, 4:5) and in landscape for phrases longer than 30 characters.
//
// Timing: phrases play back to back for `seconds` each (verses, beatless pads),
// or, when phrases have `start`, each card lands at its own time and holds for
// `seconds` (songs: times come from scripts/lyrics.mjs). Gaps between cards
// (intros, instrumentals) show the empty page; `intro` adds a title card
// before the first line.

export const scriptureSchema = z.object({
  overline: z.string(),
  reference: z.string(),
  version: z.string().optional(),
  phrases: z.array(z.object({ text: z.string(), seconds: z.number(), start: z.number().optional(), emphasis: z.array(z.string()).optional() })),
  intro: z.object({ title: z.string(), sub: z.string().optional() }).optional(),
  endSeconds: z.number(),
  audio: z.string().optional(),
  // Still mode: show this phrase fully landed (for posters and scripture cards).
  stillPhrase: z.number().optional(),
});
export type ScriptureProps = z.infer<typeof scriptureSchema>;

// Start time (s) of every phrase, and when the end card begins.
const timeline = (phrases: ScriptureProps["phrases"]) => {
  let at = 0;
  const starts = phrases.map((p) => {
    const s = p.start ?? at;
    at = s + p.seconds;
    return s;
  });
  return { starts, end: Math.max(0, ...phrases.map((p, i) => starts[i] + p.seconds)) };
};

export const calcScripture: CalculateMetadataFunction<ScriptureProps> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.round((timeline(props.phrases).end + props.endSeconds) * 30)),
});

const useLayout = () => {
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  return { portrait, u, width, height };
};

const lineText = (text: string, portrait: boolean) =>
  portrait || text.replace(/[|\n]/g, "").length > 30 ? text.replace(/\|/g, "\n") : text.replace(/\|/g, " ");

const Overline: React.FC<{ text: string }> = ({ text }) => {
  const { portrait, u } = useLayout();
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: (portrait ? 190 : 80) * u }}>
      <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 26 * u, letterSpacing: "0.42em", color: PAPER.ink, opacity: 0.72 }}>{text}</div>
      <div style={{ width: 70 * u, height: 3 * u, backgroundColor: PAPER.accent, marginTop: 18 * u, borderRadius: 2 }} />
    </AbsoluteFill>
  );
};

const Footer: React.FC<{ reference: string }> = ({ reference }) => {
  const { portrait, u } = useLayout();
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: (portrait ? 330 : 80) * u }}>
      <div style={{ fontFamily: font.serif, fontStyle: "italic", fontWeight: 500, fontSize: 34 * u, color: PAPER.ink, opacity: 0.6 }}>{reference}</div>
    </AbsoluteFill>
  );
};

const PhraseCard: React.FC<{ index: number; text: string; emphasis?: string[]; frames: number; still?: boolean }> = ({ index, text, emphasis, frames, still }) => {
  const { portrait, u } = useLayout();
  const chars = text.replace(/[|\n]/g, "").length;
  const charFrames = Math.max(0.45, Math.min(1.1, 36 / chars));
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${(portrait ? 70 : 160) * u}px` }}>
      <CutoutStrip seed={`phrase-${index}`} inAt={still ? -30 : 0} outAt={still ? 99999 : frames} tilt={index % 2 ? 1.2 : -1.4} padding={`${0.5}em ${0.85}em ${0.62}em`}>
        <InkText
          id={`p${index}`}
          text={lineText(text, portrait)}
          startAt={still ? -400 : 7}
          charFrames={charFrames}
          emphasis={emphasis}
          style={{
            fontFamily: font.serif,
            fontWeight: 560,
            fontSize: (portrait ? 92 : 88) * u,
            lineHeight: 1.26,
            letterSpacing: "-0.012em",
            textAlign: "center",
            fontVariationSettings: '"opsz" 96, "SOFT" 50',
          }}
        />
      </CutoutStrip>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ reference: string; version?: string; overline: string; frames: number }> = ({ reference, version, overline, frames }) => {
  const { portrait, u } = useLayout();
  const frame = onTwos(useCurrentFrame());
  const stamp = interpolate(frame, [22, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [frames - 14, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 40 * u, opacity: fadeOut }}>
      <CutoutStrip seed="end" inAt={0} outAt={99999} tilt={-2} padding="0.35em 0.8em 0.45em">
        <InkText
          id="ref"
          text={reference.length > 20 ? reference.replace(" · ", "\n") : reference}
          startAt={6}
          charFrames={0.9}
          style={{ fontFamily: font.serif, fontStyle: "italic", fontWeight: 600, fontSize: (portrait ? 120 : 132) * u * Math.min(1, (portrait ? 14 : 24) / Math.max(1, reference.length)) ** 0.7, lineHeight: 1.08, textAlign: "center", maxWidth: (portrait ? 820 : 1500) * u }}
        />
      </CutoutStrip>
      {version ? (
        <div
          style={{
            transform: `rotate(-6deg) scale(${interpolate(stamp, [0, 1], [1.6, 1])})`,
            opacity: stamp,
            border: `${5 * u}px solid ${PAPER.accent}`,
            color: PAPER.accent,
            fontFamily: font.body,
            fontWeight: 900,
            letterSpacing: "0.3em",
            fontSize: 30 * u,
            padding: `${10 * u}px ${20 * u}px ${10 * u}px ${26 * u}px`,
            borderRadius: 8 * u,
            mixBlendMode: "multiply",
          }}
        >
          {version}
        </div>
      ) : null}
      <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 24 * u, letterSpacing: "0.42em", color: PAPER.ink, opacity: 0.7 * stamp }}>{overline}</div>
    </AbsoluteFill>
  );
};

const IntroCard: React.FC<{ title: string; sub?: string; frames: number }> = ({ title, sub, frames }) => {
  const { portrait, u } = useLayout();
  const frame = onTwos(useCurrentFrame());
  const subIn = interpolate(frame, [16, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 34 * u }}>
      <CutoutStrip seed="intro" inAt={0} outAt={frames} tilt={1.6} padding="0.4em 0.9em 0.5em">
        <InkText id="intro" text={title} startAt={6} charFrames={0.9} style={{ fontFamily: font.serif, fontWeight: 640, fontSize: (portrait ? 110 : 120) * u, lineHeight: 1.05, textAlign: "center" }} />
      </CutoutStrip>
      {sub ? <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 28 * u, letterSpacing: "0.38em", color: PAPER.ink, opacity: 0.7 * subIn * interpolate(frame, [frames - 8, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>{sub}</div> : null}
    </AbsoluteFill>
  );
};

export const ScriptureLyric: React.FC<ScriptureProps> = (props) => {
  const { fps } = useVideoConfig();
  const { starts, end } = timeline(props.phrases);
  const at = Math.round(end * fps);
  const introFrames = props.intro && props.phrases.length ? Math.round((starts[0] - 0.2) * fps) : 0;
  const still = props.stillPhrase !== undefined;
  const endFrames = Math.round(props.endSeconds * fps);
  return (
    <AbsoluteFill>
      <PaperTexture />
      {still ? (
        <>
          <Overline text={props.overline} />
          <PhraseCard index={props.stillPhrase ?? 0} text={props.phrases[props.stillPhrase ?? 0].text} emphasis={props.phrases[props.stillPhrase ?? 0].emphasis} frames={1} still />
          <Footer reference={`${props.reference}${props.version ? ` · ${props.version}` : ""}`} />
        </>
      ) : (
        <>
          {props.intro && introFrames >= 1.5 * fps ? (
            <Sequence durationInFrames={introFrames} layout="none">
              <IntroCard title={props.intro.title} sub={props.intro.sub} frames={introFrames} />
            </Sequence>
          ) : null}
          {props.phrases.map((p, i) => {
            const from = Math.round(starts[i] * fps);
            const frames = Math.round(p.seconds * fps);
            return (
              <Sequence key={i} from={from} durationInFrames={frames} layout="none">
                <PhraseCard index={i} text={p.text} emphasis={p.emphasis} frames={frames} />
              </Sequence>
            );
          })}
          {/* The intro card stands alone; the overline and footer arrive with the first line. */}
          <Sequence from={introFrames >= 1.5 * fps ? introFrames : 0} durationInFrames={Math.max(1, at - (introFrames >= 1.5 * fps ? introFrames : 0))} layout="none">
            <Overline text={props.overline} />
            <Footer reference={props.reference} />
          </Sequence>
          <Sequence from={at} durationInFrames={endFrames} layout="none">
            <EndCard reference={props.reference} version={props.version} overline={props.overline} frames={endFrames} />
          </Sequence>
          {props.audio ? <Audio src={staticFile(props.audio)} /> : null}
        </>
      )}
      <Grain opacity={0.06} />
    </AbsoluteFill>
  );
};

// Demo content: Isaiah 40:31 (King James Version, public domain) for The Wait Culture.
export const isaiah4031: ScriptureProps = {
  overline: "THE WAIT CULTURE",
  reference: "Isaiah 40:31",
  version: "KJV",
  phrases: [
    { text: "But they that wait|upon the LORD", seconds: 3.5, emphasis: ["wait"] },
    { text: "shall renew|their strength;", seconds: 3, emphasis: ["renew"] },
    { text: "they shall mount up|with wings as eagles;", seconds: 3.5, emphasis: ["wings"] },
    { text: "they shall run,|and not be weary;", seconds: 3, emphasis: ["run"] },
    { text: "and they shall walk,|and not faint.", seconds: 3.5, emphasis: ["walk"] },
  ],
  endSeconds: 3.5,
  audio: "jobs/wait-isaiah-40-31/audio/pad-isaiah-40-31.wav",
};
