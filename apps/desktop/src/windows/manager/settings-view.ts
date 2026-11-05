// Settings page.
import { api, errorText } from "../../lib/api";
import { h } from "../../lib/dom";
import { segmented, toggle } from "../../components/controls";
import { toast } from "../../components/toast";
import { setTheme } from "../../lib/theme";
import type { Settings, SettingsPatch } from "../../lib/types";
import { state, subscribe, update } from "./state";
import { btn, btnDanger, btnSm, cx, kbd } from "../../lib/ui";

// Shared by the Settings and About pages.
export const PAGE = "min-w-0 flex-1 overflow-y-auto";
export const PAGE_INNER = "mx-auto flex max-w-[720px] flex-col gap-4 pb-8";
export const PAGE_TITLE_TEXT = "m-0 font-display text-3xl font-bold tracking-[-0.015em]";
export const CARD = "flex flex-col gap-4 rounded-xl border border-line bg-surface p-5";
export const CARD_TIGHT = "flex flex-col gap-1 rounded-xl border border-line bg-surface p-5";
export const SET_TITLE = "text-md font-semibold";
export const SET_DESC = "mt-0.5 text-sm text-fg-muted";
const KEYS_HEADING = "mt-2 text-2xs font-semibold tracking-[0.06em] text-fg-faint uppercase";

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
    { class: "flex items-center gap-4 [&+&]:border-t [&+&]:border-line [&+&]:pt-4" },
    h("div", { class: "min-w-0 flex-1" }, h("div", { class: SET_TITLE }, title), desc ? h("div", { class: SET_DESC }, desc) : null),
    control,
  );
}

function keys(list: [string, string][]) {
  return h(
    "div",
    { class: "flex flex-col gap-2" },
    ...list.map(([k, d]) =>
      h("div", { class: "flex items-center gap-3 text-md text-fg-muted" }, h("kbd", { class: cx(kbd, "min-w-0") }, k), h("span", null, d)),
    ),
  );
}

/** Shortcut reference, folded away until asked for. */
function shortcutsCard(): HTMLElement {
  const body = h("div", { class: "flex flex-col gap-2 border-t border-line pt-4", hidden: true },
    h("div", { class: KEYS_HEADING }, "Anywhere"),
    keys(GLOBAL_KEYS),
    h("div", { class: KEYS_HEADING }, "In All notes"),
    keys(WINDOW_KEYS),
    h("div", { class: KEYS_HEADING }, "In a note"),
    keys(NOTE_KEYS),
  );
  const showBtn = h("button", { class: cx(btn, btnSm), "aria-expanded": "false" }, "Show");
  showBtn.addEventListener("click", () => {
    const open = body.hidden;
    body.hidden = !open;
    showBtn.textContent = open ? "Hide" : "Show";
    showBtn.setAttribute("aria-expanded", String(open));
  });
  return h("div", { class: CARD }, row("Keyboard shortcuts", null, showBtn), body);
}

function build(s: Settings): HTMLElement[] {
  return [
    h("h1", { class: cx(PAGE_TITLE_TEXT, "mb-2") }, "Settings"),

    h("div", { class: CARD },
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

    h("div", { class: CARD },
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

    h("div", { class: CARD },
      row("Start with Windows", "Adds a per-user entry you can remove in Task Manager.",
        toggle("Start with Windows", s.startWithWindows, (v) => void patch({ startWithWindows: v }))),
    ),

    shortcutsCard(),

    h("div", { class: "flex justify-center pt-2" },
      h("button", { class: cx(btn, btnDanger, btnSm), onclick: () => void api.quit() }, "Quit Peekin"),
    ),
  ];
}

export function settingsView(): HTMLElement {
  const el = h("section", { class: PAGE });
  const inner = h("div", { class: PAGE_INNER });
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
