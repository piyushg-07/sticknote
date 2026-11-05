import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

// One HTML entry per window type. Shared code (tokens, api, editor) is split
// into common chunks so every window only parses what it actually needs.
export default defineConfig({
  clearScreen: false,
  resolve: { alias: { "@": resolve(root, "src") } },
  server: { port: 1430, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome120",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        manager: resolve(root, "manager.html"),
        note: resolve(root, "note.html"),
        deck: resolve(root, "deck.html"),
        capture: resolve(root, "capture.html"),
      },
    },
  },
});
