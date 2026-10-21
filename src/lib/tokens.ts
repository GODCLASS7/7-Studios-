import { Easing, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";

// House design tokens. A job's brand tokens (from its brief) override these.

// Fonts are bundled in public/brand/fonts so renders never depend on the
// network and look identical on every machine. Inter is a variable font
// (one file covers weights 100–900); licence: SIL OFL.
const INTER = "Inter";
loadFont({
  family: INTER,
  url: staticFile("brand/fonts/Inter-Variable-latin.woff2"),
  weight: "100 900",
});
const inter = { fontFamily: `${INTER}, Helvetica, Arial, sans-serif` };

// Fraunces: a warm variable serif for scripture, lyrics and editorial titles (SIL OFL).
const FRAUNCES = "Fraunces";
loadFont({ family: FRAUNCES, url: staticFile("brand/fonts/Fraunces-Variable-latin.woff2"), weight: "300 900", style: "normal" });
loadFont({ family: FRAUNCES, url: staticFile("brand/fonts/Fraunces-Italic-Variable-latin.woff2"), weight: "300 900", style: "italic" });

// Plus Jakarta Sans (bold numbers on cards) and DM Mono (small labels): the talking-head effects in src/effects (SIL OFL).
const JAKARTA = "Plus Jakarta Sans";
loadFont({ family: JAKARTA, url: staticFile("brand/fonts/PlusJakartaSans-Variable-latin.woff2"), weight: "200 800" });
const MONO = "DM Mono";
loadFont({ family: MONO, url: staticFile("brand/fonts/DMMono-400-latin.woff2"), weight: "400" });
loadFont({ family: MONO, url: staticFile("brand/fonts/DMMono-500-latin.woff2"), weight: "500" });

// Caveat (hand-drawn notes, arrows and step headers in tutorials) and Anton (condensed
// poster and banner type in the title effects) (SIL OFL).
const HAND = "Caveat";
loadFont({ family: HAND, url: staticFile("brand/fonts/Caveat-Variable-latin.woff2"), weight: "400 700" });
const CONDENSED = "Anton";
loadFont({ family: CONDENSED, url: staticFile("brand/fonts/Anton-400-latin.woff2"), weight: "400" });

export const color = {
  bg: "#0B0B0D",
  surface: "#17171B",
  text: "#F4EFE6",
  muted: "#9A958C",
  accent: "#E8B44A",
  line: "#2A2A30",
  paper: "#F7F5F0",
  ink: "#1C1C1F",
} as const;

export const font = {
  display: inter.fontFamily,
  body: inter.fontFamily,
  serif: `${FRAUNCES}, Georgia, "Times New Roman", serif`,
  card: `"${JAKARTA}", ${INTER}, Helvetica, Arial, sans-serif`,
  mono: `"${MONO}", ui-monospace, Menlo, monospace`,
  hand: `${HAND}, "Comic Sans MS", cursive`,
  condensed: `${CONDENSED}, Impact, "Arial Narrow", sans-serif`,
} as const;

// Type scale in px at the 1080p authoring size (rendered 2x for 4K).
export const type = {
  hero: 140,
  h1: 96,
  h2: 64,
  h3: 44,
  body: 32,
  caption: 24,
} as const;

export const space = (n: number) => n * 8;

export const ease = {
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  out: Easing.bezier(0.16, 1, 0.3, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
} as const;

export const springs = {
  smooth: { damping: 200 },
  snappy: { damping: 20, stiffness: 200 },
  punch: { damping: 12, stiffness: 180 },
} as const;
