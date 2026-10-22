import { useEffect, useState } from "react";
import { get, isVideo, mediaUrl, type FileEntry, type Run } from "../api";
import { Icon } from "../icons";
import { useStore } from "../store";
import { Empty, Field, JobPicker, Modal, PageHead, RunView, Seg, useLocal } from "../ui";

type Post = {
  id: string;
  job: string | null;
  kind: "reel" | "carousel" | "video";
  file: string;
  platform: "instagram" | "tiktok";
  account: string;
  caption: string;
  seconds?: number;
  slides?: number;
  trial: null | "MANUAL" | "SS_PERFORMANCE";
  aiLabel: null | boolean;
  at: string | null;
  status: string;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  url?: string;
};
type Variants = { goal?: string; variants: { id: string; label: string }[] } | null;

const Publish: React.FC = () => {
  const { run, toast } = useStore();
  const [tab, setTab] = useLocal<"queue" | "versions" | "review">("publish:tab", "queue");
  const [posts, setPosts] = useState<Post[]>([]);
  const [renders, setRenders] = useState<FileEntry[]>([]);
  const [approve, setApprove] = useState<Post | null>(null);
  const [read, setRead] = useState(false);
  const [words, setWords] = useState("");
  const [adding, setAdding] = useState(false);
  const [last, setLast] = useState<Run | null>(null);

  const load = () => {
    get<{ posts: Post[] }>("/api/posts").then((q) => setPosts([...q.posts].reverse()));
    get<FileEntry[]>("/api/renders").then((r) => setRenders(r.filter((f) => isVideo(f.path))));
  };
  useEffect(load, []);
  const doRun = async (task: string, args: Record<string, unknown>, ok: string) => {
    const r = await run(task, args);
    setLast(r);
    toast(r.status === "done" ? ok : r.log.filter((l) => l.startsWith("✖")).slice(-1)[0] || r.log.slice(-1)[0] || "Didn't finish", r.status === "done" ? "ok" : "error");
    load();
    return r.status === "done";
  };

  return (
    <div className="page">
      <PageHead eyebrow="Studio 07" icon="publish" title="Publish" sub="Try versions, send review pages, and queue posts. Nothing is posted unless you approve that exact post: file, caption, account and time." />
      <div className="tabs">
        {(["queue", "versions", "review"] as const).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "queue" ? "Post queue" : t === "versions" ? "Versions" : "Review & phone copies"}
          </button>
        ))}
      </div>

      {tab === "queue" ? (
        <div className="split" style={{ gridTemplateColumns: "1fr 360px" }}>
          <div className="col">
            {posts.length ? (
              posts.map((p) => (
                <div key={p.id} className="panel">
                  <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 16 }}>
                    <div style={{ width: 120, flex: "none" }}>
                      {isVideo(p.file) ? <video className="preview" src={mediaUrl(p.file)} muted playsInline preload="metadata" /> : <div className="pending" style={{ height: 160 }}>{p.slides} slides</div>}
                    </div>
                    <div className="grow col" style={{ gap: 6 }}>
                      <div className="row">
                        <b>
                          {p.platform === "instagram" ? "Instagram" : "TikTok"} · {p.account}
                        </b>
                        <span className={`badge ${p.status === "approved" ? "ok" : p.status === "done" ? "gold" : p.status === "cancelled" ? "" : "warn"}`}>{p.status}</span>
                        <span className="dim small mono">{p.id}</span>
                      </div>
                      <div className="small" style={{ whiteSpace: "pre-wrap" }}>{p.caption}</div>
                      <div className="small muted">
                        {p.at ? `Goes out ${new Date(p.at).toLocaleString()}` : "When approved"} · {p.trial ? `trial reel (${p.trial === "MANUAL" ? "you decide" : "automatic"})` : p.kind} · AI label: {p.aiLabel === null ? "not decided" : p.aiLabel ? "yes" : "no"}
                      </div>
                      {p.approvedAt ? <div className="small muted">Approved {new Date(p.approvedAt).toLocaleString()}: "{p.approvedBy}"</div> : null}
                      {p.url ? <a className="small gold" href={p.url} target="_blank" rel="noreferrer">Posted ↗</a> : null}
                    </div>
                    <div className="col" style={{ flex: "none" }}>
                      {p.status === "draft" ? (
                        <button className="btn primary sm" onClick={() => (setApprove(p), setRead(false), setWords(""))}>
                          Review & approve
                        </button>
                      ) : null}
                      {p.status === "draft" || p.status === "approved" ? (
                        <button className="btn ghost sm danger" onClick={() => doRun("posts-cancel", { id: p.id }, "Cancelled")}>
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty title="No posts queued" icon="publish">Queue a render on the right. You approve each post here before anything goes out.</Empty>
            )}
          </div>
          <div className="col">
            <div className="callout gold">
              <Icon name="shield" />
              <span>
                Posting is done by Claude with your connected accounts, after a final check that the post is approved and the file hasn't changed. In Claude Code say <b>"post my approved posts"</b>, or ask for a scheduled post.
              </span>
            </div>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Queue a post
            </button>
            {last ? <RunView run={last} compact /> : null}
          </div>
        </div>
      ) : tab === "versions" ? (
        <Versions onRun={setLast} />
      ) : (
        <ReviewTools renders={renders} />
      )}

      {approve ? (
        <Modal title={`Approve ${approve.id}?`} onClose={() => setApprove(null)}>
          <div className="callout">
            <Icon name="info" /> Read the whole post. Approving records your yes for exactly this: if the file, caption or settings change, it needs approving again.
          </div>
          {isVideo(approve.file) ? <video className="preview" src={mediaUrl(approve.file)} controls playsInline style={{ maxHeight: 360 }} /> : null}
          <dl className="kv">
            <dt>Where</dt>
            <dd>
              {approve.platform} · {approve.account}
            </dd>
            <dt>File</dt>
            <dd className="mono">{approve.file}</dd>
            <dt>Caption</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{approve.caption}</dd>
            <dt>Type</dt>
            <dd>{approve.trial ? `Trial reel, ${approve.trial === "MANUAL" ? "you decide if it graduates" : "graduates automatically if it performs"}` : approve.kind}</dd>
            <dt>AI label</dt>
            <dd>{approve.aiLabel === null ? "not decided: set it when queueing" : approve.aiLabel ? "yes" : "no"}</dd>
            <dt>When</dt>
            <dd>{approve.at ? new Date(approve.at).toLocaleString() : "as soon as Claude posts it"}</dd>
          </dl>
          <Field label="Your words (kept with the approval)">
            <input className="input" value={words} onChange={(e) => setWords(e.target.value)} placeholder="e.g. Yes, post this as is" />
          </Field>
          <label className="inline">
            <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> I've read this post and approve it exactly as shown
          </label>
          <div className="actions">
            <button className="btn ghost" onClick={() => setApprove(null)}>
              Not yet
            </button>
            <button
              className="btn primary"
              disabled={!read}
              onClick={async () => {
                const p = approve;
                setApprove(null);
                await doRun("posts-approve", { id: p.id, confirm: true, by: words.trim() || "Approved in the 7 Studios app after reading the post card" }, `${p.id} approved`);
              }}
            >
              Approve this post
            </button>
          </div>
        </Modal>
      ) : null}
      {adding ? <AddPost renders={renders} onClose={() => setAdding(false)} onAdd={async (args) => (await doRun("posts-add", args, "Queued as a draft: approve it when ready")) && setAdding(false)} /> : null}
    </div>
  );
};

const AddPost: React.FC<{ renders: FileEntry[]; onClose: () => void; onAdd: (a: Record<string, unknown>) => void }> = ({ renders, onClose, onAdd }) => {
  const [file, setFile] = useState(renders[0]?.path || "");
  const [platform, setPlatform] = useState<"instagram" | "tiktok">("instagram");
  const [account, setAccount] = useLocal("publish:account", "");
  const [caption, setCaption] = useState("");
  const [trial, setTrial] = useState<"" | "manual" | "auto">("");
  const [ai, setAi] = useState<"" | "yes" | "no">("");
  const [at, setAt] = useState("");
  return (
    <Modal title="Queue a post" onClose={onClose}>
      <Field label="Video">
        <select className="select" value={file} onChange={(e) => setFile(e.target.value)}>
          {renders.map((r) => (
            <option key={r.path} value={r.path}>
              {r.path}
            </option>
          ))}
        </select>
      </Field>
      <div className="row">
        <Field label="Platform">
          <Seg value={platform} options={["instagram", "tiktok"] as const} onChange={setPlatform} />
        </Field>
        <Field label="Account">
          <input className="input" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="@yourhandle" />
        </Field>
      </div>
      <Field label={`Caption (${caption.length}/2200)`}>
        <textarea className="textarea" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))} />
      </Field>
      {platform === "instagram" ? (
        <div className="row">
          <Field label="Trial reel">
            <Seg value={trial} options={["", "manual", "auto"] as const} labels={{ "": "No", manual: "Yes, I decide", auto: "Yes, automatic" }} onChange={setTrial} />
          </Field>
          <Field label="AI-generated label" hint="required">
            <Seg value={ai} options={["yes", "no"] as const} labels={{ yes: "Yes", no: "No" }} onChange={setAi} />
          </Field>
        </div>
      ) : null}
      <Field label="When" hint="blank: when you approve it">
        <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </Field>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!file || !account || !caption.trim() || (platform === "instagram" && ai === "")} onClick={() => onAdd({ file, platform, account, caption, trial: trial || undefined, aiLabel: ai === "" ? undefined : ai === "yes", at: at ? new Date(at).toISOString() : undefined })}>
          Queue as draft
        </button>
      </div>
    </Modal>
  );
};

const Versions: React.FC<{ onRun: (r: Run) => void }> = ({ onRun }) => {
  const { run, toast } = useStore();
  const [job, setJob] = useLocal("publish:job", "");
  const [plan, setPlan] = useState<Variants>(null);
  const [auto, setAuto] = useState(4);
  const [ver, setVer] = useState(0);
  const load = () => job && get<Variants>(`/api/jobs/${job}/variants`).then((v) => (setPlan(v), setVer(Date.now())));
  useEffect(() => {
    load();
  }, [job]);
  const go = async (task: string, args: Record<string, unknown>) => {
    const r = await run(task, { job, ...args });
    onRun(r);
    if (r.status !== "done") toast(r.log.slice(-1)[0] || "Didn't finish", "error");
    load();
  };
  return (
    <div className="split">
      <div className="col">
        <div className="panel col">
          <h3>Edit to try versions of</h3>
          <JobPicker value={job} onChange={setJob} filter={(j) => j.has.edl || j.has.variants} />
          <Field label={`Versions: ${auto}`}>
            <input type="range" min={2} max={8} value={auto} onChange={(e) => setAuto(Number(e.target.value))} />
          </Field>
          <button className="btn" disabled={!job} onClick={() => go("variants-plan", { auto })}>
            <Icon name="wand" /> Plan versions
          </button>
          <p className="note">Mechanical changes (captions, pace, framing, grade) are planned for you. New hooks and opening lines come from the speaker's own words: ask Claude to write those from the transcript.</p>
          <button className="btn primary" disabled={!job || !plan} onClick={() => go("variants-build", { render: true })}>
            <Icon name="play" /> Build and render them
          </button>
        </div>
      </div>
      <div className="panel">
        <h3>The plan {plan?.goal ? <span className="sub">{plan.goal}</span> : null}</h3>
        {plan ? (
          <>
            <div className="list">
              {plan.variants.map((v) => (
                <div key={v.id} className="item">
                  <b className="mono gold">{v.id}</b>
                  <span className="grow">{v.label}</span>
                </div>
              ))}
            </div>
            <img className="preview" style={{ marginTop: 14 }} src={`/out/${job}/variants/sheet.jpg?v=${ver}`} alt="Each version's first second" onError={(e) => (e.currentTarget.style.display = "none")} />
          </>
        ) : (
          <Empty title="No versions planned" icon="layers">Pick an edit (from the Edit studio) and plan versions to compare which opening keeps people watching.</Empty>
        )}
      </div>
    </div>
  );
};

const ReviewTools: React.FC<{ renders: FileEntry[] }> = ({ renders }) => {
  const { run, toast } = useStore();
  const [file, setFile] = useState("");
  const [label, setLabel] = useState("v1");
  const [last, setLast] = useState<Run | null>(null);
  const jobOf = (p: string) => p.split("/")[1] || "";
  const go = async (task: string, args: Record<string, unknown>) => {
    const r = await run(task, args);
    setLast(r);
    if (r.status !== "done") toast(r.log.slice(-1)[0] || "Didn't finish", "error");
  };
  return (
    <div className="split">
      <div className="panel col">
        <h3>A render</h3>
        <select className="select" value={file} onChange={(e) => setFile(e.target.value)}>
          <option value="">Choose…</option>
          {renders.map((r) => (
            <option key={r.path} value={r.path}>
              {r.path}
            </option>
          ))}
        </select>
        <Field label="Version label">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <button className="btn" disabled={!file || jobOf(file) === "app"} onClick={() => go("review-page", { job: jobOf(file), file, label })}>
          <Icon name="link" /> Make a client review page
        </button>
        <button className="btn" disabled={!file} onClick={() => go("phone", { file })}>
          <Icon name="download" /> Phone copy (720p)
        </button>
        <p className="note">A review page has the video and timestamped notes. Ask Claude to publish it as a private link to share.</p>
      </div>
      <div className="col">
        {file ? <video className="preview" src={mediaUrl(file)} controls playsInline /> : <Empty title="Choose a render" icon="video" />}
        {last ? <RunView run={last} /> : null}
      </div>
    </div>
  );
};
export default Publish;
