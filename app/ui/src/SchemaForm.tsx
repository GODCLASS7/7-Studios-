import { useState } from "react";
import { Icon } from "./icons";
import { MediaPicker } from "./ui";

// A form for any template, read from its zod schema: text, numbers, switches, choices,
// colours, media, lists and groups. Anything it can't draw is edited as JSON.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Z = any;
const WRAPS = ["default", "optional", "nullable", "prefault", "readonly", "catch", "nonoptional"];
const unwrap = (s: Z) => {
  let t = s;
  let nullable = false;
  let def: unknown = undefined;
  for (let i = 0; i < 12 && t?.def && (WRAPS.includes(t.def.type) || t.def.type === "pipe"); i++) {
    if (t.def.type === "nullable") nullable = true;
    if (t.def.type === "default" && def === undefined) def = t.def.defaultValue;
    t = t.def.type === "pipe" ? t.def.in : t.def.innerType;
  }
  return { t, nullable, def };
};
export const makeDefault = (s: Z): unknown => {
  const { t, nullable, def } = unwrap(s);
  if (def !== undefined) return structuredClone(typeof def === "function" ? (def as () => unknown)() : def);
  if (nullable) return null;
  switch (t?.def?.type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "enum":
      return t.options[0];
    case "literal":
      return t.def.values?.[0];
    case "array":
      return [];
    case "object":
      return Object.fromEntries(Object.entries(t.shape).map(([k, v]) => [k, makeDefault(v)]));
    default:
      return null;
  }
};
const MEDIA_KEY = /^(image|src|file|logo|photo|video|poster|music|audio|background|cover|thumb)$/i;
const LONG_KEY = /^(body|text|caption|quote|description|sub|subtitle|lines|lyrics|note)$/i;
const isHex = (v: unknown) => typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v);
const human = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
const preview = (v: unknown): string => {
  if (v && typeof v === "object") {
    const s = Object.values(v as Record<string, unknown>).find((x) => typeof x === "string" && x.length > 0);
    return typeof s === "string" ? s.slice(0, 40) : "";
  }
  return "";
};

const Node: React.FC<{ name: string; schema: Z; value: unknown; onChange: (v: unknown) => void; depth: number; job?: string; hide?: string[] }> = ({ name, schema, value, onChange, depth, job, hide }) => {
  const { t, nullable } = unwrap(schema);
  const type = t?.def?.type;
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(depth <= 1);
  const label = human(name);

  if (nullable && value === null && (type === "object" || type === "array")) {
    return (
      <div className="row">
        <span className="small muted">{label}: none</span>
        <button className="btn sm" type="button" onClick={() => onChange(makeDefault(t))}>
          <Icon name="plus" size={13} /> Add
        </button>
      </div>
    );
  }
  switch (type) {
    case "string": {
      const v = (value as string | null) ?? "";
      const media = MEDIA_KEY.test(name);
      return (
        <label className="field">
          <span>{label}</span>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            {isHex(v) || /colou?r|accent|background|surface|text$|muted|punch|glow|onAccent/i.test(name) && (isHex(v) || v === "") ? <input type="color" value={isHex(v) && v.length === 7 ? v : "#000000"} onChange={(e) => onChange(e.target.value)} /> : null}
            {LONG_KEY.test(name) && !media ? (
              <textarea className="textarea" style={{ minHeight: 60 }} value={v} onChange={(e) => onChange(e.target.value === "" && nullable ? null : e.target.value)} />
            ) : (
              <input className="input" value={v} placeholder={nullable ? "none" : ""} onChange={(e) => onChange(e.target.value === "" && nullable ? null : e.target.value)} />
            )}
            {media ? (
              <button type="button" className="btn sm" onClick={() => setPicking(true)}>
                Choose
              </button>
            ) : null}
          </div>
          {picking ? <MediaPicker kind="any" job={job} onClose={() => setPicking(false)} onPick={(p, item) => (onChange(item ? item.file : p), setPicking(false))} /> : null}
        </label>
      );
    }
    case "number":
      return (
        <label className="field">
          <span>{label}</span>
          <input className="input" type="number" step="any" value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : 0) : Number(e.target.value))} />
        </label>
      );
    case "boolean":
      return (
        <label className="inline">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {label}
        </label>
      );
    case "enum":
      return (
        <label className="field">
          <span>{label}</span>
          <select className="select" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
            {nullable ? <option value="">none</option> : null}
            {(t.options as string[]).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    case "array": {
      const el = unwrap(t.def.element).t;
      const arr = Array.isArray(value) ? value : [];
      if (el?.def?.type === "string")
        return (
          <label className="field">
            <span>
              {label} <em className="dim" style={{ fontStyle: "normal", fontWeight: 400 }}>one per line</em>
            </span>
            <textarea className="textarea" value={arr.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} onBlur={(e) => onChange(e.target.value.split("\n").filter((x) => x.trim() !== ""))} />
          </label>
        );
      if (el?.def?.type === "number")
        return (
          <label className="field">
            <span>{label}</span>
            <input className="input" value={arr.join(", ")} onChange={(e) => onChange(e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)))} />
          </label>
        );
      const move = (i: number, d: number) => {
        const c = [...arr];
        const [x] = c.splice(i, 1);
        c.splice(i + d, 0, x);
        onChange(c);
      };
      return (
        <div className="group">
          <div className="gh">
            <button type="button" className="btn ghost sm" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "▾" : "▸"} {label}
            </button>
            <span className="dim small">{arr.length}</span>
            <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => onChange([...arr, arr.length ? structuredClone(arr[arr.length - 1]) : makeDefault(el)])}>
              <Icon name="plus" size={13} /> Add
            </button>
          </div>
          {open
            ? arr.map((item, i) => (
                <div key={i} className="arr-item">
                  <div className="arr-head">
                    <b className="mono">{i + 1}</b>
                    <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {preview(item)}
                    </span>
                    <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button type="button" className="btn ghost sm" disabled={i === arr.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button type="button" className="btn ghost sm danger" onClick={() => onChange(arr.filter((_, j) => j !== i))} aria-label="Remove">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                  <Node name={`${name}-item`} schema={t.def.element} value={item} depth={depth + 1} job={job} onChange={(v) => onChange(arr.map((x, j) => (j === i ? v : x)))} />
                </div>
              ))
            : null}
        </div>
      );
    }
    case "object": {
      const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
      const body = Object.entries(t.shape as Record<string, Z>).filter(([k]) => !(depth === 0 && hide?.includes(k))).map(([k, s]) => (
        <Node key={k} name={k} schema={s} value={obj[k]} depth={depth + 1} job={job} onChange={(v) => onChange({ ...obj, [k]: v })} />
      ));
      if (depth === 0 || name.endsWith("-item")) return <div className="form">{body}</div>;
      return (
        <div className="group">
          <div className="gh">
            <button type="button" className="btn ghost sm" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "▾" : "▸"} {label}
            </button>
            {nullable ? (
              <button type="button" className="btn ghost sm danger" style={{ marginLeft: "auto" }} onClick={() => onChange(null)}>
                Remove
              </button>
            ) : null}
          </div>
          {open ? body : null}
        </div>
      );
    }
    default:
      return <JsonField label={label} value={value} onChange={onChange} />;
  }
};

const JsonField: React.FC<{ label: string; value: unknown; onChange: (v: unknown) => void }> = ({ label, value, onChange }) => {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <label className="field">
      <span>{label} (JSON)</span>
      <textarea
        className="textarea mono"
        value={text}
        style={bad ? { borderColor: "var(--bad)" } : undefined}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
    </label>
  );
};

export const SchemaForm: React.FC<{ schema: Z; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; job?: string; hide?: string[] }> = ({ schema, value, onChange, job, hide }) => (
  <Node name="props" schema={schema} value={value} depth={0} job={job} hide={hide} onChange={(v) => onChange(v as Record<string, unknown>)} />
);

// Check props against the template's schema; returns the filled-in props or the problems.
export const validate = (schema: Z, value: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; issues: string[] } => {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, issues: r.error.issues.slice(0, 8).map((i: { path: (string | number)[]; message: string }) => `${i.path.join(".") || "props"}: ${i.message}`) };
};
