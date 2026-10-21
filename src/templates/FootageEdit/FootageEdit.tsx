import { AbsoluteFill, Audio, CalculateMetadataFunction, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { LiquidGlassGraph } from "../../effects/LiquidGlassGraph";
import { ScreenPush } from "../../effects/ScreenPush";
import { ShoulderCards, shoulderCamera } from "../../effects/ShoulderZoom";
import { color, font, Grade, Grain, LOOKS, type Look, springs } from "../../lib";

// Edit of real footage (talking heads, interviews, testimonies, vlogs) from a
// resolved edit list: run scripts/autocut.mjs, then scripts/edl.mjs, and pass
// jobs/<job>/.edl.resolved.json as --props. The dialogue comes from the
// pre-built voice track (exact trims, 30 ms fades at every cut), so the video
// pieces are muted here.

const word = z.object({ text: z.string(), startMs: z.number(), endMs: z.number() });
export const footageEditSchema = z.object({
  job: z.string(),
  version: z.number(),
  fps: z.number(),
  durationInFrames: z.number(),
  voice: z.string().nullable(),
  segments: z.array(
    z.object({ src: z.string(), from: z.number(), durationInFrames: z.number(), trimBefore: z.number(), zoom: z.number(), push: z.number(), focusX: z.number(), focusY: z.number() }),
  ),
  cues: z.array(z.object({ startMs: z.number(), endMs: z.number(), words: z.array(word) })),
  captions: z.object({ style: z.enum(["pop", "line", "none"]), position: z.number(), uppercase: z.boolean(), highlight: z.string(), size: z.number(), emphasis: z.array(z.string()) }),
  grade: z.string(),
  // y: vertical centre as a fraction of the frame height; place it clear of faces (cutcheck.mjs reports overlaps).
  overlays: z.array(z.object({ kind: z.enum(["title", "lower-third", "popup"]), text: z.string(), sub: z.string().optional(), y: z.number().optional(), from: z.number(), durationInFrames: z.number() })),
  music: z.object({ src: z.string(), volume: z.number(), duck: z.number() }).nullable(),
  speech: z.array(z.tuple([z.number(), z.number()])),
  faceBoxes: z.record(z.string(), z.array(z.number())),
  // Talking-head effects (src/effects), timed by edl.mjs: from/durationInFrames in output frames.
  effects: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("liquid-glass"),
          from: z.number(),
          durationInFrames: z.number(),
          title: z.string(),
          startValue: z.number(),
          endValue: z.number(),
          prefix: z.string(),
          suffix: z.string(),
          decimals: z.number(),
          lineColour: z.string(),
          nodeColour: z.string(),
          textColour: z.string(),
          shape: z.array(z.number()),
          drawSeconds: z.number(),
          holdSeconds: z.number(),
          cardY: z.number(),
          frost: z.number(),
          bend: z.number(),
        }),
        z.object({
          kind: z.literal("screen-push"),
          from: z.number(),
          durationInFrames: z.number(),
          words: z.array(z.object({ text: z.string(), start: z.number() })),
          endAt: z.number(),
          textColour: z.string(),
          allCaps: z.boolean(),
          zoom: z.number(),
          pixelSize: z.number(),
          screenColour: z.string(),
          fringe: z.number(),
          glow: z.number(),
          focusFalloff: z.number(),
        }),
        z.object({
          kind: z.literal("shoulder-zoom"),
          from: z.number(),
          durationInFrames: z.number(),
          style: z.enum(["normal", "transition"]),
          start: z.object({ label: z.string(), big: z.string(), small: z.string() }),
          end: z.object({ label: z.string(), big: z.string(), small: z.string() }),
          accent: z.string(),
          faceX: z.number(),
          faceWidth: z.number(),
          eyeY: z.number(),
        }),
      ]),
    )
    .default([]),
  cutSources: z.array(z.string()),
});
export type FootageEditProps = z.infer<typeof footageEditSchema>;

export const calcFootageEdit: CalculateMetadataFunction<FootageEditProps> = ({ props }) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
});

const Shot: React.FC<{ s: FootageEditProps["segments"][number] }> = ({ s }) => {
  const frame = useCurrentFrame();
  const scale = s.zoom + s.push * (frame / Math.max(1, s.durationInFrames));
  const origin = `${s.focusX * 100}% ${s.focusY * 100}%`;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin }}>
      <OffthreadVideo src={staticFile(s.src)} trimBefore={s.trimBefore} muted style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: origin }} />
    </AbsoluteFill>
  );
};

const clean = (t: string) => t.replace(/[.,;:]+$/, "");

const Captions: React.FC<{ cues: FootageEditProps["cues"]; c: FootageEditProps["captions"] }> = ({ cues, c }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const cue = cues.find((q) => ms >= q.startMs && ms < q.endMs);
  if (!cue || c.style === "none") return null;
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  const enter = spring({ frame: frame - Math.round((cue.startMs / 1000) * fps) + 1, fps, config: springs.snappy, durationInFrames: 8 });
  const size = (portrait ? 74 : 58) * u * c.size;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: height * c.position - size * 0.6 }}>
      <div
        style={{
          maxWidth: width * (portrait ? 0.82 : 0.7),
          textAlign: "center",
          fontFamily: font.display,
          fontWeight: c.style === "pop" ? 900 : 700,
          fontSize: c.style === "pop" ? size : size * 0.72,
          lineHeight: 1.12,
          letterSpacing: c.style === "pop" ? "-0.01em" : "0",
          color: color.text,
          textTransform: c.uppercase ? "uppercase" : "none",
          WebkitTextStroke: c.style === "pop" ? `${size * 0.09}px #000` : undefined,
          paintOrder: "stroke fill",
          textShadow: `0 ${4 * u}px ${18 * u}px rgba(0,0,0,0.55)`,
          transform: `scale(${interpolate(enter, [0, 1], [0.86, 1])})`,
          opacity: enter,
        }}
      >
        {cue.words.map((w, i) => {
          const active = c.style === "pop" && ms >= w.startMs && ms < (cue.words[i + 1]?.startMs ?? cue.endMs);
          const emph = c.emphasis.some((e) => e.toLowerCase() === clean(w.text).toLowerCase());
          const pop = active ? spring({ frame: frame - Math.round((w.startMs / 1000) * fps) + 1, fps, config: springs.punch, durationInFrames: 6 }) : 1;
          return (
            <span key={i} style={{ display: "inline-block", margin: "0 0.16em", color: active || emph ? c.highlight : color.text, transform: `scale(${active ? interpolate(pop, [0, 1], [1.18, 1.06]) : 1})` }}>
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Overlay: React.FC<{ o: FootageEditProps["overlays"][number] }> = ({ o }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  const enter = spring({ frame: frame + 1, fps, config: springs.smooth, durationInFrames: 12 });
  const exit = interpolate(frame, [o.durationInFrames - 8, o.durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const t = enter * exit;
  if (o.kind === "lower-third") {
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: `0 ${(portrait ? 70 : 120) * u}px ${height * (1 - (o.y ?? (portrait ? 0.56 : 0.82))) - 40 * u}px` }}>
        <div style={{ opacity: t, transform: `translateX(${interpolate(t, [0, 1], [-40 * u, 0])}px)`, borderLeft: `${8 * u}px solid ${color.accent}`, paddingLeft: 24 * u }}>
          <div style={{ fontFamily: font.display, fontWeight: 800, fontSize: 52 * u, color: color.text, textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>{o.text}</div>
          {o.sub ? <div style={{ fontFamily: font.body, fontWeight: 600, fontSize: 30 * u, letterSpacing: "0.12em", color: color.text, opacity: 0.85, textTransform: "uppercase", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>{o.sub}</div> : null}
        </div>
      </AbsoluteFill>
    );
  }
  const top = o.kind === "title";
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: height * (o.y ?? (portrait ? (top ? 0.16 : 0.12) : top ? 0.14 : 0.12)),
          opacity: t,
          transform: `translateY(-50%) translateY(${interpolate(t, [0, 1], [24 * u, 0])}px) scale(${interpolate(t, [0, 1], [0.92, 1])})`,
          background: top ? "transparent" : color.text,
          color: top ? color.text : color.ink,
          padding: top ? 0 : `${18 * u}px ${34 * u}px`,
          borderRadius: 18 * u,
          fontFamily: font.display,
          fontWeight: 900,
          fontSize: (top ? 92 : 50) * u,
          lineHeight: 1.05,
          textAlign: "center",
          maxWidth: width * 0.84,
          textTransform: top ? "uppercase" : "none",
          textShadow: top ? "0 4px 24px rgba(0,0,0,.55)" : undefined,
          boxShadow: top ? undefined : "0 12px 40px rgba(0,0,0,.35)",
        }}
      >
        {o.text}
        {o.sub ? <div style={{ fontSize: (top ? 36 : 28) * u, fontWeight: 600, marginTop: 10 * u, color: top ? color.accent : color.muted, letterSpacing: "0.08em" }}>{o.sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

const Footage: React.FC<{ p: FootageEditProps }> = ({ p }) => {
  const look = (p.grade in LOOKS ? p.grade : "neutral") as Look;
  return (
    <Grade look={look} vignette={look === "neutral" ? 0 : 0.25}>
      {p.segments.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames} layout="none">
          <Shot s={s} />
        </Sequence>
      ))}
    </Grade>
  );
};

// The footage layer, moved by an over-the-shoulder camera while one is running.
const Camera: React.FC<{ p: FootageEditProps; children: React.ReactNode }> = ({ p, children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const fx = p.effects.find((e) => e.kind === "shoulder-zoom" && frame >= e.from && frame < e.from + e.durationInFrames);
  const cam = fx && fx.kind === "shoulder-zoom" ? shoulderCamera((frame - fx.from) / fps, fx, width, height) : undefined;
  if (!cam) return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={cam.outer}>
        <AbsoluteFill style={cam.inner}>{children}</AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const FootageEdit: React.FC<FootageEditProps> = (p) => {
  const frame = useCurrentFrame();
  const look = (p.grade in LOOKS ? p.grade : "neutral") as Look;
  const ducked = (f: number) => p.speech.some(([a, b]) => f >= a - 6 && f <= b + 6);
  // The screen push carries the words itself, so captions step aside while it runs.
  const screenOn = p.effects.some((e) => e.kind === "screen-push" && frame >= e.from && frame < e.from + e.durationInFrames);
  // Captions drop below a glass card while it's up (never into the bottom 20%).
  const { width, height } = useVideoConfig();
  const glass = p.effects.find((e) => e.kind === "liquid-glass" && frame >= e.from && frame < e.from + e.durationInFrames);
  const capPos =
    glass && glass.kind === "liquid-glass" ? Math.min(0.79, Math.max(p.captions.position, glass.cardY + (610 * (Math.min(width, height) / 1080)) / height + 0.03)) : p.captions.position;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Camera p={p}>
        <Footage p={p} />
      </Camera>
      {look === "neutral" ? null : <Grain opacity={0.04} />}
      {p.effects.map((e, i) => (
        <Sequence key={`fx${i}`} from={e.from} durationInFrames={e.durationInFrames} layout="none">
          {e.kind === "liquid-glass" ? (
            <LiquidGlassGraph
              {...e}
              id={String(i)}
              footage={
                // The same footage, shifted back to the edit's timeline, for the glass to refract.
                <Sequence from={-e.from} layout="none">
                  <Footage p={p} />
                </Sequence>
              }
            />
          ) : e.kind === "screen-push" ? (
            <ScreenPush {...e} />
          ) : (
            <ShoulderCards {...e} id={String(i)} />
          )}
        </Sequence>
      ))}
      {p.overlays.map((o, i) => (
        <Sequence key={i} from={o.from} durationInFrames={o.durationInFrames} layout="none">
          <Overlay o={o} />
        </Sequence>
      ))}
      {screenOn ? null : <Captions cues={p.cues} c={{ ...p.captions, position: capPos }} />}
      {p.voice ? <Audio src={staticFile(p.voice)} /> : null}
      {p.music ? <Audio src={staticFile(p.music.src)} loop volume={(f) => p.music!.volume * (ducked(f) ? p.music!.duck : 1)} /> : null}
    </AbsoluteFill>
  );
};

// Placeholder props so the compositions register; real jobs pass --props.
export const footageEditDefaults: FootageEditProps = {
  job: "none",
  version: 0,
  fps: 30,
  durationInFrames: 90,
  voice: null,
  segments: [],
  cues: [],
  captions: { style: "pop", position: 0.66, uppercase: true, highlight: color.accent, size: 1, emphasis: [] },
  grade: "neutral",
  overlays: [{ kind: "title", text: "Pass --props=jobs/<job>/.edl.resolved.json", from: 0, durationInFrames: 90 }],
  music: null,
  speech: [],
  faceBoxes: {},
  effects: [],
  cutSources: [],
};
