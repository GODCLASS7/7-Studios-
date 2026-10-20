import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { color, font, KineticTitle, mmToPx, springs, type } from "../../lib";
import { EVENTS, f } from "./beats";

// Scene 4: "One brief. Every format." Five deliverable shapes land on the beat,
// each labelled with the true pixel size the studio renders.

const TILES = [
  { label: "16:9", px: "3840 × 2160", w: 16, h: 9 },
  { label: "9:16", px: "2160 × 3840", w: 9, h: 16 },
  { label: "1:1", px: "2160 × 2160", w: 1, h: 1 },
  { label: "4:5", px: "2160 × 2700", w: 4, h: 5 },
  { label: "A3 print", px: `${mmToPx(297)} × ${mmToPx(420)}`, w: 297, h: 420 },
];

export const Formats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const u = Math.min(width, height) / 1080;
  const gap = 28 * u;

  // Rows: landscape = one row; portrait = two rows. Tile heights fill the width.
  const rows = portrait ? [[0, 2], [1, 3, 4]] : [[0, 1, 2, 3, 4]];
  const avail = width - 2 * (portrait ? 80 : 120) * u;
  const rowHeight = (idx: number[]) => {
    const sumAspect = idx.reduce((a, i) => a + TILES[i].w / TILES[i].h, 0);
    return Math.min((avail - gap * (idx.length - 1)) / sumAspect, (portrait ? 0.24 : 0.36) * height);
  };

  return (
    <AbsoluteFill style={{ backgroundColor: color.bg, alignItems: "center", justifyContent: "center", gap: 70 * u, flexDirection: "column" }}>
      {portrait ? (
        // Two explicit lines in portrait so the break is always "One brief." / "Every format."
        <div style={{ display: "flex", flexDirection: "column", gap: 8 * u }}>
          <KineticTitle text="One brief." startFrame={-8} staggerFrames={3} size={88 * u} feel="snappy" />
          <KineticTitle text="Every format." startFrame={-2} staggerFrames={3} size={88 * u} feel="snappy" highlight={{ word: 1, color: color.accent }} />
        </div>
      ) : (
        <div style={{ padding: `0 ${60 * u}px` }}>
          <KineticTitle text="One brief. Every format." startFrame={-8} staggerFrames={3} size={type.h1 * u} feel="snappy" highlight={{ word: 3, color: color.accent }} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 56 * u, alignItems: "center" }}>
        {rows.map((idx, r) => {
          const h = rowHeight(idx);
          return (
            <div key={r} style={{ display: "flex", gap, alignItems: "flex-end" }}>
              {idx.map((i) => {
                const t = TILES[i];
                const land = f(EVENTS.tiles[i]);
                const p = spring({ frame: frame - (land - 8), fps, config: springs.snappy });
                const w = (h * t.w) / t.h;
                return (
                  <div key={t.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * u, opacity: Math.min(1, p * 1.5) }}>
                    <div
                      style={{
                        width: w,
                        height: h,
                        transform: `translateY(${interpolate(p, [0, 1], [60 * u, 0])}px) scale(${interpolate(p, [0, 1], [0.7, 1])})`,
                        border: `${3 * u}px solid ${color.accent}`,
                        borderRadius: 12 * u,
                        backgroundColor: "rgba(232,180,74,0.07)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: font.display,
                        fontWeight: 900,
                        fontSize: Math.min(44 * u, w * 0.2),
                        color: color.text,
                      }}
                    >
                      {t.label}
                    </div>
                    <div style={{ fontFamily: font.body, fontWeight: 600, fontSize: 28 * u, color: color.muted, whiteSpace: "nowrap" }}>{t.px}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
