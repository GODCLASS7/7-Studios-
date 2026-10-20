import { AbsoluteFill, CalculateMetadataFunction } from "remotion";
import { PanelArt, SKETCH, sourceColor } from "./PanelArt";
import { ASPECT, startTimes, Storyboard, timecode, totalSeconds } from "./schema";
import { font } from "../lib/tokens";

// The approval sheet: every panel with timing, action, on-screen text and
// audio, plus a header with runtime/version/status and approval instructions.

const SHEET_W = 2400;
const MARGIN = 80;
const GAP = 40;
const HEADER = 300;
const FOOTER = 170;
const TEXT_H = 260;

const columns = (format: Storyboard["format"]) =>
  format === "9x16" ? 5 : format === "21x9" ? 2 : format === "16x9" ? 3 : 4;

const layout = (sb: Storyboard) => {
  const cols = columns(sb.format);
  const panelW = (SHEET_W - 2 * MARGIN - (cols - 1) * GAP) / cols;
  const panelH = panelW / ASPECT[sb.format];
  const rows = Math.max(1, Math.ceil(sb.panels.length / cols));
  const height = Math.round(MARGIN + HEADER + rows * (panelH + TEXT_H + GAP) + FOOTER);
  return { cols, panelW, panelH, height };
};

export const calcSheet: CalculateMetadataFunction<Storyboard> = ({ props }) => ({
  width: SHEET_W,
  height: layout(props).height,
});

const STATUS: Record<Storyboard["status"], { text: string; color: string }> = {
  draft: { text: "DRAFT", color: "#6B6B73" },
  "for-approval": { text: "FOR APPROVAL", color: "#D9480F" },
  approved: { text: "APPROVED", color: "#1F9D6B" },
  "changes-requested": { text: "CHANGES REQUESTED", color: "#B7791F" },
};

export const StoryboardSheet: React.FC<Storyboard> = (sb) => {
  const { panelW, panelH } = layout(sb);
  const starts = startTimes(sb.panels);
  const total = totalSeconds(sb.panels);
  const status = STATUS[sb.status];
  const meta = [sb.client, `v${sb.version}`, sb.date, sb.format.replace("x", ":"), `${sb.fps} fps`, `${sb.panels.length} panels`, `runtime ${timecode(total)}`]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <AbsoluteFill style={{ backgroundColor: "#FFFFFF", fontFamily: font.body, color: SKETCH.ink, padding: MARGIN, paddingBottom: 0 }}>
      <div style={{ height: HEADER, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.25em", color: "#8A8680" }}>STORYBOARD</div>
          <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.05, marginTop: 8 }}>{sb.project}</div>
          <div style={{ fontSize: 30, fontWeight: 600, marginTop: 14, color: "#5E5B56" }}>{meta}</div>
          {sb.notes ? <div style={{ fontSize: 26, marginTop: 10, color: "#5E5B56", maxWidth: 1700 }}>{sb.notes}</div> : null}
        </div>
        <div style={{ border: `5px solid ${status.color}`, color: status.color, fontWeight: 900, fontSize: 34, letterSpacing: "0.12em", padding: "14px 26px", borderRadius: 12 }}>
          {status.text}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: GAP }}>
        {sb.panels.map((p, i) => (
          <div key={p.id} style={{ width: panelW }}>
            <div style={{ width: panelW, height: panelH, border: `4px solid ${SKETCH.ink}`, borderRadius: 10, overflow: "hidden", position: "relative" }}>
              <PanelArt panel={p} aspect={ASPECT[sb.format]} />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  backgroundColor: SKETCH.ink,
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 30,
                  padding: "6px 16px",
                  borderBottomRightRadius: 10,
                }}
              >
                {p.id}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  backgroundColor: sourceColor(p.source),
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 20,
                  letterSpacing: "0.08em",
                  padding: "4px 12px",
                  borderRadius: 6,
                }}
              >
                {(p.source ?? "motion").toUpperCase()}
              </div>
            </div>
            <div style={{ height: TEXT_H, paddingTop: 14, fontSize: 24, lineHeight: 1.3, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 28 }}>
                <span>{p.title}</span>
                <span style={{ color: "#8A8680", fontWeight: 600, fontSize: 24 }}>
                  {timecode(starts[i])} → {timecode(starts[i] + p.seconds)} ({p.seconds}s)
                </span>
              </div>
              <div style={{ marginTop: 6 }}>{p.action}</div>
              {p.onScreenText ? (
                <div style={{ marginTop: 6 }}>
                  <b>TEXT:</b> “{p.onScreenText}”
                </div>
              ) : null}
              {p.audio ? (
                <div style={{ marginTop: 6, color: "#5E5B56" }}>
                  <b>AUDIO:</b> {p.audio}
                </div>
              ) : null}
              {p.exit ? (
                <div style={{ marginTop: 6, color: "#5E5B56" }}>
                  <b>OUT:</b> {p.exit}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: 0, height: FOOTER, borderTop: "3px solid #E2DED5", paddingTop: 24, display: "flex", justifyContent: "space-between", fontSize: 26 }}>
        <div style={{ maxWidth: 1350, color: "#5E5B56" }}>
          <b style={{ color: SKETCH.ink }}>To approve:</b> reply “approve storyboard v{sb.version}”. <b style={{ color: SKETCH.ink }}>To change:</b> comment by panel number, e.g. “3: warmer light, slower push-in”.
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", fontWeight: 700, fontSize: 22 }}>
          {["motion", "ai-video", "ai-image", "footage", "still"].map((s) => (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: sourceColor(s) }} />
              {s}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
