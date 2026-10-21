import React from "react";
import { AbsoluteFill, Img, interpolate, OffthreadVideo, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font, springs, useBrand } from "../lib";

// Talking-head looks for FootageEdit, switchable per section (edl.json "look" + "sections"):
//   classic    the pop captions (FootageEdit's own)
//   bold       kinetic lowercase words around the speaker; the punch word, huge and yellow, sits behind their head
//   cool-girl  warm grade, calm lowercase captions; the punch line in a yellow serif italic with sparkles; your reels orbit you
//   cool-dude  dark editorial: the room falls back, the speaker stays lit; tiny spaced capitals and big serif words
// "Behind" means between the background and the cut-out speaker (scripts/matte.mjs).

export type LookName = "classic" | "bold" | "cool-girl" | "cool-dude";
export type LookRange = { from: number; to: number; look: LookName };
export type Cue = { startMs: number; endMs: number; words: { text: string; startMs: number; endMs: number }[] };
export type Punch = { text: string; startMs: number; endMs: number; look: LookName; cueStartMs: number; cueEndMs: number; y?: number };
export type OrbitItem = { src: string; credit: string | null; image: boolean };

export const YELLOW = "#FFD60A";
const SERIF_YELLOW = "#FFD34E";
const HOUSE_PUNCH = "#FFD60A"; // the house punch colour; a brand kit's own punch colour replaces both yellows
const clean = (t: string) => t.replace(/[.,!?;:]+$/, "");
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

export const lookAt = (ranges: LookRange[], frame: number): LookName => ranges.find((r) => frame >= r.from && frame < r.to)?.look ?? "classic";

const useU = () => {
  const { width, height } = useVideoConfig();
  return { u: Math.min(width, height) / 1080, width, height };
};

// ---------- the words behind the head (bold, cool-dude) ----------
export const PunchBehind: React.FC<{ punches: Punch[]; hasMatte: boolean }> = ({ punches, hasMatte }) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  const ms = (frame / fps) * 1000;
  const p = punches.find((x) => (x.look === "bold" || x.look === "cool-dude") && ms >= x.startMs - 40 && ms < x.endMs);
  if (!p) return null;
  const local = frame - Math.round((p.startMs / 1000) * fps);
  const outF = Math.round(((p.endMs - p.startMs) / 1000) * fps);
  const enter = spring({ frame: local + 1, fps, config: p.look === "bold" ? springs.punch : springs.smooth, durationInFrames: p.look === "bold" ? 10 : 16 });
  const exit = interpolate(local, [outF - 6, outF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const bold = p.look === "bold";
  const text = bold ? p.text.toLowerCase() : p.text;
  const size = Math.min((bold ? 330 : 230) * u, (0.94 * width) / Math.max(3, text.length * (bold ? 0.58 : 0.52)));
  // With a cutout the word sits across the head, behind it; without one it moves above the head.
  const y = hasMatte ? (p.y ?? 0.26) : 0.1;
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: height * y,
          transform: `translateY(-50%) scale(${interpolate(enter, [0, 1], [bold ? 0.55 : 0.92, 1])}) rotate(${bold ? interpolate(enter, [0, 1], [-4, 0]) : 0}deg)`,
          opacity: Math.min(1, enter * 1.5) * exit,
          fontFamily: bold ? brand.displayFont : brand.serifFont,
          fontWeight: bold ? 900 : 600,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: bold ? "-0.04em" : "-0.02em",
          color: bold ? brand.punch : brand.text,
          whiteSpace: "nowrap",
          textShadow: bold ? `0 ${8 * u}px ${30 * u}px rgba(0,0,0,0.35)` : `0 ${6 * u}px ${40 * u}px rgba(0,0,0,0.5)`,
          fontVariationSettings: bold ? undefined : '"opsz" 144, "SOFT" 30',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// ---------- sparkles (cool-girl punch line) ----------
const Star: React.FC<{ x: number; y: number; s: number; o: number; c: string }> = ({ x, y, s, o, c }) => (
  <svg width={s} height={s} viewBox="-10 -10 20 20" style={{ position: "absolute", left: x - s / 2, top: y - s / 2, opacity: o, overflow: "visible" }}>
    <path d="M0,-10 C1.2,-2 2,-1.2 10,0 C2,1.2 1.2,2 0,10 C-1.2,2 -2,1.2 -10,0 C-2,-1.2 -1.2,-2 0,-10 Z" fill={c} />
  </svg>
);

// ---------- captions per look ----------
export const LookCaptions: React.FC<{ cues: Cue[]; punches: Punch[]; look: LookName; position: number; emphasis: string[] }> = ({ cues, punches, look, position, emphasis }) => {
  const brand = useBrand();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  const ms = (frame / fps) * 1000;
  const cue = cues.find((q) => ms >= q.startMs && ms < q.endMs);
  if (!cue) return null;
  const cueFrame = frame - Math.round((cue.startMs / 1000) * fps);
  const punch = punches.find((p) => p.cueStartMs === cue.startMs);
  const isPunchWord = (w: string) => (punch && norm(w) === norm(punch.text)) || emphasis.some((e) => norm(e) === norm(w));

  if (look === "cool-girl" && punch && punch.look === "cool-girl") {
    // The punch line: yellow serif italic with sparkles twinkling around it.
    const enter = spring({ frame: cueFrame + 1, fps, config: springs.smooth, durationInFrames: 14 });
    const size = Math.min(96 * u, (0.86 * width) / Math.max(6, cue.words.map((w) => w.text).join(" ").length * 0.42));
    const stars = Array.from({ length: 7 }, (_, i) => {
      const a = random(`st${cue.startMs}${i}`) * Math.PI * 2;
      const r = 0.55 + random(`sr${cue.startMs}${i}`) * 0.5;
      const tw = 0.5 + 0.5 * Math.sin((frame + i * 7) / 4);
      return { x: width / 2 + Math.cos(a) * width * 0.4 * r, y: height * position + Math.sin(a) * size * 1.3 * r, s: (26 + random(`ss${i}`) * 30) * u, o: tw * enter };
    });
    return (
      <AbsoluteFill>
        {stars.map((s, i) => (
          <Star key={i} {...s} c={i % 3 ? "#FFFFFF" : brand.punch === HOUSE_PUNCH ? SERIF_YELLOW : brand.punch} />
        ))}
        <div
          style={{
            position: "absolute",
            top: height * position,
            width: "100%",
            textAlign: "center",
            transform: `translateY(-50%) translateY(${interpolate(enter, [0, 1], [16 * u, 0])}px)`,
            opacity: enter,
            fontFamily: brand.serifFont,
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: size,
            lineHeight: 1.05,
            color: brand.punch === HOUSE_PUNCH ? SERIF_YELLOW : brand.punch,
            textShadow: `0 ${4 * u}px ${24 * u}px rgba(0,0,0,0.45)`,
            padding: `0 ${0.07 * width}px`,
            boxSizing: "border-box",
          }}
        >
          {cue.words.map((w) => w.text.toLowerCase()).join(" ")}
        </div>
      </AbsoluteFill>
    );
  }

  if (look === "bold") {
    // Kinetic lowercase: each word springs up as it's said; the punch word is yellow.
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", top: height * position, width: "100%", transform: "translateY(-50%)", textAlign: "center", padding: `0 ${0.09 * width}px`, boxSizing: "border-box" }}>
          {cue.words.map((w, i) => {
            const wf = frame - Math.round((w.startMs / 1000) * fps);
            const s = spring({ frame: wf + 1, fps, config: springs.snappy, durationInFrames: 8 });
            const on = wf >= -1;
            const hot = isPunchWord(w.text);
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  margin: `0 ${0.14 * 66 * u}px`,
                  fontFamily: brand.displayFont,
                  fontWeight: 800,
                  fontSize: 66 * u,
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  color: hot ? brand.punch : brand.text,
                  opacity: on ? s : 0,
                  transform: `translateY(${interpolate(s, [0, 1], [26 * u, 0])}px) scale(${interpolate(s, [0, 1], [0.8, 1])})`,
                  textShadow: `0 ${3 * u}px ${16 * u}px rgba(0,0,0,0.55)`,
                }}
              >
                {clean(w.text).toLowerCase()}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  // cool-girl (calm lowercase) and cool-dude (tiny spaced capitals).
  const dude = look === "cool-dude";
  const enter = interpolate(cueFrame, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: height * position,
          width: "100%",
          transform: "translateY(-50%)",
          textAlign: "center",
          opacity: enter,
          padding: `0 ${0.1 * width}px`,
          boxSizing: "border-box",
          fontFamily: font.body,
          fontWeight: dude ? 600 : 500,
          fontSize: (dude ? 27 : 48) * u,
          letterSpacing: dude ? "0.42em" : "0.005em",
          textTransform: dude ? "uppercase" : "lowercase",
          lineHeight: dude ? 1.7 : 1.2,
          color: dude ? "rgba(244,239,230,0.88)" : color.text,
          // Thin spaced capitals need a firmer shadow to read over bright clothes.
          textShadow: dude ? `0 0 ${10 * u}px rgba(0,0,0,0.9), 0 ${2 * u}px ${22 * u}px rgba(0,0,0,0.75)` : `0 ${2 * u}px ${14 * u}px rgba(0,0,0,0.6)`,
        }}
      >
        {cue.words.map((w) => clean(w.text)).join(" ")}
      </div>
    </AbsoluteFill>
  );
};

// ---------- your reels orbiting you (cool-girl) ----------
// Each card goes round the head on a flat ellipse; the far half of the orbit is
// drawn behind the speaker, the near half in front. Place it in a <Sequence>
// covering one cool-girl section, so the reels play from their start.
export const Orbit: React.FC<{ items: OrbitItem[]; durationInFrames: number; half: "back" | "front" }> = ({ items, durationInFrames, half }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, width, height } = useU();
  if (!items.length) return null;
  const t = frame / fps;
  const fade = Math.min(interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }), interpolate(durationInFrames - frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }));
  const cw = 170 * u;
  const ch = (cw * 16) / 9;
  return (
    <AbsoluteFill>
      {items.map((it, i) => {
        const a = (2 * Math.PI * t) / 9 + (i * 2 * Math.PI) / items.length;
        const depth = Math.sin(a);
        if ((half === "front") !== depth > 0) return null;
        const x = width / 2 + Math.cos(a) * width * 0.4;
        const y = height * 0.33 + depth * height * 0.07;
        const sc = 0.78 + 0.22 * (depth + 1) / 2;
        // In front, cards keep to the sides: they fade out before they would cross the face.
        const side = half === "front" ? Math.min(1, Math.max(0, (Math.abs(Math.cos(a)) - 0.45) / 0.25)) : 1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - cw / 2,
              top: y - ch / 2,
              width: cw,
              height: ch,
              transform: `scale(${sc}) rotate(${Math.cos(a) * -8}deg)`,
              opacity: fade * side * (0.65 + 0.35 * (depth + 1) / 2),
              borderRadius: 18 * u,
              overflow: "hidden",
              border: `${3 * u}px solid rgba(255,255,255,0.9)`,
              boxShadow: `0 ${14 * u}px ${36 * u}px rgba(0,0,0,0.4)`,
              background: "#111",
            }}
          >
            {it.image ? (
              <Img src={staticFile(it.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <OffthreadVideo src={staticFile(it.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
            {it.credit ? (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: `${8 * u}px`, fontFamily: font.body, fontWeight: 700, fontSize: 18 * u, color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,0.65))" }}>{it.credit}</div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
