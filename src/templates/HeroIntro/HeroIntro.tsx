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

// A website's first screen brought to life: the exact headline, supporting line and
// button, with ONE element given the main movement (the headline, the visual or the
// button) and everything else arriving quietly. It settles into the static hero, which
// must work on its own; the 9:16 format is the mobile layout. With no visual, a clearly
// marked placeholder stands in: nothing is invented.

export const heroIntroSchema = z.object({
  brand: z.string().default(""),
  logo: z.string().default("").describe("Optional: a logo file under public/, shown instead of the brand name"),
  nav: z.array(z.string()).max(4).default([]),
  headline: z.string(),
  sub: z.string().default(""),
  button: z.string().default(""),
  visual: z.string().default("").describe("An image under public/; empty shows a marked placeholder"),
  visualFrame: z.enum(["none", "browser", "phone"]).default("browser"),
  animate: z.enum(["headline", "visual", "button"]).default("headline"),
  background: z.string().default("#FBF9F4"),
  text: z.string().default("#17130D"),
  muted: z.string().default("#6F6658"),
  accent: z.string().default("#D6A33B"),
  buttonText: z.string().default("#241A05"),
  typeface: typefaceSchema,
  seconds: z.number().min(2).max(12).default(5),
  feel: feelSchema,
  reducedMotion: z.boolean().default(false),
});
export type HeroIntroProps = z.infer<typeof heroIntroSchema>;

export const calcHeroIntro: CalculateMetadataFunction<HeroIntroProps> = ({ props }) => ({
  durationInFrames: Math.round(props.seconds * 30),
  fps: 30,
});

const Visual: React.FC<{ p: HeroIntroProps; w: number; u: number }> = ({ p, w, u }) => {
  const radius = 18 * u;
  const inner = p.visual ? (
    <Img src={staticFile(p.visual)} style={{ width: "100%", display: "block" }} />
  ) : (
    <div
      style={{
        width: "100%",
        aspectRatio: "16 / 10",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `repeating-linear-gradient(135deg, ${p.accent}22 0 ${18 * u}px, transparent ${18 * u}px ${36 * u}px)`,
        color: p.muted,
        fontFamily: typefaceOf("inter"),
        fontSize: 26 * u,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
      }}
    >
      Placeholder: your visual
    </div>
  );
  if (p.visualFrame === "phone")
    return (
      <div style={{ width: w * 0.5, padding: 12 * u, borderRadius: 46 * u, background: "#111", boxShadow: `0 ${30 * u}px ${70 * u}px -${30 * u}px rgba(0,0,0,0.5)` }}>
        <div style={{ borderRadius: 36 * u, overflow: "hidden" }}>{inner}</div>
      </div>
    );
  if (p.visualFrame === "browser")
    return (
      <div style={{ width: w, borderRadius: radius, overflow: "hidden", background: "#fff", boxShadow: `0 ${34 * u}px ${80 * u}px -${34 * u}px rgba(60,45,20,0.45), 0 0 0 ${1.5 * u}px rgba(0,0,0,0.08)` }}>
        <div style={{ height: 34 * u, display: "flex", alignItems: "center", gap: 8 * u, padding: `0 ${14 * u}px`, background: "#F3EFE6" }}>
          {["#E8776B", "#E9BE5A", "#7CC27A"].map((c) => (
            <div key={c} style={{ width: 11 * u, height: 11 * u, borderRadius: "50%", background: c }} />
          ))}
        </div>
        {inner}
      </div>
    );
  return <div style={{ width: w, borderRadius: radius, overflow: "hidden" }}>{inner}</div>;
};

export const HeroIntro: React.FC<HeroIntroProps> = (p) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const f = feelOf(p.feel);
  const reduced = p.reducedMotion;
  const portrait = height > width * 1.2;
  const square = !portrait && height > width * 0.8;
  const u = (portrait ? width / 1080 : Math.min(width / 1920, height / 1080)) * (square ? 1.1 : 1);
  const font = typefaceOf(p.typeface);
  const main = p.animate;

  // Supporting elements arrive quietly; the chosen one gets the brand's full movement.
  const quiet = (start: number) => (reduced ? fade(t, start, 0.25) : fade(t, start, 0.45));
  const nav = quiet(0.05);
  const words = p.headline.split(/\s+/).filter(Boolean);
  const headStart = 0.25 * f.pace;
  const subStart = (main === "headline" ? headStart + words.length * 0.07 * f.pace + 0.2 : 0.35) * 1;
  const btnStart = main === "button" ? subStart + 0.45 * f.pace : subStart + 0.15;
  const visStart = main === "visual" ? 0.3 * f.pace : 0.5;

  const headSize = (portrait ? 104 : square ? 76 : 96) * u;
  const headline = (
    <h1 style={{ margin: 0, fontFamily: font, fontWeight: 700, fontSize: headSize, lineHeight: 1.04, letterSpacing: "-0.02em", color: p.text }}>
      {words.map((w, i) => {
        if (main !== "headline") return <span key={i}>{w} </span>;
        const e = enter(t, headStart + i * 0.07 * f.pace, p.feel, reduced);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: headSize * 0.08, marginBottom: -headSize * 0.08 }}>
            <span style={{ display: "inline-block", transform: reduced || e >= 1 ? "none" : `translateY(${(1 - e) * 105 * Math.min(1.2, f.travel + 0.2)}%)`, opacity: reduced ? clamp01(e) : 1 }}>{w}&nbsp;</span>
          </span>
        );
      })}
    </h1>
  );
  const headOpacity = main === "headline" ? 1 : quiet(0.15);

  const btnE = main === "button" ? enter(t, btnStart, p.feel, reduced) : quiet(btnStart);
  const shine = main === "button" && !reduced ? clamp01((t - btnStart - 0.35) / 0.6) : 0;
  const button = p.button ? (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        alignSelf: "flex-start",
        padding: `${24 * u}px ${44 * u}px`,
        borderRadius: 999,
        background: p.accent,
        color: p.buttonText,
        fontFamily: font,
        fontWeight: 650,
        fontSize: 34 * u,
        opacity: clamp01(btnE),
        transform: main === "button" && !reduced && btnE < 1 ? `scale(${0.7 + 0.3 * btnE})` : "none",
        boxShadow: `0 ${14 * u}px ${30 * u}px -${12 * u}px ${p.accent}`,
      }}
    >
      {p.button}
      {shine > 0 && shine < 1 ? (
        <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", left: `${-40 + shine * 140}%`, background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.6), transparent)" }} />
      ) : null}
    </div>
  ) : null;

  const visE = main === "visual" ? enter(t, visStart, p.feel, reduced) : quiet(visStart);
  const stacked = portrait || square;
  const visW = portrait ? width * 0.86 : square ? width * 0.62 : width * 0.44;
  const visual = (
    <div
      style={{
        opacity: clamp01(visE),
        transform:
          main === "visual" && !reduced && visE < 1
            ? `translate${portrait ? "Y" : "X"}(${(1 - visE) * 90 * u * f.travel}px) scale(${0.94 + 0.06 * visE})`
            : "none",
      }}
    >
      <Visual p={p} w={visW} u={u} />
    </div>
  );

  const text = (
    <div style={{ display: "flex", flexDirection: "column", gap: 34 * u, maxWidth: stacked ? width * 0.84 : width * 0.42 }}>
      <div style={{ opacity: headOpacity }}>{headline}</div>
      {p.sub ? <p style={{ margin: 0, fontFamily: font, fontSize: 36 * u, lineHeight: 1.4, color: p.muted, opacity: quiet(subStart) }}>{p.sub}</p> : null}
      {button}
    </div>
  );

  const pad = (portrait ? 70 : 90) * u;
  return (
    <AbsoluteFill style={{ backgroundColor: p.background }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at ${portrait ? "50% 80%" : "78% 50%"}, ${p.accent}26, transparent 60%)`, opacity: nav }} />
      <div style={{ position: "absolute", left: pad, right: pad, top: pad * 0.7, display: "flex", alignItems: "center", justifyContent: "space-between", opacity: nav }}>
        {p.logo ? (
          <Img src={staticFile(p.logo)} style={{ height: 54 * u }} />
        ) : (
          <div style={{ fontFamily: font, fontSize: 34 * u, fontWeight: 700, color: p.text }}>{p.brand}</div>
        )}
        <div style={{ display: "flex", gap: 36 * u, fontFamily: font, fontSize: 26 * u, color: p.muted }}>
          {(portrait ? [] : p.nav).map((n) => (
            <span key={n}>{n}</span>
          ))}
          {portrait && p.nav.length ? <span style={{ fontSize: 40 * u, lineHeight: 1 }}>≡</span> : null}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: `${pad * 2.1}px ${pad}px ${pad}px`,
          display: "flex",
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "center",
          justifyContent: stacked ? "center" : "space-between",
          gap: (portrait ? 90 : 60) * u,
        }}
      >
        {text}
        {visual}
      </div>
    </AbsoluteFill>
  );
};

export const heroIntroDefaults: HeroIntroProps = {
  brand: "7 Studios",
  logo: "",
  nav: ["Studios", "Library", "Settings"],
  headline: "Making dreams, creating realities.",
  sub: "Seven studios for images, video, edits and motion, made on your own computer.",
  button: "Open 7 Studios",
  visual: "brand/demo/7s-home.jpg",
  visualFrame: "browser",
  animate: "headline",
  background: "#FBF9F4",
  text: "#17130D",
  muted: "#6F6658",
  accent: "#D6A33B",
  buttonText: "#241A05",
  typeface: "fraunces",
  seconds: 5,
  feel: "precise",
  reducedMotion: false,
};
