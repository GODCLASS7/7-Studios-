import React, { useEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { font } from "../lib";

// Over-the-shoulder zoom (after "Effect of the Day" EP. 04): the camera pushes
// in on the speaker, looks to a card over one shoulder, whips across to a card
// over the other and eases back out. Style "transition": the start card's big
// text breaks into points of light, streaks across at light speed and rebuilds
// as the end card's big text.
//
// Two parts: shoulderCamera() moves the footage layer (FootageEdit wraps the
// footage in it), and <ShoulderCards> draws the cards and streaks above it.
// Times are seconds from the start of the move; the whole move takes 4.6 s.
// Geometry is authored on a 1080×1920 frame and scaled to the composition.

export type ShoulderCard = { label: string; big: string; small: string };
export type ShoulderZoomProps = {
  id: string;
  style: "normal" | "transition";
  start: ShoulderCard;
  end: ShoulderCard;
  accent: string;
  faceX: number; // face centre across the frame, 0–1
  faceWidth: number; // head width as a share of the frame width
  eyeY: number; // eye height, 0 (top) – 1
};
export const SHOULDER_SECONDS = 4.6;

const INK = "#1F1E1B";
const GREY = "#8A8A8E";
const k = (t: number, a: number, b: number, from: number, to: number, ease = Easing.bezier(0.16, 1, 0.3, 1)) =>
  interpolate(t, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

// ---------- camera: measured curves, zoom in log space, every move lands exactly
type Move = { t: number; kind: "in" | "pan" | "whip" | "drift" | "return"; to: number; x?: number; dur?: number };
const CURVES = { in: [0, 0.21, 0.43, 0.61, 0.73, 0.83, 0.9, 0.96, 1], out: [0, 0.14, 0.37, 0.57, 0.71, 0.8, 0.87, 0.94, 1] };
const CURVE_OF: Record<Move["kind"], "in" | "out"> = { in: "in", pan: "in", whip: "in", drift: "out", return: "out" };
const DUR_OF: Record<Move["kind"], number> = { in: 0.36, pan: 0.42, whip: 0.5, drift: 0.42, return: 0.9 };
const progress = (kind: Move["kind"], u: number) => {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const p = CURVES[CURVE_OF[kind]];
  const x = u * (p.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const m = (j: number) => (p[Math.min(j + 1, p.length - 1)] - p[Math.max(j - 1, 0)]) / (Math.min(j + 1, p.length - 1) - Math.max(j - 1, 0));
  return (2 * f ** 3 - 3 * f ** 2 + 1) * p[i] + (f ** 3 - 2 * f ** 2 + f) * m(i) + (-2 * f ** 3 + 3 * f ** 2) * p[i + 1] + (f ** 3 - f ** 2) * m(i + 1);
};
const MOVES: Move[] = [
  { t: 0.05, kind: "in", to: 1.25, dur: 0.5 },
  { t: 0.9, kind: "pan", to: 1.25, x: 110 },
  { t: 2.4, kind: "whip", to: 1.27, x: -110 },
  { t: 2.9, kind: "drift", to: 1.25, dur: 0.2 },
  { t: 3.7, kind: "return", to: 1.0, x: 0 },
];
const cameraAt = (t: number) => {
  let z = 1;
  let x = 0;
  for (const m of MOVES) {
    if (t < m.t) break;
    const d = m.dur ?? DUR_OF[m.kind];
    const u = (t - m.t) / d;
    const p = progress(m.kind, u);
    const from = z;
    const fx = x;
    z = Math.exp(Math.log(from) + (Math.log(m.to) - Math.log(from)) * p);
    if (m.x !== undefined) x = fx + (m.x - fx) * p;
    if (u >= 1) {
      z = m.to;
      if (m.x !== undefined) x = m.x;
    }
  }
  return { z, x };
};

// CSS transform for the footage layer at time t (seconds into the move). The
// framing fit (head about a third of the frame wide, eyes a quarter down) blends
// in with the push and out with the pull, so the cut into and out of the move is seamless.
export const shoulderCamera = (t: number, p: Pick<ShoulderZoomProps, "faceX" | "faceWidth" | "eyeY">, width: number, height: number) => {
  if (t < 0 || t > SHOULDER_SECONDS) return undefined;
  const u = width / 1080;
  const { z, x: cx } = cameraAt(t);
  const blend = Math.min(1, Math.max(0, (z - 1) / 0.25));
  const s = 1 + (Math.max(1, 0.32 / p.faceWidth) - 1) * blend;
  const tx = Math.min(0, Math.max(width - s * width, width / 2 - s * p.faceX * width)) * blend;
  const ty = Math.min(0, Math.max(height - s * height, 0.255 * height - s * p.eyeY * height)) * blend;
  const room = (width / 2) * (z - 1);
  const x = Math.max(-room, Math.min(room, cx * u));
  return {
    outer: { transform: `translate(${x}px, 0px) scale(${z})`, transformOrigin: `${0.5 * width}px ${0.25 * height}px` },
    inner: { transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: "0 0" },
  };
};

// ---------- the cards (authored at 1080 wide; the whole layer is scaled to the frame)
const RES = 2;
const CARD = { top: 520, edge: 70, w: 330, padX: 30, padY: 26, radius: 26 };
const EYE_H = 28;
const BIG_H = 80;
const BIG_BASE = 63;
const SUB_H = 34;
const INNER = CARD.w - 2 * CARD.padX - 6;
const CARD_H = 6 + 2 * CARD.padY + EYE_H + BIG_H + SUB_H;
const CARD_FAMILY = font.card.split(",")[0].replace(/"/g, "");
const bigFont = (size: number) => `800 ${size}px "${CARD_FAMILY}"`;
const drawBig = (ctx: CanvasRenderingContext2D, text: string, color: string) => {
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.clearRect(0, 0, INNER, BIG_H);
  let size = 64;
  ctx.font = bigFont(size);
  while (size > 26 && ctx.measureText(text).width > INNER) {
    size -= 2;
    ctx.font = bigFont(size);
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, 0, BIG_BASE);
};

const Big: React.FC<{ text: string; color: string; visible: boolean; ready: boolean }> = ({ text, color, visible, ready }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (c && ready) drawBig(c.getContext("2d")!, text, color);
  }, [text, color, ready]);
  return <canvas ref={ref} width={INNER * RES} height={BIG_H * RES} style={{ display: "block", width: INNER, height: BIG_H, opacity: visible ? 1 : 0 }} />;
};

const Card: React.FC<{ side: "l" | "r"; card: ShoulderCard; accent: string; at: number; out: number; bigVisible: boolean; flash: number; ready: boolean }> = ({ side, card, accent, at, out, bigVisible, flash, ready }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < at || t > out + 0.25) return null;
  const p = spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 12, stiffness: 170, mass: 0.7 } }) * (1 - k(t, out, out + 0.2, 0, 1));
  return (
    <div
      style={{
        position: "absolute",
        top: CARD.top,
        [side === "l" ? "left" : "right"]: CARD.edge,
        width: CARD.w,
        padding: `${CARD.padY}px ${CARD.padX}px`,
        boxSizing: "border-box",
        borderRadius: CARD.radius,
        backgroundColor: "#FFFFFF",
        border: `3px solid ${accent}`,
        boxShadow: `0 22px 50px rgba(0,0,0,0.3), 0 0 ${34 + 50 * flash}px rgba(255,236,220,${0.55 + 0.4 * flash})`,
        filter: flash > 0 ? `brightness(${1 + 0.35 * flash})` : undefined,
        transform: `scale(${0.6 + 0.4 * p}) rotate(${side === "l" ? -4 : 4}deg)`,
        opacity: Math.min(1, p * 2),
      }}
    >
      <div style={{ height: EYE_H, fontFamily: font.mono, fontSize: 22, letterSpacing: 3, color: accent, whiteSpace: "nowrap", overflow: "hidden" }}>{card.label}</div>
      <Big text={card.big} color={side === "l" ? INK : accent} visible={bigVisible} ready={ready} />
      <div style={{ height: SUB_H, fontFamily: font.card, fontWeight: 700, fontSize: 26, color: GREY, whiteSpace: "nowrap", overflow: "hidden" }}>{card.small}</div>
    </div>
  );
};

// ---------- light-speed transition: every lit pixel of the start text flies to one of the end text
type Pt = { sx: number; sy: number; gx: number; gy: number; dep: number; fl: number; r: number };
const DEPART = 2.38;
const CHARGE = DEPART - 0.25;
const samplePts = (text: string, side: "l" | "r") => {
  const c = document.createElement("canvas");
  c.width = INNER * RES;
  c.height = BIG_H * RES;
  const ctx = c.getContext("2d")!;
  drawBig(ctx, text, "#000");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const left = side === "l" ? CARD.edge : 1080 - CARD.edge - CARD.w;
  const cx = left + CARD.w / 2;
  const cy = CARD.top + CARD_H / 2;
  const a = ((side === "l" ? -4 : 4) * Math.PI) / 180;
  const pts: { x: number; y: number; xn: number }[] = [];
  for (let y = 0; y < c.height; y += 4)
    for (let x = 0; x < c.width; x += 4) {
      if (d[(y * c.width + x) * 4 + 3] > 110) {
        const lx = left + 3 + CARD.padX + x / RES - cx;
        const ly = CARD.top + 3 + CARD.padY + EYE_H + y / RES - cy;
        pts.push({ x: cx + lx * Math.cos(a) - ly * Math.sin(a), y: cy + lx * Math.sin(a) + ly * Math.cos(a), xn: x / c.width });
      }
    }
  return pts.sort((p, q) => p.x - q.x);
};
const warp = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 0.5 * Math.pow(2, 20 * u - 10) : 1 - 0.5 * Math.pow(2, -20 * u + 10));
const posAt = (p: Pt, t: number) => {
  const u = Math.max(0, Math.min(1, (t - p.dep) / p.fl));
  const e = warp(u);
  const bulge = Math.sin(Math.PI * e);
  let x = p.sx + (p.gx - p.sx) * e;
  let y = p.sy + (p.gy - p.sy) * e + (p.r - 0.5) * 110 * bulge;
  const sh = u <= 0 ? k(t, CHARGE, p.dep, 0, 1, Easing.in(Easing.quad)) : 0;
  x += (random(`x${p.r}${Math.floor(t * 60)}`) - 0.5) * 2.4 * sh;
  y += (random(`y${p.r}${Math.floor(t * 60)}`) - 0.5) * 2.4 * sh;
  return { x, y, u, e };
};

const Streaks: React.FC<{ ps: Pt[]; until: number; accent: string }> = ({ ps, until, accent }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.clearRect(0, 0, 1080, 1920);
    if (t < CHARGE || t >= until) return;
    const still = new Path2D();
    const landed = new Path2D();
    const glow = new Path2D();
    for (const p of ps) {
      const a = posAt(p, t);
      const b = posAt(p, t - 0.045);
      if (a.u <= 0 || a.e < 0.015) still.rect(a.x - 1.2, a.y - 1.2, 2.4, 2.4);
      else if (a.u >= 1 || a.e > 0.985) landed.rect(a.x - 1.2, a.y - 1.2, 2.4, 2.4);
      else {
        glow.moveTo(b.x, b.y);
        glow.lineTo(a.x + 0.01, a.y);
      }
    }
    const charge = k(t, CHARGE, DEPART, 0, 1, Easing.in(Easing.quad));
    ctx.fillStyle = INK;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 36 * charge;
    ctx.fill(still);
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.fill(landed);
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = accent + "29";
    ctx.lineWidth = 5;
    ctx.stroke(glow);
    ctx.strokeStyle = "rgba(255,246,236,0.55)";
    ctx.lineWidth = 1.3;
    ctx.stroke(glow);
    ctx.globalCompositeOperation = "source-over";
  }, [t, ps, until, accent]);
  return <canvas ref={ref} width={1080 * RES} height={1920 * RES} style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920 }} />;
};

export const ShoulderCards: React.FC<ShoulderZoomProps> = (S) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const transition = S.style === "transition";
  const [ps, setPs] = useState<Pt[]>([]);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Shoulder-zoom fonts and streaks"));
  useEffect(() => {
    Promise.all([document.fonts.load(bigFont(64)), document.fonts.load(`22px ${font.mono.split(",")[0]}`)]).then(() => {
      if (transition) {
        const A = samplePts(S.start.big, "l");
        const G = samplePts(S.end.big, "r");
        const n = Math.max(A.length, G.length);
        const out: Pt[] = [];
        for (let i = 0; i < n && A.length && G.length; i++) {
          const s = A[Math.floor((i * A.length) / n)];
          const g = G[Math.floor((i * G.length) / n)];
          const r = random(`p${S.id}${i}`);
          out.push({ sx: s.x, sy: s.y, gx: g.x, gy: g.y, r, fl: 0.34 * (0.85 + 0.3 * random(`q${S.id}${i}`)), dep: DEPART + 0.1 * (1 - s.xn) + 0.05 * r });
        }
        setPs(out);
      }
      setReady(true);
      continueRender(handle);
    });
  }, [handle, transition, S.start.big, S.end.big, S.id]);
  const arrive = useMemo(() => (ps.length ? ps.reduce((m, p) => Math.max(m, p.dep + p.fl), 0) : 2.9), [ps]);
  const flash = transition && t >= arrive ? Math.max(0, 1 - (t - arrive) / 0.2) : 0;
  // Authored on 1080×1920; scale to the composition width, and centre vertically for other aspect ratios.
  const sc = width / 1080;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: (height - 1920 * sc) / 2, width: 1080, height: 1920, transform: `scale(${sc})`, transformOrigin: "0 0" }}>
        <Card side="l" card={S.start} accent={S.accent} at={1.0} out={2.35} bigVisible={!transition || t < CHARGE} flash={0} ready={ready} />
        <Card side="r" card={S.end} accent={S.accent} at={transition ? 2.7 : 2.55} out={3.7} bigVisible={!transition || t >= arrive} flash={flash} ready={ready} />
        {transition && ps.length > 0 ? <Streaks ps={ps} until={arrive} accent={S.accent} /> : null}
      </div>
    </AbsoluteFill>
  );
};
