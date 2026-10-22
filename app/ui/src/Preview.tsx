import { Player, Thumbnail } from "@remotion/player";
import { useEffect, useState } from "react";
import { metaFor, type Meta, type Template } from "./templates";

// A live preview of a template: the same component the renderer uses, playing in the page.
export const Preview: React.FC<{ tpl: Template; fmt: string; props: Record<string, unknown>; maxHeight?: string; autoPlay?: boolean }> = ({ tpl, fmt, props, maxHeight = "68vh", autoPlay = true }) => {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    metaFor(tpl, fmt, props)
      .then((m) => live && (setMeta(m), setErr(null)))
      .catch((e) => live && setErr(String(e.message || e)));
    return () => {
      live = false;
    };
  }, [tpl, fmt, props]);
  if (err) return <div className="callout bad">{err}</div>;
  if (!meta) return <div className="shimmer" style={{ aspectRatio: "16/9", borderRadius: 12 }} />;
  const ratio = meta.width / meta.height;
  return (
    <div style={{ width: `min(100%, calc(${maxHeight} * ${ratio}))`, margin: "0 auto" }}>
      <Player
        component={tpl.component}
        inputProps={meta.props}
        durationInFrames={Math.max(1, meta.durationInFrames)}
        fps={meta.fps}
        compositionWidth={meta.width}
        compositionHeight={meta.height}
        style={{ width: "100%", aspectRatio: `${meta.width} / ${meta.height}`, borderRadius: 12, overflow: "hidden", background: "#000" }}
        controls
        loop
        autoPlay={autoPlay}
        clickToPlay
        doubleClickToFullscreen
        spaceKeyToPlayOrPause
      />
      <div className="row small muted" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <span>
          {meta.width}×{meta.height} · {meta.fps} fps
        </span>
        <span>{(meta.durationInFrames / meta.fps).toFixed(1)} s</span>
      </div>
    </div>
  );
};

// One frame of a template as a still (carousel slides).
export const Frame: React.FC<{ tpl: Template; meta: Meta; frame: number }> = ({ tpl, meta, frame }) => (
  <Thumbnail
    component={tpl.component}
    inputProps={meta.props}
    compositionWidth={meta.width}
    compositionHeight={meta.height}
    durationInFrames={Math.max(1, meta.durationInFrames)}
    fps={meta.fps}
    frameToDisplay={frame}
    style={{ width: "100%", aspectRatio: `${meta.width} / ${meta.height}`, borderRadius: 10, overflow: "hidden" }}
  />
);
