import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { color, font, springs } from "../lib";

// Animated inserts for talking-head edits (edl.json "inserts"), built so a
// subagent can make or restyle one while the main edit renders:
//   app-window      a generic app window: title bar, then typed lines, an image or a screen recording
//   profile-follow  a profile card; a tap on Follow turns it to Following and the count ticks up
//   file-scroll     a document page scrolling past
//   terminal        a command line typing commands, picking from a menu, streaming output,
//                   rolling a counter, pressing an approve button (for how-to reels)
// Deliberately generic: no platform logos or copied interfaces. Show real
// screens as an image or recording inside app-window. "layer": "behind" puts
// an insert behind the cut-out speaker (scripts/matte.mjs).

export type InsertProps = {
  kind: "app-window" | "profile-follow" | "file-scroll" | "terminal";
  durationInFrames: number;
  x: number;
  y: number;
  w: number;
  credit: string | null;
  data: Record<string, unknown>;
};

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

// An insert's height as a share of the frame height (for keeping captions clear; cutcheck uses the same numbers).
export const insertHeight = (
  i: Pick<InsertProps, "kind" | "w" | "data">,
  width: number,
  height: number,
) =>
  (i.w *
    width *
    (i.kind === "file-scroll"
      ? Number(i.data.ratio ?? 1.25)
      : i.kind === "profile-follow"
        ? 0.62
        : i.kind === "terminal"
          ? 0.56 + 0.065 * Math.max(0, arr(i.data.lines).length - 4)
          : 0.7)) /
  height;
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

const useEnterExit = (durationInFrames: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame + 1,
    fps,
    config: springs.smooth,
    durationInFrames: 14,
  });
  const exit = interpolate(
    frame,
    [durationInFrames - 9, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return { frame, fps, enter, exit };
};

const AppWindow: React.FC<InsertProps & { u: number; boxW: number }> = ({
  data,
  u,
  boxW,
  durationInFrames,
}) => {
  const { frame, fps } = useEnterExit(durationInFrames);
  const lines = arr(data.lines);
  const charsPerSec = Number(data.speed ?? 38);
  let budget = Math.max(0, (frame / fps - 0.35) * charsPerSec);
  const media = str(data.image) || str(data.video);
  return (
    <div
      style={{
        width: boxW,
        borderRadius: 22 * u,
        overflow: "hidden",
        background: "#16161A",
        border: `${1.5 * u}px solid rgba(255,255,255,0.14)`,
        boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.5)`,
      }}
    >
      <div
        style={{
          height: 54 * u,
          display: "flex",
          alignItems: "center",
          gap: 10 * u,
          padding: `0 ${20 * u}px`,
          background: "#202026",
          borderBottom: `1px solid rgba(255,255,255,0.08)`,
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <div
            key={c}
            style={{
              width: 15 * u,
              height: 15 * u,
              borderRadius: "50%",
              background: c,
            }}
          />
        ))}
        <div
          style={{
            flex: 1,
            textAlign: "center",
            marginRight: 60 * u,
            fontFamily: font.body,
            fontWeight: 600,
            fontSize: 22 * u,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {str(data.title, "App")}
        </div>
      </div>
      {media ? (
        <div
          style={{
            width: "100%",
            aspectRatio: str(data.aspect, "16 / 10"),
            background: "#000",
          }}
        >
          {str(data.image) ? (
            <Img
              src={staticFile(str(data.image))}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <OffthreadVideo
              src={staticFile(str(data.video))}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            padding: `${26 * u}px ${30 * u}px ${34 * u}px`,
            minHeight: 260 * u,
            fontFamily: str(data.mono) === "false" ? font.body : font.mono,
            fontSize: 26 * u,
            lineHeight: 1.55,
            color: "#E9E6DF",
          }}
        >
          {lines.map((l, i) => {
            const shown = l.slice(0, Math.max(0, Math.floor(budget)));
            budget -= l.length + 4;
            const typing = shown.length > 0 && shown.length < l.length;
            return (
              <div
                key={i}
                style={{
                  minHeight: 26 * u * 1.55,
                  color: l.startsWith(">") ? color.accent : undefined,
                }}
              >
                {shown}
                {typing ||
                (shown.length === l.length &&
                  i === lines.length - 1 &&
                  Math.floor(frame / 15) % 2 === 0) ? (
                  <span style={{ opacity: 0.9 }}>▍</span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ProfileFollow: React.FC<InsertProps & { u: number; boxW: number }> = ({
  data,
  u,
  boxW,
  durationInFrames,
}) => {
  const { frame, fps } = useEnterExit(durationInFrames);
  const tapAt = Number(data.tapAt ?? 1.4) * fps;
  const tapped = frame >= tapAt;
  const tap = spring({
    frame: frame - tapAt,
    fps,
    config: springs.punch,
    durationInFrames: 10,
  });
  const ripple = interpolate(frame - tapAt, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const followers = Number(data.followers ?? 1200);
  const fmt = (n: number) =>
    n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e4
        ? `${(n / 1e3).toFixed(1)}K`
        : n.toLocaleString("en-US");
  const avatar = str(data.avatar);
  const name = str(data.name, "Your Name");
  return (
    <div
      style={{
        width: boxW,
        borderRadius: 34 * u,
        padding: `${34 * u}px ${36 * u}px`,
        background: "#FFFFFF",
        color: "#111",
        boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.45)`,
        fontFamily: font.body,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 * u }}>
        <div
          style={{
            width: 132 * u,
            height: 132 * u,
            borderRadius: "50%",
            padding: 5 * u,
            background: `conic-gradient(${color.accent}, #FF6B6B, ${color.accent})`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              overflow: "hidden",
              border: `${4 * u}px solid #fff`,
              background: "#EEE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 48 * u,
            }}
          >
            {avatar ? (
              <Img
                src={staticFile(avatar)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            justifyContent: "space-around",
            textAlign: "center",
          }}
        >
          {[
            [str(data.posts, "120"), "posts"],
            [fmt(followers + (tapped ? 1 : 0)), "followers"],
            [str(data.following, "300"), "following"],
          ].map(([n, l]) => (
            <div key={l}>
              <div style={{ fontWeight: 800, fontSize: 36 * u }}>{n}</div>
              <div style={{ fontSize: 22 * u, color: "#666" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 20 * u, fontWeight: 800, fontSize: 30 * u }}>
        {name}
      </div>
      <div style={{ fontSize: 24 * u, color: "#666" }}>
        {str(data.handle, "@yourhandle")}
      </div>
      {str(data.bio) ? (
        <div style={{ marginTop: 8 * u, fontSize: 24 * u, lineHeight: 1.35 }}>
          {str(data.bio)}
        </div>
      ) : null}
      <div style={{ position: "relative", marginTop: 24 * u }}>
        <div
          style={{
            height: 66 * u,
            borderRadius: 16 * u,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 27 * u,
            background: tapped ? "#EFEFEF" : str(data.buttonColour, "#2F6BFF"),
            color: tapped ? "#111" : "#fff",
            transform: `scale(${tapped ? interpolate(tap, [0, 1], [0.94, 1]) : 1})`,
          }}
        >
          {tapped ? "Following" : "Follow"}
        </div>
        {/* the tap: a finger-sized ripple on the button */}
        {frame >= tapAt - 6 ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 90 * u,
              height: 90 * u,
              marginLeft: -45 * u,
              marginTop: -45 * u,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.18)",
              transform: `scale(${tapped ? 0.6 + ripple * 1.4 : 0.6})`,
              opacity: tapped ? 1 - ripple : 0.8,
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

const FileScroll: React.FC<InsertProps & { u: number; boxW: number }> = ({
  data,
  u,
  boxW,
  durationInFrames,
}) => {
  const { frame } = useEnterExit(durationInFrames);
  const paras = arr(data.paragraphs);
  const viewH = boxW * Number(data.ratio ?? 1.25);
  const travel = Number(data.scroll ?? 1.6) * viewH;
  const y = interpolate(frame, [8, durationInFrames - 10], [0, -travel], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width: boxW,
        height: viewH,
        borderRadius: 18 * u,
        overflow: "hidden",
        background: color.paper,
        boxShadow: `0 ${30 * u}px ${80 * u}px rgba(0,0,0,0.45)`,
        position: "relative",
      }}
    >
      <div
        style={{
          transform: `translateY(${y}px)`,
          padding: `${50 * u}px ${54 * u}px`,
          color: color.ink,
          fontFamily: font.body,
        }}
      >
        {str(data.image) ? (
          <Img
            src={staticFile(str(data.image))}
            style={{ width: "100%", display: "block" }}
          />
        ) : (
          <>
            <div
              style={{
                fontFamily: font.serif,
                fontWeight: 650,
                fontSize: 52 * u,
                lineHeight: 1.1,
                marginBottom: 28 * u,
              }}
            >
              {str(data.title, "Document")}
            </div>
            {(paras.length ? paras : Array.from({ length: 12 }, () => "")).map(
              (p, i) =>
                p ? (
                  <p
                    key={i}
                    style={{
                      fontSize: 26 * u,
                      lineHeight: 1.6,
                      margin: `0 0 ${20 * u}px`,
                    }}
                  >
                    {p}
                  </p>
                ) : (
                  <div key={i} style={{ margin: `0 0 ${22 * u}px` }}>
                    {[0.96, 0.9, 0.98, 0.62].map((w, k) => (
                      <div
                        key={k}
                        style={{
                          height: 14 * u,
                          width: `${w * 100}%`,
                          borderRadius: 7 * u,
                          background: "rgba(28,28,31,0.14)",
                          marginBottom: 12 * u,
                        }}
                      />
                    ))}
                  </div>
                ),
            )}
          </>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 90 * u,
          background: `linear-gradient(transparent, ${color.paper})`,
        }}
      />
    </div>
  );
};

// A generic command-line window. "lines" play in order, each starting at its share of
// the insert's length (or at "at" seconds): "$ npm run build" types; "> done" streams in;
// "menu: Draft|Final|Master > 2" shows a menu and picks one; "count: tokens 128400"
// rolls a number up; "approve: Render" presses a button; "# a comment" is dim.
const Terminal: React.FC<InsertProps & { u: number; boxW: number }> = ({
  data,
  u,
  boxW,
  durationInFrames,
}) => {
  const { frame, fps } = useEnterExit(durationInFrames);
  const lines = arr(data.lines);
  const title = str(data.title, "~/studio");
  const perLine = (durationInFrames - 16) / Math.max(1, lines.length);
  const fsz = boxW * 0.034;
  const pad = boxW * 0.045;
  const green = "#8CFF8F";
  const render = (line: string, i: number) => {
    const start = 8 + i * perLine;
    const l = frame - start;
    if (l < 0) return null;
    const mono: React.CSSProperties = {
      fontFamily: font.mono,
      fontSize: fsz,
      lineHeight: 1.65,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    };
    if (line.startsWith("menu:")) {
      const [items, pickRaw] = line.slice(5).split(">");
      const opts = items.split("|").map((x) => x.trim());
      const pick = Math.max(1, Math.min(opts.length, Number(pickRaw) || 1)) - 1;
      const sel = Math.min(pick, Math.floor(l / Math.max(2, fps * 0.22)));
      return (
        <div key={i} style={{ ...mono, color: "#C9CDD6" }}>
          {opts.map((o, k) => (
            <div
              key={k}
              style={{
                color: k === sel ? "#101216" : "#C9CDD6",
                backgroundColor: k === sel ? green : "transparent",
                display: "inline-block",
                minWidth: "60%",
                padding: `0 ${6 * u}px`,
                borderRadius: 4 * u,
              }}
            >
              {k + 1}. {o}
              {k === pick && sel === pick ? " ✓" : ""}
            </div>
          ))}
        </div>
      );
    }
    if (line.startsWith("count:")) {
      const m = line
        .slice(6)
        .trim()
        .match(/^(.*?)\s*([\d,]+)$/) || [null, line.slice(6), "0"];
      const target = Number(String(m[2]).replace(/,/g, ""));
      const v = Math.round(
        interpolate(l, [0, perLine * 0.8], [0, target], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: (x) => 1 - Math.pow(1 - x, 2),
        }),
      );
      return (
        <div key={i} style={{ ...mono, color: "#C9CDD6" }}>
          {m[1]}{" "}
          <span style={{ color: green, fontVariantNumeric: "tabular-nums" }}>
            {v.toLocaleString("en-US")}
          </span>{" "}
          ▲
        </div>
      );
    }
    if (line.startsWith("approve:")) {
      const label = line.slice(8).trim() || "approve";
      const press = l > perLine * 0.55;
      return (
        <div key={i} style={{ ...mono }}>
          <span
            style={{
              display: "inline-block",
              padding: `${2 * u}px ${14 * u}px`,
              borderRadius: 8 * u,
              backgroundColor: green,
              color: "#101216",
              fontWeight: 700,
              transform: `scale(${press ? 0.94 : 1})`,
            }}
          >
            {label} {press ? "✓" : ""}
          </span>
        </div>
      );
    }
    const typed = line.startsWith("$");
    const dim = line.startsWith("#");
    const shown = typed
      ? line.slice(
          0,
          1 + Math.floor((l / Math.max(1, perLine * 0.7)) * line.length),
        )
      : line;
    const done = !typed || shown.length >= line.length;
    return (
      <div
        key={i}
        style={{ ...mono, color: dim ? "#6B7280" : typed ? "#F2F4F8" : green }}
      >
        {shown}
        {!done || (typed && i === lines.length - 1) ? (
          <span style={{ opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }}>▍</span>
        ) : null}
      </div>
    );
  };
  return (
    <div
      style={{
        width: boxW,
        borderRadius: 18 * u,
        overflow: "hidden",
        backgroundColor: "#101216",
        border: `1px solid #2A2E36`,
        boxShadow: `0 ${24 * u}px ${60 * u}px rgba(0,0,0,0.5)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8 * u,
          padding: `${12 * u}px ${16 * u}px`,
          backgroundColor: "#1A1D23",
        }}
      >
        {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
          <span
            key={c}
            style={{
              width: 12 * u,
              height: 12 * u,
              borderRadius: 6 * u,
              backgroundColor: c,
            }}
          />
        ))}
        <span
          style={{
            marginLeft: 10 * u,
            fontFamily: font.mono,
            fontSize: boxW * 0.026,
            color: "#8A8F98",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: pad, minHeight: boxW * 0.42 }}>
        {lines.map(render)}
      </div>
    </div>
  );
};

export const Insert: React.FC<InsertProps> = (p) => {
  const { enter, exit } = useEnterExit(p.durationInFrames);
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  const boxW = p.w * width;
  const Body =
    p.kind === "app-window"
      ? AppWindow
      : p.kind === "profile-follow"
        ? ProfileFollow
        : p.kind === "terminal"
          ? Terminal
          : FileScroll;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: p.x * width,
          top: p.y * height,
          transform: `translate(-50%, -50%) translateY(${interpolate(enter, [0, 1], [50 * u, 0]) + exit * 30 * u}px) scale(${interpolate(enter, [0, 1], [0.92, 1]) * (1 - 0.04 * exit)})`,
          opacity: Math.min(1, enter * 1.4) * (1 - exit),
        }}
      >
        <Body {...p} u={u} boxW={boxW} />
        {p.credit ? (
          <div
            style={{
              marginTop: 10 * u,
              fontFamily: font.body,
              fontWeight: 700,
              fontSize: 22 * u,
              color: "#fff",
              textShadow: "0 2px 10px rgba(0,0,0,0.7)",
            }}
          >
            {p.credit}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
