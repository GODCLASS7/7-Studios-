import React, { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { font } from "../lib";

// Liquid glass velocity graph (after "Effect of the Day" EP. 02): a frosted glass
// card rises over the footage and really refracts it (frost inside, lens bend
// and a slight colour split at the rim, a bright rim of light). A glowing line
// draws up on a velocity ramp, a counter counts with it, the dot always leads.
// On landing the card punches, holds, then sinks away.
// The refraction profile follows liquid-glass-js by Armagan Amcalar (MIT licence).
//
// Place it in a <Sequence> starting when the card should rise; pass the
// footage again as `footage` (time-aligned), so the glass can refract it.

export type LiquidGlassProps = {
  id: string;
  title: string;
  startValue: number;
  endValue: number;
  prefix: string;
  suffix: string;
  decimals: number;
  lineColour: string;
  nodeColour: string;
  textColour: string;
  shape: number[];
  drawSeconds: number;
  holdSeconds: number;
  cardY: number; // top of the card as a fraction of the frame height (0.47 keeps it below a face, above captions on 9:16)
  frost: number;
  bend: number;
  footage: React.ReactNode;
};

const T_RISE = 0.22;
const T_DRAW_START = 0.18;
const T_PUNCH = 0.28;
const T_EXIT = 0.3;
const MAP_SCALE = 400;

export const liquidGlassSeconds = (p: Pick<LiquidGlassProps, "drawSeconds" | "holdSeconds">) => T_DRAW_START + p.drawSeconds + p.holdSeconds + T_EXIT + 0.05;

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

// Refraction map, built once per card size: red = sideways offset, green = vertical, 128 = none.
const useRefractionMap = (W: number, HC: number, R: number, H: number, bend: number) =>
  useMemo(() => {
    const c = document.createElement("canvas");
    c.width = Math.round(W);
    c.height = Math.round(HC);
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(c.width, c.height);
    const cx = c.width / 2;
    const cy = c.height / 2;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const qx = Math.abs(x + 0.5 - cx) - (cx - R);
        const qy = Math.abs(y + 0.5 - cy) - (cy - R);
        const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
        const d = Math.max(-outside, 0);
        const nx = (x + 0.5 - cx) / cx;
        const ny = (y + 0.5 - cy) / cy;
        const len = Math.hypot(nx, ny) || 1;
        const px = bend * H * (0.045 * Math.exp(-0.05 * d) + 0.06 * Math.exp(-0.35 * d) + 0.012 * (1 - Math.exp(-0.1 * d)));
        const i = (y * c.width + x) * 4;
        img.data[i] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (px * nx) / len / MAP_SCALE)));
        img.data[i + 1] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + (px * ny) / len / MAP_SCALE)));
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }, [W, HC, R, H, bend]);

const GlassRim: React.FC<{ R: number }> = ({ R }) => (
  <>
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: R,
        padding: 2,
        background: "linear-gradient(140deg, rgba(255,255,255,0.75), rgba(255,255,255,0.10) 32%, rgba(255,255,255,0.04) 62%, rgba(255,255,255,0.38))",
        WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: R,
        background: "radial-gradient(120% 70% at 12% -10%, rgba(255,255,255,0.20), rgba(255,255,255,0) 50%)",
        boxShadow: "inset 0 1.5px 1px rgba(255,255,255,0.45), inset 0 -18px 40px rgba(255,255,255,0.05)",
      }}
    />
  </>
);

export const LiquidGlassGraph: React.FC<LiquidGlassProps> = (S) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  // Narrower on vertical formats, so the card stays clear of the platform's buttons on the right (x ≤ 89%).
  const W = (height > width ? 820 : 900) * u;
  const HC = 610 * u;
  const R = 34 * u;
  const GRAPH_H = 420 * u;
  const PAD = 40 * u;
  const cardTop = S.cardY * height;
  const t = frame / fps;
  const map = useRefractionMap(W, HC, R, height, S.bend);

  const drawEnd = T_DRAW_START + S.drawSeconds;
  const exitStart = drawEnd + S.holdSeconds;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const rise = interpolate(t, [0, T_RISE], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const draw = interpolate(t, [T_DRAW_START, drawEnd], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.25, 1) });
  const punch = interpolate(t, [drawEnd - 0.04, drawEnd + 0.08, drawEnd + T_PUNCH], [0, 1, 0], { ...clamp, easing: Easing.bezier(0.33, 0, 0.2, 1) });
  const exit = interpolate(t, [exitStart, exitStart + T_EXIT], [0, 1], { ...clamp, easing: Easing.bezier(0.5, 0, 0.9, 0.4) });
  if (exit >= 1) return null;

  const s = (0.96 + 0.04 * rise) * (1 + 0.035 * punch);
  const dy = ((1 - rise) * 60 + exit * 40) * u;
  const op = rise * (1 - exit);
  const cx = width / 2;
  const cy = cardTop + HC / 2 + dy;
  const rx = cx - (W * s) / 2;
  const ry = cy - (HC * s) / 2;
  const rw = W * s;
  const rh = HC * s;

  // The node leads: cut the line and fill exactly at the head, measured along the line.
  const pts = S.shape.map((y, i) => [PAD + (i / (S.shape.length - 1)) * (W - 2 * PAD), (1 - y) * GRAPH_H]);
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let left = draw * total;
  let k = 0;
  while (k < seg.length - 1 && left > seg[k]) {
    left -= seg[k];
    k++;
  }
  const f = seg[k] ? Math.min(1, left / seg[k]) : 0;
  const head = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
  const d = [...pts.slice(0, k + 1), head].map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const value = S.startValue + (S.endValue - S.startValue) * draw;
  const shown = `${S.prefix}${value.toLocaleString("en-US", { minimumFractionDigits: S.decimals, maximumFractionDigits: S.decimals })}`;
  const text = rgb(S.textColour);
  const line = rgb(S.lineColour);
  const fid = `liquid-glass-${S.id}`;

  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={fid} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height} colorInterpolationFilters="sRGB">
          <feImage href={map} x={rx} y={ry} width={rw} height={rh} preserveAspectRatio="none" result="map" />
          <feGaussianBlur in="SourceGraphic" stdDeviation={S.frost * u} result="frost" />
          <feDisplacementMap in="frost" in2="map" scale={MAP_SCALE * s} xChannelSelector="R" yChannelSelector="G" result="dR" />
          <feDisplacementMap in="frost" in2="map" scale={MAP_SCALE * s * 0.96} xChannelSelector="R" yChannelSelector="G" result="dG" />
          <feDisplacementMap in="frost" in2="map" scale={MAP_SCALE * s * 0.92} xChannelSelector="R" yChannelSelector="G" result="dB" />
          <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r" />
          <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g" />
          <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b" />
          <feComposite in="r" in2="g" operator="arithmetic" k2={1} k3={1} result="rg" />
          <feComposite in="rg" in2="b" operator="arithmetic" k2={1} k3={1} />
        </filter>
      </svg>

      {/* The footage again, refracted, cut to the card's shape. */}
      <div style={{ position: "absolute", inset: 0, opacity: op, clipPath: `inset(${ry}px ${width - rx - rw}px ${height - ry - rh}px ${rx}px round ${R * s}px)` }}>
        <div style={{ position: "absolute", inset: 0, filter: `url(#${fid})` }}>{S.footage}</div>
      </div>

      {/* Glass surface, light, graph. */}
      <div
        style={{
          position: "absolute",
          left: (width - W) / 2,
          top: cardTop,
          width: W,
          height: HC,
          borderRadius: R,
          background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(180,180,180,0.03) 60%, rgba(0,0,0,0.12))",
          boxShadow: `0 ${30 * u}px ${70 * u}px rgba(0,0,0,0.45)`,
          opacity: op,
          transform: `translateY(${dy}px) scale(${s})`,
          transformOrigin: "50% 50%",
        }}
      >
        <GlassRim R={R} />
        <div style={{ position: "relative", padding: `${34 * u}px 0 0` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: `0 ${40 * u}px ${18 * u}px` }}>
            <span style={{ fontFamily: font.mono, fontWeight: 500, fontSize: 32 * u, letterSpacing: 4 * u, color: `rgba(${text},0.8)`, textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}>{S.title}</span>
            <span style={{ fontFamily: font.card, fontWeight: 800, fontSize: 84 * u, color: S.textColour, letterSpacing: -2 * u, textShadow: "0 2px 18px rgba(0,0,0,0.45)" }}>
              {shown}
              <span style={{ fontSize: 46 * u }}>{S.suffix}</span>
            </span>
          </div>
          <svg width={W} height={GRAPH_H} style={{ display: "block", overflow: "visible" }}>
            <defs>
              <linearGradient id={`${fid}-fill`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={S.lineColour} stopOpacity={0.45} />
                <stop offset="1" stopColor={S.lineColour} stopOpacity={0} />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={PAD} x2={W - PAD} y1={g * GRAPH_H} y2={g * GRAPH_H} stroke={`rgba(${text},0.1)`} strokeWidth={2 * u} />
            ))}
            <path d={`${d} L${head[0]},${GRAPH_H} L${PAD},${GRAPH_H} Z`} fill={`url(#${fid}-fill)`} opacity={Math.min(1, draw * 4)} />
            <path d={d} fill="none" stroke={S.lineColour} strokeWidth={9 * u} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 ${10 * u}px rgba(${line},0.8))` }} />
            <circle cx={head[0]} cy={head[1]} r={13 * u} fill={S.nodeColour} stroke={S.lineColour} strokeWidth={6 * u} opacity={draw > 0.01 ? 1 : 0} />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};
