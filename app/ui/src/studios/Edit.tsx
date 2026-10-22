import { useEffect, useMemo, useState } from "react";
import { get, isVideo, mediaUrl, type FileEntry, type Run } from "../api";
import { Icon } from "../icons";
import { go } from "../nav";
import { useStore } from "../store";
import { Empty, Field, FileDrop, JobPicker, Modal, PageHead, RunView, Seg, useLocal } from "../ui";

type Phrase = { id: string; source: string; start: number; end: number; text: string; fillers: number; speaker?: string };
type Takes = { job: string; sources: { key: string; file: string; duration: number }[]; phrases: Phrase[] };
const t = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

const Edit: React.FC<{ q: URLSearchParams }> = ({ q }) => {
  const { run, status, toast } = useStore();
  const [job, setJob] = useLocal("edit:job", q.get("job") || "");
  const [media, setMedia] = useState<FileEntry[]>([]);
  const [renders, setRenders] = useState<FileEntry[]>([]);
  const [takes, setTakes] = useState<Takes | null>(null);
  const [keep, setKeep] = useState<string[]>([]);
  const [hook, setHook] = useState("");
  const [engine, setEngine] = useState<"whisper" | "elevenlabs">("whisper");
  const [format, setFormat] = useLocal("edit:format", "9x16");
  const [last, setLast] = useState<Run | null>(null);
  const [video, setVideo] = useState("");
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!job) return;
    get<{ media: FileEntry[]; renders: FileEntry[] }>(`/api/jobs/${job}`).then((j) => {
      setMedia(j.media.filter((f) => f.path.includes("/footage/") && isVideo(f.path)));
      setRenders(j.renders);
    });
    get<Takes | null>(`/api/jobs/${job}/takes`).then((tk) => {
      setTakes(tk);
      setKeep([]);
      setHook("");
    });
  };
  useEffect(load, [job]);
  useEffect(() => {
    if (q.get("job")) setJob(q.get("job")!);
  }, []);

  const step = async (task: string, args: Record<string, unknown>) => {
    const r = await run(task, args);
    setLast(r);
    if (r.status !== "done") toast(`${r.label}: ${r.log.slice(-1)[0] || "didn't finish"}`, "error");
    return r.status === "done" ? r : null;
  };
  const transcribe = async (confirmPaid = false) => {
    if (engine === "elevenlabs" && !confirmPaid) return setPaid(true);
    setBusy(true);
    const r = await step("transcribe", { job, media: media.map((m) => m.path), engine, confirmPaid });
    if (r) await step("pack", { job });
    setBusy(false);
    load();
  };
  const cut = async () => {
    // The opening line first, then the rest in the order they were said.
    const idx = (id: string) => phrases.findIndex((p) => p.id === id);
    const order = [...(hook ? [hook] : []), ...keep.filter((k) => k !== hook).sort((a, b) => idx(a) - idx(b))];
    if (!order.length) return toast("Tick the phrases to keep.", "error");
    setBusy(true);
    const ok = (await step("autocut", { job, keep: order.join(","), format })) && (await step("edl", { job })) && (await step("render-edit", { job, format, preset: "review" }));
    setBusy(false);
    if (ok) {
      setVideo(ok.outputs[0] || "");
      load();
      toast("The review cut is ready", "ok");
    }
  };
  const phrases = useMemo(() => (takes?.phrases || []).filter((p) => p.text.trim()), [takes]);
  const dur = phrases.filter((p) => keep.includes(p.id)).reduce((s, p) => s + (p.end - p.start), 0);
  const editRenders = renders.filter((r) => /edit-.*\.mp4$/.test(r.path));
  const sheet = renders.find((r) => /cutcheck-v\d+\.png$/.test(r.path));
  const current = video || editRenders[0]?.path || "";

  return (
    <div className="page">
      <PageHead eyebrow="Studio 03" icon="scissors" title="Edit" sub="Cut real footage by reading it: the transcript shows every phrase, you tick the ones to keep, and 7 Studios makes the cut with no pops, captions timed to each word, and a check of every cut." />
      <div className="split wide">
        <div className="col">
          <div className="panel col">
            <h3>1 · The job and its footage</h3>
            <JobPicker value={job} onChange={setJob} />
            {job ? (
              <>
                {media.length ? (
                  <div className="list">
                    {media.map((m) => (
                      <div key={m.path} className="item">
                        <Icon name="video" />
                        <span className="grow small">{m.path.split("/").pop()}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <FileDrop accept="video/*,audio/*" multiple job={job} into="footage" label="Add footage (talking head, interview, sermon…)" onDone={load} />
              </>
            ) : null}
          </div>

          <div className="panel col">
            <h3>2 · Transcribe {takes ? <span className="badge ok">done</span> : null}</h3>
            <Seg value={engine} options={["whisper", "elevenlabs"] as const} labels={{ whisper: "Whisper (free, on this computer)", elevenlabs: "ElevenLabs (paid, best)" }} onChange={setEngine} />
            {engine === "elevenlabs" && !status?.keys.ELEVENLABS_API_KEY ? <p className="note">Add your ElevenLabs key in Settings first.</p> : null}
            <button className="btn primary" disabled={!job || !media.length || busy || (engine === "elevenlabs" && !status?.keys.ELEVENLABS_API_KEY)} onClick={() => transcribe()}>
              {busy ? <span className="spin" /> : <Icon name="wand" />} {takes ? "Transcribe again" : "Transcribe"}
            </button>
            <p className="note">Whisper downloads its model the first time. The words, times and speakers land in the job, ready to cut.</p>
          </div>

          <div className="panel col">
            <h3>3 · Cut</h3>
            <Field label="Format">
              <Seg value={format} options={["9x16", "16x9", "1x1", "4x5"]} onChange={setFormat} />
            </Field>
            <div className="row small muted">
              <span>
                {keep.length} phrases · about {dur.toFixed(1)} s
              </span>
              {hook ? <span className="badge gold">opens with {hook}</span> : null}
            </div>
            <button className="btn primary big" disabled={!keep.length || busy} onClick={cut}>
              {busy ? <span className="spin" /> : <Icon name="scissors" />} Make the review cut
            </button>
            <p className="note">Fillers come out, pauses close, and every cut gets a 30 ms fade so nothing pops. A speaker's meaning is never changed: keep whole thoughts.</p>
          </div>
          {last ? <RunView run={last} compact /> : null}
        </div>

        <div className="col">
          {current ? (
            <div className="panel col">
              <h3>
                Review cut <span className="sub">{current.split("/").pop()}</span>
              </h3>
              <video className="preview" src={mediaUrl(current)} controls playsInline />
              <div className="row">
                <button className="btn" disabled={busy} onClick={async () => (setBusy(true), await step("cutcheck", { job, file: current }), setBusy(false), load())}>
                  <Icon name="check" /> Check every cut
                </button>
                <button className="btn" onClick={() => go("carousel", { job })}>
                  <Icon name="carousel" /> Carousel from it
                </button>
                <button className="btn" onClick={() => go("publish", { job })}>
                  <Icon name="publish" /> Versions & posting
                </button>
                <a className="btn ghost" href={mediaUrl(current)} download>
                  <Icon name="download" /> Download
                </a>
              </div>
              {sheet ? <img src={mediaUrl(sheet.path)} alt="Cut sheet: the frames either side of each cut" className="preview" /> : null}
            </div>
          ) : null}
          <div className="panel">
            <h3>
              The takes <span className="sub">tick to keep · ★ to open with it</span>
            </h3>
            {phrases.length ? (
              <div className="list" style={{ gap: 2 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <button className="btn sm" onClick={() => setKeep(phrases.map((p) => p.id))}>
                    Keep all
                  </button>
                  <button className="btn sm ghost" onClick={() => (setKeep([]), setHook(""))}>
                    Clear
                  </button>
                </div>
                {phrases.map((p) => {
                  const on = keep.includes(p.id);
                  return (
                    <div key={p.id} className={`phrase ${on ? "on" : ""} ${hook === p.id ? "hook" : ""}`} onClick={() => setKeep(on ? keep.filter((k) => k !== p.id) : [...keep, p.id])}>
                      <input type="checkbox" checked={on} readOnly tabIndex={-1} />
                      <span className="id">{p.id}</span>
                      <span className="tm">
                        {t(p.start)}–{t(p.end)}
                      </span>
                      <span className="tx">
                        {p.text}
                        {p.fillers ? <span className="badge" style={{ marginLeft: 6 }}>{p.fillers} filler{p.fillers > 1 ? "s" : ""}</span> : null}
                      </span>
                      <button
                        className="btn ghost sm"
                        title="Open with this line"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHook(hook === p.id ? "" : p.id);
                          if (!on) setKeep([...keep, p.id]);
                        }}
                      >
                        {hook === p.id ? "★" : "☆"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty title={job ? "No transcript yet" : "Choose or start a job"} icon="scissors">
                {job ? "Add footage and transcribe it: every phrase shows here with its time." : "Each edit lives in a job with its footage, transcript and renders."}
              </Empty>
            )}
          </div>
        </div>
      </div>
      {paid ? (
        <Modal title="Transcribe with ElevenLabs?" onClose={() => setPaid(false)}>
          <p className="muted">ElevenLabs charges per minute of audio on your account. Whisper is free and runs on this computer, a little less accurate.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setPaid(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => (setPaid(false), transcribe(true))}>
              Transcribe and pay
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};
export default Edit;
