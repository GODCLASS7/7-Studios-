import { evolvePath, getLength, getPointAtLength } from "@remotion/paths";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  continueRender,
  delayRender,
  Img,
  interpolate,
  random,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { font } from "../lib";

// Seven art styles: full-frame looks that carry a line of text (and optionally an image).
//   one-line   a single blue line drawing the words over millimetre paper, the pen in view
//   ascii      a spinning torus (or your image) in green phosphor characters on a CRT
//   pixel      Game Boy-style 4-shade landscape with a dithered sphere and pixel lettering
//   sketch     sepia construction drawing on parchment, mirrored notes in the margins
//   riso       two spot colours in halftone, off-register, with cut-paper shapes
//   hud        a dot field pulsing out from a red dot on the beat, technical labels
//   ink        ink blooming in water under a floating red dot
// Retro styles step at 12 fps over the smooth timeline. Everything is a function of the frame.

export const ART_STYLES = [
  "one-line",
  "ascii",
  "pixel",
  "sketch",
  "riso",
  "hud",
  "ink",
] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

export const artItemSchema = z.object({
  style: z.enum(ART_STYLES),
  text: z.string(),
  sub: z.string().nullable().default(null),
  // An image under public/ (ascii, pixel, sketch and riso use it in place of their drawing).
  image: z.string().nullable().default(null),
  seconds: z.number().default(2.5),
});
export type ArtItem = z.infer<typeof artItemSchema>;
export const artStylesSchema = z.object({
  items: z.array(artItemSchema),
  // "NN - style" tag in the corner of each, as in a showreel.
  tags: z.boolean().default(true),
  bpm: z.number().default(124),
});
export type ArtStylesProps = z.infer<typeof artStylesSchema>;

export const calcArtStyles: CalculateMetadataFunction<ArtStylesProps> = ({
  props,
}) => ({
  durationInFrames: Math.max(
    1,
    Math.round(props.items.reduce((t, i) => t + i.seconds, 0) * 30),
  ),
});

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const useU = () => {
  const { width, height } = useVideoConfig();
  return { W: width, H: height, u: Math.min(width, height) / 1080 };
};
// Time in seconds, stepped to `rate` frames a second (for the retro looks).
const stepped = (frame: number, fps: number, rate: number) =>
  Math.floor((frame / fps) * rate) / rate;

// Load an image once for canvas drawing (rendering waits for it).
const useImage = (src: string | null) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [handle] = useState(() =>
    src ? delayRender(`art image ${src}`) : null,
  );
  useEffect(() => {
    if (!src || handle === null) return;
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => {
      setImg(i);
      continueRender(handle);
    };
    i.onerror = () => continueRender(handle);
    i.src = staticFile(src);
  }, [src, handle]);
  return img;
};
const useCanvas = (
  draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void,
  deps: unknown[],
) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const { W, H } = useU();
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) draw(ctx, W, H);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, ...deps]);
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
};
// Luminance grid of an image drawn to cover cols × rows.
const lumaGrid = (
  img: HTMLImageElement,
  cols: number,
  rows: number,
  zoom = 1,
) => {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const x = c.getContext("2d")!;
  const s = Math.max(cols / img.width, rows / img.height) * zoom;
  x.drawImage(
    img,
    (cols - img.width * s) / 2,
    (rows - img.height * s) / 2,
    img.width * s,
    img.height * s,
  );
  const d = x.getImageData(0, 0, cols, rows).data;
  const out = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++)
    out[i] =
      (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  return out;
};
// Text rasterised to a luminance grid (for ASCII lettering).
const textGrid = (text: string, cols: number, rows: number, family: string) => {
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const x = c.getContext("2d")!;
  x.fillStyle = "#000";
  x.fillRect(0, 0, cols, rows);
  x.fillStyle = "#fff";
  x.textAlign = "center";
  x.textBaseline = "middle";
  let size = rows * 0.9;
  x.font = `900 ${size}px ${family}`;
  while (x.measureText(text).width > cols * 0.92 && size > 4) {
    size -= 1;
    x.font = `900 ${size}px ${family}`;
  }
  x.fillText(text, cols / 2, rows / 2);
  const d = x.getImageData(0, 0, cols, rows).data;
  const out = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) out[i] = d[i * 4] / 255;
  return out;
};

const Tag: React.FC<{ n: number; style: string; dark: boolean }> = ({
  n,
  style,
  dark,
}) => {
  const { u } = useU();
  return (
    <div
      style={{
        position: "absolute",
        left: 40 * u,
        bottom: 40 * u,
        fontFamily: font.mono,
        fontSize: 26 * u,
        letterSpacing: "0.04em",
        color: dark ? "rgba(255,255,255,0.85)" : "rgba(20,20,24,0.8)",
        padding: `${6 * u}px ${12 * u}px`,
        background: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.5)",
        borderRadius: 6 * u,
      }}
    >
      {String(n).padStart(2, "0")} - {style}
    </div>
  );
};

// ── one-line ─────────────────────────────────────────────────────────────────
const OneLine: React.FC<{ it: ArtItem }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { W, H, u } = useU();
  const blue = "#1F4FD8";
  const p = interpolate(frame, [4, durationInFrames * 0.72], [0, 1], clamp);
  // A looping flourish under the words, drawn as one continuous line with the pen at its tip.
  const y = H * 0.62;
  const flourish = `M ${W * 0.12} ${y} C ${W * 0.3} ${y - 120 * u}, ${W * 0.36} ${y + 140 * u}, ${W * 0.5} ${y} S ${W * 0.62} ${y - 150 * u}, ${W * 0.7} ${y - 20 * u} S ${W * 0.84} ${y + 90 * u}, ${W * 0.9} ${y - 10 * u}`;
  const ev = evolvePath(p, flourish);
  const len = getLength(flourish);
  const tip = getPointAtLength(flourish, Math.max(0.01, len * p)) ?? {
    x: W * 0.12,
    y,
  };
  const fs = Math.min(200 * u, (W * 0.84) / Math.max(4, it.text.length * 0.55));
  const dash = 4000 * u;
  const draw = interpolate(frame, [0, durationInFrames * 0.6], [0, 1], clamp);
  // The camera leans toward the pen.
  const cx = (tip.x - W / 2) * 0.06;
  const cy = (tip.y - H / 2) * 0.06;
  void fps;
  return (
    <AbsoluteFill style={{ backgroundColor: "#F4F2EC" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern
            id="mm"
            width={10 * u}
            height={10 * u}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${10 * u} 0 L 0 0 0 ${10 * u}`}
              fill="none"
              stroke="rgba(31,79,216,0.09)"
              strokeWidth={1}
            />
          </pattern>
          <pattern
            id="cm"
            width={50 * u}
            height={50 * u}
            patternUnits="userSpaceOnUse"
          >
            <rect width={50 * u} height={50 * u} fill="url(#mm)" />
            <path
              d={`M ${50 * u} 0 L 0 0 0 ${50 * u}`}
              fill="none"
              stroke="rgba(31,79,216,0.2)"
              strokeWidth={1.2}
            />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#cm)" />
        <g
          transform={`translate(${-cx} ${-cy}) scale(1.03)`}
          style={{ transformOrigin: "50% 50%" }}
        >
          <text
            x={W / 2}
            y={H * 0.46}
            textAnchor="middle"
            fontFamily={font.hand}
            fontWeight={700}
            fontSize={fs}
            fill="none"
            stroke={blue}
            strokeWidth={3 * u}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dash}
            strokeDashoffset={dash * (1 - draw)}
          >
            {it.text}
          </text>
          <path
            d={flourish}
            fill="none"
            stroke={blue}
            strokeWidth={3 * u}
            strokeLinecap="round"
            strokeDasharray={ev.strokeDasharray}
            strokeDashoffset={ev.strokeDashoffset}
          />
          {p < 1 ? (
            <circle cx={tip.x} cy={tip.y} r={7 * u} fill={blue} />
          ) : null}
          {it.sub ? (
            <text
              x={W / 2}
              y={H * 0.74}
              textAnchor="middle"
              fontFamily={font.mono}
              fontSize={26 * u}
              letterSpacing="0.2em"
              fill={blue}
              opacity={interpolate(
                frame,
                [durationInFrames * 0.6, durationInFrames * 0.75],
                [0, 1],
                clamp,
              )}
            >
              {it.sub.toUpperCase()}
            </text>
          ) : null}
        </g>
      </svg>
    </AbsoluteFill>
  );
};

// ── ascii ────────────────────────────────────────────────────────────────────
const RAMP = " .,:-=+*#%@";
const Ascii: React.FC<{ it: ArtItem }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u } = useU();
  const img = useImage(it.image);
  const t = stepped(frame, fps, 12);
  const canvas = useCanvas(
    (ctx, W, H) => {
      const green = "#33FF66";
      ctx.fillStyle = "#020603";
      ctx.fillRect(0, 0, W, H);
      const cw = 15 * u;
      const ch = cw * 1.7;
      const cols = Math.floor(W / cw);
      const rows = Math.floor(H / ch);
      const grid = new Float32Array(cols * rows).fill(-1);
      if (img) {
        const g = lumaGrid(img, cols, rows, 1 + t * 0.03);
        for (let i = 0; i < g.length; i++) grid[i] = g[i];
      } else {
        // The classic spinning torus: luminance per cell from a z-buffered projection.
        const A = 1 + t * 1.1;
        const B = 0.6 + t * 0.7;
        const zb = new Float32Array(cols * rows);
        const cA = Math.cos(A),
          sA = Math.sin(A),
          cB = Math.cos(B),
          sB = Math.sin(B);
        const area = Math.min(cols, rows * 1.7) * 0.36;
        const cy0 = rows * (it.text ? 0.36 : 0.5);
        for (let th = 0; th < 6.283; th += 0.07) {
          const ct = Math.cos(th),
            st = Math.sin(th);
          for (let ph = 0; ph < 6.283; ph += 0.02) {
            const cp = Math.cos(ph),
              sp = Math.sin(ph);
            const h = ct + 2;
            const D = 1 / (sp * h * sA + st * cA + 5);
            const tt = sp * h * cA - st * sA;
            const x = Math.floor(
              cols / 2 + area * 1.4 * D * (cp * h * cB - tt * sB),
            );
            const y = Math.floor(
              cy0 + (area * 1.4 * D * (cp * h * sB + tt * cB)) / 1.7,
            );
            const L =
              (st * sA - sp * ct * cA) * cB -
              sp * ct * sA -
              st * cA -
              cp * ct * sB;
            const o = x + cols * y;
            if (y >= 0 && y < rows && x >= 0 && x < cols && D > zb[o]) {
              zb[o] = D;
              grid[o] = Math.max(0.05, L / 1.5);
            }
          }
        }
        if (it.text) {
          const band = Math.floor(rows * 0.18);
          const top = Math.floor(rows * 0.7);
          const tg = textGrid(it.text.toUpperCase(), cols, band, font.display);
          for (let r = 0; r < band; r++)
            for (let c = 0; c < cols; c++)
              if (tg[r * cols + c] > 0.3)
                grid[(top + r) * cols + c] = 0.55 + 0.45 * tg[r * cols + c];
        }
      }
      ctx.font = `${ch * 0.86}px ${font.mono}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = green;
      ctx.shadowColor = green;
      ctx.shadowBlur = 8 * u;
      ctx.globalAlpha = 0.92 + 0.08 * random(`fl${Math.round(t * 12)}`);
      for (let r = 0; r < rows; r++) {
        let line = "";
        for (let c = 0; c < cols; c++) {
          const v = grid[r * cols + c];
          line +=
            v < 0
              ? " "
              : RAMP[
                  Math.min(
                    RAMP.length - 1,
                    Math.max(0, Math.round(v * (RAMP.length - 1))),
                  )
                ];
        }
        ctx.fillText(line, (W - cols * cw) / 2, r * ch + (H - rows * ch) / 2);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    },
    [t, img, it.text],
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "#020603" }}>
      {canvas}
      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 2px, transparent 2px, transparent 4px)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.75) 100%)",
          boxShadow: `inset 0 0 ${120 * u}px rgba(0,40,10,0.6)`,
        }}
      />
      {it.sub ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 60 * u,
            textAlign: "center",
            fontFamily: font.mono,
            fontSize: 28 * u,
            letterSpacing: "0.3em",
            color: "#33FF66",
            textShadow: "0 0 8px #33FF66",
          }}
        >{`> ${it.sub.toUpperCase()}_`}</div>
      ) : null}
    </AbsoluteFill>
  );
};

// ── pixel ────────────────────────────────────────────────────────────────────
const GB = ["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16,
);
// 5×7 pixel font: each glyph is 7 rows of 5 bits (leftmost = 16).
const GLYPHS: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  ":": [0, 12, 12, 0, 12, 12, 0],
  "'": [4, 4, 8, 0, 0, 0, 0],
  "&": [12, 18, 20, 8, 21, 18, 13],
};
const pixelText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  scale: number,
  colour: string,
) => {
  const chars = text.toUpperCase().split("");
  const w = chars.length * 6 * scale - scale;
  let x = Math.round(cx - w / 2);
  ctx.fillStyle = colour;
  for (const ch of chars) {
    const g = GLYPHS[ch] || GLYPHS["?"];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r] & (16 >> c))
          ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    x += 6 * scale;
  }
};
const Pixel: React.FC<{ it: ArtItem }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const img = useImage(it.image);
  const t = stepped(frame, fps, 12);
  return useCanvas(
    (ctx, W, H) => {
      const lw = W >= H ? 160 : 120;
      const lh = Math.round((lw * H) / W);
      const low = document.createElement("canvas");
      low.width = lw;
      low.height = lh;
      const x = low.getContext("2d")!;
      const shade = new Uint8Array(lw * lh);
      const put = (px: number, py: number, v: number) => {
        // v in 0..3 (fractional): ordered dithering between the two nearest shades.
        const b = BAYER[(py % 4) * 4 + (px % 4)];
        const lo = Math.floor(v);
        shade[py * lw + px] = Math.max(
          0,
          Math.min(3, lo + (v - lo > b ? 1 : 0)),
        );
      };
      if (img) {
        const g = lumaGrid(img, lw, lh, 1 + t * 0.02);
        for (let py = 0; py < lh; py++)
          for (let px = 0; px < lw; px++) put(px, py, g[py * lw + px] * 3);
      } else {
        const horizon = lh * 0.58;
        for (let py = 0; py < lh; py++)
          for (let px = 0; px < lw; px++) {
            let v = 3 - (py / horizon) * 1.3; // sky, lighter at the horizon
            const sx = lw * 0.72,
              sy = lh * 0.22;
            if ((px - sx) ** 2 + (py - sy) ** 2 < (lw * 0.09) ** 2) v = 3; // sun
            const hill1 =
              horizon +
              Math.sin(px * 0.06 + t * 0.6) * 5 +
              Math.sin(px * 0.017) * 6;
            const hill2 = horizon + 14 + Math.sin(px * 0.1 - t * 1.2) * 4;
            if (py > hill1) v = 1.2;
            if (py > hill2) v = 0.4;
            put(px, py, Math.max(0, v));
          }
        // A floating, lit sphere.
        const cx = lw * 0.5,
          cy = lh * 0.42 + Math.sin(t * 2.4) * 3,
          R = lw * 0.13;
        for (let py = Math.floor(cy - R); py <= cy + R; py++)
          for (let px = Math.floor(cx - R); px <= cx + R; px++) {
            const dx = (px - cx) / R,
              dy = (py - cy) / R;
            const d2 = dx * dx + dy * dy;
            if (d2 > 1 || px < 0 || py < 0 || px >= lw || py >= lh) continue;
            const nz = Math.sqrt(1 - d2);
            const light = Math.max(0, -0.5 * dx - 0.6 * dy + 0.62 * nz);
            put(px, py, 0.2 + light * 2.9);
          }
        // Clouds drifting.
        for (let k = 0; k < 3; k++) {
          const cxk = ((k * 61 + t * 6) % (lw + 30)) - 15;
          const cyk = lh * (0.12 + k * 0.08);
          for (let py = Math.floor(cyk - 3); py <= cyk + 3; py++)
            for (let px = Math.floor(cxk - 10); px <= cxk + 10; px++)
              if (
                px >= 0 &&
                px < lw &&
                py >= 0 &&
                ((px - cxk) / 10) ** 2 + ((py - cyk) / 3) ** 2 < 1
              )
                shade[py * lw + px] = 3;
        }
      }
      const imgData = x.createImageData(lw, lh);
      const rgb = GB.map((h) =>
        [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),
      );
      for (let i = 0; i < lw * lh; i++) {
        const c = rgb[shade[i]];
        imgData.data.set([c[0], c[1], c[2], 255], i * 4);
      }
      x.putImageData(imgData, 0, 0);
      // Pixel lettering in a box near the bottom.
      const scale = Math.max(
        1,
        Math.floor(Math.min(2, (lw * 0.9) / Math.max(1, it.text.length * 6))),
      );
      const ty = Math.round(lh * 0.8);
      x.fillStyle = GB[0];
      const bw = Math.min(lw - 6, it.text.length * 6 * scale + 8);
      x.fillRect(Math.round((lw - bw) / 2), ty - 4, bw, 7 * scale + 8);
      pixelText(x, it.text, lw / 2, ty, scale, GB[3]);
      if (it.sub && Math.floor(t * 2) % 2 === 0)
        pixelText(x, it.sub, lw / 2, ty + 7 * scale + 7, 1, GB[1]);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(low, 0, 0, W, H);
    },
    [t, img, it.text, it.sub],
  );
};

// ── sketch ───────────────────────────────────────────────────────────────────
const Sketch: React.FC<{ it: ArtItem }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { W, H, u } = useU();
  const ink = "#4A2F1B";
  const cx = W / 2;
  const cy = H * 0.42;
  const R = Math.min(W, H) * 0.3;
  const p = (a: number, b: number) =>
    interpolate(
      frame,
      [durationInFrames * a, durationInFrames * b],
      [0, 1],
      clamp,
    );
  const lines = [
    {
      d: `M ${cx - R} ${cy} A ${R} ${R} 0 1 1 ${cx + R} ${cy} A ${R} ${R} 0 1 1 ${cx - R} ${cy}`,
      p: p(0, 0.35),
      w: 2,
    },
    {
      d: `M ${cx - R * 0.707} ${cy - R * 0.707} L ${cx + R * 0.707} ${cy - R * 0.707} L ${cx + R * 0.707} ${cy + R * 0.707} L ${cx - R * 0.707} ${cy + R * 0.707} Z`,
      p: p(0.1, 0.4),
      w: 1.5,
    },
    {
      d: `M ${cx - R * 1.25} ${cy} L ${cx + R * 1.25} ${cy} M ${cx} ${cy - R * 1.25} L ${cx} ${cy + R * 1.25}`,
      p: p(0.05, 0.3),
      w: 1,
    },
    {
      d: `M ${cx - R} ${cy - R} L ${cx + R} ${cy + R} M ${cx + R} ${cy - R} L ${cx - R} ${cy + R}`,
      p: p(0.2, 0.45),
      w: 0.8,
    },
    // A golden spiral of quarter arcs.
    {
      d: `M ${cx} ${cy} a ${R * 0.09} ${R * 0.09} 0 0 1 ${R * 0.09} ${R * 0.09} a ${R * 0.146} ${R * 0.146} 0 0 1 ${-R * 0.146} ${R * 0.146} a ${R * 0.236} ${R * 0.236} 0 0 1 ${-R * 0.236} ${-R * 0.236} a ${R * 0.382} ${R * 0.382} 0 0 1 ${R * 0.382} ${-R * 0.382} a ${R * 0.618} ${R * 0.618} 0 0 1 ${R * 0.618} ${R * 0.618}`,
      p: p(0.3, 0.65),
      w: 2.4,
    },
  ];
  const fs = Math.min(150 * u, (W * 0.8) / Math.max(4, it.text.length * 0.5));
  const dash = 3000 * u;
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 45%, #F2E4C4 0%, #E3CC9C 60%, #C9A86E 100%)",
      }}
    >
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id="parch">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={0.9 / u}
              numOctaves={3}
              seed={4}
            />
            <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.1  0 0 0 0.28 0" />
          </filter>
          <filter id="inkbleed">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={0.04}
              numOctaves={2}
              seed={9}
            />
            <feDisplacementMap in="SourceGraphic" scale={2.5 * u} />
          </filter>
        </defs>
        <rect width={W} height={H} filter="url(#parch)" />
        {it.image ? (
          <foreignObject x={cx - R} y={cy - R} width={R * 2} height={R * 2}>
            <Img
              src={staticFile(it.image)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "50%",
                filter:
                  "grayscale(1) contrast(1.7) brightness(1.08) sepia(0.85)",
                mixBlendMode: "multiply",
                opacity: p(0.25, 0.6),
              }}
            />
          </foreignObject>
        ) : null}
        <g filter="url(#inkbleed)">
          {lines.map((l, i) => {
            const ev = evolvePath(l.p, l.d);
            return (
              <path
                key={i}
                d={l.d}
                fill="none"
                stroke={ink}
                strokeWidth={l.w * u}
                strokeLinecap="round"
                strokeDasharray={ev.strokeDasharray}
                strokeDashoffset={ev.strokeDashoffset}
                opacity={0.85}
              />
            );
          })}
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const r1 = R * 1.02;
            const r2 = R * (i % 6 === 0 ? 1.12 : 1.06);
            return (
              <line
                key={i}
                x1={cx + Math.cos(a) * r1}
                y1={cy + Math.sin(a) * r1}
                x2={cx + Math.cos(a) * r2}
                y2={cy + Math.sin(a) * r2}
                stroke={ink}
                strokeWidth={u}
                opacity={p(0.35, 0.5)}
              />
            );
          })}
          <text
            x={W / 2}
            y={H * 0.82}
            textAnchor="middle"
            fontFamily={font.serif}
            fontStyle="italic"
            fontSize={fs}
            fill={ink}
            fillOpacity={p(0.6, 0.8)}
            stroke={ink}
            strokeWidth={1.2 * u}
            strokeDasharray={dash}
            strokeDashoffset={dash * (1 - p(0.4, 0.75))}
          >
            {it.text}
          </text>
        </g>
        {/* Mirror-written notes in the margins. */}
        {[
          [W * 0.12, H * 0.16, it.sub || "studio di moto"],
          [W * 0.88, H * 0.68, "a : b = b : (a+b)"],
        ].map(([x, y, s], i) => (
          <text
            key={i}
            x={0}
            y={0}
            transform={`translate(${x} ${y}) scale(-1 1) rotate(${i ? 4 : -6})`}
            textAnchor="middle"
            fontFamily={font.hand}
            fontSize={34 * u}
            fill={ink}
            opacity={0.75 * p(0.5 + i * 0.1, 0.7 + i * 0.1)}
          >
            {String(s)}
          </text>
        ))}
      </svg>
    </AbsoluteFill>
  );
};

// ── riso ─────────────────────────────────────────────────────────────────────
const PINK = "#FF48B0";
const BLUE = "#0078BF";
const Riso: React.FC<{ it: ArtItem }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { W, H, u } = useU();
  const img = useImage(it.image);
  const t = stepped(frame, fps, 8);
  const mis = {
    x: (3 + random(`mx${t}`) * 2) * u,
    y: (-2 + random(`my${t}`) * 2) * u,
  };
  const enter = (d: number) =>
    spring({ frame: frame - d, fps, config: { damping: 14, stiffness: 120 } });
  const halftone = useCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      if (!img) return;
      const cell = 12 * u;
      const cols = Math.ceil(w / cell);
      const rows = Math.ceil(h / cell);
      const g = lumaGrid(img, cols, rows, 1.05);
      ctx.globalCompositeOperation = "multiply";
      [
        [BLUE, 0, 0],
        [PINK, cell / 2 + mis.x, cell / 2 + mis.y],
      ].forEach(([col, ox, oy], layer) => {
        ctx.fillStyle = col as string;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const v = 1 - g[r * cols + c];
            const rad = (cell / 2) * Math.sqrt(layer ? v * 0.8 : v) * 1.05;
            if (rad < 0.4) continue;
            ctx.beginPath();
            ctx.arc(
              c * cell + (ox as number),
              r * cell + (oy as number),
              rad,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
      });
      ctx.globalCompositeOperation = "source-over";
    },
    [img, t],
  );
  const fs = Math.min(230 * u, (W * 0.88) / Math.max(3, it.text.length * 0.48));
  return (
    <AbsoluteFill style={{ backgroundColor: "#F3EDE2" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern
            id="dots"
            width={14 * u}
            height={14 * u}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(15)"
          >
            <circle cx={7 * u} cy={7 * u} r={4.2 * u} fill={BLUE} />
          </pattern>
          <pattern
            id="dotsP"
            width={11 * u}
            height={11 * u}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(75)"
          >
            <circle cx={5.5 * u} cy={5.5 * u} r={3 * u} fill={PINK} />
          </pattern>
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={1.2 / u}
              numOctaves={2}
              seed={Math.round(t * 8)}
            />
            <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0 0.1  0 0 0 0.22 0" />
          </filter>
        </defs>
        {!img ? (
          <g style={{ mixBlendMode: "multiply" }}>
            <circle
              cx={W * 0.62}
              cy={H * 0.36 + (1 - enter(0)) * H * 0.5}
              r={Math.min(W, H) * 0.3}
              fill="url(#dots)"
            />
            <path
              d={`M ${W * 0.12} ${H * 0.62} A ${W * 0.26} ${W * 0.26} 0 0 1 ${W * 0.64} ${H * 0.62} Z`}
              fill={PINK}
              opacity={0.92}
              transform={`translate(${mis.x - (1 - enter(4)) * W} ${mis.y})`}
            />
            <rect
              x={W * 0.08}
              y={H * 0.12}
              width={W * 0.3}
              height={H * 0.22}
              fill="url(#dotsP)"
              transform={`rotate(${-6 + (1 - enter(8)) * 30} ${W * 0.2} ${H * 0.2})`}
            />
            <rect
              x={W * 0.55}
              y={H * 0.66}
              width={W * 0.32}
              height={H * 0.05}
              fill={BLUE}
              opacity={0.9}
              transform={`translate(${(1 - enter(10)) * W} 0)`}
            />
          </g>
        ) : null}
      </svg>
      {img ? (
        <AbsoluteFill style={{ mixBlendMode: "multiply" }}>
          {halftone}
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-end",
          paddingBottom: H * 0.14,
        }}
      >
        <div
          style={{
            position: "relative",
            fontFamily: font.condensed,
            fontSize: fs,
            lineHeight: 0.9,
            whiteSpace: "nowrap",
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            transform: `translateY(${(1 - enter(6)) * 80 * u}px)`,
          }}
        >
          <span style={{ color: BLUE, mixBlendMode: "multiply" }}>
            {it.text}
          </span>
          <span
            style={{
              position: "absolute",
              left: mis.x,
              top: mis.y,
              color: PINK,
              mixBlendMode: "multiply",
              opacity: 0.9,
            }}
          >
            {it.text}
          </span>
        </div>
        {it.sub ? (
          <div
            style={{
              marginTop: 18 * u,
              fontFamily: font.mono,
              fontSize: 26 * u,
              letterSpacing: "0.24em",
              color: BLUE,
              textTransform: "uppercase",
            }}
          >
            {it.sub}
          </div>
        ) : null}
      </AbsoluteFill>
      <svg
        width={W}
        height={H}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <rect width={W} height={H} filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

// ── hud ──────────────────────────────────────────────────────────────────────
const Hud: React.FC<{ it: ArtItem; bpm: number; start: number }> = ({
  it,
  bpm,
  start,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { W, H, u } = useU();
  const t = frame / fps;
  const beat = 60 / bpm;
  // Time since the last beat on the edit's own beat grid (so cuts and pulses agree).
  const since = (((start / fps + t) % beat) + beat) % beat;
  const pulse = Math.exp(-since * 9);
  const canvas = useCanvas(
    (ctx, w, h) => {
      ctx.fillStyle = "#06070A";
      ctx.fillRect(0, 0, w, h);
      const gap = 26 * u;
      const cx = w / 2;
      const cy = h * 0.45;
      for (let y = gap / 2; y < h; y += gap)
        for (let x = gap / 2; x < w; x += gap) {
          const d = Math.hypot(x - cx, y - cy) / (Math.min(w, h) * 0.5);
          const wave =
            Math.max(0, Math.sin(d * 9 - t * 5)) * Math.exp(-d * 1.2);
          const r = (1.2 + wave * 3.2 + pulse * Math.exp(-d * 4) * 3) * u;
          ctx.fillStyle = `rgba(235,240,255,${0.25 + wave * 0.7})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.fillStyle = "#FF3B30";
      ctx.shadowColor = "#FF3B30";
      ctx.shadowBlur = 24 * u;
      ctx.beginPath();
      ctx.arc(cx, cy, (12 + pulse * 10) * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    },
    [frame],
  );
  const tc = (() => {
    const total = start + frame;
    const s = Math.floor(total / fps);
    return `00:00:${String(s).padStart(2, "0")}:${String(total % fps).padStart(2, "0")}`;
  })();
  const label: React.CSSProperties = {
    position: "absolute",
    fontFamily: font.mono,
    fontSize: 22 * u,
    letterSpacing: "0.18em",
    color: "rgba(235,240,255,0.8)",
    textTransform: "uppercase",
  };
  return (
    <AbsoluteFill>
      {canvas}
      <div style={{ ...label, left: 40 * u, top: 40 * u }}>Wave field</div>
      <div style={{ ...label, right: 40 * u, top: 40 * u }}>{bpm} BPM</div>
      <div style={{ ...label, right: 40 * u, bottom: 40 * u }}>{tc}</div>
      <div
        style={{
          ...label,
          left: 40 * u,
          top: 76 * u,
          fontSize: 18 * u,
          opacity: 0.6,
        }}
      >
        x 0.500 · y 0.450
      </div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <line
          x1={W / 2}
          y1={H * 0.45 - 60 * u}
          x2={W / 2}
          y2={H * 0.45 - 30 * u}
          stroke="rgba(255,255,255,0.5)"
        />
        <line
          x1={W / 2}
          y1={H * 0.45 + 30 * u}
          x2={W / 2}
          y2={H * 0.45 + 60 * u}
          stroke="rgba(255,255,255,0.5)"
        />
        <line
          x1={W / 2 - 60 * u}
          y1={H * 0.45}
          x2={W / 2 - 30 * u}
          y2={H * 0.45}
          stroke="rgba(255,255,255,0.5)"
        />
        <line
          x1={W / 2 + 30 * u}
          y1={H * 0.45}
          x2={W / 2 + 60 * u}
          y2={H * 0.45}
          stroke="rgba(255,255,255,0.5)"
        />
        {Array.from({ length: 41 }, (_, i) => (
          <line
            key={i}
            x1={W * 0.1 + (i * W * 0.8) / 40}
            y1={H - 100 * u}
            x2={W * 0.1 + (i * W * 0.8) / 40}
            y2={H - (i % 5 === 0 ? 116 : 108) * u}
            stroke="rgba(255,255,255,0.45)"
          />
        ))}
      </svg>
      <div
        style={{
          ...label,
          left: 0,
          right: 0,
          top: H * 0.72,
          textAlign: "center",
          fontSize: Math.min(
            64 * u,
            (W * 0.8) / Math.max(4, it.text.length * 0.62),
          ),
          letterSpacing: "0.12em",
          color: "#fff",
        }}
      >
        {it.text}
      </div>
      {it.sub ? (
        <div
          style={{
            ...label,
            left: 0,
            right: 0,
            top: H * 0.72 + 84 * u,
            textAlign: "center",
            color: "#FF3B30",
          }}
        >
          {it.sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ── ink ──────────────────────────────────────────────────────────────────────
const Ink: React.FC<{ it: ArtItem }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { W, H, u } = useU();
  const t = frame / fps;
  const blobs = [
    { x: 0.5, y: 0.5, r: 0.34, c: "#0B2A6F", d: 0, seed: 3 },
    { x: 0.42, y: 0.56, r: 0.22, c: "#1E4FBF", d: 6, seed: 7 },
    { x: 0.6, y: 0.47, r: 0.18, c: "#0A1A3F", d: 12, seed: 11 },
    { x: 0.5, y: 0.6, r: 0.12, c: "#3D6FE0", d: 20, seed: 17 },
  ];
  const dot = {
    x: W / 2 + Math.sin(t * 1.1) * 8 * u,
    y: H * 0.3 + Math.sin(t * 1.7) * 10 * u,
  };
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(180deg, #EEF3F6 0%, #DCE6EC 100%)",
      }}
    >
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          {blobs.map((b, i) => {
            const grow = interpolate(
              frame,
              [b.d, b.d + durationInFrames * 0.8],
              [0, 1],
              { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) },
            );
            return (
              <filter
                key={i}
                id={`ink${i}`}
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency={0.006 / u}
                  numOctaves={4}
                  seed={b.seed}
                />
                <feDisplacementMap
                  in="SourceGraphic"
                  scale={(40 + grow * 160) * u}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
                <feGaussianBlur stdDeviation={(2 + grow * 10) * u} />
              </filter>
            );
          })}
        </defs>
        {blobs.map((b, i) => {
          const grow = interpolate(
            frame,
            [b.d, b.d + durationInFrames * 0.8],
            [0, 1],
            { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) },
          );
          return (
            <circle
              key={i}
              cx={W * b.x}
              cy={H * b.y + grow * 30 * u}
              r={Math.min(W, H) * b.r * (0.15 + grow)}
              fill={b.c}
              opacity={0.85 - grow * 0.35}
              filter={`url(#ink${i})`}
              style={{ mixBlendMode: "multiply" }}
            />
          );
        })}
        <ellipse
          cx={dot.x}
          cy={H * 0.3 + 40 * u}
          rx={18 * u}
          ry={5 * u}
          fill="rgba(0,0,0,0.12)"
        />
        <circle cx={dot.x} cy={dot.y} r={16 * u} fill="#E5322D" />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: H * 0.1,
          textAlign: "center",
          fontFamily: font.serif,
          fontSize: Math.min(
            110 * u,
            (W * 0.8) / Math.max(4, it.text.length * 0.5),
          ),
          color: "#0A1A3F",
          opacity: interpolate(
            frame,
            [durationInFrames * 0.3, durationInFrames * 0.55],
            [0, 1],
            clamp,
          ),
        }}
      >
        {it.text}
      </div>
      {it.sub ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: H * 0.06,
            textAlign: "center",
            fontFamily: font.mono,
            fontSize: 24 * u,
            letterSpacing: "0.24em",
            color: "#0B2A6F",
            textTransform: "uppercase",
          }}
        >
          {it.sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const DARK: Record<ArtStyle, boolean> = {
  "one-line": false,
  ascii: true,
  pixel: true,
  sketch: false,
  riso: false,
  hud: true,
  ink: false,
};

/** One art style, full frame. Put it in a <Sequence> of its own length. */
export const ArtStyleView: React.FC<{
  it: ArtItem;
  bpm?: number;
  start?: number;
  tag?: number | null;
}> = ({ it, bpm = 124, start = 0, tag = null }) => {
  const body =
    it.style === "one-line" ? (
      <OneLine it={it} />
    ) : it.style === "ascii" ? (
      <Ascii it={it} />
    ) : it.style === "pixel" ? (
      <Pixel it={it} />
    ) : it.style === "sketch" ? (
      <Sketch it={it} />
    ) : it.style === "riso" ? (
      <Riso it={it} />
    ) : it.style === "hud" ? (
      <Hud it={it} bpm={bpm} start={start} />
    ) : (
      <Ink it={it} />
    );
  return (
    <AbsoluteFill>
      {body}
      {tag ? <Tag n={tag} style={it.style} dark={DARK[it.style]} /> : null}
    </AbsoluteFill>
  );
};

export const ArtStyles: React.FC<ArtStylesProps> = ({ items, tags, bpm }) => {
  const { fps } = useVideoConfig();
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {items.map((it, i) => {
        const from = at;
        const len = Math.max(1, Math.round(it.seconds * fps));
        at += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            <ArtStyleView
              it={it}
              bpm={bpm}
              start={from}
              tag={tags ? i + 1 : null}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const artStylesDefaults: ArtStylesProps = {
  tags: true,
  bpm: 124,
  items: ART_STYLES.map((style) => ({
    style,
    text: "7 Studios",
    sub: style === "hud" ? "now showing" : style === "ascii" ? "booting" : null,
    image: null,
    seconds: 2.5,
  })),
};
