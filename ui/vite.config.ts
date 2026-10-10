import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

// One self-contained IIFE file, loaded as a content script by extension/manifest.json.
// No code splitting and no emitted CSS file: styles are imported with ?inline and injected
// into Lantern's shadow root, so page CSS and our CSS can never touch each other (D10).
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: fileURLToPath(new URL("../extension/dist", import.meta.url)),
    emptyOutDir: true,
    cssCodeSplit: false,
    target: "chrome120",
    lib: {
      entry: `${here}src/content.tsx`,
      formats: ["iife"],
      name: "LanternUI",
      fileName: () => "content.js",
    },
  },
});
