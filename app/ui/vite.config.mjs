// The 7 Studios interface. `npm run app` builds it into app/ui/dist and serves it;
// `npm run app:dev` runs it with live reload on :5177, talking to the app server on :7777.
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const api = "http://127.0.0.1:7777";

export default defineConfig({
  root,
  base: "/",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000, sourcemap: false },
  server: {
    host: "127.0.0.1",
    port: 5177,
    strictPort: true,
    // The studio's templates live in ../../src; let the dev server read them.
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    proxy: {
      "/api": { target: api, changeOrigin: true, headers: { origin: api } },
      "/static": { target: api, changeOrigin: true },
      "/out": { target: api, changeOrigin: true },
    },
  },
});
