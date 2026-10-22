import { useEffect, useState } from "react";
import { get, isVideo, mediaUrl, put, type FileEntry, type Run } from "../api";
import { Icon } from "../icons";
import { Frame } from "../Preview";
import { SchemaForm, validate } from "../SchemaForm";
import { useStore } from "../store";
import { CAROUSEL, metaFor, type Meta } from "../templates";
import { Empty, Field, JobPicker, PageHead, RunView, Seg, useLocal } from "../ui";

type CarouselFile = Record<string, unknown> & { slides: Record<string, unknown>[]; brand?: string | null };

const CarouselStudio: React.FC<{ q: URLSearchParams }> = ({ q }) => {
  const { run, toast } = useStore();
  const [job, setJob] = useLocal("carousel:job", q.get("job") || "");
  const [fmt, setFmt] = useLocal("carousel:fmt", "4x5");
  const [doc, setDoc] = useState<Record<string, unknown>>(() => ({ ...structuredClone(CAROUSEL.defaults), brand: null }));
  const [brand, setBrand] = useState("");
  const [good, setGood] = useState<Record<string, unknown> | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [videos, setVideos] = useState<FileEntry[]>([]);
  const [video, setVideo] = useState("");
  const [count, setCount] = useState(8);
  const [cutout, setCutout] = useState(true);
  const [slides, setSlides] = useState<string[]>([]);
  const [last, setLast] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(0);

  const load = async () => {
    if (!job) return;
    const j = await get<{ media: FileEntry[]; renders: FileEntry[] }>(`/api/jobs/${job}`);
    setVideos([...j.renders, ...j.media.map((m) => ({ ...m, path: m.path }))].filter((f) => isVideo(f.path)));
    setSlides(j.renders.filter((r) => /carousel\/slide-\d+\.jpg$/.test(r.path)).map((r) => r.path).sort());
    setVer(Date.now());
    const c = await get<{ carousel: CarouselFile | null }>(`/api/jobs/${job}/carousel`);
    if (c.carousel) {
      const { brand: b, ...rest } = c.carousel;
      setBrand(typeof b === "string" ? b : "");
      setDoc({ ...rest, brand: null });
    }
  };
  useEffect(() => {
    load();
  }, [job]);
  useEffect(() => {
    const r = validate(CAROUSEL.schema, doc);
    if (r.ok) {
      setGood(r.data);
      setIssues([]);
    } else setIssues(r.issues);
  }, [doc]);
  useEffect(() => {
    if (good) metaFor(CAROUSEL, fmt, good).then(setMeta).catch(() => setMeta(null));
  }, [good, fmt]);

  const step = async (task: string, args: Record<string, unknown>) => {
    setBusy(true);
    const r = await run(task, args);
    setBusy(false);
    setLast(r);
    if (r.status !== "done") toast(`${r.label}: ${r.log.slice(-1)[0] || "didn't finish"}`, "error");
    return r.status === "done";
  };
  const save = async () => {
    if (!job) return toast("Choose a job first.", "error");
    if (issues.length) return toast("Fix the slides first.", "error");
    await put(`/api/jobs/${job}/carousel`, { ...doc, brand: brand || undefined });
    return true;
  };
  const renderIt = async () => {
    if (!(await save())) return;
    if (await step("carousel-render", { job, format: fmt })) {
      await load();
      toast("Slides rendered", "ok");
    }
  };

  return (
    <div className="page">
      <PageHead eyebrow="Studio 05" icon="carousel" title="Carousel" sub="Slides in eight looks, from a talk or a topic. Pull stills and cut-outs from a video, write the words, see every slide, render." />
      <div className="split wide">
        <div className="col">
          <div className="panel col">
            <h3>Job</h3>
            <JobPicker value={job} onChange={setJob} defaultFormat="4x5" />
          </div>
          {job ? (
            <div className="panel col">
              <h3>Stills from a video <span className="sub">optional</span></h3>
              <select className="select" value={video} onChange={(e) => setVideo(e.target.value)}>
                <option value="">Choose a video in this job…</option>
                {videos.map((v) => (
                  <option key={v.path} value={v.path}>
                    {v.path.replace(/^public\//, "").split("/").slice(-2).join("/")}
                  </option>
                ))}
              </select>
              <div className="row">
                <Field label={`Stills: ${count}`}>
                  <input type="range" min={3} max={16} value={count} onChange={(e) => setCount(Number(e.target.value))} />
                </Field>
                <label className="inline small">
                  <input type="checkbox" checked={cutout} onChange={(e) => setCutout(e.target.checked)} /> Cut the person out too
                </label>
              </div>
              <button className="btn" disabled={!video || busy} onClick={async () => (await step("carousel-frames", { job, video, count, cutout })) && toast("Stills ready: choose them on each slide", "ok")}>
                {busy ? <span className="spin" /> : <Icon name="image" />} Pick the best stills
              </button>
            </div>
          ) : null}
          <div className="panel">
            <h3>Slides</h3>
            <Field label="Brand kit" hint="folder name in public/brands, applied when rendering">
              <input className="input" value={brand} onChange={(e) => setBrand(e.target.value.replace(/[^a-z0-9-]/g, ""))} placeholder="none" />
            </Field>
            <div style={{ maxHeight: "50vh", overflow: "auto", marginTop: 12, paddingRight: 4 }}>
              <SchemaForm schema={CAROUSEL.schema} value={doc} onChange={setDoc} job={job} hide={["brand"]} />
            </div>
            {issues.length ? <div className="errors">{issues.join("\n")}</div> : null}
          </div>
        </div>
        <div className="col">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Seg value={fmt} options={CAROUSEL.formats} onChange={setFmt} />
            <div className="row">
              <button className="btn" onClick={async () => (await save()) && toast("Saved", "ok")} disabled={!job}>
                Save
              </button>
              <button className="btn primary" onClick={renderIt} disabled={!job || busy}>
                {busy ? <span className="spin" /> : <Icon name="play" />} Render slides
              </button>
            </div>
          </div>
          {meta ? (
            <div className="media-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {Array.from({ length: meta.durationInFrames }).map((_, i) => (
                <div key={i}>
                  <Frame tpl={CAROUSEL} meta={meta} frame={i} />
                  <div className="small dim" style={{ marginTop: 4 }}>
                    {i + 1}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="shimmer" style={{ height: 300, borderRadius: 14 }} />
          )}
          {brand ? <p className="note">The preview shows the look; the brand kit's fonts and colours are applied in the render.</p> : null}
          {last ? <RunView run={last} compact /> : null}
          <div className="panel">
            <h3>Rendered slides</h3>
            {slides.length ? (
              <div className="strip">
                {slides.map((s) => (
                  <a key={s} href={mediaUrl(s)} target="_blank" rel="noreferrer">
                    <img src={`${mediaUrl(s)}?v=${ver}`} alt={s.split("/").pop()} style={{ height: 220, width: "auto", objectFit: "contain", background: "transparent" }} />
                  </a>
                ))}
              </div>
            ) : (
              <Empty title="Not rendered yet" icon="carousel">
                The final JPEGs land in out/{job || "<job>"}/carousel/, ready to post.
              </Empty>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default CarouselStudio;
