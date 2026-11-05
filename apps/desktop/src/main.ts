// The one entry point. Every Peekin window loads index.html; its Tauri label
// says which window it is ("deck", "manager", "capture", "note-…"). Here we
// dress the page for that window, then load only that window's code (each is
// its own chunk, so no window parses another's code).
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Shell {
  /** classes on <html> / <body> / the root element */
  html?: string;
  body?: string;
  root: string;
  /** id of the root element the window's code mounts into */
  id: string;
  attrs?: Record<string, string>;
  load: () => Promise<unknown>;
}

const SHELLS: Record<string, Shell> = {
  // Deck geometry tokens live on <html>: deck/main.ts reads them from
  // document.documentElement (cssNum). ANIM_MS there = --deck-anim.
  deck: {
    html: "bg-transparent [--deck-tab-w:30px] [--deck-overhang:12px] [--deck-pill-w:7px] [--deck-pill-h:24px] [--deck-pill-gap:8px] [--deck-pill-inset:10px] [--deck-glass-w:25px] [--deck-peek-w:280px] [--deck-peek-min-h:190px] [--deck-peek-max-h:300px] [--deck-gutter:10px] [--deck-anim:380ms] [--deck-ease:cubic-bezier(0.22,1,0.36,1)] motion-reduce:[--deck-anim:1ms] [--glass-w:var(--deck-glass-w)] [--pill-x:calc(var(--deck-pill-inset)_+_var(--deck-pill-w)_/_2)]",
    body: "bg-transparent",
    root: "group/deck fixed inset-0",
    id: "deck",
    attrs: { "data-edge": "right" },
    load: () => import("./windows/deck/main"),
  },
  manager: {
    body: "bg-bg",
    root: "flex h-screen",
    id: "app",
    load: () => import("./windows/manager/main"),
  },
  capture: {
    root: "fixed inset-0 p-3",
    id: "app",
    load: () => import("./windows/capture/main"),
  },
  note: {
    root: "fixed inset-0 p-2",
    id: "app",
    load: () => import("./windows/note/main"),
  },
};

const label = getCurrentWindow().label;
const shell = SHELLS[label.startsWith("note-") ? "note" : label];
if (shell) {
  if (shell.html) document.documentElement.className = shell.html;
  if (shell.body) document.body.className = shell.body;
  const root = document.getElementById("app")!;
  root.id = shell.id;
  root.className = shell.root;
  for (const [k, v] of Object.entries(shell.attrs ?? {})) root.setAttribute(k, v);
  void shell.load();
}
