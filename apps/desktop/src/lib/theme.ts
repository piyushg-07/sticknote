// Applies the light/dark theme. "auto" follows Windows through the
// prefers-color-scheme media query — event driven, no polling.
import type { Theme } from "./types";

const media = window.matchMedia("(prefers-color-scheme: dark)");
let current: Theme = "auto";

function resolve(): "light" | "dark" {
  if (current === "auto") return media.matches ? "dark" : "light";
  return current;
}

function apply() {
  document.documentElement.dataset.theme = resolve();
}

export function setTheme(theme: Theme) {
  current = theme;
  apply();
}

media.addEventListener("change", () => {
  if (current === "auto") apply();
});

apply();
