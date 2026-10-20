import { AbsoluteFill } from "remotion";
import { color, font, Grain } from "../../lib";
import { PanelArt } from "../../storyboard/PanelArt";
import type { Panel } from "../../storyboard/schema";
import { DemoTitle } from "../Demo/DemoTitle";

// YouTube thumbnail (1280×720 authored, rendered 2× → 2560×1440).
// Big, few words; readable at phone size.

const sketch: Panel = {
  id: "2",
  title: "",
  seconds: 3,
  action: "",
  draw: [
    { type: "text", x: 50, y: 42, text: "DESIGN AT THE", size: 10 },
    { type: "text", x: 50, y: 56, text: "SPEED OF THOUGHT", size: 10 },
    { type: "rect", x: 34, y: 66, w: 32, h: 1.5, fill: "#2B2B30" },
  ],
};

const CARD_W = 500;
// A still has a single frame, so land every title word in the past instead of freezing a later frame.
const LANDED = [-60, -55, -50, -45, -40, -35];
const CARD_H = (CARD_W * 9) / 16;

export const TeaserThumb: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 70% 50%, #2A251C 0%, ${color.bg} 60%)` }}>
      {/* Sketch card (back) and rendered frame (front). */}
      <div
        style={{
          position: "absolute",
          left: 735,
          top: 105,
          width: CARD_W,
          height: CARD_H,
          transform: "rotate(-7deg)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        }}
      >
        <PanelArt panel={sketch} aspect={16 / 9} showCamera={false} showTags={false} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 750,
          top: 290,
          width: CARD_W,
          height: CARD_H,
          transform: "rotate(4deg)",
          borderRadius: 14,
          overflow: "hidden",
          border: `5px solid ${color.accent}`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ width: 1920, height: 1080, transform: `scale(${CARD_W / 1920})`, transformOrigin: "top left" }}>
          <DemoTitle line="Design at the speed of thought" orientation="landscape" landOn={LANDED} />
        </div>
      </div>

      {/* Headline. */}
      <div style={{ position: "absolute", left: 70, top: 120, width: 600 }}>
        <div style={{ fontFamily: font.body, fontWeight: 800, fontSize: 26, letterSpacing: "0.3em", color: color.accent }}>MOTION STUDIO</div>
        <div style={{ fontFamily: font.display, fontWeight: 900, fontSize: 140, lineHeight: 0.95, color: color.text, marginTop: 18, letterSpacing: "-0.02em" }}>
          SKETCH
          <div style={{ display: "flex", alignItems: "center", gap: 22, color: color.accent }}>
            <svg width="120" height="80" viewBox="0 0 120 80">
              <path d="M6 40 H92 M62 10 L98 40 L62 70" fill="none" stroke={color.accent} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            4K
          </div>
        </div>
        <div style={{ fontFamily: font.body, fontWeight: 700, fontSize: 34, color: color.muted, marginTop: 26 }}>Storyboards · Motion · Stills</div>
      </div>
      <Grain opacity={0.05} animated={false} />
    </AbsoluteFill>
  );
};
