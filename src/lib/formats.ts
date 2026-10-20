// Canvas sizes for every deliverable type.
//
// Video is authored at 1080p-class sizes and rendered with --scale=2 for 4K
// (see scripts/render.mjs), so layouts stay identical across draft, review
// and master renders. Stills for print are authored at their full pixel size.

export type Format = { width: number; height: number; label: string };

export const video = {
  "16x9": { width: 1920, height: 1080, label: "16:9 · YouTube, web (4K at 2x)" },
  "9x16": { width: 1080, height: 1920, label: "9:16 · Reels, Shorts, TikTok (2160×3840 at 2x)" },
  "1x1": { width: 1080, height: 1080, label: "1:1 · Feed" },
  "4x5": { width: 1080, height: 1350, label: "4:5 · Instagram portrait" },
  "21x9": { width: 2560, height: 1080, label: "21:9 · Cinematic / ultrawide" },
} satisfies Record<string, Format>;

export const social = {
  "ig-post": { width: 1080, height: 1350, label: "Instagram post 4:5" },
  "ig-square": { width: 1080, height: 1080, label: "Instagram square" },
  story: { width: 1080, height: 1920, label: "Story / Reel cover" },
  "yt-thumb": { width: 1280, height: 720, label: "YouTube thumbnail (render 2x → 2560×1440)" },
  "x-post": { width: 1600, height: 900, label: "X / LinkedIn landscape" },
  "linkedin-banner": { width: 1584, height: 396, label: "LinkedIn banner" },
  "yt-banner": { width: 2560, height: 1440, label: "YouTube channel art" },
  "og-image": { width: 1200, height: 630, label: "Website share image" },
} satisfies Record<string, Format>;

// Print: pixels = inches × DPI. 300 DPI is the print standard.
export const mmToPx = (mm: number, dpi = 300) => Math.round((mm / 25.4) * dpi);
export const inToPx = (inches: number, dpi = 300) => Math.round(inches * dpi);

const printMm = (wMm: number, hMm: number, label: string, dpi = 300): Format => ({
  width: mmToPx(wMm, dpi),
  height: mmToPx(hMm, dpi),
  label: `${label} @ ${dpi} DPI`,
});

export const print = {
  a5: printMm(148, 210, "A5"),
  a4: printMm(210, 297, "A4"),
  a3: printMm(297, 420, "A3"),
  letter: { width: inToPx(8.5), height: inToPx(11), label: "US Letter @ 300 DPI" },
  "poster-18x24": { width: inToPx(18), height: inToPx(24), label: "Poster 18×24 in @ 300 DPI" },
  "business-card": { width: inToPx(3.5), height: inToPx(2), label: "Business card 3.5×2 in @ 300 DPI" },
  // Large-format prints are viewed from a distance; 150 DPI is standard.
  "poster-24x36": { width: inToPx(24, 150), height: inToPx(36, 150), label: "Poster 24×36 in @ 150 DPI" },
} satisfies Record<string, Format>;

// Chromium cannot screenshot beyond ~16384 px per side; split anything larger.
export const MAX_SIDE = 16384;
