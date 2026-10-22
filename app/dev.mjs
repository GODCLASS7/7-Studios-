#!/usr/bin/env node
// Work on the 7 Studios interface with live reload: the app server on :7777 (API, files)
// and Vite on :5177 (the interface, reloading as you edit). Open http://127.0.0.1:5177.
import { spawn } from "node:child_process";

const kids = [
  spawn(process.execPath, ["app/server/index.mjs", "--no-open", "--no-build"], { stdio: "inherit" }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "app/ui/vite.config.mjs"], { stdio: "inherit" }),
];
const stop = () => {
  for (const k of kids) k.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const k of kids) k.on("exit", stop);
