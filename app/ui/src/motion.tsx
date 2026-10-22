import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

// The app's own motion: the opening, type that reacts to the cursor, rotating words,
// marquees, a gold spotlight on cards and a small motion graphic for each studio.

export const MOTTO = { a: "Making", b: "dreams,", c: "creating", d: "realities." };

// ── the opening ─────────────────────────────────────────────────────────────
// The logo draws itself, the wordmark rises, the motto arrives. Once per opening of the
// app (per tab); click or press a key to skip.
export const Splash: React.FC = () => {
  const [state, setState] = useState<"show" | "out" | "gone">(() => {
    try {
      return sessionStorage.getItem("7s:intro") ? "gone" : "show";
    } catch {
      return "show";
    }
  });
  useEffect(() => {
    if (state !== "show") return;
    try {
      sessionStorage.setItem("7s:intro", "1");
    } catch {
      /* private window: shows each time */
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setState("out"), reduced ? 900 : 3300);
    const skip = () => setState("out");
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(t1);
      window.removeEventListener("keydown", skip);
    };
  }, [state]);
  useEffect(() => {
    if (state !== "out") return;
    const t = setTimeout(() => setState("gone"), 760);
    return () => clearTimeout(t);
  }, [state]);
  if (state === "gone") return null;
  const word = "7 Studios";
  const motto = [MOTTO.a, MOTTO.b, MOTTO.c, MOTTO.d];
  return (
    <div className={`splash ${state === "out" ? "out" : ""}`} onClick={() => setState("out")} role="presentation">
      <div className="rays" />
      <div className="glow" />
      <div className="stack">
        <svg className="mark" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F8E3A2" />
              <stop offset="0.45" stopColor="#E8B44A" />
              <stop offset="1" stopColor="#B98722" />
            </linearGradient>
            <clipPath id="sc">
              <rect x="20" y="20" width="472" height="472" rx="112" />
            </clipPath>
          </defs>
          <rect className="tile" x="20" y="20" width="472" height="472" rx="112" fill="#FFFFFF" />
          <rect className="ring" x="34" y="34" width="444" height="444" rx="100" fill="none" stroke="url(#sg)" strokeWidth="8" />
          <path className="seven" d="M150 150 H362 L246 372" fill="none" stroke="url(#sg)" strokeWidth="54" strokeLinecap="round" strokeLinejoin="round" />
          <path className="bar" d="M196 262 H316" stroke="url(#sg)" strokeWidth="30" strokeLinecap="round" />
          <g clipPath="url(#sc)">
            <rect className="shine" x="0" y="-40" width="110" height="600" fill="#FFFFFF" opacity="0.65" />
          </g>
        </svg>
        <h1 className="word" aria-label={word}>
          {word.split("").map((c, i) => (
            <span key={i} style={{ "--i": i } as React.CSSProperties}>
              {c === " " ? " " : c}
            </span>
          ))}
        </h1>
        <p className="motto">
          {motto.map((w, i) =>
            i % 2 ? (
              <em key={i} style={{ "--i": i } as React.CSSProperties}>
                {w}
                {i < 3 ? " " : ""}
              </em>
            ) : (
              <span key={i} style={{ "--i": i } as React.CSSProperties}>
                {w}&nbsp;
              </span>
            ),
          )}
        </p>
        <div className="line">
          <i />
        </div>
      </div>
      <span className="skip">Click to enter</span>
    </div>
  );
};

// ── type that moves ─────────────────────────────────────────────────────────
// Letters rise in, then swell (heavier, lifted) under the cursor. Words in `gold`
// are set italic in moving gold.
export const Kinetic: React.FC<{
  text: string;
  as?: "h1" | "h2" | "span" | "div";
  className?: string;
  gold?: string[];
  delay?: number;
  base?: number;
  peak?: number;
}> = ({ text, as = "h1", className = "", gold = [], delay = 0, base = 380, peak = 780 }) => {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const letters = Array.from(el.querySelectorAll<HTMLElement>(".kl"));
    let raf = 0;
    let mx = 0;
    let my = 0;
    const paint = () => {
      raf = 0;
      for (const l of letters) {
        const r = l.getBoundingClientRect();
        const dx = (r.left + r.width / 2 - mx) / 110;
        const dy = (r.top + r.height / 2 - my) / 140;
        const f = Math.exp(-(dx * dx + dy * dy));
        l.style.setProperty("--w", String(Math.round(base + (peak - base) * f)));
        l.style.setProperty("--lift", (f * 6).toFixed(2));
      }
    };
    const move = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      for (const l of letters) {
        l.style.setProperty("--w", String(base));
        l.style.setProperty("--lift", "0");
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    leave();
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [text, base, peak]);
  let i = 0;
  const words = text.split(" ");
  const Tag = as as "h1";
  return (
    <Tag ref={ref as React.Ref<HTMLHeadingElement>} className={`kinetic ${className}`} aria-label={text} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      {words.map((w, wi) => {
        const letters = w.split("").map((c) => (
          <span key={i} className="kl" aria-hidden="true" style={{ "--i": i++ } as React.CSSProperties}>
            {c}
          </span>
        ));
        const inner = gold.includes(w) ? <em>{letters}</em> : letters;
        return (
          <span key={wi} className="kw">
            {inner}
            {wi < words.length - 1 ? <span className="kl" aria-hidden="true" style={{ "--i": i++ } as React.CSSProperties}>{" "}</span> : null}
          </span>
        );
      })}
    </Tag>
  );
};

// One word at a time, sliding up.
export const Rotator: React.FC<{ words: string[]; every?: number; className?: string }> = ({ words, every = 2200, className }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % words.length), every);
    return () => clearInterval(t);
  }, [words.length, every]);
  return (
    <span className={`rotator ${className || ""}`}>
      <span key={n}>{words[n]}</span>
    </span>
  );
};

export const Marquee: React.FC<{ seconds?: number; className?: string; children: React.ReactNode }> = ({ seconds = 40, className = "", children }) => (
  <div className={`marquee ${className}`}>
    <div className="track" style={{ "--dur": `${seconds}s` } as React.CSSProperties}>
      <div style={{ display: "flex" }}>{children}</div>
      <div style={{ display: "flex" }} aria-hidden="true">
        {children}
      </div>
    </div>
  </div>
);

// A soft gold light that follows the cursor over anything with class "spot".
export const useSpotlight = () => {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(".spot") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
};

// A looping clip that only plays while on screen.
export const Clip: React.FC<{ src: string; poster?: string; tag?: string; ratio?: string; className?: string }> = ({ src, poster, tag, ratio = "9 / 16", className = "" }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.05 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className={`clip ${className}`} style={{ aspectRatio: ratio }}>
      <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" />
      {tag ? <span className="tag">{tag}</span> : null}
    </div>
  );
};

// ── a small motion graphic for each studio ─────────────────────────────────
export const StudioArt: React.FC<{ kind: string }> = ({ kind }) => {
  switch (kind) {
    case "image":
      return (
        <div className="art art-image">
          <i className="ph" />
          <i className="ph" />
          <i className="ph" />
          <span className="sp" style={{ left: "18%", top: "20%" }}>✦</span>
          <span className="sp" style={{ right: "16%", top: "28%", animationDelay: "0.7s" }}>✦</span>
          <span className="sp" style={{ right: "26%", bottom: "14%", animationDelay: "1.3s", fontSize: 11 }}>✦</span>
        </div>
      );
    case "video":
      return (
        <div className="art art-video">
          <div className="frame">
            <i className="sun" />
            <i className="hill" />
            <i className="hill b" />
          </div>
          <span className="play">
            <Icon name="play" size={16} fill />
          </span>
          <div className="bar">
            <i />
          </div>
        </div>
      );
    case "edit":
      return (
        <div className="art art-edit">
          <div className="wave">
            {Array.from({ length: 34 }).map((_, i) => (
              <i key={i} className={i > 11 && i < 16 ? "cut" : ""} style={{ animationDelay: `${(i % 7) * 0.13}s`, animationDuration: `${0.8 + (i % 5) * 0.15}s` }} />
            ))}
          </div>
          <i className="head" />
          <div className="words">
            <span>So</span>
            <span className="x">um</span>
            <span>waiting</span>
            <span>is not</span>
            <span>wasting.</span>
          </div>
        </div>
      );
    case "motion": {
      const path = "M 20 120 C 80 10, 150 10, 180 75 S 260 140, 300 30";
      return (
        <div className="art art-motion">
          <svg viewBox="0 0 320 150" preserveAspectRatio="xMidYMid meet">
            <defs>
              <linearGradient id="mo-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#F8E3A2" />
                <stop offset="0.5" stopColor="#E8B44A" />
                <stop offset="1" stopColor="#B98722" />
              </linearGradient>
            </defs>
            <path className="path" d={path} />
            {[
              [20, 120],
              [180, 75],
              [300, 30],
            ].map(([x, y], i) => (
              <rect key={i} x={x - 6} y={y - 6} width="12" height="12" fill="#fff" stroke="#D6A33B" strokeWidth="2.5" transform={`rotate(45 ${x} ${y})`} />
            ))}
            <circle r="13" fill="url(#mo-g)" style={{ filter: "drop-shadow(0 4px 6px rgba(150,105,20,.5))" }}>
              <animateMotion dur="3.4s" repeatCount="indefinite" path={path} keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.65 0 0.35 1;0.65 0 0.35 1" />
            </circle>
          </svg>
        </div>
      );
    }
    case "carousel":
      return (
        <div className="art art-carousel">
          <div className="slides">
            {Array.from({ length: 6 }).map((_, i) => (
              <i key={i} />
            ))}
          </div>
          <div className="dots">
            <i />
            <i />
            <i />
          </div>
        </div>
      );
    case "web":
      return (
        <div className="art art-web">
          <div className="win">
            <i className="morph" />
            <svg className="cursor" viewBox="0 0 17 20">
              <path d="M 2.5 1 L 2.5 15.5 L 6.2 12.2 L 8.6 18 L 11.4 16.8 L 9 11.2 L 14 11 Z" fill="#fff" stroke="#17130d" strokeWidth="1.2" />
            </svg>
          </div>
        </div>
      );
    case "publish": {
      const arc = "M 30 120 C 90 120, 120 40, 200 50 S 290 90, 300 34";
      return (
        <div className="art art-publish">
          <svg viewBox="0 0 330 150" preserveAspectRatio="xMidYMid meet">
            <path className="arc" d={arc} />
            <g>
              <path d="M -12 -9 L 14 0 L -12 9 L -6 0 Z" fill="#D6A33B" stroke="#98701B" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M -6 0 L 14 0" stroke="#98701B" strokeWidth="1.2" />
              <animateMotion dur="3.6s" repeatCount="indefinite" path={arc} rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.25 1" />
            </g>
            <g className="tick" transform="translate(300 34)">
              <circle r="17" fill="#E8B44A" />
              <path d="M -7 0 L -2 5 L 8 -6" fill="none" stroke="#241A05" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
        </div>
      );
    }
    default:
      return <div className="art" />;
  }
};
