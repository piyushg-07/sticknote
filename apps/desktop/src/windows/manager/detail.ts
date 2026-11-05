// Right column: the selected note, editable in place.
import { api } from "../../lib/api";
import { debounce, h } from "../../lib/dom";
import { icon } from "../../lib/icons";
import { agoLong, fullDate } from "../../lib/time";
import { Editor } from "../../editor/editor";
import { swatches } from "../../components/swatches";
import { appChip, reminderChip } from "../../components/note-meta";
import { noteById, state, subscribe, update } from "./state";
import { actions, hooks } from "./actions";
import { caps, cx, iconBtn, iconBtnDanger } from "../../lib/ui";

// Header chips sit on the page, not on note paper (components/note-meta onPage).
const PAGE_CHIPS = "ml-2 flex items-center gap-1";
const EMPTY_TITLE = "mb-1 text-md font-semibold text-fg";

export function detailPane() {
  // ---- header -----------------------------------------------------------
  const dot = h("span", { class: "size-2 rounded-full bg-note-strong data-muted:bg-fg-faint" });
  const status = h("span", { class: caps });
  const openBtn = h("button", { class: iconBtn, title: "Open in its own window (Ctrl+E)", "aria-label": "Open in window" }, icon("external"));
  const doneBtn = h("button", { class: iconBtn });
  const deckBtn = h("button", { class: iconBtn });
  const delBtn = h("button", { class: cx(iconBtn, iconBtnDanger), title: "Delete (Ctrl+Backspace)", "aria-label": "Delete" }, icon("trash"));
  const remind = reminderChip({
    onPage: true,
    onSet: (at, repeat) => {
      const id = state.selectedId;
      if (id) void api.setReminder(id, at, repeat);
    },
  });
  const appTie = appChip({
    onPage: true,
    onSet: (apps) => {
      const id = state.selectedId;
      if (id) void api.setNoteApps(id, apps);
    },
  });
  const head = h(
    "div",
    { class: "mb-3 flex min-h-10 items-center gap-2" },
    dot,
    status,
    h("div", { class: PAGE_CHIPS }, remind.el, appTie.el),
    h("div", { class: "flex-1" }),
    openBtn,
    doneBtn,
    deckBtn,
    delBtn,
  );

  // ---- card ---------------------------------------------------------------
  const title = h("input", {
    class:
      "min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-3xl font-bold tracking-[-0.015em] text-note-ink placeholder:text-note-ink-muted",
    placeholder: "Title", maxlength: 200, spellcheck: "false", "aria-label": "Note title" });
  const edited = h("span", { class: "whitespace-nowrap text-xs text-note-ink-muted" });
  const bodyEl = h("div", {
    class:
      "min-h-0 flex-1 overflow-y-auto pt-1 pb-4 text-[length:calc(var(--text-note-body)*var(--note-font-scale,1))] leading-[1.45] [&::-webkit-scrollbar-thumb]:bg-note-ink-faint",
  });
  const dates = h("span", { class: "min-w-0 flex-1 truncate text-xs text-note-ink-muted" });
  const picker = swatches((c) => {
    const id = state.selectedId;
    if (!id) return;
    card.dataset.color = String(c);
    picker.set(c);
    void actions.setColor(id, c);
  });
  const card = h(
    "article",
    {
      // data-on-note: components inside (swatches, app stacks) restyle for note paper.
      "data-on-note": true,
      class:
        "flex min-h-0 flex-1 flex-col rounded-[20px] bg-note px-8 pt-6 pb-3 text-note-ink shadow-md transition-[background-color] duration-200 ease-in-out",
    },
    h("div", { class: "mb-2 flex items-baseline gap-3" }, title, edited),
    bodyEl,
    h("div", { class: "h-px bg-note-ink-faint" }),
    h("div", { class: "flex h-12 items-center gap-3" }, dates, picker.el),
  );

  const empty = h(
    "div",
    {
      class:
        "flex flex-1 flex-col items-center justify-center gap-1 rounded-[20px] border-[1.5px] border-dashed border-line pb-[60px] text-center text-sm",
    },
    h("div", { class: "mb-2 grid size-14 place-items-center rounded-xl bg-accent-soft text-accent-text" }, icon("note", 26)),
    h("div", { class: EMPTY_TITLE }, "Nothing selected"),
    h("div", { class: "text-fg-muted" }, "Pick a note on the left to read or edit it."),
  );

  const el = h("section", { class: "flex min-w-0 flex-1 flex-col" }, head, card, empty);

  // ---- editing --------------------------------------------------------------
  let currentId: string | null = null;
  let lastBody = "";
  let lastTitle = "";

  const editor = new Editor(bodyEl, { onChange: () => save(), placeholder: "Start writing…" });

  const save = debounce(async () => {
    const id = currentId;
    if (!id) return;
    lastTitle = title.value;
    lastBody = editor.getHTML();
    try {
      const saved = await api.updateNote(id, { title: lastTitle, body: lastBody });
      lastBody = saved.body;
      update({ notes: state.notes.map((n) => (n.id === id ? saved : n)) });
    } catch {
      /* deleted meanwhile */
    }
  }, 400);

  hooks.flushEditor = async () => save.flush();
  hooks.focusTitle = () => title.focus();

  title.addEventListener("input", () => save());
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      editor.focus(true);
    }
  });

  // ---- actions --------------------------------------------------------------
  openBtn.addEventListener("click", () => currentId && void actions.openWindow(currentId));
  doneBtn.addEventListener("click", () => {
    const n = noteById(currentId);
    if (n) void actions.setStatus([n.id], n.status === "archived" ? "active" : "archived");
  });
  deckBtn.addEventListener("click", () => currentId && void actions.toggleDeck(currentId));
  delBtn.addEventListener("click", () => currentId && void actions.remove([currentId]));

  // ---- paint ------------------------------------------------------------------
  function paintMeta() {
    const n = noteById(currentId);
    if (!n) return;
    const archived = n.status === "archived";
    card.dataset.color = String(n.color);
    card.dataset.font = n.font;
    dot.dataset.color = String(n.color);
    dot.toggleAttribute("data-muted", archived || !n.onDeck);
    status.textContent = archived ? "Archived" : n.onDeck ? "Active · On the deck" : "Active · Off the deck";
    doneBtn.replaceChildren(icon(archived ? "restore" : "check"));
    doneBtn.title = archived ? "Restore to the deck" : "Mark complete (archive)";
    doneBtn.setAttribute("aria-label", doneBtn.title);
    deckBtn.replaceChildren(icon(n.onDeck && !archived ? "offDeck" : "toDeck"));
    deckBtn.title = archived ? "Restore to the deck" : n.onDeck ? "Take off the deck" : "Put on the deck";
    deckBtn.setAttribute("aria-label", deckBtn.title);
    picker.set(n.color);
    remind.set(n);
    appTie.set(n);
    edited.textContent = `edited ${agoLong(n.updated).replace(" ago", "")}`;
    dates.textContent = `Created ${fullDate(n.created)} · Updated ${agoLong(n.updated)}`;
  }

  function paint(selectionChanged: boolean) {
    const n = noteById(state.selectedId);
    const has = !!n;
    card.hidden = !has;
    empty.hidden = has;
    [openBtn, doneBtn, deckBtn, delBtn].forEach((b) => (b.disabled = !has));
    dot.hidden = status.hidden = !has;
    if (!n) {
      currentId = null;
      return;
    }
    if (selectionChanged || n.id !== currentId) {
      currentId = n.id;
      title.value = lastTitle = n.title;
      editor.setHTML((lastBody = n.body));
      bodyEl.scrollTop = 0;
    } else if (!save.pending()) {
      // external edit (e.g. from the note's own window)
      if (n.title !== lastTitle && document.activeElement !== title) title.value = lastTitle = n.title;
      if (n.body !== lastBody && !editor.hasFocus()) editor.setHTML((lastBody = n.body));
    }
    paintMeta();
  }

  subscribe((changed) => {
    if (changed.has("selectedId")) paint(true);
    else if (changed.has("notes")) paint(false);
  });
  paint(true);

  return Object.assign(el, { refreshTimes: paintMeta, focusEditor: () => editor.focus(true) });
}
