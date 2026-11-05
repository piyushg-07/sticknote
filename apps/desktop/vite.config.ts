import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

// One page (index.html) for every window; src/main.ts loads each window's
// code as its own chunk, so a window only parses what it needs.
export default defineConfig({
  clearScreen: false,
  plugins: [tailwindcss()],
  resolve: { alias: { "@": resolve(root, "src") } },
  server: { port: 1430, strictPort: true, host: "127.0.0.1" },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome120",
    minify: "esbuild",
    cssMinify: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
});
