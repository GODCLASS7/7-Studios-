import { useEffect, useState } from "react";
import { get, post, type Run } from "../api";
import { Icon } from "../icons";
import { useStore } from "../store";
import { Field, FileDrop, PageHead, RunView, Seg } from "../ui";

type EngineCfg = {
  default: string;
  open: { url: string; workflows: Record<string, { draft: string; final: string }>; gpuHourly: number };
  premium: Record<string, string | null>;
};
type Model = { id: string; name?: string; kind: string; price: number | null; verified: boolean };
type Request = { id: string; kind: string; prompt: string; status: string; createdAt: string };

const ENGINES: Record<string, { title: string; body: string }> = {
  demo: { title: "Demo", body: "Placeholders made on this computer. Free; not AI. For trying the studio." },
  open: { title: "Open models", body: "ComfyUI with FLUX, Qwen-Image and Wan 2.2: on this Mac (slow, drafts) or a rented GPU through an SSH tunnel." },
  premium: { title: "Premium", body: "Hosted models through fal.ai with your own key. Paid per run; you confirm each one." },
  claude: { title: "Claude + Higgsfield", body: "Leaves requests for Claude to run in chat (Seedance, Kling, Veo…), quoted in credits before anything is spent." },
};
const KEYS = [
  { name: "FAL_KEY", label: "fal.ai key", for: "the Premium engine" },
  { name: "ELEVENLABS_API_KEY", label: "ElevenLabs key", for: "paid transcription with speaker labels" },
];

const Settings: React.FC = () => {
  const { status, refreshStatus, run, toast } = useStore();
  const [cfg, setCfg] = useState<EngineCfg | null>(null);
  const [workflows, setWorkflows] = useState<string[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [keyVals, setKeyVals] = useState<Record<string, string>>({});
  const [last, setLast] = useState<Run | null>(null);
  const [lora, setLora] = useState({ name: "", trigger: "", seconds: 3, files: [] as string[] });

  const load = () => {
    get<{ config: EngineCfg; workflows: string[] }>("/api/engine").then((e) => (setCfg(e.config), setWorkflows(e.workflows)));
    get<Model[]>("/api/models").then(setModels).catch(() => {});
    get<Request[]>("/api/requests").then(setRequests).catch(() => {});
  };
  useEffect(load, []);
  const saveCfg = async (patch: { default?: string; open?: Partial<EngineCfg["open"]>; premium?: EngineCfg["premium"] }) => {
    try {
      const r = await post<{ config: EngineCfg }>("/api/engine", patch);
      setCfg(r.config);
      refreshStatus();
      toast("Saved", "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const setKey = async (name: string, value: string) => {
    try {
      await post("/api/keys", { name, value });
      setKeyVals({ ...keyVals, [name]: "" });
      refreshStatus();
      toast(value ? "Key saved to .env on this computer" : "Key removed", "ok");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const task = async (t: string, args: Record<string, unknown> = {}) => setLast(await run(t, args));

  return (
    <div className="page">
      <PageHead eyebrow="Yours" icon="settings" title="Settings" sub="Engines, keys and this computer. Keys are saved in the studio's .env file here and never shown again." />
      {cfg ? (
        <div className="col" style={{ gap: 20 }}>
          <div className="panel">
            <h3>Default engine</h3>
            <div className="studios" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
              {Object.entries(ENGINES).map(([id, e]) => (
                <button key={id} className={`preset text-only spot ${cfg.default === id ? "on" : ""}`} style={{ padding: 16 }} onClick={() => saveCfg({ default: id })}>
                  <b>
                    {e.title} {cfg.default === id ? <span className="badge gold">default</span> : null}
                  </b>
                  <span>{e.body}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="split">
            <div className="panel col">
              <h3>Open models (ComfyUI)</h3>
              <Field label="ComfyUI address" hint="this Mac, or an SSH tunnel to a GPU">
                <input className="input" defaultValue={cfg.open.url} onBlur={(e) => e.target.value !== cfg.open.url && saveCfg({ open: { url: e.target.value } })} />
              </Field>
              <Field label="GPU price per hour (USD)" hint="0 on your own Mac">
                <input className="input" type="number" min={0} step={0.01} defaultValue={cfg.open.gpuHourly} onBlur={(e) => Number(e.target.value) !== cfg.open.gpuHourly && saveCfg({ open: { gpuHourly: Number(e.target.value) } })} />
              </Field>
              <div className="row small muted">
                <span style={{ width: 52 }} />
                <span className="grow">Draft workflow</span>
                <span className="grow">Final workflow</span>
              </div>
              {(["image", "edit", "video"] as const).map((k) => (
                <div key={k} className="row" style={{ flexWrap: "nowrap" }}>
                  <b className="small" style={{ width: 52, flex: "none", textTransform: "capitalize" }}>{k}</b>
                  {(["draft", "final"] as const).map((q) => (
                    <select
                      key={q}
                      className="select grow"
                      value={cfg.open.workflows[k]?.[q] || ""}
                      onChange={(e) => saveCfg({ open: { workflows: { ...cfg.open.workflows, [k]: { ...cfg.open.workflows[k], [q]: e.target.value } } } })}
                      aria-label={`${k} ${q} workflow`}
                    >
                      {workflows.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              ))}
              <button className="btn" onClick={() => task("engine-check")}>
                <Icon name="check" /> Check ComfyUI and the model files
              </button>
              <div className="callout">
                <Icon name="shield" /> ComfyUI has no password. On a rented GPU, connect with an SSH tunnel; never open it to the internet. Switch the GPU off when you're done.
              </div>
            </div>

            <div className="col">
              <div className="panel col">
                <h3>Keys</h3>
                {KEYS.map((k) => (
                  <div key={k.name} className="col" style={{ gap: 6 }}>
                    <div className="row">
                      <b className="small">{k.label}</b>
                      <span className={`badge ${status?.keys[k.name] ? "ok" : ""}`}>{status?.keys[k.name] ? "set" : "not set"}</span>
                      <span className="dim small">for {k.for}</span>
                    </div>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <input className="input" type="password" autoComplete="off" placeholder={status?.keys[k.name] ? "Replace with a new key" : "Paste the key"} value={keyVals[k.name] || ""} onChange={(e) => setKeyVals({ ...keyVals, [k.name]: e.target.value })} />
                      <button className="btn" disabled={!keyVals[k.name]} onClick={() => setKey(k.name, keyVals[k.name])}>
                        Save
                      </button>
                      {status?.keys[k.name] ? (
                        <button className="btn ghost danger" onClick={() => setKey(k.name, "")}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                <p className="note">Saved to .env in the studio folder on this computer (never committed, never sent to Claude).</p>
              </div>
              <div className="panel col">
                <h3>Premium models</h3>
                {(["image", "edit", "video"] as const).map((k) => (
                  <div key={k} className="row">
                    <b className="small" style={{ width: 52, textTransform: "capitalize" }}>{k}</b>
                    <select className="select grow" value={cfg.premium[k] || ""} onChange={(e) => saveCfg({ premium: { ...cfg.premium, [k]: e.target.value || null } })}>
                      <option value="">None</option>
                      {models
                        .filter((m) => m.kind === k || (k === "edit" && m.kind === "edit"))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id} {m.verified && m.price !== null ? `· $${m.price}` : "· price not verified"}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
                <p className="note">Check each model's endpoint and price on the provider's page, then mark it verified in engine/models.json.</p>
              </div>
            </div>
          </div>

          <div className="split">
            <div className="panel col">
              <h3>Requests for Claude</h3>
              {requests.length ? (
                <div className="list">
                  {requests.slice(-8).reverse().map((r) => (
                    <div key={r.id} className="item">
                      <span className="badge">{r.kind}</span>
                      <span className="grow small">{r.prompt}</span>
                      <span className={`badge ${r.status === "done" ? "ok" : "warn"}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">None waiting.</p>
              )}
              <p className="note">In Claude Code, say <b>"run my 7 Studios requests"</b>. Claude checks your Higgsfield balance, quotes the credits and waits for your yes.</p>
            </div>
            <div className="panel col">
              <h3>Train your own look (LoRA)</h3>
              <div className="row">
                <Field label="Name">
                  <input className="input" value={lora.name} onChange={(e) => setLora({ ...lora, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="e.g. church-look" />
                </Field>
                <Field label="Trigger word">
                  <input className="input" value={lora.trigger} onChange={(e) => setLora({ ...lora, trigger: e.target.value.replace(/[^\w-]/g, "") })} placeholder="e.g. chrchlk" />
                </Field>
              </div>
              <FileDrop accept="video/*,image/*" multiple label="Footage or photos you own" onDone={(p) => setLora({ ...lora, files: [...lora.files, ...p] })} />
              <div className="row">
                <span className="small muted grow">{lora.files.length} files</span>
                <Seg value={lora.seconds} options={[2, 3, 4, 5]} labels={{ 2: "2 s", 3: "3 s", 4: "4 s", 5: "5 s" }} onChange={(v) => setLora({ ...lora, seconds: v })} />
              </div>
              <button className="btn" disabled={!lora.name || !lora.files.length} onClick={() => task("lora-prepare", lora)}>
                <Icon name="layers" /> Prepare the training set
              </button>
              <p className="note">Builds clips, captions to finish and a trainer config in production/lora/. Training runs on a rented GPU (quote the hours first).</p>
            </div>
          </div>

          <div className="panel col">
            <h3>This computer</h3>
            {status ? (
              <dl className="kv">
                <dt>7 Studios</dt>
                <dd>v{status.version}</dd>
                <dt>ffmpeg</dt>
                <dd>{status.ffmpeg || <span className="badge bad">missing: brew install ffmpeg</span>}</dd>
                <dt>Node</dt>
                <dd>{status.node}</dd>
                <dt>System</dt>
                <dd>{status.platform === "darwin" ? "macOS" : status.platform}</dd>
              </dl>
            ) : null}
            <button className="btn" style={{ justifySelf: "start" }} onClick={() => task("doctor")}>
              <Icon name="shield" /> Is this computer ready?
            </button>
          </div>
          {last ? <RunView run={last} /> : null}
        </div>
      ) : (
        <div className="shimmer" style={{ height: 300, borderRadius: 18 }} />
      )}
    </div>
  );
};
export default Settings;
