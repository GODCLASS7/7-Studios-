import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { font } from "../lib";

// Screen push (after "Effect of the Day" EP. 03): the picture hard-cuts to an
// extreme close-up of a monitor, flat on. The line sits on one row of LCD pixels
// (red, green and blue subpixels, dark gaps, phosphor glow, a red/cyan split,
// a sharp band with macro blur above and below), and the camera hard-cuts to
// each word the moment it is said. The voice track keeps playing underneath.
//
// Place it in a <Sequence> starting at the first word; word starts and endAt
// are seconds from that point (edl.mjs times them from the transcript).

export type ScreenPushProps = {
  words: { text: string; start: number }[];
  endAt: number;
  textColour: string;
  allCaps: boolean;
  zoom: number;
  pixelSize: number;
  screenColour: string;
  fringe: number;
  glow: number;
  focusFalloff: number;
};

const SIZE = 150;
const TRACK = -0.01 * SIZE;
const PAD = 1400;
const FAMILY = font.body.split(",")[0];

type Placed = { text: string; start: number; x: number; w: number };

const Words: React.FC<{ words: Placed[]; color: string; dx?: number }> = ({ words, color, dx = 0 }) => (
  <>
    {words.map((p, i) => (
      <div
        key={i}
        style={{ position: "absolute", left: p.x + dx, top: PAD - SIZE * 0.82, fontFamily: font.body, fontWeight: 700, fontSize: SIZE, lineHeight: 1, color, whiteSpace: "pre", letterSpacing: TRACK }}
      >
        {p.text}
      </div>
    ))}
  </>
);

export const ScreenPush: React.FC<ScreenPushProps> = (S) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  // Measure only once the font has loaded, so every word is centred on its real width.
  const [handle] = useState(() => delayRender("Loading the screen-push font"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.fonts.load(`700 ${SIZE}px ${FAMILY}`).then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [handle]);
  const placed = useMemo(() => {
    if (!ready) return [] as Placed[];
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `700 ${SIZE}px ${FAMILY}`;
    const measure = (s: string) => ctx.measureText(s).width + TRACK * s.length;
    const space = measure(" ");
    let x = 0;
    return S.words.map((w) => {
      const text = S.allCaps ? w.text.toUpperCase() : w.text;
      const p = { text, start: w.start, x, w: measure(text) };
      x += p.w + space;
      return p;
    });
  }, [ready, S.words, S.allCaps]);

  if (!placed.length || t < placed[0].start || t >= S.endAt) return null;

  const P = S.pixelSize;
  const k = P / 10;
  const subpixels = (
    [
      ["#ff8a7a", 2],
      ["#9affb0", 6],
      ["#8aa8ff", 10],
    ] as const
  )
    .map(([c, x]) => `radial-gradient(ellipse ${1.7 * k}px ${4.3 * k}px at ${x * k}px ${5.5 * k}px, ${c} 70%, transparent 100%)`)
    .join(", ");

  let i = 0;
  while (i < placed.length - 1 && t >= placed[i + 1].start) i++;
  const cur = placed[i];
  // A hard cut per word, with a tiny per-word offset so each cut reads as a new frame.
  const jx = ((i * 37) % 11) - 5;
  const jy = ((i * 23) % 9) - 4;
  const cx = cur.x + cur.w / 2 + jx;
  const cy = PAD - SIZE * 0.36 + jy;
  const zoom = Math.min(S.zoom * (Math.min(width, height) / 1080), (0.84 * width) / cur.w);
  const half = width / 2 / zoom + 4 * P;
  const left = Math.floor((cx - half) / P) * P;
  const span = Math.ceil((2 * half) / P + 2) * P;
  const near = placed.filter((p) => p.x + p.w + 2 * S.fringe > left && p.x - 2 * S.fringe < left + span);

  const Plane: React.FC = () => (
    <div style={{ position: "absolute", left, top: 0, width: span, height: 2 * PAD, background: S.screenColour, isolation: "isolate", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: -left, top: 0 }}>
        <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
          <Words words={near} color="#ff3020" dx={-S.fringe} />
        </div>
        <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
          <Words words={near} color="#20d8ff" dx={S.fringe} />
        </div>
        <Words words={near} color={S.textColour} />
      </div>
      <div style={{ position: "absolute", inset: 0, mixBlendMode: "multiply", backgroundColor: "#000", backgroundImage: subpixels, backgroundSize: `${P}px ${P}px` }} />
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: S.screenColour, overflow: "hidden" }}>
      <AbsoluteFill style={{ backgroundColor: S.screenColour, filter: "blur(0.4px)" }}>
        <div style={{ position: "absolute", left: width / 2, top: height / 2, transformOrigin: "0 0", transform: `scale(${zoom}) translate(${-cx}px, ${-cy}px)` }}>
          <Plane />
          {/* Phosphor bloom: lit dots bleed into white light. */}
          <div style={{ position: "absolute", left: 0, top: 0, mixBlendMode: "screen", filter: "blur(4px) brightness(1.6)", opacity: S.glow }}>
            <Plane />
          </div>
        </div>
      </AbsoluteFill>
      {S.focusFalloff > 0 ? (
        <AbsoluteFill style={{ backdropFilter: `blur(${S.focusFalloff}px)`, WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 34%, transparent 66%, #000 100%)" }} />
      ) : null}
    </AbsoluteFill>
  );
};
