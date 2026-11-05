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

export function detailPane() {
  // ---- header -----------------------------------------------------------
  const dot = h("span", { class: "status-dot" });
  const status = h("span", { class: "status t-caps" });
  const openBtn = h("button", { class: "icon-btn", title: "Open in its own window (Ctrl+E)", "aria-label": "Open in window" }, icon("external"));
  const doneBtn = h("button", { class: "icon-btn" });
  const deckBtn = h("button", { class: "icon-btn" });
  const delBtn = h("button", { class: "icon-btn danger", title: "Delete (Ctrl+Backspace)", "aria-label": "Delete" }, icon("trash"));
  const remind = reminderChip({
    onSet: (at, repeat) => {
      const id = state.selectedId;
      if (id) void api.setReminder(id, at, repeat);
    },
  });
  const appTie = appChip({
    onSet: (apps) => {
      const id = state.selectedId;
      if (id) void api.setNoteApps(id, apps);
    },
  });
  const head = h(
    "div",
    { class: "detail-head" },
    dot,
    status,
    h("div", { class: "detail-chips" }, remind.el, appTie.el),
    h("div", { class: "grow" }),
    openBtn,
    doneBtn,
    deckBtn,
    delBtn,
  );

  // ---- card ---------------------------------------------------------------
  const title = h("input", { class: "card-title", placeholder: "Title", maxlength: 200, spellcheck: "false", "aria-label": "Note title" });
  const edited = h("span", { class: "card-edited" });
  const bodyEl = h("div", { class: "card-body" });
  const dates = h("span", { class: "card-dates" });
  const picker = swatches((c) => {
    const id = state.selectedId;
    if (!id) return;
    card.dataset.color = String(c);
    picker.set(c);
    void actions.setColor(id, c);
  });
  const card = h(
    "article",
    { class: "detail-card on-note" },
    h("div", { class: "card-head" }, title, edited),
    bodyEl,
    h("div", { class: "card-rule" }),
    h("div", { class: "card-foot" }, dates, picker.el),
  );

  const empty = h(
    "div",
    { class: "detail-empty" },
    h("div", { class: "empty-icon" }, icon("note", 26)),
    h("div", { class: "empty-title" }, "Nothing selected"),
    h("div", { class: "t-muted" }, "Pick a note on the left to read or edit it."),
  );

  const el = h("section", { class: "detail" }, head, card, empty);

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
    dot.classList.toggle("muted", archived || !n.onDeck);
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
