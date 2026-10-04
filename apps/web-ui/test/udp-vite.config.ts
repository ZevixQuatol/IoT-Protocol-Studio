import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../out/qa/p10/browser-dist",
    emptyOutDir: false,
    rollupOptions: { input: "test/udp-preview.html" },
  },
  preview: { host: "127.0.0.1", port: 5177, strictPort: true },
});
