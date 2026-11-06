import { z } from "zod";
import { springStep } from "./motion";
import { font } from "./tokens";

// The motion brief shared by the brand templates (logo reveal, interaction, website hero,
// explainer, product demo): one word for how the brand moves, a reduced-motion switch
// and a typeface. "feel" sets the pace between moves, the spring and how far things
// travel; reducedMotion swaps every movement for a short fade, for viewers who ask
// their device for less motion.

export const FEELS = ["calm", "precise", "playful", "energetic"] as const;
export type Feel = (typeof FEELS)[number];
export const feelSchema = z.enum(FEELS).default("precise");

type FeelSpec = {
  /** Multiplies the gaps between moves (1 = the template's own timing). */
  pace: number;
  omega: number;
  zeta: number;
  /** Multiplies how far things travel as they enter. */
  travel: number;
};
const SPEC: Record<Feel, FeelSpec> = {
  calm: { pace: 1.3, omega: 9, zeta: 1, travel: 0.6 },
  precise: { pace: 1, omega: 14, zeta: 1, travel: 0.8 },
  playful: { pace: 0.9, omega: 15, zeta: 0.6, travel: 1.15 },
  energetic: { pace: 0.7, omega: 22, zeta: 0.78, travel: 1.4 },
};
export const feelOf = (f: Feel) => SPEC[f];

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Progress of a move that starts at `start` seconds, at time t: 0 before, 1 once settled.
 * Overshoots past 1 for the playful and energetic feels (use clamp01 for opacity).
 * With reduced motion it is a 0.25 s linear fade with no overshoot. Exactly 1 once the
 * spring has settled, so a template's last frame is the clean, still design.
 */
export const enter = (t: number, start: number, feel: Feel, reduced = false) => {
  const u = t - start;
  if (reduced) return clamp01(u / 0.25);
  const s = SPEC[feel];
  const settle = s.zeta >= 1 ? 8 / s.omega : 7 / (s.zeta * s.omega);
  if (u >= settle) return 1;
  return springStep(u, { omega: s.omega, zeta: s.zeta });
};

/** A short linear fade between two times, for supporting elements. */
export const fade = (t: number, start: number, dur = 0.3) => clamp01((t - start) / dur);

export const TYPEFACES = ["inter", "fraunces", "jakarta", "anton"] as const;
export const typefaceSchema = z.enum(TYPEFACES).default("inter");
export const typefaceOf = (k: (typeof TYPEFACES)[number]) =>
  ({ inter: font.display, fraunces: font.serif, jakarta: font.card, anton: font.condensed })[k];

/** Seconds a line of text needs on screen to be read comfortably (about 190 words a minute). */
export const readingSeconds = (text: string, min = 2.2) =>
  Math.max(min, 1.2 + text.trim().split(/\s+/).filter(Boolean).length * 0.32);
