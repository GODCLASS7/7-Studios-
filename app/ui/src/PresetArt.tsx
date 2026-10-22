import { useId } from "react";

// A small moving picture for each generation preset: a drawn scene in the preset's
// colours, moved the way the preset moves (a dolly pushes in, an orbit swings round,
// a timelapse races the sky, an edit wipes from before to after). Drawn, not
// generated: it shows the idea of the look, not a result.

type Scene = "portrait" | "product" | "landscape" | "food" | "stage" | "city" | "interior" | "aerial" | "flatlay" | "campus" | "sphere" | "clay" | "paper" | "poster" | "drops";
type Art = {
  scene: Scene;
  pal: [string, string, string];
  mv?: string;
  far?: string;
  near?: string;
  subj?: string;
  fx?: ("steam" | "beams" | "bokeh" | "twinkle" | "clouds" | "sky" | "sun" | "sweep" | "bird" | "drops")[];
  over?: ("grain" | "letterbox" | "gate" | "split")[];
  dark?: boolean;
};
const NIGHT: [string, string, string] = ["#0b1030", "#3a1d6b", "#ff6fae"];
const WARM: [string, string, string] = ["#ffd38a", "#f0904a", "#fff4cf"];
const CINE: [string, string, string] = ["#2b3a4f", "#c98a4a", "#f3c27a"];
const CREAM: [string, string, string] = ["#f6ead6", "#e6cfac", "#ffffff"];
const ART: Record<string, Art> = {
  // looks
  "cinematic-portrait": { scene: "portrait", pal: CINE, fx: ["bokeh"], over: ["letterbox"], dark: true },
  "golden-hour-portrait": { scene: "portrait", pal: WARM, fx: ["bokeh"] },
  "studio-headshot": { scene: "portrait", pal: ["#efe9df", "#d6ccbc", "#ffffff"], mv: "pa-breathe" },
  "product-hero": { scene: "product", pal: ["#1a1712", "#3d3326", "#e8b44a"], fx: ["sweep"], dark: true },
  "product-podium": { scene: "product", pal: CREAM },
  "food-macro": { scene: "food", pal: ["#3b2014", "#9a4d25", "#f6c27d"], fx: ["bokeh", "steam"], dark: true },
  "flat-lay": { scene: "flatlay", pal: ["#f4eee3", "#e8dccb", "#d6a33b"], mv: "pa-breathe" },
  "worship-stage": { scene: "stage", pal: ["#130f2c", "#4b2479", "#f3c27a"], fx: ["beams"], dark: true },
  "campus-life": { scene: "campus", pal: ["#bfe2f3", "#e6f3f9", "#fff2c9"], fx: ["clouds"] },
  "documentary-candid": { scene: "portrait", pal: ["#6a675f", "#b4ad9f", "#ece6da"], mv: "pa-handheld", over: ["grain"] },
  "editorial-fashion": { scene: "portrait", pal: ["#f3e9df", "#ddb8a2", "#1c1916"], mv: "pa-breathe" },
  "poster-key-art": { scene: "poster", pal: ["#0f1b3d", "#d9573a", "#f3c27a"], mv: "pa-breathe", dark: true },
  "minimal-3d": { scene: "sphere", pal: ["#efeaff", "#cfc5f7", "#ffffff"], subj: "subj-float", mv: "none" },
  "clay-scene": { scene: "clay", pal: ["#ffe0d2", "#ffbfa8", "#fff4ec"], subj: "subj-squish", mv: "none" },
  "paper-cut": { scene: "paper", pal: ["#ffecc9", "#f4b56c", "#e2694a"], far: "lay-left-far", near: "lay-left", mv: "none" },
  "interior-architecture": { scene: "interior", pal: ["#f3eee6", "#ddd2c0", "#ffffff"] },
  "aerial-landscape": { scene: "aerial", pal: ["#5f8f58", "#9fc78b", "#e9dba9"], mv: "pa-pan" },
  "night-city": { scene: "city", pal: NIGHT, fx: ["twinkle"], dark: true },
  // edits: a wipe from before to after
  "edit-background": { scene: "portrait", pal: ["#bfe2f3", "#7fb6d9", "#fff4d6"], over: ["split"], mv: "none" },
  "edit-golden-hour": { scene: "landscape", pal: WARM, over: ["split"], mv: "none" },
  "edit-declutter": { scene: "interior", pal: ["#f3eee6", "#ddd2c0", "#ffffff"], over: ["split"], mv: "none" },
  "edit-outfit": { scene: "portrait", pal: ["#f2e7dc", "#d9b9a3", "#c0392b"], over: ["split"], mv: "none" },
  "edit-season": { scene: "landscape", pal: ["#e9f1f7", "#cfdde8", "#ffffff"], over: ["split"], mv: "none" },
  "edit-product-scene": { scene: "product", pal: ["#e8f3ea", "#b6d8bd", "#ffffff"], over: ["split"], mv: "none" },
  // camera moves and film looks
  "dolly-in": { scene: "portrait", pal: CINE, mv: "pa-dollyin", dark: true },
  "dolly-out": { scene: "landscape", pal: ["#9cc9e8", "#f6e2b3", "#fff6d8"], mv: "pa-dollyout" },
  orbit: { scene: "product", pal: CREAM, mv: "pa-orbit", far: "lay-right", subj: "subj-spin" },
  "crane-up": { scene: "campus", pal: ["#bfe2f3", "#e6f3f9", "#fff2c9"], mv: "pa-crane" },
  "truck-right": { scene: "city", pal: NIGHT, mv: "none", far: "lay-left-far", near: "lay-left", fx: ["twinkle"], dark: true },
  "handheld-follow": { scene: "portrait", pal: ["#6a675f", "#b4ad9f", "#ece6da"], mv: "pa-handheld", subj: "subj-walk" },
  "drone-flyover": { scene: "aerial", pal: ["#5f8f58", "#9fc78b", "#e9dba9"], mv: "pa-fly" },
  "push-in-macro": { scene: "food", pal: ["#3b2014", "#9a4d25", "#f6c27d"], mv: "pa-macro", fx: ["bokeh", "steam"], dark: true },
  "rack-focus": { scene: "portrait", pal: ["#2f3d33", "#8aa37a", "#f1e7c6"], mv: "none", far: "blur-swap-r", subj: "blur-swap", fx: ["bokeh"], dark: true },
  "parallax-still": { scene: "landscape", pal: ["#a8d0e6", "#f5e3c0", "#fff6d8"], mv: "none", far: "lay-left-far", near: "lay-left" },
  "slow-motion": { scene: "drops", pal: ["#0d2238", "#1f5e86", "#cfeaff"], fx: ["drops"], mv: "pa-breathe", dark: true },
  "timelapse-sky": { scene: "landscape", pal: ["#7fb6e8", "#ffd7a8", "#fff4cf"], fx: ["sky", "clouds", "sun"], mv: "none" },
  "product-turntable": { scene: "product", pal: ["#f4f1ec", "#e2dbd0", "#ffffff"], subj: "subj-spin", mv: "none" },
  "food-sizzle": { scene: "food", pal: ["#2a1710", "#7a3b1c", "#ffb36b"], fx: ["steam", "bokeh"], mv: "pa-breathe", dark: true },
  "worship-haze": { scene: "stage", pal: ["#1a1030", "#5a2a7a", "#ffd88a"], fx: ["beams"], mv: "pa-breathe", dark: true },
  "film-35mm": { scene: "landscape", pal: ["#e9c38f", "#b97a45", "#fff1cf"], over: ["grain", "gate"] },
  "commercial-clean": { scene: "product", pal: ["#ffffff", "#f1ede6", "#e8b44a"], fx: ["sweep"], mv: "pa-breathe" },
  "nature-doc": { scene: "landscape", pal: ["#a8d0e6", "#e9f2df", "#fff6d8"], mv: "pa-pan", fx: ["bird"] },
};
const FALLBACK: Record<string, Art> = {
  image: { scene: "portrait", pal: WARM },
  edit: { scene: "portrait", pal: CREAM, over: ["split"], mv: "none" },
  video: { scene: "landscape", pal: ["#9cc9e8", "#f6e2b3", "#fff6d8"], mv: "pa-dollyin" },
};

const ink = (dark?: boolean) => (dark ? "#0c0a08" : "#3b3127");

const SceneSvg: React.FC<{ a: Art; uid: string }> = ({ a, uid }) => {
  const [c0, c1, c2] = a.pal;
  const sky = `sky-${uid}`;
  const sun = `sun-${uid}`;
  const fx = new Set(a.fx || []);
  const silhouette = ink(a.dark);
  const Bg = (
    <>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c0} />
          <stop offset="1" stopColor={c1} />
        </linearGradient>
        <radialGradient id={sun} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={c2} />
          <stop offset="0.55" stopColor={c2} stopOpacity="0.55" />
          <stop offset="1" stopColor={c2} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect className={fx.has("sky") ? "fx-sky" : ""} x="-40" y="-40" width="240" height="200" fill={`url(#${sky})`} />
    </>
  );
  const Bokeh = fx.has("bokeh") ? (
    <g className="fx-bokeh" opacity="0.75">
      {[
        [22, 30, 7],
        [130, 22, 9],
        [140, 64, 5],
        [16, 70, 4],
        [104, 40, 4],
        [48, 18, 5],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={c2} opacity="0.55" />
      ))}
    </g>
  ) : null;
  const Steam = fx.has("steam") ? (
    <g className="fx-steam" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.5" strokeLinecap="round">
      <path d="M70 70 q -6 -8 0 -16 t 0 -16" />
      <path d="M82 72 q -6 -8 0 -16 t 0 -16" />
      <path d="M94 70 q -6 -8 0 -16 t 0 -16" />
    </g>
  ) : null;
  const Clouds = fx.has("clouds") ? (
    <g className="fx-clouds" fill="#fff" opacity="0.85">
      <ellipse cx="40" cy="26" rx="18" ry="6" />
      <ellipse cx="52" cy="22" rx="10" ry="6" />
      <ellipse cx="118" cy="34" rx="16" ry="5" />
    </g>
  ) : null;
  const Sun = (
    <g className={fx.has("sun") ? "fx-sun" : ""}>
      <circle cx="112" cy="36" r="26" fill={`url(#${sun})`} />
      <circle cx="112" cy="36" r="9" fill={c2} />
    </g>
  );
  switch (a.scene) {
    case "landscape":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            {Sun}
            {Clouds}
            <g className="lay far">
              <path d="M-30 82 Q 10 50 50 72 T 120 64 T 200 70 V140 H-30Z" fill={c1} opacity="0.75" style={{ filter: "brightness(0.82)" }} />
            </g>
            <g className="lay near">
              <path d="M-30 96 Q 30 74 80 92 T 200 88 V140 H-30Z" fill={c1} style={{ filter: "brightness(0.6)" }} />
              <path d="M-30 108 Q 40 96 100 108 T 200 104 V140 H-30Z" fill={c1} style={{ filter: "brightness(0.45)" }} />
            </g>
            {fx.has("bird") ? (
              <g className="fx-bird" fill="none" stroke={silhouette} strokeWidth="1.6" strokeLinecap="round">
                <path d="M0 40 q 4 -4 8 0 q 4 -4 8 0" />
              </g>
            ) : null}
          </g>
        </svg>
      );
    case "portrait":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            <g className="lay far">
              <circle cx="38" cy="40" r="30" fill={`url(#${sun})`} />
              <rect x="112" y="18" width="30" height="46" rx="3" fill="#fff" opacity="0.22" />
              {Bokeh}
            </g>
            <g className="subj">
              <path d="M44 124 Q 46 92 80 86 Q 114 92 116 124 Z" fill={a.scene === "portrait" && a.over?.includes("split") && c2 !== "#fff4d6" ? c2 : silhouette} />
              <rect x="73" y="74" width="14" height="14" rx="5" fill={silhouette} />
              <circle cx="80" cy="62" r="17" fill={silhouette} />
              <path d="M63 60 Q 64 42 80 42 Q 97 42 97 60 Q 90 50 80 50 Q 70 50 63 60Z" fill={silhouette} style={{ filter: "brightness(0.7)" }} />
              <path d="M97 60 Q 96 76 86 79" fill="none" stroke={c2} strokeOpacity="0.8" strokeWidth="1.6" />
            </g>
          </g>
        </svg>
      );
    case "product":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            <g className="lay far">
              <circle cx="80" cy="54" r="44" fill={`url(#${sun})`} opacity="0.7" />
            </g>
            <ellipse cx="80" cy="100" rx="40" ry="8" fill="#000" opacity="0.14" />
            <rect x="44" y="90" width="72" height="14" rx="7" fill={c1} style={{ filter: "brightness(0.92)" }} />
            <ellipse cx="80" cy="90" rx="36" ry="7" fill={c1} style={{ filter: "brightness(1.05)" }} />
            <g className="subj">
              <rect x="66" y="36" width="28" height="54" rx="7" fill={a.dark ? "#2a241b" : "#17130d"} />
              <rect x="66" y="52" width="28" height="7" fill="#e8b44a" />
              <rect x="70" y="40" width="5" height="44" rx="2.5" fill="#fff" opacity="0.28" />
              <rect x="64" y="32" width="32" height="8" rx="3" fill={a.dark ? "#3a3226" : "#2b241a"} />
            </g>
            {fx.has("sweep") ? <rect className="fx-sweep" x="20" y="-10" width="18" height="140" fill="#fff" opacity="0.35" /> : null}
          </g>
        </svg>
      );
    case "food":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            {Bokeh}
            <ellipse cx="80" cy="92" rx="54" ry="16" fill="#f4ede2" />
            <ellipse cx="80" cy="90" rx="42" ry="11" fill="#e6dccb" />
            <path d="M48 86 Q 80 60 112 86 Z" fill={c2} />
            <circle cx="70" cy="78" r="4" fill="#4f8a3a" />
            <circle cx="88" cy="75" r="3.5" fill="#c0392b" />
            <circle cx="96" cy="82" r="3" fill="#4f8a3a" />
            {Steam}
          </g>
        </svg>
      );
    case "stage":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            {fx.has("beams") ? (
              <g className="fx-beams">
                {[-30, -12, 6, 24].map((x, i) => (
                  <polygon key={i} points={`${80 + x},0 ${80 + x - 30},120 ${80 + x + 30},120`} fill={c2} opacity="0.13" />
                ))}
              </g>
            ) : null}
            <ellipse cx="80" cy="8" rx="50" ry="10" fill={c2} opacity="0.5" />
            <rect x="20" y="78" width="120" height="8" fill={c2} opacity="0.35" />
            <g className="lay near" fill="#05040a">
              {Array.from({ length: 11 }).map((_, i) => (
                <g key={i}>
                  <circle cx={8 + i * 15} cy={101 + (i % 2) * 3} r="6" />
                  <rect x={1 + i * 15} y={106 + (i % 2) * 3} width="14" height="20" rx="5" />
                </g>
              ))}
              <path d="M38 98 l -4 -16" stroke="#05040a" strokeWidth="3" strokeLinecap="round" />
              <path d="M112 98 l 5 -17" stroke="#05040a" strokeWidth="3" strokeLinecap="round" />
            </g>
          </g>
        </svg>
      );
    case "city":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            <circle cx="126" cy="24" r="8" fill="#fff4dc" opacity="0.9" />
            <g className="lay far" fill="#1d1640">
              {[[-20, 50, 26], [8, 38, 20], [30, 56, 24], [56, 30, 22], [80, 46, 26], [108, 34, 22], [132, 52, 24], [158, 40, 22]].map(([x, y, w], i) => (
                <rect key={i} x={x} y={y} width={w} height={120} />
              ))}
            </g>
            <g className="lay near">
              {[[-10, 64, 30], [24, 72, 26], [52, 60, 30], [86, 70, 24], [112, 58, 30], [146, 68, 28]].map(([x, y, w], i) => (
                <rect key={i} x={x} y={y} width={w} height={70} fill="#120d2b" />
              ))}
              <g className="fx-twinkle" fill={c2}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <rect key={i} x={-4 + ((i * 37) % 160)} y={66 + ((i * 13) % 40)} width="3" height="4" opacity="0.9" />
                ))}
              </g>
            </g>
          </g>
        </svg>
      );
    case "interior":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            <rect x="96" y="16" width="44" height="54" rx="2" fill="#fff" opacity="0.9" />
            <path d="M118 16 V70 M96 43 H140" stroke={c1} strokeWidth="2" />
            <polygon points="0,84 160,84 160,120 0,120" fill={c1} style={{ filter: "brightness(0.9)" }} />
            <path d="M80 84 L 20 120 M80 84 L 140 120 M80 84 L 80 120" stroke="#fff" strokeOpacity="0.35" />
            <rect x="22" y="66" width="56" height="20" rx="6" fill="#b48a5a" />
            <rect x="22" y="58" width="56" height="12" rx="5" fill="#c79d6c" />
            <circle cx="102" cy="78" r="6" fill="#4f8a3a" />
            <rect x="99" y="82" width="6" height="8" fill="#8a6a45" />
            <line x1="40" y1="0" x2="40" y2="30" stroke="#8a7a66" />
            <path d="M32 30 h16 l -4 8 h-8z" fill={c2 === "#ffffff" ? "#e8b44a" : c2} />
          </g>
        </svg>
      );
    case "aerial":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          <rect x="-40" y="-40" width="240" height="200" fill={c0} />
          <g className="world">
            {Array.from({ length: 12 }).map((_, i) => (
              <rect key={i} x={-20 + (i % 4) * 50} y={-10 + Math.floor(i / 4) * 46} width="44" height="40" rx="2" fill={i % 3 ? c1 : c2} opacity="0.85" />
            ))}
            <path d="M-20 30 C 30 40, 50 80, 90 70 S 150 40, 190 90" fill="none" stroke="#7fb6d9" strokeWidth="9" strokeLinecap="round" />
            <path d="M-20 30 C 30 40, 50 80, 90 70 S 150 40, 190 90" fill="none" stroke="#cfe7f5" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
            {Array.from({ length: 14 }).map((_, i) => (
              <circle key={i} cx={(i * 41) % 170} cy={(i * 29) % 120} r="3.5" fill="#3d6b3a" />
            ))}
          </g>
        </svg>
      );
    case "flatlay":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            <rect x="22" y="22" width="50" height="64" rx="3" fill="#fff" transform="rotate(-8 47 54)" />
            <rect x="30" y="34" width="32" height="3" fill="#d8cdb9" transform="rotate(-8 47 54)" />
            <rect x="30" y="42" width="26" height="3" fill="#d8cdb9" transform="rotate(-8 47 54)" />
            <circle cx="112" cy="40" r="17" fill="#fff" />
            <circle cx="112" cy="40" r="11" fill="#6b4226" />
            <rect x="92" y="70" width="44" height="8" rx="4" fill={c2} transform="rotate(14 114 74)" />
            {[[88, 96], [96, 100], [80, 104], [70, 98]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="4" fill="#c0392b" />
            ))}
            <path d="M20 100 q 10 -14 22 -4" stroke="#4f8a3a" strokeWidth="3" fill="none" />
          </g>
        </svg>
      );
    case "campus":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            {Clouds}
            <circle cx="130" cy="26" r="10" fill="#fff3c4" />
            <polygon points="40,46 80,28 120,46" fill="#d8c6a6" />
            <rect x="44" y="46" width="72" height="44" fill="#efe3cc" />
            {[50, 62, 74, 86, 98, 108].map((x) => (
              <rect key={x} x={x} y="50" width="5" height="40" fill="#d8c6a6" />
            ))}
            <rect x="36" y="90" width="88" height="5" fill="#cdbb9b" />
            <rect x="0" y="95" width="160" height="25" fill="#8cc79a" />
            <circle cx="20" cy="82" r="13" fill="#5d9a63" />
            <circle cx="142" cy="80" r="15" fill="#5d9a63" />
            <g fill="#3b3127">
              <circle cx="64" cy="102" r="3" />
              <rect x="62" y="105" width="4" height="9" rx="2" />
              <circle cx="98" cy="101" r="3" />
              <rect x="96" y="104" width="4" height="9" rx="2" />
            </g>
          </g>
        </svg>
      );
    case "sphere":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <defs>
            <radialGradient id={`sp-${uid}`} cx="0.35" cy="0.3" r="0.75">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor={c1} />
              <stop offset="1" stopColor="#8f80d6" />
            </radialGradient>
          </defs>
          <ellipse cx="80" cy="100" rx="30" ry="6" fill="#6b5fb0" opacity="0.18" />
          <g className="subj">
            <circle cx="80" cy="60" r="26" fill={`url(#sp-${uid})`} />
          </g>
          <rect x="112" y="72" width="22" height="22" rx="4" fill="#fff" opacity="0.8" />
          <circle cx="36" cy="82" r="10" fill={c1} opacity="0.8" />
        </svg>
      );
    case "clay":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <ellipse cx="80" cy="102" rx="46" ry="8" fill="#c97b62" opacity="0.18" />
          <g className="subj">
            <path d="M48 98 Q 40 60 72 52 Q 104 44 112 78 Q 118 102 80 102 Q 52 104 48 98Z" fill="#ff9c7a" />
            <circle cx="70" cy="70" r="5" fill="#fff" />
            <circle cx="92" cy="68" r="5" fill="#fff" />
            <circle cx="71" cy="71" r="2.4" fill="#3b2a24" />
            <circle cx="93" cy="69" r="2.4" fill="#3b2a24" />
            <path d="M74 84 Q 82 90 90 84" stroke="#3b2a24" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </g>
          <circle cx="128" cy="92" r="9" fill="#ffd36e" />
          <circle cx="30" cy="94" r="7" fill="#9ad0b0" />
        </svg>
      );
    case "paper":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <circle cx="110" cy="34" r="12" fill="#fff6e0" />
          <g className="lay far">
            <path d="M-30 70 Q 10 48 50 66 T 130 60 T 200 66 V140 H-30Z" fill={c1} style={{ filter: "drop-shadow(0 -2px 2px rgba(0,0,0,.18))" }} />
          </g>
          <g className="lay near">
            <path d="M-30 86 Q 20 66 70 84 T 200 80 V140 H-30Z" fill={c2} style={{ filter: "drop-shadow(0 -2px 2px rgba(0,0,0,.22))" }} />
            <path d="M-30 102 Q 40 88 100 102 T 200 98 V140 H-30Z" fill="#b54a35" style={{ filter: "drop-shadow(0 -2px 2px rgba(0,0,0,.22))" }} />
          </g>
        </svg>
      );
    case "poster":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            <circle cx="80" cy="54" r="34" fill={c1} />
            <circle cx="80" cy="54" r="34" fill={`url(#${sun})`} opacity="0.6" />
            <path d="M74 120 L 77 76 Q 80 70 83 76 L 86 120Z" fill="#05060f" />
            <circle cx="80" cy="70" r="5" fill="#05060f" />
            <rect x="20" y="98" width="120" height="6" fill={c2} opacity="0.9" />
            <rect x="44" y="108" width="72" height="3" fill={c2} opacity="0.6" />
          </g>
        </svg>
      );
    case "drops":
      return (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice">
          {Bg}
          <g className="world">
            <g className="fx-drops" fill={c2}>
              {Array.from({ length: 12 }).map((_, i) => (
                <circle key={i} cx={10 + i * 13} cy={(i * 23) % 60} r={1.5 + (i % 3)} opacity="0.85" />
              ))}
            </g>
            <ellipse cx="80" cy="96" rx="40" ry="6" fill={c2} opacity="0.3" />
            <ellipse cx="80" cy="96" rx="22" ry="3" fill="none" stroke={c2} strokeOpacity="0.7" />
            <path d="M80 96 q -4 -14 0 -22 q 4 8 0 22" fill={c2} opacity="0.8" />
          </g>
        </svg>
      );
  }
};

export const PresetArt: React.FC<{ id: string; kind: string; playing?: boolean }> = ({ id, kind, playing = true }) => {
  const a = ART[id] || FALLBACK[kind] || FALLBACK.image;
  const uid = `${id}-${useId()}`;
  const vars = {
    "--mv": a.mv === "none" ? "none" : a.mv || "pa-drift",
    "--far": a.far || "none",
    "--near": a.near || "none",
    "--subj": a.subj || "none",
  } as React.CSSProperties;
  const over = new Set(a.over || []);
  return (
    <div className={`pa ${playing ? "anim" : ""}`} style={vars} aria-hidden="true">
      <SceneSvg a={a} uid={uid.replace(/[^a-z0-9-]/gi, "")} />
      {over.has("grain") ? <div className="grain" /> : null}
      {over.has("gate") ? <div className="gate" /> : null}
      {over.has("letterbox") ? <div className="letterbox" /> : null}
      {over.has("split") ? (
        <div className="split">
          <div className="before" />
          <div className="bar" />
        </div>
      ) : null}
    </div>
  );
};
