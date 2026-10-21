import { Img, staticFile } from "remotion";
import type { Camera, Element, Panel } from "./schema";
import { font } from "../lib/tokens";

// Draws one storyboard frame: a real image if the panel has one, otherwise a
// pencil-style wireframe from `panel.draw`. Coordinates are % of the frame.

export const SKETCH = {
  paper: "#F7F5F0",
  ink: "#2B2B30",
  fill: "#E2DED5",
  fill2: "#CFCAC0",
  camera: "#D9480F",
} as const;

const SOURCE_COLOR: Record<string, string> = {
  motion: "#2F6FDE",
  "ai-video": "#8B3FD9",
  "ai-image": "#B0389A",
  footage: "#1F9D6B",
  still: "#B7791F",
};
export const sourceColor = (s?: string) => SOURCE_COLOR[s ?? "motion"] ?? SOURCE_COLOR.motion;

const DrawElement: React.FC<{ el: Element; W: number; H: number }> = ({ el, W, H }) => {
  const X = (v: number) => (v / 100) * W;
  const Y = (v: number) => (v / 100) * H;
  const sw = H * 0.006;
  const labelSize = H * 0.045;
  const label = (text: string | undefined, cx: number, cy: number) =>
    text ? (
      <text x={cx} y={cy} fontSize={labelSize} fontFamily={font.body} fontWeight={600} fill={SKETCH.ink} textAnchor="middle" dominantBaseline="middle">
        {text}
      </text>
    ) : null;

  switch (el.type) {
    case "rect":
      return (
        <g>
          <rect x={X(el.x)} y={Y(el.y)} width={X(el.w)} height={Y(el.h)} rx={H * 0.012} fill={el.fill ?? SKETCH.fill} stroke={SKETCH.ink} strokeWidth={sw} />
          {label(el.label, X(el.x + el.w / 2), Y(el.y + el.h / 2))}
        </g>
      );
    case "circle":
      return (
        <g>
          <circle cx={X(el.x)} cy={Y(el.y)} r={Y(el.r)} fill={el.fill ?? SKETCH.fill} stroke={SKETCH.ink} strokeWidth={sw} />
          {label(el.label, X(el.x), Y(el.y))}
        </g>
      );
    case "text":
      return (
        <text
          x={X(el.x)}
          y={Y(el.y)}
          fontSize={Y(el.size ?? 8)}
          fontWeight={el.weight ?? 800}
          fontFamily={font.display}
          fill={SKETCH.ink}
          textAnchor={el.align ?? "middle"}
          dominantBaseline="middle"
        >
          {el.text}
        </text>
      );
    case "figure": {
      // Feet at (x, y); height h.
      const h = Y(el.h);
      const cx = X(el.x);
      const base = Y(el.y);
      const head = h * 0.13;
      return (
        <g>
          <circle cx={cx} cy={base - h + head} r={head} fill={SKETCH.fill2} stroke={SKETCH.ink} strokeWidth={sw} />
          <path
            d={`M ${cx - h * 0.2} ${base} L ${cx - h * 0.16} ${base - h * 0.6} Q ${cx} ${base - h * 0.78} ${cx + h * 0.16} ${base - h * 0.6} L ${cx + h * 0.2} ${base} Z`}
            fill={SKETCH.fill2}
            stroke={SKETCH.ink}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          {label(el.label, cx, base + labelSize)}
        </g>
      );
    }
    case "arrow": {
      const x1 = X(el.x1);
      const y1 = Y(el.y1);
      const x2 = X(el.x2);
      const y2 = Y(el.y2);
      return (
        <g>
          <Arrow x1={x1} y1={y1} x2={x2} y2={y2} color={SKETCH.ink} width={sw} head={H * 0.035} />
          {label(el.label, (x1 + x2) / 2, (y1 + y2) / 2 - labelSize)}
        </g>
      );
    }
    case "device": {
      const x = X(el.x);
      const y = Y(el.y);
      const w = X(el.w);
      const h = Y(el.h);
      if (el.kind === "phone") {
        return (
          <g>
            <rect x={x} y={y} width={w} height={h} rx={w * 0.14} fill={SKETCH.ink} />
            <rect x={x + w * 0.06} y={y + w * 0.06} width={w * 0.88} height={h - w * 0.12} rx={w * 0.1} fill={SKETCH.fill} />
            {label(el.label, x + w / 2, y + h / 2)}
          </g>
        );
      }
      if (el.kind === "laptop") {
        const screenH = h * 0.86;
        return (
          <g>
            <rect x={x + w * 0.08} y={y} width={w * 0.84} height={screenH} rx={h * 0.03} fill={SKETCH.ink} />
            <rect x={x + w * 0.1} y={y + h * 0.04} width={w * 0.8} height={screenH - h * 0.06} fill={SKETCH.fill} />
            <path d={`M ${x} ${y + h} L ${x + w * 0.06} ${y + screenH} L ${x + w * 0.94} ${y + screenH} L ${x + w} ${y + h} Z`} fill={SKETCH.fill2} stroke={SKETCH.ink} strokeWidth={sw} />
            {label(el.label, x + w / 2, y + screenH / 2)}
          </g>
        );
      }
      const bar = h * 0.1;
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={h * 0.03} fill={SKETCH.fill} stroke={SKETCH.ink} strokeWidth={sw} />
          <path d={`M ${x} ${y + bar} L ${x + w} ${y + bar}`} stroke={SKETCH.ink} strokeWidth={sw} />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={x + bar * (0.6 + i * 0.6)} cy={y + bar / 2} r={bar * 0.18} fill={SKETCH.ink} />
          ))}
          {label(el.label, x + w / 2, y + bar + (h - bar) / 2)}
        </g>
      );
    }
    case "chart": {
      const x = X(el.x);
      const y = Y(el.y);
      const w = X(el.w);
      const h = Y(el.h);
      if (el.kind === "donut") {
        const r = Math.min(w, h) * 0.38;
        const c = 2 * Math.PI * r;
        return (
          <g>
            <circle cx={x + w / 2} cy={y + h / 2} r={r} fill="none" stroke={SKETCH.fill2} strokeWidth={r * 0.35} />
            <circle
              cx={x + w / 2}
              cy={y + h / 2}
              r={r}
              fill="none"
              stroke={SKETCH.ink}
              strokeWidth={r * 0.35}
              strokeDasharray={`${c * 0.62} ${c}`}
              transform={`rotate(-90 ${x + w / 2} ${y + h / 2})`}
            />
          </g>
        );
      }
      const axis = (
        <path d={`M ${x} ${y} L ${x} ${y + h} L ${x + w} ${y + h}`} fill="none" stroke={SKETCH.ink} strokeWidth={sw} />
      );
      const values = [0.35, 0.55, 0.45, 0.8, 0.95];
      if (el.kind === "line") {
        const pts = values.map((v, i) => `${x + (w * (i + 0.5)) / values.length},${y + h - v * h * 0.9}`).join(" ");
        return (
          <g>
            {axis}
            <polyline points={pts} fill="none" stroke={SKETCH.ink} strokeWidth={sw * 2} strokeLinejoin="round" />
          </g>
        );
      }
      const bw = (w / values.length) * 0.6;
      return (
        <g>
          {axis}
          {values.map((v, i) => (
            <rect
              key={i}
              x={x + (w * (i + 0.2)) / values.length}
              y={y + h - v * h * 0.9}
              width={bw}
              height={v * h * 0.9}
              fill={i === values.length - 1 ? SKETCH.ink : SKETCH.fill2}
              stroke={SKETCH.ink}
              strokeWidth={sw * 0.6}
            />
          ))}
        </g>
      );
    }
    case "logo":
      return (
        <g>
          <rect x={X(el.x)} y={Y(el.y)} width={X(el.w)} height={Y(el.h)} rx={Y(el.h) * 0.2} fill={SKETCH.ink} />
          <text
            x={X(el.x + el.w / 2)}
            y={Y(el.y + el.h / 2)}
            fontSize={Y(el.h) * 0.45}
            fontWeight={900}
            fontFamily={font.display}
            fill={SKETCH.paper}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {el.text}
          </text>
        </g>
      );
    case "horizon":
      return <path d={`M 0 ${Y(el.y)} L ${W} ${Y(el.y)}`} stroke={SKETCH.ink} strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} />;
    default:
      return null;
  }
};

export const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; color: string; width: number; head: number }> = ({
  x1,
  y1,
  x2,
  y2,
  color,
  width,
  head,
}) => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p1 = `${x2 - head * Math.cos(a - 0.45)},${y2 - head * Math.sin(a - 0.45)}`;
  const p2 = `${x2 - head * Math.cos(a + 0.45)},${y2 - head * Math.sin(a + 0.45)}`;
  return (
    <g>
      <path d={`M ${x1} ${y1} L ${x2} ${y2}`} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${p1} ${p2}`} fill={color} />
    </g>
  );
};

const CAMERA_LABEL: Record<Camera, string> = {
  static: "STATIC",
  "push-in": "PUSH IN",
  "pull-out": "PULL OUT",
  "pan-left": "PAN LEFT",
  "pan-right": "PAN RIGHT",
  "tilt-up": "TILT UP",
  "tilt-down": "TILT DOWN",
  orbit: "ORBIT",
  handheld: "HANDHELD",
  "crane-up": "CRANE UP",
};

// Storyboard-convention camera notation, drawn in red over the frame.
const CameraMarks: React.FC<{ camera: Camera; W: number; H: number }> = ({ camera, W, H }) => {
  const c = SKETCH.camera;
  const w = H * 0.012;
  const head = H * 0.05;
  const m = H * 0.16;
  const inner = { x: W * 0.22, y: H * 0.22, w: W * 0.56, h: H * 0.56 };
  switch (camera) {
    case "push-in":
    case "pull-out": {
      const inward = camera === "push-in";
      const corners: [number, number, number, number][] = [
        [m, m, inner.x, inner.y],
        [W - m, m, inner.x + inner.w, inner.y],
        [m, H - m, inner.x, inner.y + inner.h],
        [W - m, H - m, inner.x + inner.w, inner.y + inner.h],
      ];
      return (
        <g>
          <rect x={inner.x} y={inner.y} width={inner.w} height={inner.h} fill="none" stroke={c} strokeWidth={w * 0.7} strokeDasharray={`${w * 3} ${w * 2}`} />
          {corners.map(([ox, oy, ix, iy], i) =>
            inward ? (
              <Arrow key={i} x1={ox} y1={oy} x2={ix} y2={iy} color={c} width={w} head={head} />
            ) : (
              <Arrow key={i} x1={ix} y1={iy} x2={ox} y2={oy} color={c} width={w} head={head} />
            ),
          )}
        </g>
      );
    }
    case "pan-left":
      return <Arrow x1={W * 0.8} y1={H * 0.14} x2={W * 0.2} y2={H * 0.14} color={c} width={w} head={head} />;
    case "pan-right":
      return <Arrow x1={W * 0.2} y1={H * 0.14} x2={W * 0.8} y2={H * 0.14} color={c} width={w} head={head} />;
    case "tilt-up":
    case "crane-up":
      return <Arrow x1={W * 0.92} y1={H * 0.8} x2={W * 0.92} y2={H * 0.2} color={c} width={w} head={head} />;
    case "tilt-down":
      return <Arrow x1={W * 0.92} y1={H * 0.2} x2={W * 0.92} y2={H * 0.8} color={c} width={w} head={head} />;
    case "orbit": {
      const cx = W / 2;
      const cy = H * 0.82;
      const rx = W * 0.32;
      const ry = H * 0.08;
      return (
        <g>
          <path d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`} fill="none" stroke={c} strokeWidth={w} />
          <Arrow x1={cx + rx - 1} y1={cy - 1} x2={cx + rx} y2={cy - ry * 0.6} color={c} width={w} head={head} />
        </g>
      );
    }
    case "handheld": {
      const pts = Array.from({ length: 9 }, (_, i) => `${W * (0.3 + i * 0.05)},${H * (0.14 + (i % 2 ? 0.03 : -0.03))}`).join(" ");
      return <polyline points={pts} fill="none" stroke={c} strokeWidth={w} strokeLinejoin="round" />;
    }
    default:
      return null;
  }
};

export const PanelArt: React.FC<{
  panel: Panel;
  aspect: number;
  showCamera?: boolean;
  showTags?: boolean;
}> = ({ panel, aspect, showCamera = true, showTags = true }) => {
  const H = 900;
  const W = Math.round(H * aspect);
  const camera = panel.camera ?? "static";
  const tag = Math.min(W, H) * 0.05;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", backgroundColor: SKETCH.paper, overflow: "hidden" }}>
      {panel.image ? (
        <Img src={staticFile(panel.image)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {panel.image ? null : (panel.draw ?? []).map((el, i) => <DrawElement key={i} el={el} W={W} H={H} />)}
        {showCamera ? <CameraMarks camera={camera} W={W} H={H} /> : null}
        {showTags ? (
          <g fontFamily={font.body} fontWeight={800} fontSize={tag}>
            {camera !== "static" ? (
              <text x={H * 0.04} y={H - H * 0.05} fill={SKETCH.camera}>
                {CAMERA_LABEL[camera]}
              </text>
            ) : null}
            {panel.shot ? (
              <text x={W - H * 0.04} y={H - H * 0.05} fill={SKETCH.ink} textAnchor="end">
                {panel.shot.toUpperCase()}
              </text>
            ) : null}
          </g>
        ) : null}
      </svg>
    </div>
  );
};
