// A single note window. Its label is `note-<id>`.
//
//   ┌──────────────────────────────────────────────┐
//   │ Untitled note              Saved · 9h  —  ×  │
//   │ ──────────────────────────────────────────── │
//   │ body…                                        │
//   │ B I U S | ☑ • 1. | 🔗 | Aa                 … │
//   │ ● ● ● ● ● ○ ● ●     Delete  Mark complete  Close │
//   └──────────────────────────────────────────────┘
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { api } from "../../lib/api";
import { on } from "../../lib/events";
import { setTheme } from "../../lib/theme";
import { debounce, h } from "../../lib/dom";
import { icon } from "../../lib/icons";
import { matchKey } from "../../lib/keys";
import { agoLong } from "../../lib/time";
import { Editor } from "../../editor/editor";
import { toolbar } from "../../editor/toolbar";
import { swatches } from "../../components/swatches";
import { appChip, reminderChip } from "../../components/note-meta";
import { initTooltips } from "../../components/tooltip";

initTooltips();
import type { Note, NoteFont } from "../../lib/types";

const win = getCurrentWindow();
/** The note this window shows. Note windows are pre-loaded as hidden spares
 *  and given their note when one is opened (see windows/note.rs). */
let id = "";
let note: Note;
let saving = false;

// ---- view ------------------------------------------------------------------
const title = h("input", {
  class: "note-title",
  placeholder: "Untitled note",
  maxlength: 200,
  spellcheck: "false",
  "aria-label": "Note title",
});
const meta = h("span", { class: "note-meta", "data-tauri-drag-region": true });
const hideBtn = h("button", { class: "note-icon", title: "Hide (click its tab to bring it back)", "aria-label": "Hide" }, icon("minus", 15));
const closeBtn = h("button", { class: "note-icon", title: "Close (Esc)", "aria-label": "Close" }, icon("close", 15));
const remind = reminderChip({
  dark: true,
  onSet: (at, repeat) => {
    note.remindAt = at ?? undefined;
    note.repeat = repeat ?? undefined;
    remind.set(note);
    void api.setReminder(id, at, repeat);
  },
});
const appTie = appChip({
  dark: true,
  onSet: (apps) => {
    note.apps = apps;
    void api.setNoteApps(id, apps);
  },
});
const head = h(
  "header",
  { class: "note-head", "data-tauri-drag-region": true },
  title,
  h("div", { class: "note-chips" }, remind.el, appTie.el),
  meta,
  hideBtn,
  closeBtn,
);

const bodyEl = h("div", { class: "note-body" });
const editor = new Editor(bodyEl, { onChange: () => scheduleSave() });

const tools = toolbar(editor, {
  getFont: () => note.font,
  setFont: (f) => void setFont(f),
  more: () => [
    { label: "Move completed to the bottom", icon: "checkCircle", run: () => editor.moveCompletedToBottom() },
    { label: "Copy as text", icon: "fileIO", run: () => void navigator.clipboard.writeText(plainText()) },
    { label: note.onDeck ? "Take off the deck" : "Put on the deck", icon: note.onDeck ? "offDeck" : "toDeck", run: () => void toggleDeck() },
    { label: "Open in All notes", icon: "grid", run: () => void api.openManager("all") },
  ],
});

const picker = swatches((c) => void setColor(c));
const foot = h(
  "footer",
  { class: "note-foot on-note" },
  picker.el,
  h("span", { class: "grow" }),
  h("button", { class: "note-action danger", title: "Delete (Ctrl+Backspace) — undo for 10 seconds", onclick: () => void remove() }, "Delete"),
  h("button", { class: "note-action", title: "Archive this note", onclick: () => void complete() }, "Mark complete"),
  h("button", { class: "note-action", title: "Close (Esc)", onclick: () => void close() }, "Close"),
);

const shell = h(
  "div",
  { class: "note-shell" },
  head,
  h("div", { class: "note-rule" }),
  bodyEl,
  h("div", { class: "note-tools" }, tools.el),
  foot,
);
document.getElementById("app")!.append(shell);

// ---- corner-only resize ----------------------------------------------------
// The window isn't natively resizable; this grip resizes width and height
// together from the bottom-right corner. Sizes are logical px (CSS px).
const MIN_W = 340;
const MIN_H = 260;
const grip = h("div", { class: "resize-grip", title: "Drag to resize", "aria-hidden": "true" });
shell.append(grip);
grip.addEventListener("pointerdown", (down) => {
  if (down.button !== 0) return;
  down.preventDefault();
  grip.setPointerCapture(down.pointerId);
  const sx = down.screenX;
  const sy = down.screenY;
  const w0 = window.innerWidth;
  const h0 = window.innerHeight;
  const maxW = window.screen.availWidth;
  const maxH = window.screen.availHeight;
  let frame = 0;
  let next: [number, number] | null = null;

  const apply = () => {
    frame = 0;
    if (next) void win.setSize(new LogicalSize(next[0], next[1]));
    next = null;
  };
  const move = (e: PointerEvent) => {
    const w = Math.round(Math.min(maxW, Math.max(MIN_W, w0 + e.screenX - sx)));
    const hh = Math.round(Math.min(maxH, Math.max(MIN_H, h0 + e.screenY - sy)));
    next = [w, hh];
    if (!frame) frame = requestAnimationFrame(apply); // at most one resize per frame
  };
  const up = () => {
    grip.removeEventListener("pointermove", move);
    grip.removeEventListener("pointerup", up);
    grip.removeEventListener("pointercancel", up);
    shell.classList.remove("resizing");
  };
  shell.classList.add("resizing");
  grip.addEventListener("pointermove", move);
  grip.addEventListener("pointerup", up);
  grip.addEventListener("pointercancel", up);
});

// ---- state → view ----------------------------------------------------------
function paint(full: boolean) {
  shell.dataset.color = String(note.color);
  shell.dataset.font = note.font;
  picker.set(note.color);
  remind.set(note);
  appTie.set(note);
  if (full || document.activeElement !== title) title.value = note.title;
  if (full || !editor.hasFocus()) editor.setHTML(note.body);
  renderMeta();
}

function renderMeta() {
  meta.textContent = saving ? "Saving…" : `Saved · ${agoLong(note.updated).replace(" ago", "")}`;
}

function plainText() {
  const t = title.value.trim();
  const body = bodyEl.innerText.trim();
  return t ? `${t}\n\n${body}` : body;
}

// ---- persistence -----------------------------------------------------------
const save = debounce(async () => {
  try {
    note = await api.updateNote(id, { title: title.value, body: editor.getHTML() });
  } catch {
    /* deleted elsewhere; the backend is closing this window */
  }
  saving = false;
  renderMeta();
}, 350);

function scheduleSave() {
  saving = true;
  renderMeta();
  save();
}

async function flush() {
  if (save.pending()) save.flush();
}

title.addEventListener("input", scheduleSave);
title.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "ArrowDown") {
    e.preventDefault();
    editor.focus(e.key === "Enter");
  }
});

// ---- actions ---------------------------------------------------------------
// ---- enter / leave animations ---------------------------------------------
const LEAVE_MS = 200; // must match .note-shell.leave in note.css

function playEnter() {
  shell.classList.remove("leave", "enter");
  void shell.offsetWidth; // restart the animation
  shell.classList.add("enter");
}

/** Fade + shrink the note away before the window goes. */
function playLeave(): Promise<void> {
  shell.classList.remove("enter");
  shell.classList.add("leave");
  return new Promise((r) => setTimeout(r, LEAVE_MS));
}

async function close() {
  await flush();
  await playLeave();
  await api.closeSelf();
}

async function hide() {
  await flush();
  await playLeave();
  await win.hide();
  // stay invisible until shown again (note:shown replays the entrance)
}

async function remove() {
  await playLeave();
  await api.deleteNotes([id]); // backend closes this window; Undo lives on the deck
}

async function complete() {
  await flush();
  await playLeave();
  await api.setStatus([id], "archived");
}

async function setColor(c: number) {
  note.color = c;
  paint(false);
  await api.setColor(id, c);
}

async function setFont(f: NoteFont) {
  note.font = f;
  paint(false);
  await api.setFont(id, f);
}

async function toggleDeck() {
  note.onDeck = !note.onDeck;
  await api.setOnDeck(id, note.onDeck);
}

async function cycle() {
  note.color = await api.cycleColor(id);
  paint(false);
}

hideBtn.addEventListener("click", () => void hide());
closeBtn.addEventListener("click", () => void close());

window.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if (matchKey(e, "Esc") || matchKey(e, "Ctrl+W")) {
    e.preventDefault();
    void close();
  } else if (matchKey(e, "Ctrl+.")) {
    e.preventDefault();
    void cycle();
  } else if (matchKey(e, "Ctrl+Backspace")) {
    e.preventDefault();
    void remove();
  }
});

// Save whenever focus leaves the window.
window.addEventListener("blur", () => void flush());

// ---- sync with other windows -----------------------------------------------
void on("notes:changed", async (p) => {
  if (!id || p.origin === win.label || (p.ids.length && !p.ids.includes(id))) return; // !id: spare not bound yet
  try {
    note = await api.getNote(id);
    paint(false);
  } catch {
    /* deleted */
  }
});
void on("settings:changed", (s) => setTheme(s.theme));
window.addEventListener("focus", renderMeta);

// ---- boot ------------------------------------------------------------------
/** Resolve which note to show: already bound (window created on demand), or
 *  wait to be handed one (pre-loaded spare). */
function whichNote(): Promise<string> {
  return new Promise((resolve) => {
    let done = false;
    const take = (noteId: string) => {
      if (done) return;
      done = true;
      resolve(noteId);
    };
    void on("note:bind", (p) => {
      if (p.label === win.label) take(p.id);
    });
    void api.noteId().then((noteId) => noteId && take(noteId));
  });
}

void on("note:shown", (label) => {
  if (label !== win.label) return;
  playEnter();
  renderMeta();
  editor.focus(true);
});

(async () => {
  const settings = api.getSettings(); // load while waiting to be bound
  id = await whichNote();
  const [n, s] = await Promise.all([api.getNote(id), settings]);
  note = n;
  setTheme(s.theme);
  paint(true);
  tools.refresh();
  // Paint first, then ask the backend to show the window, then animate in.
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await api.noteReady().catch(() => {}); // never leave the note invisible
  playEnter();
  if (!note.title && !note.text) title.focus();
  else editor.focus(true);
})();
