import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { clamp01, enter, fade, feelOf, feelSchema, typefaceOf, typefaceSchema } from "../../lib/feel";
import { springTrack, springTracks } from "../../lib/motion";
import { Pointer, pressAt } from "../../lib/pointer";

// A product shown in action from its real screens: a pointer moves to the thing that
// matters, pauses, clicks; the next real screen follows; a caption says what happened;
// a closing line ends it. Only the screens you supply are shown (a change between two
// screens is a short crossfade, never an invented in-between state). Pointer targets are
// fractions of each screen (0 to 1 from its top left).

export const productDemoSchema = z.object({
  screens: z.array(z.object({ image: z.string(), label: z.string().default("") })).min(1).max(8),
  frame: z.enum(["browser", "phone", "none"]).default("browser"),
  url: z.string().default(""),
  steps: z
    .array(
      z.object({
        screen: z.number().int().min(0).default(0),
        x: z.number().min(0).max(1).default(0.5),
        y: z.number().min(0).max(1).default(0.5),
        action: z.enum(["click", "point", "none"]).default("click"),
        caption: z.string().default(""),
        zoom: z.boolean().default(false),
        /** How long this step lasts; the click lands near its end, after a short pause. */
        seconds: z.number().min(1).max(10).default(2.6),
      }),
    )
    .min(1)
    .max(12),
  closing: z.string().default(""),
  closingSeconds: z.number().min(0).max(6).default(2.2),
  pointer: z.enum(["arrow", "tap"]).default("arrow"),
  background: z.string().default("#F1ECE1"),
  text: z.string().default("#17130D"),
  accent: z.string().default("#D6A33B"),
  typeface: typefaceSchema,
  feel: feelSchema,
  reducedMotion: z.boolean().default(false),
});
export type ProductDemoProps = z.infer<typeof productDemoSchema>;

const timeline = (p: ProductDemoProps) => {
  let at = 0.4;
  const starts = p.steps.map((s) => {
    const v = at;
    at += s.seconds;
    return v;
  });
  return { starts, stepsEnd: at, total: at + (p.closing ? p.closingSeconds : 0.3) };
};

export const calcProductDemo: CalculateMetadataFunction<ProductDemoProps> = ({ props }) => ({
  durationInFrames: Math.round(timeline(props).total * 30),
  fps: 30,
});

export const ProductDemo: React.FC<ProductDemoProps> = (p) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const f = feelOf(p.feel);
  const reduced = p.reducedMotion;
  const font = typefaceOf(p.typeface);
  const portrait = height > width * 1.2;
  const u = Math.min(width, height) / 1080;
  const { starts, stepsEnd } = timeline(p);
  const idx = Math.max(0, starts.filter((s) => t >= s).length - 1);
  const step = p.steps[idx];
  const scr = (i: number) => Math.min(p.screens.length - 1, Math.max(0, i));

  // The device: a browser window, a phone, or the bare screen. Screens are 16:10-ish
  // desktop captures in a browser and tall captures on a phone; both fit the width.
  const phone = p.frame === "phone";
  const bar = p.frame === "browser" ? 44 * u : 0;
  // Sized to fit the frame with room for the caption underneath.
  const capSpace = portrait ? 260 * u : 150 * u;
  const room = height - capSpace - 80 * u - bar;
  const ratio = phone ? 2.05 : 0.625;
  const devW = Math.min(phone ? width * 0.62 : portrait ? width * 0.92 : width * 0.78, room / ratio);
  const screenH = devW * ratio;
  const devH = screenH + bar;
  const devX = (width - devW) / 2;
  const devY = Math.max(40 * u, (height - devH - capSpace) / 2);

  // Pointer path: to each step's target, 0.15 s after the step starts.
  const tgt = (i: number) => ({ x: devX + p.steps[i].x * devW, y: devY + bar + p.steps[i].y * screenH });
  const move = 0.65 * f.pace;
  const ptr = reduced
    ? tgt(idx)
    : springTracks(
        t,
        [{ t: 0, v: { x: devX + devW * 0.86, y: devY + bar + screenH * 0.92 } }, ...p.steps.map((s, i) => ({ t: starts[i] + 0.15, v: tgt(i) }))],
        { shape: "step4", omega: 9 / move },
      );
  const clickAt = (i: number) => starts[i] + p.steps[i].seconds - 0.45;
  const isClick = step.action === "click";
  const pr = isClick && !reduced ? pressAt(t, clickAt(idx)) : 0;
  const ring = isClick ? clamp01((t - clickAt(idx)) / 0.5) : 0;

  // Camera: zooms toward the target on steps marked zoom, back out otherwise.
  const zoomKeys = [{ t: 0, v: 0 }, ...p.steps.map((s, i) => ({ t: starts[i] + 0.1, v: s.zoom ? 1 : 0 })), { t: stepsEnd, v: 0 }];
  const z = reduced ? 0 : springTrack(t, zoomKeys, { omega: f.omega * 0.6, zeta: 1 });
  // The zoom's centre follows the targets with the same calm spring, so it never jumps.
  const zt = reduced
    ? tgt(idx)
    : springTracks(t, [{ t: 0, v: tgt(0) }, ...p.steps.map((s, i) => ({ t: starts[i] + 0.1, v: tgt(i) }))], { omega: f.omega * 0.6, zeta: 1 });
  const scale = 1 + 0.32 * z;

  // Screens: the current one, crossfading from the previous one when it changes.
  const cur = scr(step.screen);
  const prev = idx > 0 ? scr(p.steps[idx - 1].screen) : cur;
  const xf = cur !== prev ? fade(t, starts[idx], 0.3) : 1;

  // Closing: the device steps back and the line arrives.
  const closeE = p.closing ? enter(t, stepsEnd, p.feel, reduced) : 0;
  const inClose = p.closing && t >= stepsEnd;
  const capIn = fade(t, starts[idx] + 0.2, 0.3) * (1 - clamp01((t - (starts[idx] + step.seconds - 0.2)) / 0.2));

  const shot = (i: number, o: number) => (
    <Img key={`${i}-${o > 0.999 ? "a" : "b"}`} src={staticFile(p.screens[i].image)} style={{ position: "absolute", left: 0, top: 0, width: devW, height: screenH, objectFit: "cover", objectPosition: "top", opacity: o }} />
  );

  return (
    <AbsoluteFill style={{ backgroundColor: p.background }}>
      <AbsoluteFill
        style={{
          transformOrigin: `${zt.x}px ${zt.y}px`,
          transform: `scale(${scale * (inClose && !reduced ? 1 - 0.12 * clamp01(closeE) : 1)})`,
          opacity: inClose ? 1 - 0.96 * clamp01(closeE) : clamp01(enter(t, 0, p.feel, reduced) * 1.5),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: devX,
            top: devY,
            width: devW,
            height: devH,
            borderRadius: phone ? 54 * u : 18 * u,
            overflow: "hidden",
            background: "#fff",
            boxShadow: `0 ${40 * u}px ${90 * u}px -${40 * u}px rgba(50,35,10,0.5), 0 0 0 ${phone ? 12 * u : 1.5 * u}px ${phone ? "#111" : "rgba(0,0,0,0.08)"}`,
          }}
        >
          {bar ? (
            <div style={{ height: bar, display: "flex", alignItems: "center", gap: 9 * u, padding: `0 ${16 * u}px`, background: "#F3EFE6", borderBottom: `${1 * u}px solid rgba(0,0,0,0.06)` }}>
              {["#E8776B", "#E9BE5A", "#7CC27A"].map((c) => (
                <div key={c} style={{ width: 12 * u, height: 12 * u, borderRadius: "50%", background: c }} />
              ))}
              {p.url ? (
                <div style={{ marginLeft: 18 * u, padding: `${6 * u}px ${18 * u}px`, borderRadius: 999, background: "#fff", fontFamily: typefaceOf("inter"), fontSize: 18 * u, color: "#6F6658" }}>{p.url}</div>
              ) : null}
            </div>
          ) : null}
          <div style={{ position: "relative", width: devW, height: screenH, overflow: "hidden" }}>
            {xf < 1 ? shot(prev, 1) : null}
            {shot(cur, xf)}
            {/* The highlight: a soft ring around the target while the step is active. */}
            {step.action !== "none" && !inClose ? (
              <div
                style={{
                  position: "absolute",
                  left: step.x * devW - 46 * u,
                  top: step.y * screenH - 46 * u,
                  width: 92 * u,
                  height: 92 * u,
                  borderRadius: "50%",
                  border: `${4 * u}px solid ${p.accent}`,
                  boxShadow: `0 0 0 ${9999}px rgba(20,14,4,${0.18 * fade(t, starts[idx] + 0.15 + move, 0.3)})`,
                  opacity: fade(t, starts[idx] + 0.15 + move * 0.8, 0.25),
                }}
              />
            ) : null}
          </div>
        </div>
        {!inClose ? <Pointer x={ptr.x} y={ptr.y} press={pr} ring={t > clickAt(idx) ? ring : 0} u={u * 1.2} kind={p.pointer} opacity={fade(t, 0.2, 0.3)} /> : null}
      </AbsoluteFill>

      {step.caption && !inClose ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: devY + devH + (portrait ? 70 : 44) * u, display: "flex", justifyContent: "center", opacity: capIn }}>
          <div
            style={{
              padding: `${18 * u}px ${34 * u}px`,
              borderRadius: 999,
              background: p.text,
              color: p.background,
              fontFamily: font,
              fontSize: (portrait ? 44 : 36) * u,
              fontWeight: 600,
              maxWidth: width * 0.86,
              textAlign: "center",
              transform: reduced ? "none" : `translateY(${(1 - capIn) * 12 * u}px)`,
            }}
          >
            {step.caption}
          </div>
        </div>
      ) : null}

      {inClose ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: width * 0.1 }}>
          <div
            style={{
              fontFamily: font,
              fontSize: (portrait ? 96 : 86) * u,
              fontWeight: 700,
              lineHeight: 1.08,
              textAlign: "center",
              color: p.text,
              opacity: clamp01(closeE),
              transform: reduced || closeE >= 1 ? "none" : `translateY(${(1 - clamp01(closeE)) * 30 * u * f.travel}px)`,
            }}
          >
            {p.closing}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// The 7 Studios app itself (real screens): open the Motion studio, pick a template.
export const productDemoDefaults: ProductDemoProps = {
  screens: [
    { image: "brand/demo/7s-home.jpg", label: "Home" },
    { image: "brand/demo/7s-motion.jpg", label: "Motion studio" },
  ],
  frame: "browser",
  url: "127.0.0.1:7777",
  steps: [
    { screen: 0, x: 0.052, y: 0.344, action: "click", caption: "Open the Motion studio", zoom: false, seconds: 2.6 },
    { screen: 1, x: 0.733, y: 0.31, action: "click", caption: "Pick a template: it plays as you type", zoom: true, seconds: 3 },
  ],
  closing: "Make it move in 7 Studios.",
  closingSeconds: 2.2,
  pointer: "arrow",
  background: "#F1ECE1",
  text: "#17130D",
  accent: "#D6A33B",
  typeface: "fraunces",
  feel: "precise",
  reducedMotion: false,
};
