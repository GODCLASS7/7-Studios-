import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { color, font } from "../lib";

// A picture of a stretch of footage for edit decisions and cut checks:
// filmstrip + waveform + words on one time axis, with pauses (cut candidates)
// marked. Built by scripts/timeline.mjs; Claude reads the PNG instead of
// watching the video (the video-use idea: text first, pictures on demand).

export const timelineSchema = z.object({
  title: z.string(),
  from: z.number(),
  to: z.number(),
  frames: z.array(z.object({ src: z.string(), t: z.number() })),
  peaks: z.array(z.number()),
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number(), filler: z.boolean().optional() })),
  gaps: z.array(z.object({ start: z.number(), end: z.number() })),
  marks: z.array(z.object({ t: z.number(), label: z.string() })),
});
export type TimelineProps = z.infer<typeof timelineSchema>;

const W = 2400;
const PAD = 60;

export const TimelineView: React.FC<TimelineProps> = (p) => {
  const span = Math.max(0.001, p.to - p.from);
  const x = (t: number) => PAD + ((t - p.from) / span) * (W - 2 * PAD);
  const stripH = 300;
  const waveTop = 420;
  const waveH = 170;
  const fw = (W - 2 * PAD) / Math.max(1, p.frames.length);
  const tick = span > 20 ? 5 : span > 8 ? 1 : 0.5;
  const ticks = Array.from({ length: Math.floor(span / tick) + 1 }, (_, i) => Math.ceil(p.from / tick) * tick + i * tick).filter((t) => t <= p.to);
  return (
    <AbsoluteFill style={{ backgroundColor: color.bg, fontFamily: font.body, color: color.text }}>
      <div style={{ position: "absolute", left: PAD, top: 22, fontSize: 30, fontWeight: 800, letterSpacing: "0.04em" }}>
        {p.title} <span style={{ color: color.muted, fontWeight: 600 }}>· {p.from.toFixed(2)}–{p.to.toFixed(2)} s</span>
      </div>
      {p.frames.map((f, i) => (
        <div key={i} style={{ position: "absolute", left: PAD + i * fw, top: 80, width: fw - 6, height: stripH, overflow: "hidden", borderRadius: 6, backgroundColor: "#000" }}>
          <Img src={staticFile(f.src)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          <div style={{ position: "absolute", left: 6, bottom: 6, fontSize: 18, fontWeight: 700, backgroundColor: "rgba(0,0,0,.6)", padding: "2px 6px", borderRadius: 4 }}>{f.t.toFixed(2)}</div>
        </div>
      ))}
      <svg width={W} height={900} style={{ position: "absolute", left: 0, top: 0 }}>
        {p.gaps.map((g, i) => (
          <rect key={i} x={x(g.start)} y={waveTop - 10} width={Math.max(2, x(g.end) - x(g.start))} height={waveH + 160} fill={color.accent} opacity={0.16} />
        ))}
        {p.peaks.map((v, i) => {
          const px = PAD + (i / p.peaks.length) * (W - 2 * PAD);
          const h = Math.max(1, v * waveH);
          return <rect key={i} x={px} y={waveTop + waveH / 2 - h / 2} width={Math.max(1, (W - 2 * PAD) / p.peaks.length - 0.5)} height={h} fill="#6FA8DC" />;
        })}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={waveTop + waveH + 4} y2={waveTop + waveH + 16} stroke={color.muted} strokeWidth={2} />
            <text x={x(t)} y={waveTop + waveH + 40} fill={color.muted} fontSize={20} textAnchor="middle">
              {t.toFixed(tick < 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {p.marks.map((m, i) => (
          <g key={i}>
            <line x1={x(m.t)} x2={x(m.t)} y1={70} y2={860} stroke="#FF5A4E" strokeWidth={3} strokeDasharray="10 6" />
            <text x={x(m.t) + 6} y={860} fill="#FF5A4E" fontSize={20} fontWeight={800}>
              {m.label}
            </text>
          </g>
        ))}
      </svg>
      {p.words.map((w, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x(w.start),
            top: 660 + (i % 3) * 52,
            minWidth: Math.max(4, x(w.end) - x(w.start)),
            fontSize: 24,
            fontWeight: 700,
            padding: "4px 6px",
            borderRadius: 5,
            whiteSpace: "nowrap",
            backgroundColor: w.filler ? "rgba(255,90,78,.25)" : "rgba(255,255,255,.08)",
            borderLeft: `3px solid ${w.filler ? "#FF5A4E" : color.accent}`,
            color: w.filler ? "#FF8A80" : color.text,
          }}
        >
          {w.text}
        </div>
      ))}
    </AbsoluteFill>
  );
};

export const timelineDefaults: TimelineProps = { title: "Timeline", from: 0, to: 1, frames: [], peaks: [], words: [], gaps: [], marks: [] };
