import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../lib";

// A generic app screen "recording" for testing the tutorial layout (npm test renders
// it to public/jobs/tutorial-test/screen/app.mp4). No real product's interface:
// a sidebar, a prompt box that types, a model menu, a Download button that gets
// pressed, and a result panel. Key moments (seconds): menu 2.5, download 5.5,
// prompt typing 6.5–9, send 9.3, result 10.
export const TestScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const prompt = "Animate the word WAIT in big serif letters behind me";
  const typed = prompt.slice(
    0,
    Math.max(
      0,
      Math.floor(
        interpolate(t, [6.5, 9], [0, prompt.length], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      ),
    ),
  );
  const menuOpen = t > 2.5 && t < 4.2;
  const pressed = t > 5.5 && t < 5.75;
  const result = interpolate(t, [10, 10.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ui = {
    bg: "#F6F5F2",
    panel: "#FFFFFF",
    line: "#E4E1DA",
    ink: "#24221F",
    muted: "#8A857C",
    accent: "#C8553D",
  };
  return (
    <AbsoluteFill
      style={{ backgroundColor: ui.bg, fontFamily: font.body, color: ui.ink }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 300,
          backgroundColor: "#EFEDE8",
          borderRight: `2px solid ${ui.line}`,
          padding: 32,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 30, marginBottom: 40 }}>
          Studio App
        </div>
        {["New project", "Library", "Templates", "Exports", "Settings"].map(
          (x, i) => (
            <div
              key={x}
              style={{
                fontSize: 24,
                padding: "14px 16px",
                borderRadius: 12,
                marginBottom: 6,
                backgroundColor: i === 0 ? "#E2DED6" : undefined,
                color: i === 0 ? ui.ink : ui.muted,
              }}
            >
              {x}
            </div>
          ),
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 300,
          right: 0,
          top: 0,
          height: 96,
          borderBottom: `2px solid ${ui.line}`,
          display: "flex",
          alignItems: "center",
          padding: "0 40px",
          gap: 24,
        }}
      >
        <div style={{ fontSize: 26, fontWeight: 700 }}>Untitled motion</div>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <div
            style={{
              fontSize: 22,
              padding: "12px 20px",
              border: `2px solid ${ui.line}`,
              borderRadius: 12,
              backgroundColor: ui.panel,
            }}
          >
            Model: Studio 2 ▾
          </div>
          {menuOpen ? (
            <div
              style={{
                position: "absolute",
                top: 60,
                right: 0,
                width: 300,
                backgroundColor: ui.panel,
                border: `2px solid ${ui.line}`,
                borderRadius: 14,
                boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
                padding: 8,
                zIndex: 2,
              }}
            >
              {["Studio 2 (best)", "Studio 2 Fast", "Studio 1"].map((m, i) => (
                <div
                  key={m}
                  style={{
                    fontSize: 22,
                    padding: "12px 14px",
                    borderRadius: 10,
                    backgroundColor: i === 0 ? "#F1EEE8" : undefined,
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#fff",
            padding: "12px 24px",
            borderRadius: 12,
            backgroundColor: ui.accent,
            transform: `scale(${pressed ? 0.94 : 1})`,
          }}
        >
          Download
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 340,
          right: 40,
          top: 136,
          bottom: 220,
          borderRadius: 20,
          border: `2px solid ${ui.line}`,
          backgroundColor: ui.panel,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 1 - result,
            color: ui.muted,
            fontSize: 28,
          }}
        >
          Your animation appears here
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #2A2320, #120F0E)",
            opacity: result,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 260,
              color: "#F2C14E",
              transform: `scale(${0.9 + 0.1 * result})`,
            }}
          >
            Wait
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 340,
          right: 40,
          bottom: 48,
          height: 128,
          borderRadius: 20,
          border: `2px solid ${ui.line}`,
          backgroundColor: ui.panel,
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: 20,
        }}
      >
        <div
          style={{ flex: 1, fontSize: 28, color: typed ? ui.ink : ui.muted }}
        >
          {typed || "Describe the animation…"}
          {t > 6.5 && t < 9.2 && Math.floor(frame / 8) % 2 === 0 ? "|" : ""}
        </div>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: t > 9.3 && t < 9.6 ? "#8E3B2A" : ui.accent,
            color: "#fff",
            fontSize: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ↑
        </div>
      </div>
    </AbsoluteFill>
  );
};
