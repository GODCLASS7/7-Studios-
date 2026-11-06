import {
  AbsoluteFill,
  CalculateMetadataFunction,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { clamp01, enter, fade, feelOf, feelSchema, typefaceOf, typefaceSchema } from "../../lib/feel";
import { mixHex, springTracks } from "../../lib/motion";
import { Pointer, pressAt } from "../../lib/pointer";

// A micro-interaction, shown as a clip: one action and the response that confirms it.
// A button that saves (with an optional moment of loading), a switch that turns on, or
// a like that fills. The confirmation never relies on colour alone: the label changes
// and a mark appears. This is a demonstration for reels and product pages; on a real
// website the working control is built and tested separately (keyboard and touch).

export const interactionSchema = z.object({
  kind: z.enum(["button", "toggle", "like"]).default("button"),
  /** Before the action: a button label, the switch's text, or the like count. */
  label: z.string().default("Save"),
  /** After it: "Saved", the switch's text once on, or the new count. */
  doneLabel: z.string().default("Saved"),
  loading: z.boolean().default(true),
  caption: z.string().default(""),
  trigger: z.enum(["click", "tap"]).default("click"),
  background: z.string().default("#FBF9F4"),
  surface: z.string().default("#FFFFFF"),
  color: z.string().default("#17130D"),
  labelColor: z.string().default("#FFFFFF"),
  success: z.string().default("#1F7A4A"),
  muted: z.string().default("#8E8574"),
  /** Size of the control, 1 = the default. */
  scale: z.number().min(0.5).max(2).default(1.3),
  typeface: typefaceSchema,
  seconds: z.number().min(2).max(10).default(4),
  feel: feelSchema,
  reducedMotion: z.boolean().default(false),
});
export type InteractionProps = z.infer<typeof interactionSchema>;

export const calcInteraction: CalculateMetadataFunction<InteractionProps> = ({ props }) => ({
  durationInFrames: Math.round(props.seconds * 30),
  fps: 30,
});

const Check: React.FC<{ size: number; draw: number; color: string; stroke: number }> = ({ size, draw, color, stroke }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path d="M4.5 12.5 L9.6 17.4 L19.5 6.8" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
  </svg>
);

const Heart: React.FC<{ size: number; fill: number; color: string; line: string }> = ({ size, fill, color, line }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", overflow: "visible" }}>
    <path
      d="M12 20.3 C 5.6 15.6 2.8 12.6 2.8 8.9 C 2.8 6.1 5 4 7.6 4 C 9.4 4 11 5 12 6.6 C 13 5 14.6 4 16.4 4 C 19 4 21.2 6.1 21.2 8.9 C 21.2 12.6 18.4 15.6 12 20.3 Z"
      fill={color}
      fillOpacity={fill}
      stroke={fill > 0.5 ? color : line}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
  </svg>
);

export const Interaction: React.FC<InteractionProps> = (p) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const f = feelOf(p.feel);
  const reduced = p.reducedMotion;
  const u = (Math.min(width, height) / 1080) * p.scale;
  const font = typefaceOf(p.typeface);

  // Timeline: settle, the pointer arrives, the press, (loading), the confirmation, a hold.
  const arrive = 0.35 * f.pace;
  const travel = 0.75 * f.pace;
  const press = arrive + travel + 0.25 * f.pace;
  const loads = p.kind === "button" && p.loading;
  const done = press + (loads ? 0.9 * f.pace : 0.12);
  const leave = done + 0.7 * f.pace;

  const cx = width / 2;
  const cy = height / 2 - (p.caption ? 30 * u : 0);
  // Pointer: from low right, onto the control, then a little away once it's done.
  const start = { x: cx + 360 * u, y: cy + 300 * u };
  const on = { x: cx + (p.kind === "toggle" ? 70 * u : 12 * u), y: cy + 10 * u };
  const away = { x: cx + 150 * u, y: cy + 150 * u };
  const ptr = reduced
    ? t < leave ? on : away
    : springTracks(
        t,
        [
          { t: 0, v: start },
          { t: arrive, v: on },
          { t: leave, v: away },
        ],
        { shape: "step4", omega: 9 / travel },
      );
  const pr = reduced ? 0 : pressAt(t, press);
  const ring = clamp01((t - press) / 0.45);
  const ptrIn = fade(t, arrive * 0.4, 0.25);

  const isDone = t >= done;
  const doneE = enter(t, done, p.feel, reduced);
  const sq = 1 - pr * (reduced ? 0 : 0.05);

  let control: React.ReactNode;
  if (p.kind === "button") {
    const loadingNow = loads && t >= press + 0.08 && !isDone;
    const bg = isDone ? p.success : p.color;
    const spin = (t - press) * 360 * 1.6;
    control = (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 16 * u,
          minWidth: 300 * u,
          height: 104 * u,
          padding: `0 ${46 * u}px`,
          borderRadius: 52 * u,
          background: bg,
          color: p.labelColor,
          fontFamily: font,
          fontWeight: 650,
          fontSize: 42 * u,
          transform: `scale(${sq})`,
          boxShadow: `0 ${18 * u}px ${44 * u}px -${18 * u}px rgba(0,0,0,0.45)`,
        }}
      >
        {loadingNow ? (
          reduced ? (
            <span style={{ letterSpacing: "0.2em" }}>…</span>
          ) : (
            <svg width={40 * u} height={40 * u} viewBox="0 0 24 24" style={{ transform: `rotate(${spin}deg)` }}>
              <circle cx="12" cy="12" r="9" fill="none" stroke={p.labelColor} strokeOpacity={0.25} strokeWidth={3} />
              <path d="M12 3 A 9 9 0 0 1 21 12" fill="none" stroke={p.labelColor} strokeWidth={3} strokeLinecap="round" />
            </svg>
          )
        ) : isDone ? (
          <>
            <Check size={44 * u} draw={reduced ? 1 : clamp01(doneE)} color={p.labelColor} stroke={3} />
            <span style={{ opacity: clamp01(doneE), transform: reduced ? "none" : `translateY(${(1 - clamp01(doneE)) * 10 * u}px)` }}>{p.doneLabel}</span>
          </>
        ) : (
          <span>{p.label}</span>
        )}
      </div>
    );
  } else if (p.kind === "toggle") {
    const k = isDone ? doneE : 0;
    const W = 168 * u;
    const H = 96 * u;
    const knob = H - 16 * u;
    control = (
      <div style={{ display: "flex", alignItems: "center", gap: 34 * u, transform: `scale(${sq})` }}>
        <div style={{ display: "grid", fontFamily: font, fontSize: 44 * u, fontWeight: 600, color: p.color, whiteSpace: "nowrap" }}>
          <span style={{ gridArea: "1/1", opacity: 1 - clamp01(k) }}>{p.label}</span>
          <span style={{ gridArea: "1/1", opacity: clamp01(k) }}>{p.doneLabel}</span>
        </div>
        <div
          style={{
            position: "relative",
            width: W,
            height: H,
            borderRadius: H,
            background: mixHex("#D9D2C4", p.success, clamp01(k)),
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 8 * u,
              left: 8 * u + (W - knob - 16 * u) * (reduced ? (isDone ? 1 : 0) : k),
              width: knob,
              height: knob,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isDone ? <Check size={44 * u} draw={reduced ? 1 : clamp01(doneE)} color={p.success} stroke={3.2} /> : null}
          </div>
        </div>
      </div>
    );
  } else {
    const pop = isDone && !reduced ? 1 + Math.sin(Math.min(1, (t - done) / 0.35) * Math.PI) * 0.22 * f.travel : 1;
    const burst = clamp01((t - done) / 0.55);
    control = (
      <div style={{ display: "flex", alignItems: "center", gap: 26 * u, transform: `scale(${sq})` }}>
        <div style={{ position: "relative", transform: `scale(${pop})` }}>
          {isDone && !reduced && burst < 1
            ? Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2;
                const r = (40 + burst * 70) * u;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: 60 * u + Math.cos(a) * r - 6 * u,
                      top: 60 * u + Math.sin(a) * r - 6 * u,
                      width: 12 * u,
                      height: 12 * u,
                      borderRadius: "50%",
                      background: p.success,
                      opacity: 1 - burst,
                    }}
                  />
                );
              })
            : null}
          <Heart size={120 * u} fill={isDone ? clamp01(doneE) : 0} color={p.success} line={p.muted} />
        </div>
        <div style={{ display: "grid", fontFamily: font, fontSize: 56 * u, fontWeight: 650, color: p.color, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ gridArea: "1/1", opacity: 1 - clamp01(doneE * (isDone ? 1 : 0)) }}>{p.label}</span>
          <span style={{ gridArea: "1/1", opacity: isDone ? clamp01(doneE) : 0 }}>{p.doneLabel}</span>
        </div>
      </div>
    );
  }

  const cardIn = enter(t, 0, p.feel, reduced);
  return (
    <AbsoluteFill style={{ backgroundColor: p.background }}>
      <div
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          transform: `translate(-50%, -50%) translateY(${reduced ? 0 : (1 - clamp01(cardIn)) * 30 * u}px)`,
          opacity: clamp01(cardIn * 1.4),
          padding: `${70 * u}px ${90 * u}px`,
          borderRadius: 44 * u,
          background: p.surface,
          boxShadow: `0 ${30 * u}px ${80 * u}px -${36 * u}px rgba(60,45,20,0.35), 0 0 0 ${1.5 * u}px rgba(0,0,0,0.05)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {control}
      </div>
      {p.caption ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: cy + 190 * u,
            textAlign: "center",
            fontFamily: font,
            fontSize: 36 * u,
            fontWeight: 500,
            color: p.color,
            opacity: isDone ? clamp01(doneE) * 0.72 : 0,
          }}
        >
          {p.caption}
        </div>
      ) : null}
      <Pointer x={ptr.x} y={ptr.y} press={pr} ring={t > press ? ring : 0} u={u} kind={p.trigger === "tap" ? "tap" : "arrow"} opacity={ptrIn} />
    </AbsoluteFill>
  );
};

export const interactionDefaults: InteractionProps = {
  kind: "button",
  label: "Save",
  doneLabel: "Saved",
  loading: true,
  caption: "Saved to your Library",
  trigger: "click",
  background: "#FBF9F4",
  surface: "#FFFFFF",
  color: "#17130D",
  labelColor: "#FFFFFF",
  success: "#1F7A4A",
  muted: "#8E8574",
  scale: 1.3,
  typeface: "inter",
  seconds: 4,
  feel: "precise",
  reducedMotion: false,
};
