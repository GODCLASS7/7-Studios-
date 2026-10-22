import { useEffect, useRef, useState } from "react";
import { ago, fileName, get, isImage, isVideo, mediaUrl, upload, type FileEntry, type GalleryItem, type Job, type Run } from "./api";
import { Icon, type IconName } from "./icons";
import { useStore } from "./store";

export const PageHead: React.FC<{ eyebrow?: string; icon?: IconName; title: string; sub?: string; children?: React.ReactNode }> = ({ eyebrow, icon, title, sub, children }) => (
  <div className="page-head">
    <div>
      {eyebrow ? (
        <div className="eyebrow">
          {icon ? <Icon name={icon} size={14} /> : null}
          {eyebrow}
        </div>
      ) : null}
      <h1>{title}</h1>
      {sub ? <p>{sub}</p> : null}
    </div>
    {children ? <div className="row">{children}</div> : null}
  </div>
);

export function Seg<T extends string | number>({ value, options, onChange, labels }: { value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Partial<Record<string, string>> }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o)} type="button" role="radio" aria-checked={o === value} className={o === value ? "on" : ""} onClick={() => onChange(o)}>
          {labels?.[String(o)] ?? String(o)}
        </button>
      ))}
    </div>
  );
}

export const Field: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="field">
    <span>
      {label}
      {hint ? <em className="dim" style={{ fontStyle: "normal", fontWeight: 400 }}>{hint}</em> : null}
    </span>
    {children}
  </label>
);

export const Progress: React.FC<{ value?: number | null }> = ({ value }) => (
  <div className={`progress ${value === null || value === undefined ? "indet" : ""}`}>
    <i style={{ width: `${Math.round((value ?? 0.3) * 100)}%` }} />
  </div>
);

export const Empty: React.FC<{ icon?: IconName; title: string; children?: React.ReactNode }> = ({ icon = "sparkle", title, children }) => (
  <div className="empty">
    <Icon name={icon} size={26} />
    <b>{title}</b>
    {children ? <div className="small">{children}</div> : null}
  </div>
);

export const Modal: React.FC<{ title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ title, onClose, wide, children }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// Drop or pick files; uploads them and reports each saved path.
export const FileDrop: React.FC<{
  accept?: string;
  multiple?: boolean;
  job?: string;
  into?: string;
  label?: string;
  onDone: (paths: string[]) => void;
}> = ({ accept, multiple, job, into, label = "Drop files here or click to choose", onDone }) => {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [prog, setProg] = useState<number | null>(null);
  const [name, setName] = useState("");
  const { toast } = useStore();
  const go = async (files: FileList | null) => {
    if (!files?.length) return;
    const paths: string[] = [];
    try {
      for (const f of Array.from(files)) {
        setName(f.name);
        setProg(0);
        const r = await upload(f, { job, into }, setProg);
        paths.push(r.path);
      }
      onDone(paths);
      toast(`Added ${paths.length} file${paths.length > 1 ? "s" : ""}`, "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setProg(null);
      setName("");
    }
  };
  return (
    <div
      className={`drop ${over ? "over" : ""}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        go(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
    >
      <Icon name="upload" size={22} />
      {prog === null ? <span>{label}</span> : <span className="small">Adding {name}… {Math.round(prog * 100)}%</span>}
      {prog !== null ? <div style={{ width: "70%" }}><Progress value={prog} /></div> : null}
      <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => go(e.target.files)} />
    </div>
  );
};

export const Media: React.FC<{ src: string; poster?: string | null; controls?: boolean; className?: string; muted?: boolean }> = ({ src, poster, controls, className, muted = true }) =>
  isVideo(src) ? (
    <video className={className} src={mediaUrl(src)} poster={poster ? mediaUrl(poster) : undefined} controls={controls} muted={muted} loop playsInline preload="metadata" onMouseEnter={(e) => !controls && e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => !controls && e.currentTarget.pause()} />
  ) : (
    <img className={className} src={mediaUrl(src)} alt="" loading="lazy" />
  );

export const Tile: React.FC<{
  item: GalleryItem;
  selected?: boolean;
  onClick?: () => void;
  actions?: React.ReactNode;
}> = ({ item, selected, onClick, actions }) => (
  <div className={`tile ${selected ? "on" : ""}`} onClick={onClick}>
    <div className="ratio" style={{ paddingTop: `${(item.height / Math.max(1, item.width)) * 100}%` }}>
      <Media src={item.file} poster={item.thumb} />
    </div>
    <div className="tl">
      {item.demo ? <span className="badge">demo</span> : null}
      {item.kind === "video" ? <span className="badge">{item.seconds ? `${item.seconds.toFixed(1)} s` : "video"}</span> : null}
    </div>
    {actions ? <div className="tr" onClick={(e) => e.stopPropagation()}>{actions}</div> : null}
    <div className="over">
      <span className="cap">{item.userPrompt || item.prompt}</span>
    </div>
  </div>
);

// Choose an image or clip from the gallery or a job, or add a new one.
export const MediaPicker: React.FC<{ kind?: "image" | "video" | "any"; onPick: (path: string, item?: GalleryItem) => void; onClose: () => void; job?: string }> = ({ kind = "image", onPick, onClose, job }) => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  useEffect(() => {
    get<{ items: GalleryItem[] }>("/api/gallery").then((g) => setItems(g.items.filter((i) => kind === "any" || i.kind === kind)));
    if (job) get<{ media: FileEntry[] }>(`/api/jobs/${job}`).then((j) => setFiles(j.media.filter((f) => (kind === "video" ? isVideo(f.path) : kind === "image" ? isImage(f.path) : isVideo(f.path) || isImage(f.path)))));
  }, [kind, job]);
  return (
    <Modal title={kind === "video" ? "Choose a clip" : kind === "image" ? "Choose an image" : "Choose media"} onClose={onClose} wide>
      <FileDrop accept={kind === "video" ? "video/*" : kind === "image" ? "image/*" : "image/*,video/*"} label="Add from this computer" job={job} into={job ? (kind === "video" ? "footage" : "stills") : undefined} onDone={(p) => p[0] && onPick(p[0])} />
      {files.length ? (
        <>
          <div className="nav-label" style={{ padding: 0 }}>In this job</div>
          <div className="media-grid dense">
            {files.slice(0, 60).map((f) => (
              <div key={f.path} className="tile" onClick={() => onPick(f.path)}>
                <div className="ratio" style={{ paddingTop: "100%" }}>
                  <Media src={f.path} />
                </div>
                <div className="over" style={{ opacity: 1 }}>
                  <span className="cap">{fileName(f.path)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className="nav-label" style={{ padding: 0 }}>Library</div>
      {items.length ? (
        <div className="media-grid dense">
          {items.slice(0, 120).map((it) => (
            <Tile key={it.id} item={it} onClick={() => onPick(it.id, it)} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing in the library yet" icon="library">Make something in the Image or Video studio, or add a file above.</Empty>
      )}
    </Modal>
  );
};

export const RunView: React.FC<{ run: Run | null | undefined; title?: string; compact?: boolean }> = ({ run, title, compact }) => {
  const { runs } = useStore();
  const live = run ? runs.find((r) => r.id === run.id) || run : null;
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [live?.log.length]);
  if (!live) return null;
  const busy = live.status === "running" || live.status === "queued";
  return (
    <div className="run">
      <div className="head">
        {busy ? <span className="spin" /> : <Icon name={live.status === "done" ? "check" : "x"} className={live.status === "done" ? "gold" : ""} />}
        <b>{title || live.label}</b>
        <span className={`badge ${live.status === "done" ? "ok" : live.status === "failed" ? "bad" : busy ? "gold" : ""}`}>{live.status}</span>
        <span className="when">{ago(live.createdAt)}</span>
      </div>
      {busy ? <Progress /> : null}
      {live.log.length ? <pre className="log" ref={pre} style={compact ? { maxHeight: 120 } : undefined}>{live.log.slice(compact ? -12 : -300).join("\n")}</pre> : null}
      {live.outputs?.length && live.status === "done" ? (
        <div className="row">
          {live.outputs.map((o) => (
            <a key={o} className="btn sm" href={mediaUrl(o)} target="_blank" rel="noreferrer">
              <Icon name="link" size={14} /> {fileName(o)}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const JobPicker: React.FC<{ value: string; onChange: (id: string) => void; filter?: (j: Job) => boolean; defaultFormat?: string }> = ({ value, onChange, filter, defaultFormat = "9x16" }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [making, setMaking] = useState(false);
  const [title, setTitle] = useState("");
  const { run, toast } = useStore();
  const load = () => get<Job[]>("/api/jobs").then(setJobs).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  const create = async () => {
    if (!slug) return;
    const r = await run("new-job", { job: slug, title, format: defaultFormat });
    if (r.status === "done") {
      await load();
      onChange(slug);
      setMaking(false);
      setTitle("");
      toast(`Job "${title}" created`, "ok");
    } else toast(r.log.slice(-1)[0] || "Couldn't create the job", "error");
  };
  const list = filter ? jobs.filter(filter) : jobs;
  return making ? (
    <div className="row">
      <input className="input grow" autoFocus placeholder="Project name, e.g. Sunday recap" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
      <button className="btn primary" onClick={create} disabled={!slug}>Create</button>
      <button className="btn ghost" onClick={() => setMaking(false)}>Cancel</button>
    </div>
  ) : (
    <div className="row">
      <select className="select grow" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a job…</option>
        {list.map((j) => (
          <option key={j.id} value={j.id}>
            {j.title} ({j.id})
          </option>
        ))}
      </select>
      <button className="btn" onClick={() => setMaking(true)}>
        <Icon name="plus" size={15} /> New
      </button>
    </div>
  );
};

// Persist a small per-studio choice in this browser only (a remembered tab or job).
export function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(`7s:${key}`);
      return s === null ? initial : (JSON.parse(s) as T);
    } catch {
      return initial;
    }
  });
  const set = (n: T) => {
    setV(n);
    try {
      localStorage.setItem(`7s:${key}`, JSON.stringify(n));
    } catch {
      /* private window: fine */
    }
  };
  return [v, set];
}
