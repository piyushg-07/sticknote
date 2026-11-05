// Manager window bootstrap: layout, routing between views, global keys,
// cross-window sync and the undo toast.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../../lib/api";
import { on } from "../../lib/events";
import { setTheme } from "../../lib/theme";
import { h } from "../../lib/dom";
import { isEditable, matchKey } from "../../lib/keys";
import { toast, closeToast } from "../../components/toast";
import { closeMenu } from "../../components/menu";
import { state, subscribe, update, isListView, visibleNotes } from "./state";
import { actions, hooks } from "./actions";
import { topbar } from "./titlebar";
import { sidebar } from "./sidebar";
import { listPanel } from "./list";
import { detailPane } from "./detail";
import { settingsView } from "./settings-view";
import { aboutView } from "./about-view";
import { loadIcons } from "../../lib/apps";
import { initTooltips } from "../../components/tooltip";

initTooltips();

const win = getCurrentWindow();

const list = listPanel();
const detail = detailPane();
const settings = settingsView();
const about = aboutView();
const notesArea = h("div", { class: "flex min-w-0 flex-1 gap-6 narrow:gap-4" }, list, detail);
const content = h("main", { class: "flex min-h-0 flex-1 px-6 pb-6 narrow:px-4" }, notesArea, settings, about);
const nav = sidebar();
// Layout: full-height sidebar | main (draggable top bar + current view).
document.getElementById("app")!.append(nav, h("div", { class: "flex min-w-0 flex-1 flex-col" }, topbar(), content));

function route() {
  notesArea.hidden = !isListView(state.view);
  settings.hidden = state.view !== "settings";
  about.hidden = state.view !== "about";
  closeMenu();
}
subscribe((c) => {
  if (c.has("view")) {
    route();
    // keep the selection meaningful for the new view
    if (isListView(state.view) && state.selectedId && !visibleNotes().some((n) => n.id === state.selectedId)) {
      void actions.select(visibleNotes()[0]?.id ?? null);
    }
  }
  if (c.has("settings")) setTheme(state.settings.theme);
});

// ---- undo toast ----------------------------------------------------------------
let undoToken: number | null = null;
void on("notes:deleted", (p) => {
  undoToken = p.token;
  toast(p.count > 1 ? `Deleted ${p.count} notes` : `Deleted “${p.title}”`, {
    key: "undo",
    duration: 10_000,
    action: { label: "Undo", run: () => void actions.undo(p.token) },
  });
  setTimeout(() => {
    if (undoToken === p.token) undoToken = null;
  }, 10_000);
});
void on("notes:restored", (token) => {
  if (token === undoToken) {
    undoToken = null;
    closeToast("undo");
  }
});

// ---- sync ------------------------------------------------------------------
void on("notes:changed", () => void actions.reload());
void on("settings:changed", (s) => update({ settings: s }));
void on("manager:navigate", (view) => update({ view, checked: new Set() }));

// ---- keyboard -------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  const editing = isEditable(document.activeElement);
  const sel = state.selectedId;

  if (matchKey(e, "Ctrl+N")) {
    e.preventDefault();
    void actions.create();
  } else if (matchKey(e, "Ctrl+F")) {
    e.preventDefault();
    if (!isListView(state.view)) update({ view: "all" });
    requestAnimationFrame(() => list.focusSearch());
  } else if (matchKey(e, "Ctrl+Z") && undoToken !== null && !editing) {
    e.preventDefault();
    const t = undoToken;
    undoToken = null;
    closeToast("undo");
    void actions.undo(t);
  } else if (matchKey(e, "Ctrl+Backspace") && sel && isListView(state.view)) {
    // In a text field Ctrl+Backspace deletes a word, so only outside one.
    if (editing) return;
    e.preventDefault();
    void actions.remove(state.checked.size ? [...state.checked] : [sel]);
  } else if (matchKey(e, "Ctrl+.") && sel) {
    e.preventDefault();
    void actions.cycleColor(sel);
  } else if (matchKey(e, "Ctrl+E") && sel) {
    e.preventDefault();
    void actions.openWindow(sel);
  } else if (matchKey(e, "Ctrl+\\")) {
    e.preventDefault();
    nav.toggle();
  } else if (matchKey(e, "Ctrl+,")) {
    e.preventDefault();
    update({ view: "settings" });
  } else if (e.key === "Enter" && !editing && sel && isListView(state.view)) {
    e.preventDefault();
    detail.focusEditor();
  } else if (e.key === "Escape" && !editing) {
    if (state.checked.size) update({ checked: new Set() });
  } else if (e.key === "Escape" && editing) {
    (document.activeElement as HTMLElement).blur();
    document.querySelector<HTMLElement>("[data-note-list]")?.focus();
  }
});

// ---- relative times: refresh only while the window has focus ---------------------
let tick: number | undefined;
const refreshTimes = () => {
  list.repaint();
  detail.refreshTimes();
};
window.addEventListener("focus", () => {
  refreshTimes();
  clearInterval(tick);
  tick = window.setInterval(refreshTimes, 60_000);
});
window.addEventListener("blur", () => {
  clearInterval(tick);
  tick = undefined;
  void hooks.flushEditor();
});

// ---- boot ----------------------------------------------------------------------
(async () => {
  const [notes, settingsData, initial] = await Promise.all([api.listNotes(), api.getSettings(), api.takeInitialView()]);
  setTheme(settingsData.theme);
  const view = initial ?? "all";
  update({ notes, settings: settingsData, view });
  // Real app names/icons for notes tied to an app (only if any are).
  const tied = notes.flatMap((n) => n.apps ?? []);
  if (tied.length) void loadIcons(tied).then(() => list.repaint()).catch(() => {});
  route();
  await new Promise((r) => requestAnimationFrame(r));
  const first = visibleNotes()[0];
  if (first && isListView(view)) await actions.select(first.id);
  await win.show();
  await win.setFocus();
})();
