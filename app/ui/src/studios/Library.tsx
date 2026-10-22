import { useEffect, useMemo, useState } from "react";
import { ago, bytes, del, get, isVideo, mediaUrl, patch, type FileEntry, type GalleryItem } from "../api";
import { Icon } from "../icons";
import { go } from "../nav";
import { useStore } from "../store";
import { Empty, Media, Modal, PageHead, Seg, Tile, useLocal } from "../ui";

const Library: React.FC = () => {
  const { refreshStatus } = useStore();
  const [tab, setTab] = useLocal<"made" | "renders">("library:tab", "made");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [renders, setRenders] = useState<FileEntry[]>([]);
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const [favs, setFavs] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const load = () => {
    get<{ items: GalleryItem[] }>("/api/gallery").then((g) => setItems(g.items));
    get<FileEntry[]>("/api/renders").then(setRenders);
  };
  useEffect(load, []);
  const shown = useMemo(
    () => items.filter((i) => (kind === "all" || i.kind === kind) && (!favs || i.favorite) && (!search || `${i.userPrompt} ${i.preset} ${i.engine}`.toLowerCase().includes(search.toLowerCase()))),
    [items, kind, favs, search],
  );
  const fav = async (it: GalleryItem) => {
    await patch(`/api/gallery/${it.id}`, { favorite: !it.favorite });
    load();
  };
  const remove = async (it: GalleryItem) => {
    if (!window.confirm("Delete this from the library? The file is removed too.")) return;
    await del(`/api/gallery/${it.id}`);
    setOpen(null);
    load();
    refreshStatus();
  };
  return (
    <div className="page">
      <PageHead eyebrow="Yours" icon="library" title="Library" sub="Everything made here, with the prompt, look, engine, seed and cost of each, and every render." />
      <div className="tabs">
        <button className={tab === "made" ? "on" : ""} onClick={() => setTab("made")}>
          Generated ({items.length})
        </button>
        <button className={tab === "renders" ? "on" : ""} onClick={() => setTab("renders")}>
          Renders ({renders.length})
        </button>
      </div>
      {tab === "made" ? (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <Seg value={kind} options={["all", "image", "video"] as const} labels={{ all: "All", image: "Images", video: "Clips" }} onChange={setKind} />
            <button className={`chip ${favs ? "on" : ""}`} onClick={() => setFavs(!favs)}>
              <Icon name="heart" size={13} fill={favs} /> Favourites
            </button>
            <input className="input grow" style={{ maxWidth: 360 }} placeholder="Search prompts, looks, engines…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {shown.length ? (
            <div className="media-grid">
              {shown.map((it) => (
                <Tile
                  key={it.id}
                  item={it}
                  onClick={() => setOpen(it)}
                  actions={
                    <button className={`icon-btn ${it.favorite ? "fav" : ""}`} onClick={() => fav(it)} aria-label="Favourite">
                      <Icon name="heart" size={15} fill={it.favorite} />
                    </button>
                  }
                />
              ))}
            </div>
          ) : (
            <Empty title="Nothing here yet" icon="library">
              Make images and clips in the Image and Video studios.
            </Empty>
          )}
        </>
      ) : renders.length ? (
        <div className="list">
          {renders.map((r) => (
            <div key={r.path} className="item">
              <Icon name={isVideo(r.path) ? "video" : "image"} />
              <div className="grow">
                <div className="t">{r.path.replace(/^out\//, "")}</div>
                <div className="s">
                  {bytes(r.size)} · {ago(r.mtime)}
                </div>
              </div>
              <a className="btn sm" href={mediaUrl(r.path)} target="_blank" rel="noreferrer">
                Open
              </a>
              <a className="btn sm ghost" href={mediaUrl(r.path)} download>
                <Icon name="download" size={14} />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="No renders yet" icon="play">Renders from every studio collect in the out/ folder.</Empty>
      )}
      {open ? (
        <Modal title={open.userPrompt ? open.userPrompt.slice(0, 60) : open.kind} onClose={() => setOpen(null)} wide>
          <div className="split" style={{ gridTemplateColumns: "1fr 300px" }}>
            <Media src={open.file} poster={open.thumb} controls muted={false} className="preview" />
            <div className="col">
              <dl className="kv">
                <dt>Full prompt</dt>
                <dd className="small">{open.prompt}</dd>
                <dt>Engine</dt>
                <dd>
                  {open.engine} {open.model ? `· ${open.model}` : ""}
                </dd>
                <dt>Look</dt>
                <dd>{open.preset || "—"}</dd>
                <dt>Seed</dt>
                <dd className="mono">{open.seed}</dd>
                <dt>Made</dt>
                <dd>{ago(open.createdAt)}</dd>
              </dl>
              {open.kind === "image" ? (
                <button className="btn" onClick={() => go("video", { image: open.id })}>
                  <Icon name="video" /> Animate it
                </button>
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
export default Library;
