import { useEffect, useMemo, useState } from "react";
import { del, get, mediaUrl, patch, post, type Character, type GalleryItem, type Generation, type Preset } from "../api";
import { Icon } from "../icons";
import { go } from "../nav";
import { PresetArt } from "../PresetArt";
import { useStore } from "../store";
import { Empty, Field, FileDrop, Media, MediaPicker, Modal, PageHead, Progress, Seg, Tile, useLocal } from "../ui";

type Kind = "image" | "video";
const ASPECTS: Record<Kind, string[]> = { image: ["1x1", "4x5", "9x16", "16x9", "3x2"], video: ["9x16", "16x9", "1x1", "4x5"] };
const ENGINE_LABEL: Record<string, string> = { demo: "Demo (free placeholder)", mac: "This Mac (Draw Things, free)", open: "Open models (ComfyUI)", premium: "Premium (your key, paid)", claude: "Claude + Higgsfield" };
type Model = { id: string; kind: string; name?: string; price: number | null; verified: boolean; unit?: string };

const Generate: React.FC<{ kind: Kind; q: URLSearchParams }> = ({ kind, q }) => {
  const { status, gens, toast, refreshStatus } = useStore();
  const [mode, setMode] = useState<"create" | "edit">(q.get("mode") === "edit" ? "edit" : "create");
  const [prompt, setPrompt] = useLocal(`${kind}:prompt`, "");
  const [negative, setNegative] = useState("");
  const [preset, setPreset] = useState<string>("");
  const [aspect, setAspect] = useLocal(`${kind}:aspect`, kind === "video" ? "9x16" : "1x1");
  const [count, setCount] = useLocal(`${kind}:count`, 1);
  const [quality, setQuality] = useLocal<"draft" | "final">(`${kind}:quality`, "draft");
  const [engine, setEngine] = useState<string>("");
  const [seed, setSeed] = useState("");
  const [seconds, setSeconds] = useLocal(`${kind}:seconds`, 5);
  const [image, setImage] = useState<string>(q.get("image") || "");
  const [endImage, setEndImage] = useState<string>("");
  const [character, setCharacter] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [chars, setChars] = useState<Character[]>([]);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [picking, setPicking] = useState<"" | "image" | "end">("");
  const [newChar, setNewChar] = useState(false);
  const [confirm, setConfirm] = useState<null | { text: string; go: () => void }>(null);
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const [adv, setAdv] = useState(false);
  const [cat, setCat] = useState("All");

  const presetKind = kind === "video" ? "video" : mode === "edit" ? "edit" : "image";
  useEffect(() => {
    get<Preset[]>(`/api/presets?kind=${presetKind}`).then(setPresets).catch(() => {});
    setPreset("");
    setCat("All");
  }, [presetKind]);
  useEffect(() => {
    get<Character[]>("/api/characters").then(setChars).catch(() => {});
  }, [newChar]);
  const loadItems = () => get<{ items: GalleryItem[] }>("/api/gallery").then((g) => setItems(g.items.filter((i) => i.kind === kind))).catch(() => {});
  useEffect(() => {
    loadItems();
  }, [kind]);
  useEffect(() => {
    // Draw Things makes images only, so the Video studio starts on the demo engine instead.
    if (status && !engine) setEngine(kind === "video" && status.engine.default === "mac" ? "demo" : status.engine.default);
  }, [status, engine, kind]);
  // When a generation finishes, the library has new items.
  const mine = gens.filter((g) => (g.req.kind === kind || (kind === "image" && g.req.kind === "edit")));
  const doneKey = mine.filter((g) => g.status !== "running").map((g) => g.id).join();
  useEffect(() => {
    loadItems();
  }, [doneKey]);

  const presetObj = presets.find((p) => p.id === preset);
  const cats = useMemo(() => ["All", ...Array.from(new Set(presets.map((p) => p.category || "Other")))], [presets]);
  const shown = presets.filter((p) => cat === "All" || (p.category || "Other") === cat);
  const genKind = kind === "video" ? "video" : mode === "edit" ? "edit" : "image";
  const sourceItem = items.find((i) => i.id === image);

  const submit = async (confirmPaid = false) => {
    if (genKind !== "video" && !prompt.trim()) return toast("Write what you want first.", "error");
    if (genKind === "edit" && !image && !character) return toast("Choose the image to edit.", "error");
    if (engine === "premium" && !confirmPaid) {
      const models = await get<Model[]>("/api/models").catch(() => [] as Model[]);
      const id = status?.engine.premium?.[genKind] || null;
      const m = models.find((x) => x.id === id);
      const each = m?.price ?? null;
      const text = !id
        ? `No premium model is chosen for ${genKind} yet. Choose one in Settings.`
        : `${m?.name || id}: ${each !== null && m?.verified ? `about $${(each * count).toFixed(2)} for ${count} (${m.unit || "per run"})` : "price not verified yet: check it on the provider's page before running"}. This is charged to your fal.ai account.`;
      if (!id) return toast(text, "error");
      return setConfirm({ text, go: () => submit(true) });
    }
    try {
      await post("/api/generate", {
        kind: genKind,
        prompt: prompt.trim(),
        negative: negative.trim() || undefined,
        preset: preset || undefined,
        engine,
        aspect,
        count,
        seed: seed === "" ? undefined : Number(seed),
        quality,
        image: image || undefined,
        endImage: endImage || undefined,
        character: character || undefined,
        seconds: kind === "video" ? seconds : undefined,
        confirmPaid: confirmPaid || undefined,
      });
      refreshStatus();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const fav = async (it: GalleryItem) => {
    await patch(`/api/gallery/${it.id}`, { favorite: !it.favorite });
    loadItems();
  };
  const remove = async (it: GalleryItem) => {
    if (!window.confirm("Delete this from the library? The file is removed too.")) return;
    await del(`/api/gallery/${it.id}`);
    setOpen(null);
    loadItems();
    refreshStatus();
  };
  const reuse = (it: GalleryItem) => {
    setPrompt(it.userPrompt || it.prompt);
    setPreset(it.preset || "");
    setSeed(String(it.seed));
    setAspect(it.aspect);
    setOpen(null);
  };
  const running = mine.filter((g) => g.status === "running");
  const problems = mine.filter((g) => g.status === "failed" || g.status === "waiting").slice(0, 3);

  return (
    <div className="page">
      <PageHead
        eyebrow={kind === "image" ? "Studio 01" : "Studio 02"}
        icon={kind}
        title={kind === "image" ? "Image" : "Video"}
        sub={kind === "image" ? "Describe it, pick a look, and make it. Edit any picture with a sentence." : "Bring a still to life with a camera move, or describe the shot from scratch."}
      >
        {kind === "image" ? <Seg value={mode} options={["create", "edit"] as const} labels={{ create: "Create", edit: "Edit a picture" }} onChange={setMode} /> : null}
      </PageHead>

      <div className="split wide">
        <div className="col sticky">
          {kind === "video" || mode === "edit" ? (
            <div className="panel">
              <h3>
                {mode === "edit" ? "Picture to edit" : "Start frame"} <span className="sub">{kind === "video" ? "optional: or describe the whole shot" : "required"}</span>
              </h3>
              {image ? (
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <div style={{ width: 120 }}>
                    <Media src={sourceItem ? sourceItem.file : image} className="preview" />
                  </div>
                  <div className="col">
                    <button className="btn sm" onClick={() => setPicking("image")}>
                      Change
                    </button>
                    <button className="btn sm ghost" onClick={() => setImage("")}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn block" onClick={() => setPicking("image")}>
                  <Icon name="image" /> Choose a picture
                </button>
              )}
              {kind === "video" && engine === "premium" ? (
                <div style={{ marginTop: 10 }}>
                  <button className="btn sm ghost" onClick={() => setPicking("end")}>
                    {endImage ? "End frame chosen ✓" : "+ End frame (some models)"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="prompt">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                kind === "video"
                  ? "What happens in the shot? e.g. the worship team lifts their hands as the lights rise"
                  : mode === "edit"
                    ? "What should change? e.g. make it golden hour, keep the face the same"
                    : "Describe it. e.g. a young pastor on a rooftop at dusk, city lights behind"
              }
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
            />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <Seg value={aspect} options={ASPECTS[kind]} onChange={setAspect} />
              </div>
              <button className="btn primary big" onClick={() => submit()} disabled={!engine}>
                <Icon name="sparkle" /> Generate{count > 1 ? ` ${count}` : ""}
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>
              {kind === "video" ? "Camera & look" : mode === "edit" ? "Edit recipes" : "Looks"}
              <span className="sub">{presetObj ? presetObj.name : "none: just your words"}</span>
            </h3>
            {cats.length > 2 ? (
              <div className="chips" style={{ marginBottom: 10 }}>
                {cats.map((c) => (
                  <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="presets">
              {shown.map((p) => (
                <button key={p.id} className={`preset ${preset === p.id ? "on" : ""}`} onClick={() => setPreset(preset === p.id ? "" : p.id)} title={p.prompt}>
                  <PresetArt id={p.id} kind={p.kind} />
                  <b>{p.name}</b>
                  <span>{p.description}</span>
                </button>
              ))}
            </div>
            {presetObj && presetObj.tested === false ? <p className="note" style={{ marginTop: 8 }}>A starting recipe, not yet tuned on your engine.</p> : null}
          </div>

          <div className="panel col">
            <div className="row">
              <Field label="Engine">
                <select className="select" value={engine} onChange={(e) => setEngine(e.target.value)}>
                  {(status?.engine.engines || ["demo"]).filter((e) => !(kind === "video" && e === "mac")).map((e) => (
                    <option key={e} value={e}>
                      {ENGINE_LABEL[e] || e}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quality">
                <Seg value={quality} options={["draft", "final"] as const} labels={{ draft: "Draft", final: "Final" }} onChange={setQuality} />
              </Field>
            </div>
            <div className="row">
              <Field label="How many">
                <Seg value={count} options={kind === "video" ? [1, 2] : [1, 2, 3, 4]} onChange={setCount} />
              </Field>
              {kind === "video" ? (
                <Field label={`Length: ${seconds} s`}>
                  <input type="range" min={2} max={10} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
                </Field>
              ) : null}
            </div>
            <Field label="Character" hint={<button className="btn ghost sm" type="button" onClick={() => setNewChar(true)}>+ New</button>}>
              <select className="select" value={character} onChange={(e) => setCharacter(e.target.value)}>
                <option value="">None</option>
                {chars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.consent.kind})
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn ghost sm" onClick={() => setAdv(!adv)} style={{ justifySelf: "start" }}>
              {adv ? "▾" : "▸"} More: negative prompt, seed
            </button>
            {adv ? (
              <>
                <Field label="Avoid (negative prompt)">
                  <input className="input" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="e.g. text, watermark, extra fingers" />
                </Field>
                <Field label="Seed" hint="same seed + same settings = same result">
                  <input className="input" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))} placeholder="random" />
                </Field>
              </>
            ) : null}
            {engine === "demo" ? <div className="callout"><Icon name="info" /> The demo engine makes placeholders on this computer to try the studio. They're marked "demo" and aren't AI.</div> : null}
            {engine === "mac" ? <div className="callout gold"><Icon name="info" /> Free, on this Mac: Draw Things must be open with its API Server on (Settings → API Server). The model is the one chosen in Draw Things.</div> : null}
            {engine === "open" ? <div className="callout"><Icon name="info" /> Needs ComfyUI running with its model files (Settings → Open models). On a MacBook Air, use This Mac (Draw Things) instead.</div> : null}
            {engine === "claude" ? <div className="callout gold"><Icon name="info" /> This leaves a request for Claude. In Claude Code, say "run my 7 Studios requests": Claude quotes the Higgsfield credits and waits for your yes.</div> : null}
          </div>
        </div>

        <div className="col">
          {problems.map((g) => (
            <div key={g.id} className={`callout ${g.status === "failed" ? "bad" : "gold"}`}>
              <Icon name={g.status === "failed" ? "x" : "clock"} />
              <span>{g.status === "failed" ? `Couldn't generate: ${g.error}` : g.items[0]?.note || "Waiting for Claude to run this request."}</span>
            </div>
          ))}
          <div className="media-grid">
            {running.map((g: Generation) =>
              Array.from({ length: Number(g.req.count || 1) }).map((_, i) => (
                <div key={`${g.id}-${i}`} className="tile">
                  <div className="ratio shimmer" style={{ paddingTop: aspectPad(String(g.req.aspect || aspect)) }}>
                    <div className="pending" style={{ background: "transparent" }}>
                      <div style={{ width: "70%" }}>
                        <div className="dreaming" style={{ marginBottom: 4 }}>Making the dream…</div>
                        <div className="small" style={{ marginBottom: 8 }}>{g.note || g.stage}</div>
                        <Progress value={g.pct || null} />
                      </div>
                    </div>
                  </div>
                </div>
              )),
            )}
            {items.map((it) => (
              <Tile
                key={it.id}
                item={it}
                onClick={() => setOpen(it)}
                actions={
                  <>
                    <button className={`icon-btn ${it.favorite ? "fav" : ""}`} onClick={() => fav(it)} aria-label="Favourite">
                      <Icon name="heart" size={15} fill={it.favorite} />
                    </button>
                    {it.kind === "image" ? (
                      <button className="icon-btn" onClick={() => go("video", { image: it.id })} aria-label="Animate" title="Animate">
                        <Icon name="video" size={15} />
                      </button>
                    ) : null}
                  </>
                }
              />
            ))}
          </div>
          {!items.length && !running.length ? (
            <Empty title={kind === "image" ? "Your images appear here" : "Your clips appear here"} icon={kind}>
              Write a prompt and press Generate (⌘/Ctrl + Enter).
            </Empty>
          ) : null}
        </div>
      </div>

      {picking ? (
        <MediaPicker
          kind="image"
          onClose={() => setPicking("")}
          onPick={(p) => {
            if (picking === "end") setEndImage(p);
            else setImage(p);
            setPicking("");
          }}
        />
      ) : null}
      {newChar ? <NewCharacter onClose={() => setNewChar(false)} onSaved={(id) => (setCharacter(id), setNewChar(false))} /> : null}
      {confirm ? (
        <Modal title="This one costs money" onClose={() => setConfirm(null)}>
          <p className="muted">{confirm.text}</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const f = confirm.go;
                setConfirm(null);
                f();
              }}
            >
              Generate and pay
            </button>
          </div>
        </Modal>
      ) : null}
      {open ? (
        <Modal title={open.kind === "video" ? "Clip" : "Image"} onClose={() => setOpen(null)} wide>
          <div className="split" style={{ gridTemplateColumns: "1fr 300px" }}>
            <Media src={open.file} poster={open.thumb} controls className="preview" muted={false} />
            <div className="col">
              <dl className="kv">
                <dt>Prompt</dt>
                <dd>{open.userPrompt || "—"}</dd>
                <dt>Look</dt>
                <dd>{open.preset || "—"}</dd>
                <dt>Engine</dt>
                <dd>
                  {open.engine}
                  {open.model ? ` · ${open.model}` : ""} {open.demo ? <span className="badge">demo</span> : null}
                </dd>
                <dt>Size</dt>
                <dd>
                  {open.width}×{open.height}
                  {open.seconds ? ` · ${open.seconds.toFixed(1)} s` : ""}
                </dd>
                <dt>Seed</dt>
                <dd className="mono">{open.seed}</dd>
                <dt>Cost</dt>
                <dd>{open.cost?.usd ? `$${open.cost.usd.toFixed(3)}` : open.cost?.credits ? `${open.cost.credits} credits` : open.cost?.note || "free"}</dd>
              </dl>
              <div className="hr" />
              <button className="btn" onClick={() => reuse(open)}>
                <Icon name="refresh" /> Use these settings
              </button>
              {open.kind === "image" ? (
                <>
                  <button className="btn" onClick={() => (setOpen(null), go("video", { image: open.id }))}>
                    <Icon name="video" /> Animate it
                  </button>
                  <button className="btn" onClick={() => (setOpen(null), setMode("edit"), setImage(open.id))}>
                    <Icon name="wand" /> Edit it
                  </button>
                </>
              ) : null}
              <a className="btn" href={mediaUrl(open.file)} download>
                <Icon name="download" /> Download
              </a>
              <button className="btn danger" onClick={() => remove(open)}>
                <Icon name="trash" /> Delete
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};
const aspectPad = (a: string) => {
  const [w, h] = a.split("x").map(Number);
  return `${((h || 1) / (w || 1)) * 100}%`;
};

const NewCharacter: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState<"self" | "permission" | "fictional">("fictional");
  const [note, setNote] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const { toast } = useStore();
  const save = async () => {
    try {
      const c = await post<Character>("/api/characters", { name, description, consent: { kind: consent, note }, refs });
      toast(`${c.name} saved`, "ok");
      onSaved(c.id);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <Modal title="New character" onClose={onClose}>
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pastor Ama" />
      </Field>
      <Field label="Description" hint="joins every prompt">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. a woman in her 30s with short natural hair, warm smile, navy blazer" />
      </Field>
      <Field label="Who is this?">
        <Seg value={consent} options={["self", "permission", "fictional"] as const} labels={{ self: "Me", permission: "Someone who agreed", fictional: "Made up" }} onChange={setConsent} />
      </Field>
      {consent === "permission" ? (
        <Field label="Who agreed, and when" hint="required">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ama agreed in writing, 20 Oct 2026" />
        </Field>
      ) : null}
      <div className="callout">
        <Icon name="shield" /> Real people only with their agreement. The consent record is kept with the character.
      </div>
      <FileDrop accept="image/*" multiple label="Reference photos (optional)" onDone={(p) => setRefs([...refs, ...p])} />
      {refs.length ? <p className="small muted">{refs.length} reference photo{refs.length > 1 ? "s" : ""} added</p> : null}
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={!name || (consent === "permission" && !note)}>
          Save character
        </button>
      </div>
    </Modal>
  );
};
export default Generate;
