#!/usr/bin/env node
// The 7 Studios app, end to end, through its own interface in a real browser:
// every studio opens without errors; Image and Video make demo items; Motion renders a
// template; Web captures the test site, plans, renders and passes its check; Edit cuts
// the test take from its transcript; Publish queues a post and approves it (on a
// scratch queue); and the server refuses other hosts, other pages, unknown tasks and
// paths outside the studio. Cleans up what it made.
//
//   node scripts/test/app.mjs [--keep] [--shots]     (npm test -- --only=app)
//
// Prints one "RESULT <pass|fail|skip> <name> <note>" line per check; exits 1 on a fail.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, request } from "node:http";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "../lib/media.mjs";
import { launch } from "../lib/browser.mjs";

const { opt } = parseArgs(process.argv.slice(2));
const PORT = 7791;
const SITE_PORT = 7792;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = join("production", "tmp", "test", "app");
mkdirSync(TMP, { recursive: true });
const QUEUE = join(TMP, "posts.json");
rmSync(QUEUE, { force: true });
const results = [];
const record = (status, name, note = "") => {
  results.push({ status, name, note });
  console.log(`RESULT\t${status}\t${name}\t${note}`);
};
const check = (ok, name, note) => record(ok ? "pass" : "fail", name, note);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 500) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(step);
  }
  return null;
};
const api = async (path, init) => {
  const r = await fetch(`${BASE}${path}`, init);
  return { status: r.status, body: await r.json().catch(() => null) };
};

// The test site, served over http like a real one.
const site = createServer((req, res) => {
  const root = resolve("scripts/test/assets/site");
  const p = resolve(root, `.${decodeURIComponent(new URL(req.url, "http://x").pathname)}`);
  if (!p.startsWith(root) || !existsSync(p) || !statSync(p).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": { ".html": "text/html", ".svg": "image/svg+xml" }[extname(p)] || "application/octet-stream" });
  createReadStream(p).pipe(res);
}).listen(SITE_PORT, "127.0.0.1");

// The edit test reuses the edit-test take and transcript in a job of its own.
if (!existsSync("public/jobs/edit-test/footage/take-a.mp4")) spawnSync("node", ["scripts/test/footage-fixture.mjs", "edit-test", "--vertical"], { stdio: "ignore" });
rmSync("jobs/app-test", { recursive: true, force: true });
rmSync("out/app-test", { recursive: true, force: true });
mkdirSync("jobs/app-test", { recursive: true });
for (const f of ["takes.json", "job.json"]) if (existsSync(`jobs/edit-test/${f}`)) copyFileSync(`jobs/edit-test/${f}`, `jobs/app-test/${f}`);
if (existsSync("jobs/edit-test/transcripts")) cpSync("jobs/edit-test/transcripts", "jobs/app-test/transcripts", { recursive: true });

const server = spawn(process.execPath, ["app/server/index.mjs", "--no-open", `--port=${PORT}`], { env: { ...process.env, POSTS_QUEUE: QUEUE }, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const up = await until(async () => (await fetch(`${BASE}/api/status`)).ok, 240000);
if (!up) {
  record("fail", "app starts", serverLog.slice(-400));
  process.exit(1);
}
record("pass", "app starts", "builds its interface and answers on 127.0.0.1");

const before = new Set((await api("/api/gallery")).body.items.map((i) => i.id));
const made = () => api("/api/gallery").then((r) => r.body.items.filter((i) => !before.has(i.id)));
const runsDone = (task, since) =>
  until(async () => {
    const runs = (await api("/api/runs")).body;
    const r = runs.find((x) => x.task === task && x.createdAt >= since && ["done", "failed", "cancelled"].includes(x.status));
    return r || null;
  }, 600000, 1000);

// ── safety ──────────────────────────────────────────────────────────────────
{
  // fetch() won't send a made-up Host header, so ask with node:http (as a DNS-rebinding page would arrive).
  const other = await new Promise((ok) => request({ host: "127.0.0.1", port: PORT, path: "/api/status", headers: { host: `evil.example:${PORT}` } }, (r) => (r.resume(), ok(r.statusCode))).on("error", () => ok(0)).end());
  check(other === 403, "refuses other hostnames", `got ${other}`);
  const noHeader = await api("/api/runs", { method: "POST", body: JSON.stringify({ task: "doctor" }) });
  check(noHeader.status === 403, "refuses changes from other pages", `got ${noHeader.status}`);
  const otherOrigin = await api("/api/runs", { method: "POST", headers: { "x-7s": "1", origin: "https://evil.example" }, body: JSON.stringify({ task: "doctor" }) });
  check(otherOrigin.status === 403, "refuses another site's origin", `got ${otherOrigin.status}`);
  const H = { "x-7s": "1", "content-type": "application/json" };
  const unknown = await api("/api/runs", { method: "POST", headers: H, body: JSON.stringify({ task: "rm", args: {} }) });
  check(unknown.status === 400, "refuses unknown tasks", unknown.body?.error);
  const comp = await api("/api/runs", { method: "POST", headers: H, body: JSON.stringify({ task: "render", args: { comp: "Nope-9x16" } }) });
  check(comp.status === 400, "refuses unknown compositions", comp.body?.error);
  const fileUrl = await api("/api/runs", { method: "POST", headers: H, body: JSON.stringify({ task: "site-capture", args: { url: "file:///etc/passwd", job: "x" } }) });
  check(fileUrl.status === 400, "site capture takes web addresses only", fileUrl.body?.error);
  const outside = await api("/api/runs", { method: "POST", headers: H, body: JSON.stringify({ task: "loopcheck", args: { file: "../../etc/passwd" } }) });
  check(outside.status === 400, "refuses files outside public/ and out/", outside.body?.error);
  const trav = await fetch(`${BASE}/static/..%2f..%2fpackage.json`);
  check(trav.status === 403 || trav.status === 404, "no path tricks in /static", `got ${trav.status}`);
  const keys = (await api("/api/keys")).body;
  check(Object.values(keys).every((v) => typeof v === "boolean"), "keys are reported as set or not, never shown", JSON.stringify(keys));
  const paid = await api("/api/generate", { method: "POST", headers: H, body: JSON.stringify({ kind: "image", prompt: "x", engine: "premium" }) });
  check(paid.status === 400, "premium needs a confirmed cost", paid.body?.error);
  const approve = await api("/api/runs", { method: "POST", headers: H, body: JSON.stringify({ task: "posts-approve", args: { id: "p1" } }) });
  check(approve.status === 400, "approving a post needs the confirmation", approve.body?.error);
}

// ── the interface ───────────────────────────────────────────────────────────
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
const shot = (name) => (opt.shots ? page.screenshot({ path: join(TMP, `${name}.png`) }) : null);
const goTo = async (route) => {
  await page.goto(`${BASE}/#/${route}`);
  await page.waitForTimeout(900);
};

try {
  for (const r of ["home", "image", "video", "edit", "motion", "carousel", "web", "publish", "library", "settings"]) {
    const n = errors.length;
    await goTo(r);
    const h1 = await page.locator("h1").first().textContent().catch(() => "");
    check(errors.length === n && !!h1, `opens ${r}`, errors.slice(n).join(" | ") || h1);
    await shot(`open-${r}`);
  }

  // Image: a demo generation through the prompt box.
  await goTo("image");
  await page.locator("select.select").first().selectOption("demo");
  await page.locator(".prompt textarea").fill("A gold seven on black, studio light");
  await page.getByRole("button", { name: /Generate/ }).click();
  const img = await until(async () => (await made()).find((i) => i.kind === "image"), 60000);
  check(!!img, "Image studio makes an image", img ? `${img.width}×${img.height} ${img.engine}` : "nothing new in the library");
  await page.waitForTimeout(800);
  await shot("image-made");

  // Video: animate it.
  if (img) {
    await goTo(`video?image=${img.id}`);
    await page.locator("select.select").first().selectOption("demo");
    await page.locator(".prompt textarea").fill("Slow push in");
    await page.getByRole("button", { name: /Generate/ }).click();
    const vid = await until(async () => (await made()).find((i) => i.kind === "video"), 90000);
    check(!!vid, "Video studio animates it", vid ? `${vid.seconds} s ${vid.width}×${vid.height}` : "no clip");
    await shot("video-made");
  }

  // Motion: the live preview plays, and a template renders.
  await goTo("motion");
  await page.getByRole("button", { name: "Terminal" }).click();
  const player = await until(async () => (await page.locator(".player-frame .__remotion-player, .player-frame [class*='remotion']").count()) > 0 || (await page.locator(".player-frame canvas, .player-frame div div div").count()) > 3, 15000);
  check(!!player, "Motion previews the template live");
  await page.locator(".panel select.select").last().selectOption("draft");
  const t0 = new Date().toISOString();
  await page.getByRole("button", { name: /Render Terminal/ }).click();
  const mr = await runsDone("render", t0);
  check(mr?.status === "done" && mr.outputs.length && existsSync(mr.outputs[0]), "Motion renders it", mr ? `${mr.status} ${mr.outputs[0] || mr.log.slice(-1)[0]}` : "timed out");
  await shot("motion-rendered");

  // Web: capture the test site, plan, render, check.
  await goTo("web");
  await page.locator(".prompt input").fill(`http://127.0.0.1:${SITE_PORT}/index.html`);
  const t1 = new Date().toISOString();
  await page.getByRole("button", { name: /Capture/ }).click();
  const cap = await runsDone("site-capture", t1);
  check(cap?.status === "done", "Web captures the site", cap?.log.find((l) => l.startsWith("✔")) || cap?.log.slice(-1)[0]);
  const job = "127-0-0";
  await page.waitForTimeout(1500);
  const strip = await page.locator(".strip img").count();
  check(strip >= 5, "shows each section", `${strip} sections`);
  const t2 = new Date().toISOString();
  await page.getByRole("button", { name: /Plan it/ }).click();
  const plan = await runsDone("sitemorph-plan", t2);
  check(plan?.status === "done", "plans the SiteMorph", plan?.log.find((l) => / states at /.test(l)) || plan?.log.slice(-1)[0]);
  await page.waitForTimeout(1500);
  const rows = await page.locator(".state-row").count();
  check(rows >= 5, "lists the states", `${rows} states`);
  await shot("web-planned");
  const t3 = new Date().toISOString();
  await page.getByRole("button", { name: /Render 1x1 review/ }).click();
  const rr = await runsDone("sitemorph-render", t3);
  const ck = rr?.status === "done" ? await runsDone("sitemorph-check", t3) : null;
  check(ck?.status === "done", "renders and passes the beat and loop check", ck ? ck.log.filter((l) => /PASS|FAIL/.test(l)).join(" · ") : rr?.log.slice(-2).join(" "));
  await page.waitForTimeout(1200);
  await shot("web-checked");
  rmSync(`jobs/${job}`, { recursive: true, force: true });
  rmSync(`public/jobs/${job}`, { recursive: true, force: true });
  rmSync(`out/${job}`, { recursive: true, force: true });

  // Edit: cut the test take from its transcript.
  if (existsSync("jobs/app-test/takes.json")) {
    await goTo("edit?job=app-test");
    await page.locator("select.select").first().selectOption("app-test");
    await page.waitForTimeout(1200);
    const phrases = page.locator(".phrase");
    const n = await phrases.count();
    for (let i = 0; i < Math.min(3, n); i++) await phrases.nth(i).click();
    const t4 = new Date().toISOString();
    await page.getByRole("button", { name: /Make the review cut/ }).click();
    const er = await runsDone("render-edit", t4);
    check(er?.status === "done" && existsSync(er.outputs[0] || ""), "Edit cuts from the transcript and renders", er ? er.outputs[0] || er.log.slice(-1)[0] : `${n} phrases; no render`);
    await page.waitForTimeout(1000);
    await shot("edit-cut");
    // Publish: queue that cut and approve it (scratch queue).
    if (er?.outputs[0]) {
      await goTo("publish");
      await page.getByRole("button", { name: /Post queue/ }).click();
      await page.getByRole("button", { name: /Queue a post/ }).click();
      await page.locator(".modal select.select").selectOption(er.outputs[0]);
      await page.locator(".modal input.input").first().fill("@seven.test");
      await page.locator(".modal textarea").fill("Test caption: not posted anywhere.");
      await page.locator(".modal").getByRole("radio", { name: "No" }).last().click();
      await page.getByRole("button", { name: /Queue as draft/ }).click();
      const queued = await until(async () => JSON.parse(readFileSync(QUEUE, "utf8")).posts.find((p) => p.status === "draft"), 15000);
      check(!!queued, "Publish queues a draft post", queued ? `${queued.id} ${queued.platform} ${queued.account}` : "nothing queued");
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: /Review & approve/ }).first().click();
      const approveBtn = page.getByRole("button", { name: "Approve this post" });
      check(await approveBtn.isDisabled(), "approval waits for the 'I've read this post' tick");
      await page.locator(".modal input[type=checkbox]").check();
      await approveBtn.click();
      const ok = await until(async () => JSON.parse(readFileSync(QUEUE, "utf8")).posts.find((p) => p.status === "approved"), 15000);
      check(!!ok, "and records the approval", ok ? `"${ok.approvedBy}"` : "not approved");
      await shot("publish-approved");
    }
  } else record("skip", "Edit cuts from the transcript", "the edit-test transcript isn't there (npm test builds it)");

  // Library shows what was made.
  await goTo("library");
  const tiles = await page.locator(".tile").count();
  check(tiles >= 1, "Library shows the made items", `${tiles} tiles`);
  check(!errors.length, "no errors in the page", errors.slice(0, 3).join(" | "));
} catch (e) {
  record("fail", "the run", String(e.message).split("\n")[0]);
  await shot("crash");
} finally {
  await browser.close();
  if (!opt.keep) {
    for (const it of await made()) await api(`/api/gallery/${it.id}`, { method: "DELETE", headers: { "x-7s": "1" } });
    rmSync("jobs/app-test", { recursive: true, force: true });
    rmSync("out/app-test", { recursive: true, force: true });
    for (const r of (await api("/api/runs")).body.filter((x) => x.task === "render" && x.args?.comp?.startsWith("Terminal"))) for (const o of r.outputs) rmSync(o, { force: true });
    rmSync("production/app/props", { recursive: true, force: true });
  }
  server.kill("SIGTERM");
  site.close();
}
const failed = results.filter((r) => r.status === "fail").length;
console.log(`\n${results.filter((r) => r.status === "pass").length} passed, ${failed} failed, ${results.filter((r) => r.status === "skip").length} skipped`);
process.exit(failed ? 1 : 0);
