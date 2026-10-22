#!/usr/bin/env node
// Site capture: read a website the way a motion designer would before animating it.
//
//   npm run site-capture -- <url or .html file> <job> [--width=1440] [--max=12] [--scale=2] [--no-states]
//
// Opens the page at desktop width, scrolls the whole way down and back so lazy sections
// load, then writes:
//   public/jobs/<job>/site/full.jpg        the whole page
//   public/jobs/<job>/site/section-NN.jpg  each section
//   public/jobs/<job>/site/img-NN.jpg      each large picture, as rendered
//   public/jobs/<job>/site/state-NN.jpg    interactive states (each tab, switches, open answers)
//   jobs/<job>/site/inventory.json         every section and component: kind, exact words, box
//   jobs/<job>/site/copy.json              all the page's words, verbatim, in order
//   jobs/<job>/site/INVENTORY.md           the same for people: sections, palette, fonts, flags
// Then: npm run sitemorph -- plan <job>.
//
// Words are copied exactly and never rewritten. Placeholder copy (lorem ipsum, $0,
// "sample", example.com…) is flagged and left out of plans. Everything captured
// belongs to the site's owner: use it only for that client's own video.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ff, parseArgs, writeJson } from "./lib/media.mjs";
import { launch } from "./lib/browser.mjs";

const { opt, pos } = parseArgs(process.argv.slice(2));
const [target, job] = pos;
if (!target || !job || !/^[a-z0-9][a-z0-9-]*$/.test(job)) {
  console.error("Usage: npm run site-capture -- <url or .html file> <job> [--width=1440] [--max=12] [--scale=2] [--no-states]");
  process.exit(1);
}
const isFile = !/^https?:\/\//i.test(target);
if (isFile && !existsSync(target)) {
  console.error(`Not found: ${target}`);
  process.exit(1);
}
const url = isFile ? pathToFileURL(resolve(target)).href : target;
const width = Number(opt.width || 1440);
const maxSections = Number(opt.max || 12);
const scale = Number(opt.scale || 2);
const pubDir = join("public", "jobs", job, "site");
const jobDir = join("jobs", job, "site");
rmSync(pubDir, { recursive: true, force: true });
mkdirSync(pubDir, { recursive: true });
mkdirSync(jobDir, { recursive: true });
const rel = (f) => `jobs/${job}/site/${f}`; // public-relative path, for staticFile()

const browser = await launch();
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: scale });
console.log(`Opening ${url} at ${width} px…`);
await page.goto(url, { waitUntil: "load", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

// Scroll down in steps so lazy images and on-scroll sections load, then back up.
await page.evaluate(async () => {
  const step = Math.round(innerHeight * 0.8);
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 260));
  }
  scrollTo(0, document.documentElement.scrollHeight);
  await new Promise((r) => setTimeout(r, 500));
  scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
});
await page
  .waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 8000 })
  .catch(() => console.log("  (some images were still loading; continuing)"));
await page.waitForTimeout(400);

// Everything is read inside the page: sections, components, words, colours, fonts.
const collect = (maxN) => {
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const W = document.documentElement.clientWidth;
  const css = (el) => getComputedStyle(el);
  const opaque = (c) => c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c);
  const ownBg = (el) => {
    for (let e = el; e; e = e.parentElement) if (opaque(css(e).backgroundColor)) return css(e).backgroundColor;
    return "rgb(255, 255, 255)";
  };

  // Sections: the outermost full-width blocks; one giant wrapper is split into its children.
  let secs = [...document.querySelectorAll("header, nav, section, footer, main > *, body > div > section, [role=region], [role=banner], [role=contentinfo]")]
    .filter(shown)
    .filter((el) => el.getBoundingClientRect().width >= W * 0.6 && el.getBoundingClientRect().height >= 60);
  secs = secs.filter((el) => !secs.some((o) => o !== el && o.contains(el)));
  const split = [];
  for (const el of secs) {
    const kids = [...el.children].filter(shown).filter((k) => k.getBoundingClientRect().height >= 80);
    if (el.getBoundingClientRect().height > innerHeight * 1.8 && kids.length >= 2) split.push(...kids);
    else split.push(el);
  }
  secs = split;
  if (secs.length < 3) {
    let root = document.querySelector("main") || document.body;
    while (root.children.length === 1) root = root.children[0];
    secs = [...root.children].filter(shown).filter((el) => el.getBoundingClientRect().height >= 60);
  }
  secs.sort((a, b) => box(a).y - box(b).y);
  secs = secs.slice(0, maxN);
  secs.forEach((el, i) => el.setAttribute("data-7s-section", String(i + 1)));

  const statRe = /^[~≈+]?[$€£¥]?\d[\d,.]*\s*(%|\+|[kKmMbB]\+?|x|×)?\+?$/;
  const textOf = (el) => clean(el.innerText);
  const sections = secs.map((sec, si) => {
    const q = (sel) => [...sec.querySelectorAll(sel)].filter(shown);
    const components = [];
    const add = (c, el) => {
      el.setAttribute("data-7s-c", `${si + 1}-${components.length + 1}`);
      el.setAttribute("data-7s-k", c.kind);
      components.push({ id: `${si + 1}-${components.length + 1}`, ...c, box: box(el) });
    };
    const headings = q("h1, h2, h3").map((h) => ({ level: Number(h.tagName[1]), text: textOf(h) })).filter((h) => h.text);
    for (const t of q("[role=tablist]")) {
      const tabs = [...t.querySelectorAll("[role=tab]")];
      add({ kind: "tabs", items: tabs.map(textOf).filter(Boolean), selected: Math.max(0, tabs.findIndex((x) => x.getAttribute("aria-selected") === "true")) }, t);
    }
    for (const s of q("[role=switch], input[type=checkbox]")) {
      const label = clean(s.getAttribute("aria-label") || s.closest("label")?.innerText || "");
      add({ kind: "toggle", label, on: s.getAttribute("aria-checked") === "true" || s.checked === true }, s.closest("label") || s);
    }
    for (const s of q("input[type=range], [role=slider]")) {
      add({ kind: "slider", label: clean(s.getAttribute("aria-label") || s.closest("label")?.innerText || "") }, s);
    }
    for (const v of q("video, iframe[src*='youtube'], iframe[src*='vimeo'], [aria-label*='video' i], [class*='player' i]")) {
      if (components.some((c) => c.kind === "player")) break;
      const lines = clean(v.innerText).length ? v.innerText.split("\n").map(clean).filter((x) => x && !/^[▶►⏵]$/.test(x)) : [];
      add({ kind: "player", title: lines[0] || clean(v.getAttribute("aria-label") || v.getAttribute("title") || ""), body: lines[1] || null }, v);
    }
    // Numbers set large: stats, with the words next to them as the label.
    for (const el of q("b, strong, span, div, p, h2, h3, h4, dt, dd")) {
      const t = textOf(el);
      if (!statRe.test(t) || el.children.length > 1) continue;
      if (parseFloat(css(el).fontSize) < 28) continue;
      if (components.some((c) => c.kind === "stat" && c.value === t && Math.abs(c.box.y - box(el).y) < 4)) continue;
      // The label is the short line right after the number (or before it).
      const near = [el.nextElementSibling, el.previousElementSibling].map((x) => (x ? textOf(x) : "")).find((x) => x && x.length <= 80 && !statRe.test(x));
      const rest = el.parentElement ? clean(el.parentElement.innerText.replace(el.innerText, "")) : "";
      add({ kind: "stat", value: t, label: near || (rest.length <= 80 ? rest : null) }, el);
    }
    for (const b of q("blockquote, q, [class*='testimonial' i]")) {
      if (components.some((c) => c.kind === "quote" && b.contains(document.querySelector(`[data-7s-c="${c.id}"]`)))) continue;
      const cite = b.querySelector("cite, figcaption, [class*='author' i]");
      const body = clean((b.innerText || "").replace(cite ? cite.innerText : "", ""));
      add({ kind: "quote", body, cite: cite ? textOf(cite) : null }, b);
    }
    for (const l of q("ul, ol")) {
      if (l.closest("nav")) continue;
      const items = [...l.children].filter((li) => li.tagName === "LI" && shown(li)).map(textOf);
      if (items.length >= 3 && items.every((x) => x.length > 0 && x.length <= 90)) add({ kind: "list", items }, l);
    }
    for (const d of q("details")) {
      add({ kind: "faq", question: textOf(d.querySelector("summary")), answer: clean([...d.children].filter((c) => c.tagName !== "SUMMARY").map((c) => c.textContent).join(" ")) }, d);
    }
    for (const b of q("button, a, [role=button], input[type=submit]")) {
      if (b.closest("[role=tablist], [class*='player' i], video, nav") || b.getAttribute("role") === "switch") continue;
      const t = clean(b.innerText || b.value || "");
      const st = css(b);
      if (!t || t.length > 40) continue;
      const filled = opaque(st.backgroundColor) && st.backgroundColor !== ownBg(b.parentElement || b);
      const bordered = parseFloat(st.borderTopWidth) > 0 && st.borderTopStyle !== "none";
      if (!filled && !bordered) continue;
      add({ kind: "button", title: t, filled, background: st.backgroundColor, color: st.color, radius: parseFloat(st.borderTopLeftRadius) || 0, href: b.getAttribute("href") || null }, b);
    }
    // Cards: rounded boxes with their own fill holding a heading and some words.
    const cards = q("article, li, div").filter((el) => {
      const r = el.getBoundingClientRect();
      const st = css(el);
      if (r.width < 180 || r.height < 110 || r.width > sec.getBoundingClientRect().width * 0.75) return false;
      if (parseFloat(st.borderTopLeftRadius) < 8) return false;
      if (!opaque(st.backgroundColor) && !(parseFloat(st.borderTopWidth) > 0)) return false;
      // Not a wrapper around a number, a player or a quote already found.
      const taken = "[data-7s-k=player], [data-7s-k=quote]";
      if (el.matches(taken) || el.querySelector(taken) || el.closest(taken)) return false;
      const h = el.querySelector("h2, h3, h4, b, strong");
      return !!h && !h.matches("[data-7s-k=stat]") && clean(el.innerText).length > 12;
    });
    for (const c of cards.filter((el) => !cards.some((o) => o !== el && o.contains(el))).slice(0, 6)) {
      const h = c.querySelector("h2, h3, h4, b, strong");
      const rest = clean(c.innerText.replace(h.innerText, ""));
      add({ kind: "card", title: textOf(h), body: rest || null }, c);
    }
    const images = q("img, picture, svg[width], [style*='background-image']")
      .filter((im) => {
        const r = im.getBoundingClientRect();
        return r.width >= 200 && r.height >= 120 && !im.closest("nav");
      })
      .slice(0, 4);
    for (const im of images) add({ kind: "image", alt: clean(im.getAttribute("alt") || ""), src: im.currentSrc || im.getAttribute("src") || null }, im);
    const paragraphs = q("p").map(textOf).filter((t) => t.length >= 30);
    const st = css(sec);
    return {
      n: si + 1,
      tag: sec.tagName.toLowerCase(),
      id: sec.id || null,
      box: box(sec),
      background: opaque(st.backgroundColor) ? st.backgroundColor : ownBg(sec),
      headings,
      paragraphs,
      components,
    };
  });

  // Words, verbatim, in reading order: every text-holding block once.
  const copy = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!clean(n.textContent)) continue;
    let el = n.parentElement;
    while (el && el !== document.body && css(el).display.startsWith("inline") && !["A", "BUTTON", "LABEL"].includes(el.tagName)) el = el.parentElement;
    if (!el || seen.has(el) || !shown(el) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    seen.add(el);
    const t = clean(el.innerText);
    if (!t) continue;
    const sec = el.closest("[data-7s-section]");
    copy.push({ section: sec ? Number(sec.getAttribute("data-7s-section")) : null, tag: el.tagName.toLowerCase(), text: t });
  }

  // Colours by use: backgrounds weighted by area, text by length, buttons as accents.
  const bgs = {};
  const texts = {};
  for (const el of document.querySelectorAll("body *")) {
    if (!shown(el)) continue;
    const st = css(el);
    const r = el.getBoundingClientRect();
    if (opaque(st.backgroundColor)) bgs[st.backgroundColor] = (bgs[st.backgroundColor] || 0) + r.width * r.height;
    const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join("");
    if (own) texts[st.color] = (texts[st.color] || 0) + own.length;
  }
  const bodyBg = [document.body, document.documentElement].map((e) => css(e).backgroundColor).find(opaque) || "rgb(255, 255, 255)";
  const fam = (el) => (el ? { family: css(el).fontFamily.split(",")[0].replace(/["']/g, "").trim(), stack: css(el).fontFamily, weight: css(el).fontWeight, size: css(el).fontSize } : null);
  const fonts = {
    display: fam(document.querySelector("h1") || document.querySelector("h2")),
    heading: fam(document.querySelector("h2") || document.querySelector("h3")),
    body: fam(document.querySelector("p") || document.body),
    button: fam(document.querySelector("button, .btn, a[class*='button' i]")),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replace(/["']/g, "")} ${f.weight} ${f.style}`),
  };
  const meta = {
    title: document.title,
    description: document.querySelector("meta[name=description]")?.content || null,
    ogImage: document.querySelector("meta[property='og:image']")?.content || null,
    lang: document.documentElement.lang || null,
    height: document.documentElement.scrollHeight,
  };
  return { sections, copy, colours: { bodyBg, bgs, texts }, fonts, meta };
};

const data = await page.evaluate(collect, maxSections);

// Screenshots: the whole page, each section, each large picture.
const fullH = Math.min(data.meta.height, 14000);
await page.screenshot({ path: join(pubDir, "full.jpg"), type: "jpeg", quality: 82, clip: { x: 0, y: 0, width, height: fullH }, fullPage: true });
const shot = async (b, file) => {
  const clip = { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(width, b.w), height: Math.min(4000, Math.max(8, b.h)) };
  await page.screenshot({ path: join(pubDir, file), type: "jpeg", quality: 88, clip, fullPage: true });
  return rel(file);
};
let imgN = 0;
for (const s of data.sections) {
  s.shot = await shot(s.box, `section-${String(s.n).padStart(2, "0")}.jpg`);
  for (const c of s.components) if (c.kind === "image") c.shot = await shot(c.box, `img-${String(++imgN).padStart(2, "0")}.jpg`);
}

// Interactive states: each tab, each switch, open answers. The page is put back after each.
const states = [];
let stateN = 0;
if (!opt["no-states"]) {
  const sectionShot = async (sec, what) => {
    const fresh = await page.evaluate((n) => {
      const el = document.querySelector(`[data-7s-section="${n}"]`);
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), text: el.innerText.replace(/\s+/g, " ").trim() };
    }, sec.n);
    const file = `state-${String(++stateN).padStart(2, "0")}.jpg`;
    await shot(fresh, file);
    states.push({ section: sec.n, ...what, shot: rel(file), text: fresh.text });
  };
  for (const s of data.sections) {
    for (const c of s.components) {
      try {
        const loc = page.locator(`[data-7s-c="${c.id}"]`);
        if (c.kind === "tabs") {
          const tabs = loc.locator("[role=tab]");
          const n = Math.min(await tabs.count(), 4);
          for (let i = 0; i < n; i++) {
            if (i === c.selected) continue;
            await tabs.nth(i).click({ timeout: 3000 });
            await page.waitForTimeout(450);
            await sectionShot(s, { component: c.id, action: `tab "${c.items[i]}"` });
          }
          await tabs.nth(c.selected).click({ timeout: 3000 }).catch(() => {});
        } else if (c.kind === "toggle") {
          const sw = loc.locator("[role=switch], input[type=checkbox]").first();
          const target = (await sw.count()) ? sw : loc;
          await target.click({ timeout: 3000 });
          await page.waitForTimeout(450);
          await sectionShot(s, { component: c.id, action: `switch "${c.label}" ${c.on ? "off" : "on"}` });
          await target.click({ timeout: 3000 }).catch(() => {});
        } else if (c.kind === "faq" && states.filter((x) => x.action.startsWith("open")).length < 3) {
          await loc.locator("summary").click({ timeout: 3000 });
          await page.waitForTimeout(350);
          await sectionShot(s, { component: c.id, action: `open "${c.question}"` });
          await loc.locator("summary").click({ timeout: 3000 }).catch(() => {});
        }
      } catch (e) {
        console.log(`  (couldn't try ${c.kind} ${c.id}: ${String(e.message).split("\n")[0]})`);
      }
    }
  }
}
await browser.close();

// Colours: the page's own use of colour first, then the picture's pixels as a check.
const parse = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const toHex = (c) => hex(parse(c));
const lum = ([r, g, b]) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const sat = ([r, g, b]) => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ranked = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([c, w]) => ({ rgb: parse(c), w }));

const pixels = (() => {
  const tmp = join("production", "tmp", `site-${job}.rgb`);
  mkdirSync(join("production", "tmp"), { recursive: true });
  ff(["-i", join(pubDir, "full.jpg"), "-vf", "scale=96:-2:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", tmp]);
  const buf = readFileSync(tmp);
  rmSync(tmp, { force: true });
  const buckets = new Map();
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const k = [buf[i] >> 3, buf[i + 1] >> 3, buf[i + 2] >> 3].join(",");
    const e = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += buf[i];
    e.g += buf[i + 1];
    e.b += buf[i + 2];
    buckets.set(k, e);
  }
  const total = buf.length / 3;
  const merged = [];
  for (const e of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb = [e.r / e.n, e.g / e.n, e.b / e.n];
    const near = merged.find((m) => dist(m.rgb, rgb) < 28);
    if (near) near.n += e.n;
    else merged.push({ rgb, n: e.n });
  }
  return merged.slice(0, 8).map((m) => ({ hex: hex(m.rgb), share: Number((m.n / total).toFixed(3)), rgb: m.rgb }));
})();

const bg = parse(data.colours.bodyBg);
const bgList = ranked(data.colours.bgs);
const textList = ranked(data.colours.texts);
const surface = bgList.find((c) => dist(c.rgb, bg) > 10 && contrast(c.rgb, bg) < 2.2)?.rgb ?? bgList.find((c) => dist(c.rgb, bg) > 10)?.rgb ?? bg;
const text = textList.find((c) => contrast(c.rgb, bg) >= 4.5)?.rgb ?? (lum(bg) > 0.4 ? [17, 17, 17] : [244, 244, 246]);
const muted = textList.find((c) => dist(c.rgb, text) > 30 && contrast(c.rgb, bg) >= 2.5 && sat(c.rgb) < 0.35)?.rgb ?? text;
const buttons = data.sections.flatMap((s) => s.components).filter((c) => c.kind === "button" && c.filled);
const accentBtn = buttons.map((b) => ({ b, rgb: parse(b.background) })).sort((x, y) => sat(y.rgb) - sat(x.rgb))[0];
const accent = accentBtn && sat(accentBtn.rgb) > 0.2 ? accentBtn.rgb : (textList.find((c) => sat(c.rgb) > 0.35)?.rgb ?? pixels.find((p) => sat(p.rgb) > 0.35)?.rgb ?? [232, 180, 74]);
const onAccent = accentBtn ? parse(accentBtn.b.color) : contrast(accent, [255, 255, 255]) >= 3 ? [255, 255, 255] : [17, 17, 17];
const palette = {
  background: hex(bg),
  surface: hex(surface),
  text: hex(text),
  muted: hex(muted),
  accent: hex(accent),
  onAccent: hex(onAccent),
  dark: lum(bg) < 0.2,
  backgrounds: bgList.slice(0, 6).map((c) => hex(c.rgb)),
  textColours: textList.slice(0, 5).map((c) => hex(c.rgb)),
  pixels: pixels.map(({ hex: h, share }) => ({ hex: h, share })),
};

// Placeholder copy: flagged so plans leave it out.
const PLACEHOLDER = [
  [/lorem ipsum|dolor sit amet/i, "lorem ipsum"],
  [/^[$€£]\s?0(\.00)?$/, "a zero price"],
  [/\bsample\b|\bplaceholder\b|\bdummy\b/i, "sample/placeholder wording"],
  [/\b(john|jane) doe\b/i, "a stand-in name"],
  [/example\.(com|org)|your (name|company|email)/i, "stand-in contact"],
  [/\bTBD\b|\bTODO\b|coming soon|\{\{.*\}\}|\[.*insert.*\]/i, "unfinished copy"],
  [/^(0|00|000|0%)$/, "a zero figure"],
];
const flags = [];
const flagText = (t, where) => {
  for (const [re, why] of PLACEHOLDER) if (re.test(t)) flags.push({ where, text: t.length > 90 ? `${t.slice(0, 90)}…` : t, why });
};
for (const s of data.sections) {
  for (const p of s.paragraphs) flagText(p, `section ${s.n}`);
  for (const c of s.components) {
    for (const t of [c.title, c.body, c.value, c.label, ...(c.items || [])].filter(Boolean)) {
      const before = flags.length;
      flagText(t, `section ${s.n}, ${c.kind} ${c.id}`);
      if (flags.length > before) c.placeholder = true;
    }
  }
}
// Section kinds, from what they hold.
for (const s of data.sections) {
  const kinds = s.components.map((c) => c.kind);
  const words = `${s.headings.map((h) => h.text).join(" ")} ${s.id || ""}`.toLowerCase();
  s.kind =
    s.tag === "nav" || (s.n === 1 && s.box.h < 140) ? "nav"
    : s.tag === "footer" ? (kinds.includes("button") ? "cta" : "footer")
    : s.headings.some((h) => h.level === 1) ? "hero"
    : /pric|plan/.test(words) || s.components.some((c) => /^[$€£]/.test(c.value || "")) ? "pricing"
    : kinds.includes("quote") || /testimon|review|love/.test(words) ? "testimonials"
    : kinds.includes("faq") || /faq|question/.test(words) ? "faq"
    : kinds.filter((k) => k === "stat").length >= 2 ? "stats"
    : kinds.includes("player") ? "demo"
    : kinds.includes("list") || kinds.filter((k) => k === "card").length >= 2 || kinds.includes("tabs") ? "features"
    : "content";
}

const inventory = {
  url: isFile ? target : url,
  capturedAt: new Date().toISOString(),
  width,
  meta: data.meta,
  palette,
  fonts: data.fonts,
  sections: data.sections,
  states,
  placeholders: flags,
};
writeJson(join(jobDir, "inventory.json"), inventory);
writeJson(join(jobDir, "copy.json"), { url: inventory.url, words: data.copy });

const md = `# Site inventory: ${data.meta.title || inventory.url}

Captured ${inventory.capturedAt.slice(0, 16).replace("T", " ")} UTC from \`${inventory.url}\` at ${width} px. Pictures in \`public/jobs/${job}/site/\`.
Everything here belongs to the site's owner; use it only for their own video.

## Sections

| # | Kind | Heading | Components | Picture |
|---|---|---|---|---|
${data.sections.map((s) => `| ${s.n} | ${s.kind} | ${s.headings[0]?.text ?? "—"} | ${[...new Set(s.components.map((c) => c.kind))].map((k) => `${k}×${s.components.filter((c) => c.kind === k).length}`).join(", ") || "—"} | \`${s.shot}\` |`).join("\n")}

## Components (exact words)

${data.sections.map((s) => s.components.filter((c) => c.kind !== "image").map((c) => `- **${c.id} ${c.kind}**${c.placeholder ? " ⚠ placeholder" : ""}: ${[c.title, c.value, c.label, c.body, c.question, c.answer, c.cite, c.items?.join(" · ")].filter(Boolean).map((t) => `"${t}"`).join(", ")}`).join("\n")).filter(Boolean).join("\n")}

## Interactive states

${states.length ? states.map((x) => `- ${x.action} (section ${x.section}): \`${x.shot}\``).join("\n") : "None tried."}

## Palette

| Role | Colour |
|---|---|
${["background", "surface", "text", "muted", "accent", "onAccent"].map((k) => `| ${k} | \`${palette[k]}\` |`).join("\n")}

Most-used in the picture: ${pixels.map((p) => `\`${p.hex}\` ${Math.round(p.share * 100)}%`).join(", ")}.

## Fonts

- Display: ${data.fonts.display ? `${data.fonts.display.family} ${data.fonts.display.weight} (${data.fonts.display.size})` : "—"}
- Body: ${data.fonts.body ? `${data.fonts.body.family} ${data.fonts.body.weight}` : "—"}
- Loaded web fonts: ${data.fonts.loaded.length ? [...new Set(data.fonts.loaded)].join(", ") : "none (system fonts)"}

Fonts aren't downloaded: check the licence, then add the files to \`public/jobs/${job}/brand/\`, or use the closest bundled font.

## Placeholder copy (left out of plans)

${flags.length ? flags.map((f) => `- ${f.where}: "${f.text}" (${f.why})`).join("\n") : "None found."}
`;
writeFileSync(join(jobDir, "INVENTORY.md"), md);

const count = data.sections.reduce((t, s) => t + s.components.length, 0);
console.log(`✔ ${data.sections.length} sections, ${count} components, ${states.length} states, ${data.copy.length} blocks of words`);
console.log(`  palette: bg ${palette.background} · surface ${palette.surface} · text ${palette.text} · accent ${palette.accent}`);
console.log(`  fonts: ${data.fonts.display?.family ?? "?"} / ${data.fonts.body?.family ?? "?"}`);
if (flags.length) console.log(`  ⚠ ${flags.length} placeholder${flags.length > 1 ? "s" : ""} flagged (left out of plans)`);
console.log(`  ${join(jobDir, "INVENTORY.md")}\n  next: npm run sitemorph -- plan ${job}`);
