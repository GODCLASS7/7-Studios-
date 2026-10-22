import { useEffect, useState } from "react";
import { type Run } from "../api";
import { Icon } from "../icons";
import { Preview } from "../Preview";
import { SchemaForm, validate } from "../SchemaForm";
import { useStore } from "../store";
import { TEMPLATES } from "../templates";
import { Field, PageHead, RunView, Seg, useLocal } from "../ui";

const PRESETS = ["draft", "review", "hd", "4k", "master", "webm-alpha"] as const;
const PRESET_NOTE: Record<string, string> = {
  draft: "Half size, every other frame: a quick look",
  review: "1080p H.264: for approval",
  hd: "1080p final, PNG frames",
  "4k": "2160p final",
  master: "4K ProRes 422 HQ for editors",
  "webm-alpha": "Transparent WebM for websites (titles on transparent)",
};

const Motion: React.FC<{ q: URLSearchParams }> = ({ q }) => {
  const { run, toast } = useStore();
  const [name, setName] = useLocal("motion:tpl", q.get("t") || "ArtStyles");
  const tpl = TEMPLATES.find((t) => t.name === name) || TEMPLATES[0];
  const [fmt, setFmt] = useState(tpl.formats[0]);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => structuredClone(tpl.defaults));
  const [good, setGood] = useState<Record<string, unknown>>(tpl.defaults);
  const [issues, setIssues] = useState<string[]>([]);
  const [json, setJson] = useState(false);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("review");
  const [last, setLast] = useState<Run | null>(null);

  useEffect(() => {
    setFmt(tpl.formats[0]);
    const d = structuredClone(tpl.defaults);
    setDraft(d);
    setGood(d);
    setIssues([]);
  }, [tpl]);
  // Check every edit against the template's schema; the preview only takes good props.
  useEffect(() => {
    const t = setTimeout(() => {
      const r = validate(tpl.schema, draft);
      if (r.ok) {
        setGood(r.data);
        setIssues([]);
      } else setIssues(r.issues);
    }, 250);
    return () => clearTimeout(t);
  }, [draft, tpl]);

  const render = async () => {
    if (issues.length) return toast("Fix the highlighted props first.", "error");
    const r = await run("render", { comp: `${tpl.name}-${fmt}`, preset, props: good });
    setLast(r);
    toast(r.status === "done" ? "Rendered" : "The render didn't finish: see Activity", r.status === "done" ? "ok" : "error");
  };

  return (
    <div className="page">
      <PageHead eyebrow="Studio 04" icon="motion" title="Motion" sub="Every template plays live as you type. Render it exactly, frame for frame, at any size up to 4K or ProRes." />
      <div className="chips" style={{ marginBottom: 18 }}>
        {TEMPLATES.map((t) => (
          <button key={t.name} className={`chip ${t.name === tpl.name ? "on" : ""}`} onClick={() => setName(t.name)}>
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>
      <div className="split wide">
        <div className="col">
          <div className="panel">
            <h3>
              {tpl.label}
              <span className="sub">
                <button className="btn ghost sm" onClick={() => setJson(!json)}>
                  {json ? "Form" : "JSON"}
                </button>
                <button className="btn ghost sm" onClick={() => setDraft(structuredClone(tpl.defaults))}>
                  Reset
                </button>
              </span>
            </h3>
            <p className="note" style={{ marginTop: -4, marginBottom: 12 }}>
              {tpl.description}
            </p>
            {json ? (
              <JsonEditor key={tpl.name} initial={JSON.stringify(draft, null, 2)} onChange={setDraft} />
            ) : (
              <div style={{ maxHeight: "58vh", overflow: "auto", paddingRight: 4 }}>
                <SchemaForm schema={tpl.schema} value={draft} onChange={setDraft} />
              </div>
            )}
            {issues.length ? <div className="errors" style={{ marginTop: 10 }}>{issues.join("\n")}</div> : null}
          </div>
        </div>
        <div className="col sticky">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Seg value={fmt} options={tpl.formats} onChange={setFmt} />
            {issues.length ? <span className="badge bad">preview paused: fix the props</span> : <span className="badge ok">live</span>}
          </div>
          <div className="player-frame">
            <Preview tpl={tpl} fmt={fmt} props={good} />
          </div>
          <div className="panel col">
            <Field label="Render as">
              <select className="select" value={preset} onChange={(e) => setPreset(e.target.value as (typeof PRESETS)[number])}>
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}: {PRESET_NOTE[p]}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn primary big" onClick={render}>
              <Icon name="play" /> Render {tpl.label} {fmt}
            </button>
          </div>
          {last ? <RunView run={last} /> : null}
        </div>
      </div>
    </div>
  );
};

// Takes the props once when opened; edits flow out as they parse.
const JsonEditor: React.FC<{ initial: string; onChange: (v: Record<string, unknown>) => void }> = ({ initial, onChange }) => {
  const [v, setV] = useState(initial);
  const [bad, setBad] = useState("");
  return (
    <>
      <textarea
        className="textarea mono"
        style={{ minHeight: "52vh" }}
        value={v}
        spellCheck={false}
        onChange={(e) => {
          setV(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad("");
          } catch (err) {
            setBad((err as Error).message);
          }
        }}
      />
      {bad ? <div className="errors">{bad}</div> : null}
    </>
  );
};
export default Motion;
