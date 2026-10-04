import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Isolate visual QA from concurrent development servers and hot reloads.
export default defineConfig({
  base: "./",
  plugins: [react()],
  cacheDir: "../../output/p14/vite-cache",
  build: {
    outDir: "../../output/p14/preview",
    emptyOutDir: false,
    rollupOptions: { input: "test/settings-preview.html" },
  },
});
