import { defineConfig } from "vite";

// base "./": the built viewer works from any sub-path (e.g. /v2/ next to v1)
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
  server: { host: true },
});
