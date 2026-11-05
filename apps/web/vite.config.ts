import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Single-page marketing site. Port 1431 so it runs beside the desktop app's
// dev server (1430).
export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 1431, host: "127.0.0.1" },
  build: {
    target: "es2020",
    cssMinify: true,
    sourcemap: false,
  },
});
