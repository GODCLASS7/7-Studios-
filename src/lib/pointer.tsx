import React from "react";

// The pointer for product demos and interactions: an arrow for a mouse click, or a soft
// fingertip for a tap. `press` runs 0 → 1 → 0 around the click; the ring shows it
// happened. Positions are in pixels of the composition.

export const Pointer: React.FC<{
  x: number;
  y: number;
  press: number;
  /** Ring progress after the click: 0 → 1. */
  ring?: number;
  u: number;
  kind?: "arrow" | "tap";
  opacity?: number;
}> = ({ x, y, press, ring = 0, u, kind = "arrow", opacity = 1 }) => (
  <div style={{ position: "absolute", left: x, top: y, zIndex: 50, opacity, pointerEvents: "none" }}>
    {ring > 0 && ring < 1 ? (
      <div
        style={{
          position: "absolute",
          left: -30 * u,
          top: -30 * u,
          width: 60 * u,
          height: 60 * u,
          borderRadius: "50%",
          border: `${3 * u}px solid rgba(255,255,255,0.9)`,
          boxShadow: `0 0 0 ${2 * u}px rgba(0,0,0,0.12)`,
          transform: `scale(${0.4 + ring * 1.1})`,
          opacity: 1 - ring,
        }}
      />
    ) : null}
    {kind === "tap" ? (
      <div
        style={{
          position: "absolute",
          left: -22 * u,
          top: -22 * u,
          width: 44 * u,
          height: 44 * u,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.55)",
          border: `${2 * u}px solid rgba(255,255,255,0.95)`,
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          transform: `scale(${1 - press * 0.22})`,
        }}
      />
    ) : (
      <svg
        width={34 * u}
        height={40 * u}
        viewBox="0 0 17 20"
        style={{
          position: "absolute",
          left: -5 * u,
          top: -2 * u,
          transform: `scale(${1 - press * 0.16})`,
          transformOrigin: "5px 2px",
          filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.4))",
        }}
      >
        <path d="M 2.5 1 L 2.5 15.5 L 6.2 12.2 L 8.6 18 L 11.4 16.8 L 9 11.2 L 14 11 Z" fill="#fff" stroke="#1a1a1e" strokeWidth={1} />
      </svg>
    )}
  </div>
);

/** A press that dips around `at` seconds: down in 0.08 s, back up in 0.14 s. */
export const pressAt = (t: number, at: number) => {
  const u = t - at;
  if (u < -0.08 || u > 0.14) return 0;
  return u < 0 ? 1 + u / 0.08 : 1 - u / 0.14;
};
