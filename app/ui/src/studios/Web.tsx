import { useEffect, useMemo, useState } from "react";
import { get, mediaUrl, put, type Run } from "../api";
import { Icon } from "../icons";
import { Preview } from "../Preview";
import { validate } from "../SchemaForm";
import { useStore } from "../store";
import { TEMPLATES } from "../templates";
import { Empty, Field, FileDrop, PageHead, RunView, Seg, useLocal } from "../ui";

type Comp = { id: string; kind: string; title?: string; value?: string; label?: string; body?: string; items?: string[]; placeholder?: boolean };
type Section = { n: number; kind: string; shot: string; headings: { level: number; text: string }[]; components: Comp[] };
type Inventory = {
  url: string;
  meta: { title: string };
  palette: Record<string, string> & { pixels: { hex: string; share: number }[] };
  fonts: { display?: { family: string; weight: string }; body?: { family: string } };
  sections: Section[];
  states: { action: string; shot: string }[];
  placeholders: { where: string; text: string; why: string }[];
};
type State = { kind: string; title: string | null; body: string | null; label: string | null; value: string | null; items: string[]; image: string | null; color: string | null; beats: number | null };
type Props = Record<string, unknown> & { bpm: number; beatsPerState: number; loop: boolean; states: State[]; theme: Record<string, string | null> };
type Check = { results: { name: string; ok: boolean; note: string }[] } | null;

const SM = TEMPLATES.find((t) => t.name === "SiteMorph")!;
const slugOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").split(".").slice(0, -1).join("-").replace(/[^a-z0-9-]/g, "").slice(0, 40) || "site";
  } catch {
    return "";
  }
};
const words = (s: State) => [s.value, s.title, s.label, s.body, s.items.join(" · ")].filter(Boolean).join(" — ") || (s.image ? "picture" : "—");

const Web: React.FC<{ q: URLSearchParams }> = ({ q }) => {
  const { run, toast } = useStore();
  const [url, setUrl] = useLocal("web:url", "");
  const [job, setJob] = useLocal("web:job", q.get("job") || "");
  const [inv, setInv] = useState<Inventory | null>(null);
  const [props, setProps] = useState<Props | null>(null);
  const [check, setCheck] = useState<Check>(null);
  const [states, setStates] = useState(8);
  const [bpm, setBpm] = useState(120);
  const [loop, setLoop] = useState(true);
  const [sfx, setSfx] = useState(false);
  const [music, setMusic] = useState("");
  const [fmt, setFmt] = useLocal("web:fmt", "1x1");
  const [preset, setPreset] = useState<"draft" | "review" | "hd" | "4k">("review");
  const [last, setLast] = useState<Run | null>(null);
  const [video, setVideo] = useState("");
  const [busy, setBusy] = useState("");
  const [ver, setVer] = useState(0);

  const load = async (id = job) => {
    if (!id) return;
    setInv(await get<Inventory | null>(`/api/jobs/${id}/inventory`).catch(() => null));
    const sm = await get<{ props: Props | null; check: Check }>(`/api/jobs/${id}/sitemorph`).catch(() => ({ props: null, check: null }));
    setProps(sm.props);
    setCheck(sm.check);
    setVer(Date.now());
  };
  useEffect(() => {
    load();
  }, [job]);

  const step = async (label: string, task: string, args: Record<string, unknown>) => {
    setBusy(label);
    const r = await run(task, args);
    setBusy("");
    setLast(r);
    if (r.status !== "done") toast(`${r.label}: ${r.log.filter((l) => /✖|error|Error|FAIL/.test(l)).slice(-1)[0] || r.log.slice(-1)[0] || "didn't finish"}`, "error");
    return r;
  };
  const capture = async () => {
    const id = job && job === slugOf(url) ? job : slugOf(url);
    if (!id) return toast("Enter the site's address, starting with https://", "error");
    setJob(id);
    const r = await step("capture", "site-capture", { url, job: id });
    if (r.status === "done") {
      await load(id);
      toast("Captured: check the words and pictures below", "ok");
    }
  };
  const plan = async () => {
    const r = await step("plan", "sitemorph-plan", { job, states, bpm, loop, sfx, music: music || undefined });
    if (r.status === "done") await load();
  };
  const save = async (p: Props) => {
    setProps(p);
    await put(`/api/jobs/${job}/sitemorph`, p);
  };
  const renderIt = async () => {
    if (props) await save(props);
    const r = await step("render", "sitemorph-render", { job, format: fmt, preset });
    if (r.status === "done") {
      setVideo(r.outputs[0] || "");
      if (preset !== "draft") {
        const c = await step("check", "sitemorph-check", { job, file: r.outputs[0] });
        await load();
        toast(c.status === "done" ? "Rendered and checked: every beat and the loop pass" : "Rendered; the check found something: see below", c.status === "done" ? "ok" : "error");
      }
    }
  };
  const good = useMemo(() => {
    if (!props) return null;
    const r = validate(SM.schema, props);
    return r.ok ? r.data : null;
  }, [props]);
  const move = (i: number, d: number) => {
    if (!props) return;
    const s = [...props.states];
    const [x] = s.splice(i, 1);
    s.splice(i + d, 0, x);
    save({ ...props, states: s });
  };

  return (
    <div className="page">
      <PageHead eyebrow="Studio 06" icon="web" title="Web" sub="Paste a website. 7 Studios reads it like a motion designer (every section, its exact words, colours and fonts), then tells it as one shape that morphs through its real parts, on the beat." />
      <div className="prompt" style={{ marginBottom: 20 }}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <Icon name="link" />
          <input className="input" style={{ border: 0, background: "transparent", fontSize: 16, boxShadow: "none" }} value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://your-site.com" onKeyDown={(e) => e.key === "Enter" && capture()} />
          <button className="btn primary big" onClick={capture} disabled={!!busy || !url}>
            {busy === "capture" ? <span className="spin" /> : <Icon name="web" />} Capture
          </button>
        </div>
        <p className="note" style={{ margin: 0 }}>
          Only for sites you own or have permission to use. Words are copied exactly; placeholder copy (lorem ipsum, $0…) is flagged and left out.
        </p>
      </div>

      {inv ? (
        <div className="col" style={{ gap: 20 }}>
          <div className="panel">
            <h3>
              {inv.meta.title || inv.url} <span className="sub">{job}</span>
            </h3>
            <div className="strip">
              {inv.sections.map((s) => (
                <a key={s.n} href={mediaUrl(s.shot)} target="_blank" rel="noreferrer" title={`${s.n} · ${s.kind}`}>
                  <img src={`${mediaUrl(s.shot)}?v=${ver}`} alt={`Section ${s.n}: ${s.kind}`} />
                </a>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14, alignItems: "flex-start", gap: 28 }}>
              <div>
                <div className="nav-label" style={{ padding: "0 0 8px" }}>Palette</div>
                <div className="swatches">
                  {["background", "surface", "text", "muted", "accent", "onAccent"].map((k) => (
                    <div key={k} className="swatch">
                      <i style={{ background: inv.palette[k] }} />
                      {k}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="nav-label" style={{ padding: "0 0 8px" }}>Type</div>
                <div className="small">
                  {inv.fonts.display?.family || "?"} {inv.fonts.display?.weight} / {inv.fonts.body?.family || "?"}
                </div>
              </div>
              <div className="grow">
                <div className="nav-label" style={{ padding: "0 0 8px" }}>Found</div>
                <div className="chips">
                  {Object.entries(
                    inv.sections.flatMap((s) => s.components).reduce<Record<string, number>>((a, c) => ((a[c.kind] = (a[c.kind] || 0) + 1), a), {}),
                  ).map(([k, n]) => (
                    <span key={k} className="chip">
                      {k} ×{n}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {inv.placeholders.length ? (
              <div className="callout gold" style={{ marginTop: 14 }}>
                <Icon name="info" />
                <span>
                  {inv.placeholders.length} placeholder{inv.placeholders.length > 1 ? "s" : ""} left out: {inv.placeholders.slice(0, 3).map((p) => `"${p.text}"`).join(", ")}
                  {inv.placeholders.length > 3 ? "…" : ""}
                </span>
              </div>
            ) : null}
          </div>

          <div className="split wide">
            <div className="col">
              <div className="panel col">
                <h3>Plan the morph</h3>
                <Field label={`States: ${states}`}>
                  <input type="range" min={3} max={14} value={states} onChange={(e) => setStates(Number(e.target.value))} />
                </Field>
                <div className="row">
                  <Field label="Tempo (BPM)">
                    <input className="input" type="number" min={60} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
                  </Field>
                  <label className="inline small">
                    <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Seamless loop
                  </label>
                  <label className="inline small">
                    <input type="checkbox" checked={sfx} onChange={(e) => setSfx(e.target.checked)} /> Clicks
                  </label>
                </div>
                {music ? (
                  <div className="row small">
                    <Icon name="music" /> {music.split("/").pop()} <button className="btn ghost sm" onClick={() => setMusic("")}>Remove</button>
                  </div>
                ) : (
                  <FileDrop accept="audio/*" label="Music (optional): the tempo and first downbeat come from it" onDone={(p) => setMusic(p[0])} />
                )}
                <button className="btn primary" onClick={plan} disabled={!!busy}>
                  {busy === "plan" ? <span className="spin" /> : <Icon name="wand" />} {props ? "Plan again" : "Plan it"}
                </button>
              </div>
              {props ? (
                <div className="panel">
                  <h3>
                    States <span className="sub">words stay exactly as on the site</span>
                  </h3>
                  <div className="list">
                    {props.states.map((s, i) => (
                      <div key={i} className="state-row">
                        <b className="mono gold">{i + 1}</b>
                        <span className="badge">{s.kind}</span>
                        <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={words(s)}>
                          {words(s)}
                        </span>
                        <input className="input" type="number" min={1} max={16} title="Beats to hold" value={s.beats ?? props.beatsPerState} onChange={(e) => save({ ...props, states: props.states.map((x, j) => (j === i ? { ...x, beats: Number(e.target.value) || null } : x)) })} />
                        <span className="row" style={{ flexWrap: "nowrap", gap: 2 }}>
                          <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Earlier">↑</button>
                          <button className="btn ghost sm" disabled={i === props.states.length - 1} onClick={() => move(i, 1)} aria-label="Later">↓</button>
                          <button className="btn ghost sm danger" onClick={() => save({ ...props, states: props.states.filter((_, j) => j !== i) })} aria-label="Remove">
                            <Icon name="trash" size={13} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    {(["background", "surface", "text", "accent"] as const).map((k) => (
                      <label key={k} className="field" style={{ width: 90 }}>
                        <span>{k}</span>
                        <input type="color" value={String(props.theme[k] || "#000000").slice(0, 7)} onChange={(e) => save({ ...props, theme: { ...props.theme, [k]: e.target.value } })} />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="col sticky">
              {good ? (
                <>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <Seg value={fmt} options={SM.formats} onChange={setFmt} />
                    <Seg value={preset} options={["draft", "review", "hd", "4k"] as const} onChange={setPreset} />
                  </div>
                  <div className="player-frame">
                    <Preview tpl={SM} fmt={fmt} props={good} />
                  </div>
                  <button className="btn primary big" onClick={renderIt} disabled={!!busy}>
                    {busy === "render" || busy === "check" ? <span className="spin" /> : <Icon name="play" />} Render {fmt} {preset}
                    {preset !== "draft" ? " and check" : ""}
                  </button>
                  {video ? <video className="preview" src={mediaUrl(video)} controls loop playsInline /> : null}
                  {check ? (
                    <div className="panel col">
                      <h3>Check</h3>
                      {check.results.map((r) => (
                        <div key={r.name} className="row small">
                          <span className={`badge ${r.ok ? "ok" : "bad"}`}>{r.ok ? "pass" : "fail"}</span>
                          <b>{r.name}</b> <span className="muted">{r.note}</span>
                        </div>
                      ))}
                      <img className="preview" src={`/out/${job}/sitemorph-beats.jpg?v=${ver}`} alt="Beat sheet: each state mid-morph, on its beat, and settled" />
                    </div>
                  ) : null}
                </>
              ) : (
                <Empty title="Plan it to see it move" icon="motion">
                  The plan picks the site's strongest parts in story order: the hero button, the headline, numbers, features, proof, the final call.
                </Empty>
              )}
              {last ? <RunView run={last} compact /> : null}
            </div>
          </div>
        </div>
      ) : (
        <Empty title={busy ? "Reading the site…" : "Start with a website"} icon="web">
          {busy ? "Scrolling every section so lazy parts load, then trying tabs, switches and questions." : "7 Studios opens it at desktop width on this computer and takes it apart."}
        </Empty>
      )}
      {!inv && last ? <div style={{ marginTop: 16 }}><RunView run={last} /></div> : null}
    </div>
  );
};
export default Web;
