import { useEffect, useState } from "react";
import { get, type GalleryItem, type Job } from "../api";
import { Icon } from "../icons";
import { Clip, Kinetic, Marquee, Rotator, StudioArt } from "../motion";
import { go, STUDIOS } from "../nav";
import { useStore } from "../store";
import { Empty, RunView, Tile } from "../ui";

type ClipMeta = { name: string; label: string; template: string; ratio: string };
const clipSrc = (c: ClipMeta) => `/showcase/${c.name}.mp4`;
const clipPoster = (c: ClipMeta) => `/showcase/${c.name}.jpg`;

const ENGINE_NOTE: Record<string, string> = {
  demo: "You're on the demo engine: images and clips are placeholders made on this computer, not AI. Choose your engine when you're ready.",
  open: "Open models: your ComfyUI with FLUX, Qwen and Wan, on this Mac or a rented GPU.",
  premium: "Premium: hosted models with your own key, paid per run, always confirmed first.",
  claude: "Claude + Higgsfield: requests Claude runs in chat, quoted in credits before anything is spent.",
};
const WORDS = ["Images", "Video", "Edits", "Motion", "Carousels", "Websites", "Titles", "Lyrics", "Posters", "Reels"];

const Home: React.FC = () => {
  const { status, runs } = useStore();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clips, setClips] = useState<ClipMeta[]>([]);
  useEffect(() => {
    get<{ items: GalleryItem[] }>("/api/gallery").then((g) => setItems(g.items.slice(0, 8))).catch(() => {});
    get<Job[]>("/api/jobs").then((j) => setJobs(j.slice(0, 6))).catch(() => {});
    fetch("/showcase/showcase.json")
      .then((r) => r.json())
      .then(setClips)
      .catch(() => {});
  }, []);
  const active = runs.filter((r) => r.status === "running" || r.status === "queued");
  const cols = [0, 1, 2].map((c) => clips.filter((_, i) => i % 3 === c));
  return (
    <div className="page">
      <section className="hero">
        <div className="aurora">
          <i />
          <i />
          <i />
        </div>
        <div className="grid-lines" />
        <div>
          <div className="eyebrow">
            <Icon name="sparkle" size={14} /> 7 Studios · on your computer
          </div>
          <Kinetic as="h1" text="Making dreams," gold={["dreams,"]} base={340} peak={720} />
          <Kinetic as="h1" text="creating realities." gold={["realities."]} delay={320} base={340} peak={720} />
          <p className="lede">
            Seven studios in one place. Make <b><Rotator words={["a reel", "a poster", "a lyric video", "a carousel", "a website move", "a brand sting", "a sermon clip"]} /></b> with images, video, edits and motion design, every frame rendered here, exactly.
          </p>
          <div className="row">
            <button className="btn primary big" onClick={() => go("image")}>
              <Icon name="wand" /> Start creating
            </button>
            <button className="btn big" onClick={() => go("web")}>
              <Icon name="web" /> Animate a website
            </button>
          </div>
          <div className="facts">
            <div>
              <b>7</b>
              <span>studios</span>
            </div>
            <div>
              <b>{status?.engine.presets ?? 42}</b>
              <span>looks & camera moves</span>
            </div>
            <div>
              <b>4K</b>
              <span>and ProRes masters</span>
            </div>
            <div>
              <b>0</b>
              <span>posts without your yes</span>
            </div>
          </div>
        </div>
        <div className="wall" aria-label="Made in 7 Studios">
          {cols.map((col, ci) => (
            <div key={ci} className="wall-col">
              {[...col, ...col].map((c, i) => (
                <Clip key={`${c.name}-${i}`} src={clipSrc(c)} poster={clipPoster(c)} ratio={c.ratio} tag={c.label} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <Marquee seconds={60} className="words">
        {WORDS.map((w) => (
          <span key={w} className="w">
            {w}
          </span>
        ))}
      </Marquee>

      {status ? (
        <div className="callout gold" style={{ marginBottom: 30 }}>
          <Icon name="bolt" />
          <span style={{ flex: 1 }}>{ENGINE_NOTE[status.engine.default] || ""}</span>
          <a href="#/settings" className="btn sm">
            Engines <Icon name="arrow" size={14} />
          </a>
        </div>
      ) : null}

      <div className="section-title">
        <h2>
          Seven <em className="gold-text">studios</em>
        </h2>
        <span className="muted">Everything from the first idea to the approved post.</span>
      </div>
      <div className="studios">
        {STUDIOS.map((s, i) => (
          <a key={s.path} className="studio-card spot" href={`#/${s.path}`}>
            <span className="num">{String(i + 1).padStart(2, "0")}</span>
            <StudioArt kind={s.path} />
            <div className="meta">
              <b>
                {s.label} <Icon name="arrow" size={18} className="arrow" />
              </b>
              <span className="blurb">{s.blurb}</span>
            </div>
          </a>
        ))}
        <a className="studio-card cta-card" href="#/web">
          <span className="cta-glow" />
          <span className="eyebrow" style={{ color: "var(--gold-ink)" }}>Start here</span>
          <b>
            Your website, <em>in motion.</em>
          </b>
          <span className="blurb">Paste a link: 7 Studios reads every section and turns it into a looping SiteMorph, on the beat, in minutes.</span>
          <span className="btn ink sm" style={{ justifySelf: "start" }}>
            Animate a website <Icon name="arrow" size={14} />
          </span>
        </a>
      </div>

      {clips.length ? (
        <>
          <div className="section-title">
            <h2>
              Made in <em className="gold-text">7 Studios</em>
            </h2>
            <a className="btn sm" href="#/motion">
              Open Motion <Icon name="arrow" size={14} />
            </a>
          </div>
          <Marquee seconds={70} className="reel">
            {clips.map((c) => (
              <Clip key={c.name} src={clipSrc(c)} poster={clipPoster(c)} ratio={c.ratio} tag={c.label} />
            ))}
          </Marquee>
        </>
      ) : null}

      {active.length ? (
        <div className="panel" style={{ margin: "26px 0" }}>
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

      <div className="split" style={{ gridTemplateColumns: "1fr 360px", marginTop: 30 }}>
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
                <Icon name="arrow" size={15} className="dim" />
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
