import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, Logo, type IconName } from "./icons";
import { MOTTO, Splash, useSpotlight } from "./motion";
import { parse, STUDIOS } from "./nav";
import { StoreProvider, useStore } from "./store";
import { RunView } from "./ui";

const Home = lazy(() => import("./studios/Home"));
const Generate = lazy(() => import("./studios/Generate"));
const Edit = lazy(() => import("./studios/Edit"));
const Motion = lazy(() => import("./studios/Motion"));
const CarouselStudio = lazy(() => import("./studios/Carousel"));
const Web = lazy(() => import("./studios/Web"));
const Publish = lazy(() => import("./studios/Publish"));
const Library = lazy(() => import("./studios/Library"));
const Settings = lazy(() => import("./studios/Settings"));

const Shell: React.FC = () => {
  const [route, setRoute] = useState(parse);
  const { online, runs, drawer, setDrawer, toasts, status } = useStore();
  useEffect(() => {
    const f = () => setRoute(parse());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [route.path]);
  useSpotlight();
  // The gold pill slides to whichever studio is open.
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const a = navRef.current?.querySelector<HTMLElement>("a.on");
    setInd(a ? { top: a.offsetTop, height: a.offsetHeight } : null);
  }, [route.path, status]);
  const busy = runs.filter((r) => r.status === "running" || r.status === "queued");
  const page = (() => {
    switch (route.path) {
      case "image":
        return <Generate key="image" kind="image" q={route.q} />;
      case "video":
        return <Generate key="video" kind="video" q={route.q} />;
      case "edit":
        return <Edit q={route.q} />;
      case "motion":
        return <Motion q={route.q} />;
      case "carousel":
        return <CarouselStudio q={route.q} />;
      case "web":
        return <Web q={route.q} />;
      case "publish":
        return <Publish />;
      case "library":
        return <Library />;
      case "settings":
        return <Settings />;
      default:
        return <Home />;
    }
  })();
  const link = (path: string, label: string, icon: IconName, n?: string) => (
    <a key={path} href={`#/${path}`} className={route.path === path ? "on" : ""} aria-current={route.path === path ? "page" : undefined}>
      <Icon name={icon} /> {label}
      {n ? <span className="n">{n}</span> : null}
    </a>
  );
  return (
    <div className="shell">
      <Splash />
      {!online ? <div className="offline">7 Studios isn't answering. Is it still running in the terminal? Reconnecting…</div> : null}
      <aside className="side">
        <a className="brand" href="#/home">
          <Logo size={38} className="mark" />
          <div>
            <b>7 Studios</b>
            <small>
              {MOTTO.a} {MOTTO.b} {MOTTO.c} {MOTTO.d}
            </small>
          </div>
        </a>
        <nav className="nav" ref={navRef}>
          <i className="ind" style={ind ? { top: ind.top, height: ind.height } : { opacity: 0 }} />
          {link("home", "Home", "home")}
          <div className="nav-label">Studios</div>
          {STUDIOS.map((s, i) => link(s.path, s.label, s.icon, String(i + 1).padStart(2, "0")))}
          <div className="nav-label">Yours</div>
          {link("library", "Library", "library", status ? String(status.engine.gallery) : undefined)}
          {link("settings", "Settings", "settings")}
        </nav>
        <div className="side-foot">
          <span className="row">
            <span className={`dot ${online ? "" : "off"}`} /> {online ? "Running locally" : "Offline"}
          </span>
          {status ? (
            <span className="small dim">
              On this computer · engine <b className="gold">{status.engine.default}</b> · v{status.version}
            </span>
          ) : null}
        </div>
      </aside>
      <main className="main">
        <Suspense fallback={<div className="page"><div className="shimmer" style={{ height: 200, borderRadius: 18 }} /></div>}>{page}</Suspense>
      </main>
      <button className="fab" onClick={() => setDrawer(!drawer)} aria-expanded={drawer}>
        {busy.length ? <span className="spin" /> : <Icon name="clock" />}
        Activity
        {busy.length ? <span className="count">{busy.length}</span> : null}
      </button>
      {drawer ? (
        <div className="drawer" role="dialog" aria-label="Activity">
          <header>
            <b>Activity</b>
            <button className="btn ghost icon" onClick={() => setDrawer(false)} aria-label="Close">
              <Icon name="x" />
            </button>
          </header>
          <div className="body">
            {runs.length ? runs.slice(0, 30).map((r) => <RunView key={r.id} run={r} compact />) : <p className="muted small">Renders, captures and checks show here while they run.</p>}
          </div>
        </div>
      ) : null}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <Icon name={t.kind === "error" ? "x" : t.kind === "ok" ? "check" : "info"} />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export const App: React.FC = () => (
  <StoreProvider>
    <Shell />
  </StoreProvider>
);
