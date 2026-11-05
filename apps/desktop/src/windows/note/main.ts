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
import { cx } from "../../lib/ui";

initTooltips();
import type { Note, NoteFont } from "../../lib/types";

const win = getCurrentWindow();
/** The note this window shows. Note windows are pre-loaded as hidden spares
 *  and given their note when one is opened (see windows/note.rs). */
let id = "";
let note: Note;
let saving = false;

// ---- view ------------------------------------------------------------------
/** Small ink-coloured header buttons (hide, close). */
const noteIcon =
  "grid size-[30px] place-items-center rounded-sm text-note-ink opacity-80 transition-[background-color,opacity] duration-[120ms] hover:bg-black/7 hover:opacity-100";
/** Footer text buttons (Delete, Mark complete, Close); add a text colour. */
const noteAction =
  "h-[30px] whitespace-nowrap rounded-sm px-3 text-md transition-[background-color] duration-[120ms] hover:bg-black/7";

const title = h("input", {
  class:
    "h-[30px] min-w-0 flex-1 border-0 bg-transparent p-0 font-ui text-note-title font-bold text-note-ink caret-note-ink outline-0 placeholder:text-note-ink placeholder:opacity-100 focus:placeholder:text-note-ink-muted",
  placeholder: "Untitled note",
  maxlength: 200,
  spellcheck: "false",
  "aria-label": "Note title",
});
const meta = h("span", { class: "mr-2 whitespace-nowrap text-xs text-note-ink-muted", "data-tauri-drag-region": true });
const hideBtn = h("button", { class: noteIcon, title: "Hide (click its tab to bring it back)", "aria-label": "Hide" }, icon("minus", 15));
const closeBtn = h("button", { class: noteIcon, title: "Close (Esc)", "aria-label": "Close" }, icon("close", 15));
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
  { class: "flex h-14 flex-none items-center gap-2 pr-4 pl-[22px]", "data-tauri-drag-region": true },
  title,
  h("div", { class: "flex flex-none items-center gap-0.5" }, remind.el, appTie.el),
  meta,
  hideBtn,
  closeBtn,
);

const bodyEl = h("div", {
  // `rich` (added by the editor) styles the generated HTML and sets the note font.
  class:
    "min-h-0 flex-1 overflow-y-auto px-[22px] py-3 text-[length:calc(var(--text-note-body)*var(--note-font-scale,1))] leading-[1.45] caret-note-ink [&::-webkit-scrollbar-thumb]:bg-note-ink-faint",
});
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
  {
    // data-on-note: components inside (swatches, app stacks) restyle for note paper.
    "data-on-note": true,
    // The descendant variants size the swatch picker for the footer, ring the
    // selected swatch in ink, and drop the picker on narrow windows.
    class:
      "flex h-[50px] flex-none items-center gap-1 pr-4 pb-1 pl-[22px] [&_[role=radiogroup]]:gap-1 [&_[role=radio]]:size-4 [&_[role=radio][aria-checked=true]]:shadow-[inset_0_0_0_2px_var(--color-note-ink)] [@media(max-width:440px)]:[&_[role=radiogroup]]:hidden",
  },
  picker.el,
  h("span", { class: "flex-1" }),
  h("button", { class: cx(noteAction, "text-[#c0392b]"), title: "Delete (Ctrl+Backspace) — undo for 10 seconds", onclick: () => void remove() }, "Delete"),
  h("button", { class: cx(noteAction, "text-note-ink"), title: "Archive this note", onclick: () => void complete() }, "Mark complete"),
  h("button", { class: cx(noteAction, "text-note-ink"), title: "Close (Esc)", onclick: () => void close() }, "Close"),
);

const shell = h(
  "div",
  {
    // Laid out but invisible until the window is revealed; data-anim plays the
    // entrance / exit (tw/note.css), data-resizing while the grip is dragged.
    class:
      "group/note relative flex h-full flex-col overflow-hidden rounded-[20px] bg-note text-note-ink opacity-0 shadow-note transition-[background-color] duration-200 ease-in-out data-[anim=enter]:animate-note-in data-[anim=enter]:opacity-100 data-[anim=leave]:pointer-events-none data-[anim=leave]:animate-note-out data-[anim=leave]:opacity-100 data-resizing:cursor-nwse-resize! data-resizing:select-none data-resizing:**:cursor-nwse-resize! data-resizing:**:select-none",
  },
  head,
  h("div", { class: "mx-5 h-px flex-none bg-note-ink-faint" }),
  bodyEl,
  h("div", { class: "flex-none pt-1 pr-4 pl-[18px]" }, tools.el),
  foot,
);
document.getElementById("app")!.append(shell);

// ---- corner-only resize ----------------------------------------------------
// The window isn't natively resizable; this grip resizes width and height
// together from the bottom-right corner. Sizes are logical px (CSS px).
const MIN_W = 340;
const MIN_H = 260;
const grip = h("div", {
  // two diagonal ink strokes in the bottom-right corner
  class:
    "absolute right-[3px] bottom-[3px] size-4 cursor-nwse-resize touch-none rounded-br-[14px] bg-[linear-gradient(135deg,transparent_45%,var(--color-note-ink)_45%,var(--color-note-ink)_52%,transparent_52%,transparent_68%,var(--color-note-ink)_68%,var(--color-note-ink)_75%,transparent_75%)] opacity-35 transition-opacity duration-[120ms] hover:opacity-75 group-data-resizing/note:opacity-75",
  title: "Drag to resize", "aria-hidden": "true" });
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
    delete shell.dataset.resizing;
  };
  shell.dataset.resizing = "";
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
const LEAVE_MS = 200; // must match --animate-note-out in styles/tw/note.css

function playEnter() {
  delete shell.dataset.anim;
  void shell.offsetWidth; // restart the animation
  shell.dataset.anim = "enter";
}

/** Fade + shrink the note away before the window goes. */
function playLeave(): Promise<void> {
  shell.dataset.anim = "leave";
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
