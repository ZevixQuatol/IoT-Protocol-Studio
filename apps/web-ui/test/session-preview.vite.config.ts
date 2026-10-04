import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../../out/qa/p15-preview",
    emptyOutDir: false,
    rolldownOptions: { input: "test/session-preview.html" },
  },
});
