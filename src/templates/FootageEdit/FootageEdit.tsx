import {
  AbsoluteFill,
  Audio,
  CalculateMetadataFunction,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { LiquidGlassGraph } from "../../effects/LiquidGlassGraph";
import { ScreenPush } from "../../effects/ScreenPush";
import { ShoulderCards, shoulderCamera } from "../../effects/ShoulderZoom";
import { Insert, insertHeight } from "../../inserts/Inserts";
import {
  BrandEndCard,
  BrandProvider,
  color,
  font,
  Grade,
  Grain,
  LOOKS,
  type Look,
  springs,
  useBrand,
} from "../../lib";
import { LookCaptions, lookAt, Orbit, PunchBehind } from "../../looks/Looks";
import { TitleFX, titleSchema } from "../../titles/TitleFX";

// Edit of real footage (talking heads, interviews, testimonies, vlogs) from a
// resolved edit list: run scripts/autocut.mjs, then scripts/edl.mjs, and pass
// jobs/<job>/.edl.resolved.json as --props. The dialogue comes from the
// pre-built voice track (exact trims, 30 ms fades at every cut), so the video
// pieces are muted here.

const word = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
});
export const footageEditSchema = z.object({
  job: z.string(),
  version: z.number(),
  fps: z.number(),
  durationInFrames: z.number(),
  voice: z.string().nullable(),
  segments: z.array(
    z.object({
      src: z.string(),
      from: z.number(),
      durationInFrames: z.number(),
      trimBefore: z.number(),
      zoom: z.number(),
      push: z.number(),
      focusX: z.number(),
      focusY: z.number(),
      // The speaker cut out of this source (scripts/matte.mjs): transparent VP9, same frames.
      matte: z.string().nullable().default(null),
      // Crop centre keyframes [frame in segment, x, y] when the crop follows a moving speaker (scripts/track.mjs).
      focusTrack: z
        .array(z.tuple([z.number(), z.number(), z.number()]))
        .nullable()
        .default(null),
      // The speaker's head for this segment, as fractions of the source frame (for checks and placement).
      faceBox: z.array(z.number()).nullable().default(null),
      // Source size in pixels (layouts that frame the speaker themselves, e.g. Tutorial).
      srcW: z.number().nullable().default(null),
      srcH: z.number().nullable().default(null),
    }),
  ),
  // Looks per section (src/looks), punch words, orbiting reels, inserts and sound effects (all from edl.mjs).
  looks: z
    .array(
      z.object({
        from: z.number(),
        to: z.number(),
        look: z.enum(["classic", "bold", "cool-girl", "cool-dude"]),
      }),
    )
    .default([]),
  punches: z
    .array(
      z.object({
        text: z.string(),
        startMs: z.number(),
        endMs: z.number(),
        look: z.enum(["classic", "bold", "cool-girl", "cool-dude"]),
        cueStartMs: z.number(),
        cueEndMs: z.number(),
        y: z.number().optional(),
      }),
    )
    .default([]),
  orbit: z
    .array(
      z.object({
        src: z.string(),
        credit: z.string().nullable(),
        image: z.boolean(),
      }),
    )
    .default([]),
  inserts: z
    .array(
      z.object({
        kind: z.enum(["app-window", "profile-follow", "file-scroll"]),
        from: z.number(),
        durationInFrames: z.number(),
        layer: z.enum(["behind", "front"]),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        credit: z.string().nullable(),
        data: z.record(z.string(), z.unknown()),
      }),
    )
    .default([]),
  sfx: z
    .array(z.object({ from: z.number(), src: z.string(), volume: z.number() }))
    .default([]),
  // The client's brand kit (public/brands/<slug>/brand.json), resolved by edl.mjs.
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
  cues: z.array(
    z.object({ startMs: z.number(), endMs: z.number(), words: z.array(word) }),
  ),
  captions: z.object({
    style: z.enum(["pop", "line", "none"]),
    position: z.number(),
    uppercase: z.boolean(),
    highlight: z.string(),
    size: z.number(),
    emphasis: z.array(z.string()),
  }),
  grade: z.string(),
  // y: vertical centre as a fraction of the frame height; place it clear of faces (cutcheck.mjs reports overlaps).
  overlays: z.array(
    z.object({
      kind: z.enum(["title", "lower-third", "popup"]),
      text: z.string(),
      sub: z.string().optional(),
      y: z.number().optional(),
      from: z.number(),
      durationInFrames: z.number(),
    }),
  ),
  music: z
    .object({
      src: z.string(),
      volume: z.number(),
      duck: z.number(),
      trimBefore: z.number().default(0),
      // Music level under the end card, relative to "volume" (it comes up when the talking stops).
      outro: z.number().default(2),
    })
    .nullable(),
  // Cinematic titles (src/titles), behind or in front of the speaker, optionally pinned.
  titles: z.array(titleSchema).default([]),
  // B-roll cutaways over the speaker; the voice carries on underneath.
  broll: z
    .array(
      z.object({
        src: z.string(),
        from: z.number(),
        durationInFrames: z.number(),
        trimBefore: z.number(),
        zoom: z.number(),
        credit: z.string().nullable(),
      }),
    )
    .default([]),
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
          start: z.object({
            label: z.string(),
            big: z.string(),
            small: z.string(),
          }),
          end: z.object({
            label: z.string(),
            big: z.string(),
            small: z.string(),
          }),
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

export const calcFootageEdit: CalculateMetadataFunction<FootageEditProps> = ({
  props,
}) => ({
  durationInFrames: Math.max(1, props.durationInFrames),
  fps: props.fps,
});

const Shot: React.FC<{
  s: FootageEditProps["segments"][number];
  person?: boolean;
}> = ({ s, person }) => {
  const frame = useCurrentFrame();
  const scale = s.zoom + s.push * (frame / Math.max(1, s.durationInFrames));
  const ft = s.focusTrack;
  const fX =
    ft && ft.length > 1
      ? interpolate(
          frame,
          ft.map((k) => k[0]),
          ft.map((k) => k[1]),
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : s.focusX;
  const fY =
    ft && ft.length > 1
      ? interpolate(
          frame,
          ft.map((k) => k[0]),
          ft.map((k) => k[2]),
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : s.focusY;
  const origin = `${fX * 100}% ${fY * 100}%`;
  return (
    <AbsoluteFill
      style={{ transform: `scale(${scale})`, transformOrigin: origin }}
    >
      <OffthreadVideo
        src={staticFile(person && s.matte ? s.matte : s.src)}
        transparent={person}
        trimBefore={s.trimBefore}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: origin,
        }}
      />
    </AbsoluteFill>
  );
};

// A b-roll cutaway: full frame, a 4-frame dissolve in and out, the same grade as the edit.
const Cutaway: React.FC<{ b: FootageEditProps["broll"][number] }> = ({ b }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const o = Math.min(
    interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [b.durationInFrames - 4, b.durationInFrames], [1, 0], {
      extrapolateLeft: "clamp",
    }),
  );
  return (
    <AbsoluteFill style={{ opacity: o, backgroundColor: "#000" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${b.zoom + 0.04 * (frame / Math.max(1, b.durationInFrames))})`,
        }}
      >
        <OffthreadVideo
          src={staticFile(b.src)}
          trimBefore={b.trimBefore || undefined}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      {b.credit ? (
        <div
          style={{
            position: "absolute",
            left: 40 * u,
            top: height * 0.12,
            fontFamily: font.body,
            fontWeight: 700,
            fontSize: 24 * u,
            color: "#fff",
            textShadow: "0 2px 10px rgba(0,0,0,0.7)",
          }}
        >
          {b.credit}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// Grade per frame: the job's grade, or the look's own (cool-girl warm, cool-dude film).
const gradeFor = (p: FootageEditProps, frame: number): Look => {
  const l = lookAt(p.looks, frame);
  if (l === "cool-girl") return "warm";
  if (l === "cool-dude") return "film";
  return (p.grade in LOOKS ? p.grade : "neutral") as Look;
};

const clean = (t: string) => t.replace(/[.,;:]+$/, "");

const Captions: React.FC<{
  cues: FootageEditProps["cues"];
  c: FootageEditProps["captions"];
}> = ({ cues, c }) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const cue = cues.find((q) => ms >= q.startMs && ms < q.endMs);
  if (!cue || c.style === "none") return null;
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  const enter = spring({
    frame: frame - Math.round((cue.startMs / 1000) * fps) + 1,
    fps,
    config: springs.snappy,
    durationInFrames: 8,
  });
  const size = (portrait ? 74 : 58) * u * c.size;
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: height * c.position - size * 0.6,
      }}
    >
      <div
        style={{
          maxWidth: width * (portrait ? 0.82 : 0.7),
          textAlign: "center",
          fontFamily: brand.displayFont,
          fontWeight: c.style === "pop" ? 900 : 700,
          fontSize: c.style === "pop" ? size : size * 0.72,
          lineHeight: 1.12,
          letterSpacing: c.style === "pop" ? "-0.01em" : "0",
          color: color.text,
          textTransform: c.uppercase ? "uppercase" : "none",
          WebkitTextStroke:
            c.style === "pop" ? `${size * 0.09}px #000` : undefined,
          paintOrder: "stroke fill",
          textShadow: `0 ${4 * u}px ${18 * u}px rgba(0,0,0,0.55)`,
          transform: `scale(${interpolate(enter, [0, 1], [0.86, 1])})`,
          opacity: enter,
        }}
      >
        {cue.words.map((w, i) => {
          const active =
            c.style === "pop" &&
            ms >= w.startMs &&
            ms < (cue.words[i + 1]?.startMs ?? cue.endMs);
          const emph = c.emphasis.some(
            (e) => e.toLowerCase() === clean(w.text).toLowerCase(),
          );
          const pop = active
            ? spring({
                frame: frame - Math.round((w.startMs / 1000) * fps) + 1,
                fps,
                config: springs.punch,
                durationInFrames: 6,
              })
            : 1;
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "0 0.16em",
                color: active || emph ? c.highlight : color.text,
                transform: `scale(${active ? interpolate(pop, [0, 1], [1.18, 1.06]) : 1})`,
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Overlay: React.FC<{ o: FootageEditProps["overlays"][number] }> = ({
  o,
}) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  const enter = spring({
    frame: frame + 1,
    fps,
    config: springs.smooth,
    durationInFrames: 12,
  });
  const exit = interpolate(
    frame,
    [o.durationInFrames - 8, o.durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const t = enter * exit;
  if (o.kind === "lower-third") {
    return (
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: `0 ${(portrait ? 70 : 120) * u}px ${height * (1 - (o.y ?? (portrait ? 0.56 : 0.82))) - 40 * u}px`,
        }}
      >
        <div
          style={{
            opacity: t,
            transform: `translateX(${interpolate(t, [0, 1], [-40 * u, 0])}px)`,
            borderLeft: `${8 * u}px solid ${brand.accent}`,
            paddingLeft: 24 * u,
          }}
        >
          <div
            style={{
              fontFamily: brand.displayFont,
              fontWeight: 800,
              fontSize: 52 * u,
              color: brand.text,
              textShadow: "0 2px 12px rgba(0,0,0,.6)",
            }}
          >
            {o.text}
          </div>
          {o.sub ? (
            <div
              style={{
                fontFamily: font.body,
                fontWeight: 600,
                fontSize: 30 * u,
                letterSpacing: "0.12em",
                color: color.text,
                opacity: 0.85,
                textTransform: "uppercase",
                textShadow: "0 2px 12px rgba(0,0,0,.6)",
              }}
            >
              {o.sub}
            </div>
          ) : null}
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
          top:
            height *
            (o.y ?? (portrait ? (top ? 0.16 : 0.12) : top ? 0.14 : 0.12)),
          opacity: t,
          transform: `translateY(-50%) translateY(${interpolate(t, [0, 1], [24 * u, 0])}px) scale(${interpolate(t, [0, 1], [0.92, 1])})`,
          background: top ? "transparent" : color.text,
          color: top ? color.text : color.ink,
          padding: top ? 0 : `${18 * u}px ${34 * u}px`,
          borderRadius: 18 * u,
          fontFamily: brand.displayFont,
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
        {o.sub ? (
          <div
            style={{
              fontSize: (top ? 36 : 28) * u,
              fontWeight: 600,
              marginTop: 10 * u,
              color: top ? brand.accent : color.muted,
              letterSpacing: "0.08em",
            }}
          >
            {o.sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// layer "all": the footage as shot. "background": the same, darkened for cool-dude
// when the speaker is cut out ("the room falls back"). "person": only the
// cut-out speaker, for drawing on top of anything placed behind them.
const Footage: React.FC<{
  p: FootageEditProps;
  layer?: "all" | "background" | "person";
}> = ({ p, layer = "all" }) => {
  const frame = useCurrentFrame();
  const look = gradeFor(p, frame);
  const seg = p.segments.find(
    (s) => frame >= s.from && frame < s.from + s.durationInFrames,
  );
  const dim =
    layer === "background" &&
    lookAt(p.looks, frame) === "cool-dude" &&
    seg?.matte;
  return (
    <Grade
      look={look}
      vignette={
        layer === "person" || look === "neutral" ? 0 : dim ? 0.55 : 0.25
      }
    >
      <AbsoluteFill
        style={{ filter: dim ? "brightness(0.42) saturate(0.8)" : undefined }}
      >
        {p.segments.map((s, i) =>
          layer === "person" && !s.matte ? null : (
            <Sequence
              key={i}
              from={s.from}
              durationInFrames={s.durationInFrames}
              layout="none"
            >
              <Shot s={s} person={layer === "person"} />
            </Sequence>
          ),
        )}
      </AbsoluteFill>
    </Grade>
  );
};

// The footage layer, moved by an over-the-shoulder camera while one is running.
const Camera: React.FC<{ p: FootageEditProps; children: React.ReactNode }> = ({
  p,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const fx = p.effects.find(
    (e) =>
      e.kind === "shoulder-zoom" &&
      frame >= e.from &&
      frame < e.from + e.durationInFrames,
  );
  const cam =
    fx && fx.kind === "shoulder-zoom"
      ? shoulderCamera((frame - fx.from) / fps, fx, width, height)
      : undefined;
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
  const endFrames = p.brand?.endCard
    ? Math.round(p.brand.endCard.seconds * (p.fps || 30))
    : 0;
  // Music ducks under speech (with 6 frames of margin), easing down and back up
  // over 8 frames instead of switching, fades in and out, and comes up under the end card.
  const musicVolume = (f: number) => {
    const m = p.music!;
    let dist = Infinity;
    for (const [a, b] of p.speech) {
      const d = f < a - 6 ? a - 6 - f : f > b + 6 ? f - b - 6 : 0;
      if (d < dist) dist = d;
    }
    const duck = m.duck + (1 - m.duck) * Math.min(1, dist / 8);
    const endAt = p.durationInFrames - endFrames;
    const outro = endFrames
      ? interpolate(f, [endAt - 6, endAt + 12], [1, m.outro], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;
    const fade = interpolate(
      f,
      [
        0,
        6,
        p.durationInFrames - Math.round(0.8 * p.fps),
        p.durationInFrames - 1,
      ],
      [0, 1, 1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    return Math.min(1, m.volume * duck * outro * fade);
  };
  // The screen push carries the words itself, so captions step aside while it runs.
  const screenOn = p.effects.some(
    (e) =>
      e.kind === "screen-push" &&
      frame >= e.from &&
      frame < e.from + e.durationInFrames,
  );
  // Captions drop below a glass card while it's up (never into the bottom 20%).
  const { width, height } = useVideoConfig();
  const glass = p.effects.find(
    (e) =>
      e.kind === "liquid-glass" &&
      frame >= e.from &&
      frame < e.from + e.durationInFrames,
  );
  const glassPos =
    glass && glass.kind === "liquid-glass"
      ? Math.min(
          0.79,
          Math.max(
            p.captions.position,
            glass.cardY +
              (610 * (Math.min(width, height) / 1080)) / height +
              0.03,
          ),
        )
      : p.captions.position;
  // Likewise below a front insert while it's on screen.
  const frontIns = p.inserts.find(
    (i) =>
      i.layer === "front" &&
      frame >= i.from &&
      frame < i.from + i.durationInFrames,
  );
  const capPos = frontIns
    ? Math.min(
        0.8,
        Math.max(
          glassPos,
          frontIns.y + insertHeight(frontIns, width, height) / 2 + 0.035,
        ),
      )
    : glassPos;
  const lookNow = lookAt(p.looks, frame);
  const seg = p.segments.find(
    (s) => frame >= s.from && frame < s.from + s.durationInFrames,
  );
  const hasMatte = Boolean(seg?.matte);
  // The cut-out speaker is only drawn again when something sits behind them (saves a second decode).
  const ms = (frame / (p.fps || 30)) * 1000;
  const needPerson =
    hasMatte &&
    (lookNow === "cool-dude" ||
      lookNow === "cool-girl" ||
      p.punches.some(
        (x) =>
          (x.look === "bold" || x.look === "cool-dude") &&
          ms >= x.startMs - 100 &&
          ms < x.endMs + 100,
      ) ||
      p.inserts.some(
        (i) =>
          i.layer === "behind" &&
          frame >= i.from &&
          frame < i.from + i.durationInFrames,
      ) ||
      p.titles.some(
        (t) =>
          t.layer === "behind" &&
          frame >= t.from &&
          frame < t.from + t.durationInFrames,
      ));
  const coolGirl = p.looks.filter((r) => r.look === "cool-girl");
  // Anything "behind" the speaker is drawn between the background and the cut-out person.
  const behind = (
    <>
      <PunchBehind punches={p.punches} hasMatte={hasMatte} />
      {coolGirl.map((r, i) => (
        <Sequence
          key={`ob${i}`}
          from={r.from}
          durationInFrames={r.to - r.from}
          layout="none"
        >
          <Orbit items={p.orbit} durationInFrames={r.to - r.from} half="back" />
        </Sequence>
      ))}
      {p.inserts.map((ins, i) =>
        ins.layer === "behind" ? (
          <Sequence
            key={`ib${i}`}
            from={ins.from}
            durationInFrames={ins.durationInFrames}
            layout="none"
          >
            <Insert {...ins} />
          </Sequence>
        ) : null,
      )}
      {p.titles.map((t, i) =>
        t.layer === "behind" ? (
          <Sequence
            key={`tb${i}`}
            from={t.from}
            durationInFrames={t.durationInFrames}
            layout="none"
          >
            <TitleFX t={t} id={`t${i}`} />
          </Sequence>
        ) : null,
      )}
    </>
  );
  return (
    <BrandProvider brand={p.brand}>
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <Camera p={p}>
          <Footage p={p} layer="background" />
        </Camera>
        {behind}
        {needPerson ? (
          <Camera p={p}>
            <Footage p={p} layer="person" />
          </Camera>
        ) : null}
        {look === "neutral" && lookNow === "classic" ? null : (
          <Grain opacity={0.04} />
        )}
        {coolGirl.map((r, i) => (
          <Sequence
            key={`of${i}`}
            from={r.from}
            durationInFrames={r.to - r.from}
            layout="none"
          >
            <Orbit
              items={p.orbit}
              durationInFrames={r.to - r.from}
              half="front"
            />
          </Sequence>
        ))}
        {p.inserts.map((ins, i) =>
          ins.layer === "front" ? (
            <Sequence
              key={`if${i}`}
              from={ins.from}
              durationInFrames={ins.durationInFrames}
              layout="none"
            >
              <Insert {...ins} />
            </Sequence>
          ) : null,
        )}
        {p.broll.map((b, i) => (
          <Sequence
            key={`br${i}`}
            from={b.from}
            durationInFrames={b.durationInFrames}
            layout="none"
          >
            <Cutaway b={b} />
          </Sequence>
        ))}
        {p.effects.map((e, i) => (
          <Sequence
            key={`fx${i}`}
            from={e.from}
            durationInFrames={e.durationInFrames}
            layout="none"
          >
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
        {p.titles.map((t, i) =>
          t.layer === "front" ? (
            <Sequence
              key={`tf${i}`}
              from={t.from}
              durationInFrames={t.durationInFrames}
              layout="none"
            >
              <TitleFX t={t} id={`t${i}`} />
            </Sequence>
          ) : null,
        )}
        {p.overlays.map((o, i) => (
          <Sequence
            key={i}
            from={o.from}
            durationInFrames={o.durationInFrames}
            layout="none"
          >
            <Overlay o={o} />
          </Sequence>
        ))}
        {screenOn ? null : lookNow === "classic" ? (
          <Captions cues={p.cues} c={{ ...p.captions, position: capPos }} />
        ) : (
          <LookCaptions
            cues={p.cues}
            punches={p.punches}
            look={lookNow}
            position={
              lookNow === "cool-dude"
                ? Math.max(capPos, 0.74)
                : Math.max(capPos, 0.7)
            }
            emphasis={p.captions.emphasis}
          />
        )}
        {p.voice ? <Audio src={staticFile(p.voice)} /> : null}
        {p.sfx.map((x, i) => (
          <Sequence key={`sfx${i}`} from={x.from} layout="none">
            <Audio src={staticFile(x.src)} volume={x.volume} />
          </Sequence>
        ))}
        {p.music ? (
          <Audio
            src={staticFile(p.music.src)}
            trimBefore={p.music.trimBefore || undefined}
            loop
            volume={musicVolume}
          />
        ) : null}
        {endFrames ? (
          <Sequence
            from={p.durationInFrames - endFrames}
            durationInFrames={endFrames}
            layout="none"
          >
            <BrandEndCard durationInFrames={endFrames} />
          </Sequence>
        ) : null}
      </AbsoluteFill>
    </BrandProvider>
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
  captions: {
    style: "pop",
    position: 0.66,
    uppercase: true,
    highlight: color.accent,
    size: 1,
    emphasis: [],
  },
  grade: "neutral",
  overlays: [
    {
      kind: "title",
      text: "Pass --props=jobs/<job>/.edl.resolved.json",
      from: 0,
      durationInFrames: 90,
    },
  ],
  music: null,
  broll: [],
  speech: [],
  faceBoxes: {},
  effects: [],
  looks: [],
  punches: [],
  orbit: [],
  inserts: [],
  titles: [],
  sfx: [],
  brand: null,
  cutSources: [],
};
