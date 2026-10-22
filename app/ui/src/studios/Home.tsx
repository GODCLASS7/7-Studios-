import { useEffect, useState } from "react";
import { get, type GalleryItem, type Job } from "../api";
import { Icon } from "../icons";
import { go, STUDIOS } from "../nav";
import { useStore } from "../store";
import { Empty, RunView, Tile } from "../ui";

const ENGINE_NOTE: Record<string, string> = {
  demo: "Demo engine: placeholders made on this computer, not AI. Switch in Settings when your engine is ready.",
  open: "Open engine: your ComfyUI with open models (on this Mac or a rented GPU).",
  premium: "Premium engine: hosted models with your own key, paid per run.",
  claude: "Claude engine: requests Claude runs in chat through Higgsfield, quoted before any credits are spent.",
};

const Home: React.FC = () => {
  const { status, runs } = useStore();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    get<{ items: GalleryItem[] }>("/api/gallery").then((g) => setItems(g.items.slice(0, 8))).catch(() => {});
    get<Job[]>("/api/jobs").then((j) => setJobs(j.slice(0, 6))).catch(() => {});
  }, []);
  const active = runs.filter((r) => r.status === "running" || r.status === "queued");
  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">
          <Icon name="sparkle" size={14} /> Your studio, on your computer
        </div>
        <h1>
          Make anything <em>that moves.</em>
        </h1>
        <p>Images, video, edits from the transcript, motion design, carousels and websites in motion: seven studios in one place. Every frame is rendered here, exactly, and nothing is posted without your yes.</p>
        <div className="row">
          <button className="btn primary big" onClick={() => go("image")}>
            <Icon name="wand" /> Start creating
          </button>
          <button className="btn big" onClick={() => go("web")}>
            <Icon name="web" /> Animate a website
          </button>
        </div>
      </section>

      {status ? (
        <div className="callout gold" style={{ marginBottom: 22 }}>
          <Icon name="bolt" />
          <span>
            {ENGINE_NOTE[status.engine.default] || ""}{" "}
            <a href="#/settings" className="gold">
              Engines
            </a>
          </span>
        </div>
      ) : null}

      <div className="studios">
        {STUDIOS.map((s, i) => (
          <a key={s.path} className="studio-card" href={`#/${s.path}`}>
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <span className="ic">
              <Icon name={s.icon} size={20} />
            </span>
            <b>{s.label}</b>
            <span>{s.blurb}</span>
          </a>
        ))}
      </div>

      <div className="stat-row">
        <div className="stat">
          <b>{status?.engine.gallery ?? "–"}</b>
          <span>made in the library</span>
        </div>
        <div className="stat">
          <b>{status?.engine.presets ?? "–"}</b>
          <span>generation presets</span>
        </div>
        <div className="stat">
          <b>{jobs.length ? `${jobs.length}+` : "–"}</b>
          <span>jobs on this computer</span>
        </div>
        <div className="stat">
          <b>{status ? Object.keys(status.compositions).length : "–"}</b>
          <span>motion templates</span>
        </div>
      </div>

      {active.length ? (
        <div className="panel" style={{ marginBottom: 20 }}>
          <h3>
            <span className="spin" /> Working now
          </h3>
          <div className="col">
            {active.map((r) => (
              <RunView key={r.id} run={r} compact />
            ))}
          </div>
        </div>
      ) : null}

      <div className="split" style={{ gridTemplateColumns: "1fr 340px" }}>
        <div className="panel">
          <h3>
            Recently made <a className="sub" href="#/library">Library →</a>
          </h3>
          {items.length ? (
            <div className="media-grid dense">
              {items.map((it) => (
                <Tile key={it.id} item={it} onClick={() => go("library")} />
              ))}
            </div>
          ) : (
            <Empty title="Nothing made yet">Your images and clips collect here.</Empty>
          )}
        </div>
        <div className="panel">
          <h3>Jobs</h3>
          <div className="list">
            {jobs.map((j) => (
              <div key={j.id} className="item clickable" onClick={() => go(j.has.site ? "web" : j.has.carousel ? "carousel" : "edit", { job: j.id })}>
                <Icon name={j.has.site ? "web" : j.has.carousel ? "carousel" : "scissors"} />
                <div className="grow">
                  <div className="t">{j.title}</div>
                  <div className="s">{j.id}</div>
                </div>
              </div>
            ))}
            {!jobs.length ? <p className="muted small">No jobs yet. The Edit, Carousel and Web studios start one.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Home;
