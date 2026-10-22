import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { get, runTask, type Generation, type Run, type Status } from "./api";

// One live connection to the server: runs (studio scripts) and generations update
// here as they happen, and any screen can start a run and wait for it.

type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
type Ctx = {
  status: Status | null;
  refreshStatus: () => void;
  runs: Run[];
  gens: Generation[];
  online: boolean;
  /** Start a studio task; resolves when it finishes (done or failed). */
  run: (task: string, args?: Record<string, unknown>) => Promise<Run>;
  toast: (text: string, kind?: Toast["kind"]) => void;
  toasts: Toast[];
  drawer: boolean;
  setDrawer: (v: boolean) => void;
};
const StoreCtx = createContext<Ctx | null>(null);
export const useStore = () => {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside StoreProvider");
  return c;
};

const FINISHED = new Set(["done", "failed", "cancelled", "stopped"]);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [gens, setGens] = useState<Generation[]>([]);
  const [online, setOnline] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawer, setDrawer] = useState(false);
  const waiters = useRef(new Map<string, (r: Run) => void>());

  const refreshStatus = useCallback(() => {
    get<Status>("/api/status").then(setStatus).catch(() => setOnline(false));
  }, []);
  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);

  useEffect(() => {
    refreshStatus();
    get<Run[]>("/api/runs").then(setRuns).catch(() => {});
    get<Generation[]>("/api/generations").then(setGens).catch(() => {});
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource("/api/events");
      es.onopen = () => setOnline(true);
      es.onerror = () => {
        setOnline(false);
        es?.close();
        retry = setTimeout(connect, 2500);
      };
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data);
        if (ev.type === "run") {
          const r: Run = ev.run;
          setRuns((all) => {
            const i = all.findIndex((x) => x.id === r.id);
            if (i < 0) return [{ ...r, log: r.log || [] }, ...all].slice(0, 80);
            const copy = [...all];
            copy[i] = { ...copy[i], ...r, log: copy[i].log };
            return copy;
          });
          if (FINISHED.has(r.status)) {
            // The full log, then wake whoever was waiting.
            get<Run>(`/api/runs/${r.id}`)
              .then((full) => {
                setRuns((all) => all.map((x) => (x.id === full.id ? full : x)));
                waiters.current.get(r.id)?.(full);
                waiters.current.delete(r.id);
              })
              .catch(() => {});
          }
        } else if (ev.type === "log") {
          setRuns((all) => all.map((x) => (x.id === ev.id ? { ...x, log: [...x.log.slice(-400), ev.line] } : x)));
        } else if (ev.type === "gen") {
          const g: Generation = ev.gen;
          setGens((all) => {
            const i = all.findIndex((x) => x.id === g.id);
            if (i < 0) return [g, ...all].slice(0, 60);
            const copy = [...all];
            copy[i] = g;
            return copy;
          });
        }
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      es?.close();
    };
  }, [refreshStatus]);

  const run = useCallback(
    async (task: string, args: Record<string, unknown> = {}) => {
      const r = await runTask(task, args);
      setRuns((all) => (all.some((x) => x.id === r.id) ? all : [{ ...r, log: [] }, ...all]));
      return new Promise<Run>((ok) => {
        waiters.current.set(r.id, ok);
        // A quick task may have finished before we started waiting.
        get<Run>(`/api/runs/${r.id}`)
          .then((full) => {
            if (FINISHED.has(full.status) && waiters.current.has(r.id)) {
              waiters.current.delete(r.id);
              ok(full);
            }
          })
          .catch(() => {});
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ status, refreshStatus, runs, gens, online, run, toast, toasts, drawer, setDrawer }),
    [status, refreshStatus, runs, gens, online, run, toast, toasts, drawer],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
};
