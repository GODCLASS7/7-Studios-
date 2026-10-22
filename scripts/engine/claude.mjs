// The Claude engine: a request Claude runs in a chat through the Higgsfield connector
// (Seedance, Kling, Veo, Cinema Studio, Nano Banana…). The app can't spend Higgsfield
// credits itself; it leaves the request in production/claude-requests.json. In Claude
// Code, say "run my 7 Studios requests": Claude checks the balance, quotes the credits,
// waits for your yes, generates, and brings each result back into the gallery with
// `npm run gen -- import <file> --request=<id> --model=<model> --credits=<n>`.

import { join } from "node:path";
import { readJson, writeJson } from "../lib/media.mjs";
import { newId, REQUESTS_PATH } from "./index.mjs";

export const listRequests = () => readJson(REQUESTS_PATH, { requests: [] }).requests;
export const updateRequest = (id, patch) => {
  const d = readJson(REQUESTS_PATH, { requests: [] });
  const r = d.requests.find((x) => x.id === id);
  if (!r) throw new Error(`No request ${id}`);
  Object.assign(r, patch);
  writeJson(REQUESTS_PATH, d);
  return r;
};

export const run = async (job) => {
  const d = readJson(REQUESTS_PATH, { requests: [] });
  const rel = (p) => (p ? p.replace(/^public\//, "") : null);
  const req = {
    id: newId("r"),
    createdAt: new Date().toISOString(),
    status: "waiting",
    kind: job.kind,
    prompt: job.prompt,
    userPrompt: job.userPrompt,
    negative: job.negative,
    preset: job.preset,
    character: job.character,
    aspect: job.aspect,
    seconds: job.seconds,
    quality: job.quality,
    count: job.count,
    image: rel(job.image),
    endImage: rel(job.endImage),
    wanted: job.model || "any",
  };
  d.requests.unshift(req);
  writeJson(REQUESTS_PATH, d);
  return [{ pending: true, requestId: req.id, note: `Waiting for Claude: in Claude Code, say "run my 7 Studios requests" (${join("production", "claude-requests.json")})` }];
};
