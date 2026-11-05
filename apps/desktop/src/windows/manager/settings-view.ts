// Settings page.
import { api, errorText } from "../../lib/api";
import { h } from "../../lib/dom";
import { segmented, toggle } from "../../components/controls";
import { toast } from "../../components/toast";
import { setTheme } from "../../lib/theme";
import type { Settings, SettingsPatch } from "../../lib/types";
import { state, subscribe, update } from "./state";

const GLOBAL_KEYS: [string, string][] = [
  ["Ctrl + Alt + N", "Quick note (Enter saves, Ctrl+Enter opens it)"],
  ["Ctrl + Alt + A", "All notes"],
  ["Ctrl + Alt + L", "Archive"],
];
const WINDOW_KEYS: [string, string][] = [
  ["Ctrl + N", "New note"],
  ["Ctrl + F", "Search"],
  ["Ctrl + E", "Open the selected note in its own window"],
  ["Ctrl + \\", "Collapse or expand the sidebar"],
];
const NOTE_KEYS: [string, string][] = [
  ["Esc", "Close a note window"],
  ["Ctrl + .", "Cycle a note's colour"],
  ["Ctrl + Backspace", "Delete a note, with ten seconds to undo"],
  ["Ctrl + Z", "Undo a delete (while the toast is showing)"],
  ["Ctrl + B / I / U", "Bold, italic, underline"],
  ["Ctrl + Shift + L", "Task list"],
  ["Ctrl + Shift + 8", "Bullets"],
  ["Ctrl + Shift + 7", "Numbered list"],
  ["Ctrl + K", "Add or edit a link (Ctrl+click opens it)"],
  ["- , 1. , [ ]  + Space", "Start a list as you type (Backspace undoes)"],
];

async function patch(p: SettingsPatch) {
  try {
    const s = await api.updateSettings(p);
    update({ settings: s });
  } catch (e) {
    toast(errorText(e), { error: true });
    update({ settings: await api.getSettings() });
  }
}

function row(title: string, desc: string | null, control: Node | null) {
  return h(
    "div",
    { class: "set-row" },
    h("div", { class: "set-text" }, h("div", { class: "set-title" }, title), desc ? h("div", { class: "set-desc" }, desc) : null),
    control,
  );
}

function keys(list: [string, string][]) {
  return h("div", { class: "keys" }, ...list.map(([k, d]) => h("div", { class: "key-row" }, h("kbd", null, k), h("span", null, d))));
}

/** Shortcut reference, folded away until asked for. */
function shortcutsCard(): HTMLElement {
  const body = h("div", { class: "keys-body", hidden: true },
    h("div", { class: "keys-heading t-caps" }, "Anywhere"),
    keys(GLOBAL_KEYS),
    h("div", { class: "keys-heading t-caps" }, "In All notes"),
    keys(WINDOW_KEYS),
    h("div", { class: "keys-heading t-caps" }, "In a note"),
    keys(NOTE_KEYS),
  );
  const btn = h("button", { class: "btn btn-sm", "aria-expanded": "false" }, "Show");
  btn.addEventListener("click", () => {
    const open = body.hidden;
    body.hidden = !open;
    btn.textContent = open ? "Hide" : "Show";
    btn.setAttribute("aria-expanded", String(open));
  });
  return h("div", { class: "set-card" }, row("Keyboard shortcuts", null, btn), body);
}

function build(s: Settings): HTMLElement[] {
  return [
    h("h1", { class: "page-title" }, "Settings"),

    h("div", { class: "set-card" },
      row("Theme", "Follows Windows unless you choose otherwise.",
        segmented("Theme", [
          { value: "auto", label: "Auto" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ], s.theme, (theme) => {
          setTheme(theme);
          void patch({ theme });
        })),
    ),

    h("div", { class: "set-card" },
      row("Screen edge", "Which side of the display your notes live on.",
        segmented("Screen edge", [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ], s.edge, (edge) => void patch({ edge }))),
      row("Show the deck", "Tabs for your notes along the screen edge.",
        toggle("Show the deck", s.showDeck, (v) => void patch({ showDeck: v }))),
      row("Hide over fullscreen apps", "Keeps the deck out of games, videos and presentations.",
        toggle("Hide over fullscreen apps", s.hideFullscreen, (v) => void patch({ hideFullscreen: v }))),
    ),

    h("div", { class: "set-card" },
      row("Start with Windows", "Adds a per-user entry you can remove in Task Manager.",
        toggle("Start with Windows", s.startWithWindows, (v) => void patch({ startWithWindows: v }))),
    ),

    shortcutsCard(),

    h("div", { class: "set-foot" },
      h("button", { class: "btn btn-danger btn-sm", onclick: () => void api.quit() }, "Quit Peekin"),
    ),
  ];
}

export function settingsView(): HTMLElement {
  const el = h("section", { class: "page settings-page" });
  const inner = h("div", { class: "page-inner" });
  el.append(inner);
  const paint = () => inner.replaceChildren(...build(state.settings));
  subscribe((c) => {
    // Rebuild only when shown and something external changed (tray, etc.).
    if (c.has("view") && state.view === "settings") paint();
    else if (c.has("settings") && state.view === "settings" && !el.contains(document.activeElement)) paint();
  });
  paint();
  return el;
}
