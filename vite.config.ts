import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static single-page site: deploys to any static host. Data and the simulator are copied in by scripts/sync-data.mjs.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { chunkSizeWarningLimit: 1500 },
});
