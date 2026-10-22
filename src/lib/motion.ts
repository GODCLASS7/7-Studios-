// Motion maths for UI-style animation: closed-form springs summed over target changes
// (so a value can be computed at any time with no state carried between frames),
// seamless loops that match in position AND velocity at the seam, and a 4th-order
// step for cursor moves that start from rest and never overshoot.

export type SpringOpts = {
  /** Natural frequency in radians per second (higher = faster). */
  omega?: number;
  /** Damping ratio: 1 = no overshoot, 0.85–0.9 = a tiny overshoot. */
  zeta?: number;
};

/** Step response of a damped spring: 0 at t ≤ 0, settles to 1. */
export const springStep = (
  t: number,
  { omega = 14, zeta = 0.88 }: SpringOpts = {},
) => {
  if (t <= 0) return 0;
  if (zeta >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return (
    1 -
    Math.exp(-zeta * omega * t) *
      (Math.cos(wd * t) +
        (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t))
  );
};

/** 4th-order step: starts from rest, accelerates smoothly, never overshoots. */
export const step4 = (t: number, omega = 18) => {
  if (t <= 0) return 0;
  const x = omega * t;
  return 1 - Math.exp(-x) * (1 + x + (x * x) / 2 + (x * x * x) / 6);
};

export type Key = { t: number; v: number };

/**
 * A value that springs to each key's v at time t (seconds). keys[0] is the starting value.
 * With loop = T, each change is also added one period earlier, so the end of the loop flows
 * into its start with matching position and velocity (the keys must end where they start).
 */
export const springTrack = (
  time: number,
  keys: Key[],
  opts: SpringOpts & { loop?: number; shape?: "spring" | "step4" } = {},
) => {
  if (!keys.length) return 0;
  const f =
    opts.shape === "step4"
      ? (u: number) => step4(u, opts.omega ?? 18)
      : (u: number) => springStep(u, opts);
  let v = keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const d = keys[i].v - keys[i - 1].v;
    if (!d) continue;
    v += d * f(time - keys[i].t);
    if (opts.loop) v += d * (f(time - keys[i].t + opts.loop) - 1);
  }
  return v;
};

/** The same track for several numbers at once (x, y, width…). */
export const springTracks = <K extends string>(
  time: number,
  keys: { t: number; v: Record<K, number> }[],
  opts: SpringOpts & { loop?: number; shape?: "spring" | "step4" } = {},
) => {
  const out = {} as Record<K, number>;
  if (!keys.length) return out;
  for (const k of Object.keys(keys[0].v) as K[])
    out[k] = springTrack(
      time,
      keys.map((x) => ({ t: x.t, v: x.v[k] })),
      opts,
    );
  return out;
};

/** Mix two hex colours (0 → a, 1 → b). */
export const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string) => {
    const s = h.replace("#", "");
    const f =
      s.length === 3
        ? s
            .split("")
            .map((c) => c + c)
            .join("")
        : s;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
  };
  const [x, y] = [p(a), p(b)];
  const c = Math.max(0, Math.min(1, t));
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * c)).join(",")})`;
};

/** A colour that springs through a list of keys (each a hex colour). */
export const colourTrack = (
  time: number,
  keys: { t: number; c: string }[],
  opts: SpringOpts = {},
) => {
  if (!keys.length) return "#000";
  let col = keys[0].c;
  for (let i = 1; i < keys.length; i++) {
    const p = Math.max(
      0,
      Math.min(
        1,
        springStep(time - keys[i].t, {
          ...opts,
          zeta: Math.max(1, opts.zeta ?? 1),
        }),
      ),
    );
    if (p <= 0) break;
    col = mixHex(rgbToHex(col), keys[i].c, p);
  }
  return col;
};
const rgbToHex = (c: string) => {
  if (c.startsWith("#")) return c;
  const m = c.match(/\d+/g) || ["0", "0", "0"];
  return `#${m
    .slice(0, 3)
    .map((v) => Number(v).toString(16).padStart(2, "0"))
    .join("")}`;
};
