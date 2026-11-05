// Middle column: header (title, sort, import/export), search, bulk actions,
// and the note list with selection checkboxes and drag-to-reorder handles.
import { h, displayTitle, preview } from "../../lib/dom";
import { icon } from "../../lib/icons";
import { ago, reminderChipLabel } from "../../lib/time";
import { appName } from "../../lib/apps";
import { appStack, appsLabel } from "../../components/app-picker";
import { checklistProgress } from "../../lib/progress";
import { showMenu } from "../../components/menu";
import { api } from "../../lib/api";
import type { Note, SortMode } from "../../lib/types";
import { state, subscribe, update, visibleNotes, isListView } from "./state";
import { actions } from "./actions";

const TITLES = { all: "All notes", deck: "On the deck", archive: "Archive" } as const;
const SORTS: { mode: SortMode; label: string }[] = [
  { mode: "manual", label: "Deck order" },
  { mode: "updated", label: "Last edited" },
  { mode: "created", label: "Date created" },
  { mode: "title", label: "Title A–Z" },
];
const EMPTY = {
  all: ["No notes yet", "Press Ctrl+N or the New note button to write one."],
  deck: ["The deck is empty", "Notes you add to the deck appear as tabs on the screen edge."],
  archive: ["Nothing archived", "Mark a note complete to tuck it away here."],
} as const;

export function listPanel() {
  const heading = h("h2", { class: "panel-title" });
  const sortBtn = h("button", { class: "icon-btn", title: "Sort", "aria-label": "Sort notes" }, icon("sort"));
  const ioBtn = h("button", { class: "icon-btn", title: "Import & export", "aria-label": "Import and export" }, icon("fileIO"));

  const search = h("input", { type: "search", placeholder: "Search notes", "aria-label": "Search notes", spellcheck: "false" });
  const count = h("span", { class: "search-count" });
  const searchField = h("label", { class: "field search" }, icon("search", 15), search, count);

  const bulkLabel = h("span", { class: "bulk-label" });
  const bulkArchive = h("button", { class: "btn btn-sm btn-ghost" });
  const bulk = h(
    "div",
    { class: "bulk", hidden: true },
    bulkLabel,
    h("div", { class: "bulk-actions" },
      bulkArchive,
      h("button", { class: "btn btn-sm btn-ghost", onclick: () => void actions.exportNotes("json", [...state.checked]) }, "Export"),
      h("button", { class: "btn btn-sm btn-ghost btn-danger", onclick: () => void actions.remove([...state.checked]) }, "Delete"),
      h("button", { class: "icon-btn", title: "Clear selection", "aria-label": "Clear selection", onclick: () => update({ checked: new Set() }) }, icon("close", 14)),
    ),
  );

  const list = h("div", { class: "list", role: "listbox", tabindex: 0, "aria-label": "Notes" });
  const el = h(
    "section",
    { class: "list-panel" },
    h("div", { class: "panel-head" }, heading, h("div", { class: "panel-tools" }, sortBtn, ioBtn)),
    searchField,
    bulk,
    list,
  );

  // ---- header menus -----------------------------------------------------
  sortBtn.addEventListener("click", () =>
    showMenu(sortBtn, [
      { heading: "Sort by" },
      ...SORTS.map((s) => ({
        label: s.label,
        checked: state.settings.sort === s.mode,
        run: async () => update({ settings: await api.updateSettings({ sort: s.mode }) }),
      })),
    ]),
  );
  ioBtn.addEventListener("click", () =>
    showMenu(ioBtn, [
      { label: "Export all as JSON…", icon: "download", run: () => void actions.exportNotes("json") },
      { label: "Export all as Markdown…", icon: "download", run: () => void actions.exportNotes("markdown") },
    ]),
  );

  search.addEventListener("input", () => update({ query: search.value }));
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) {
      e.stopPropagation();
      search.value = "";
      update({ query: "" });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list.focus();
      move(1);
    }
  });

  // ---- keyboard navigation ----------------------------------------------
  function move(delta: number) {
    const notes = visibleNotes();
    if (!notes.length) return;
    const i = notes.findIndex((n) => n.id === state.selectedId);
    const next = notes[Math.max(0, Math.min(notes.length - 1, i < 0 ? 0 : i + delta))];
    void actions.select(next.id);
  }
  list.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Delete" && state.selectedId) {
      e.preventDefault();
      void actions.remove(state.checked.size ? [...state.checked] : [state.selectedId]);
    } else if (e.key === " " && state.selectedId) {
      e.preventDefault();
      toggleCheck(state.selectedId);
    }
  });

  function toggleCheck(id: string) {
    const next = new Set(state.checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ checked: next });
  }

  // ---- rows ---------------------------------------------------------------
  function row(n: Note, draggable: boolean): HTMLElement {
    const selected = n.id === state.selectedId;
    const checked = state.checked.has(n.id);
    const check = h("button", {
      class: "row-check",
      role: "checkbox",
      "aria-checked": String(checked),
      "aria-label": "Select note",
      onclick: (e: Event) => {
        e.stopPropagation();
        toggleCheck(n.id);
      },
    }, checked ? icon("check", 12) : null);

    const handle = draggable
      ? h("span", { class: "row-handle", title: "Drag to reorder", "aria-hidden": "true" }, icon("grip", 14))
      : null;

    const r = h(
      "div",
      {
        class: `row${selected ? " selected" : ""}${checked ? " checked" : ""}`,
        role: "option",
        "aria-selected": String(selected),
        "data-id": n.id,
        "data-color": n.color,
        title: "Double-click to open in its own window",
      },
      check,
      h("span", { class: "row-stripe" }),
      h("div", { class: "row-main" },
        h("div", { class: "row-top" },
          n.alert ? h("span", { class: "row-alert", title: "Reminder is due" }) : null,
          h("span", { class: "row-title truncate" }, displayTitle(n.title, n.text)),
          n.status === "archived" ? h("span", { class: "badge" }, "Archived") : null,
          h("span", { class: "row-time" }, ago(n.updated)),
        ),
        h("div", { class: "row-preview truncate t-hand" }, preview(n.title ? n.text : n.text.split("\n").slice(1).join("\n")) || " "),
        rowMeta(n),
      ),
      handle,
    );
    r.addEventListener("click", () => void actions.select(n.id));
    r.addEventListener("dblclick", () => void actions.openWindow(n.id));
    if (handle) bindDrag(handle, r);
    return r;
  }

  /** Small chips under a row: checklist progress, reminder, app. */
  function rowMeta(n: Note): HTMLElement | null {
    const prog = checklistProgress(n.text);
    const apps = n.apps ?? [];
    if (!prog && !n.remindAt && !apps.length) return null;
    const bar = prog ? h("span", { class: "row-bar" }, h("span")) : null;
    bar?.style.setProperty("--progress", String(prog!.ratio));
    return h(
      "div",
      { class: "row-meta" },
      prog ? h("span", { class: `row-chip${prog.done === prog.total ? " done" : ""}` }, bar, `${prog.done}/${prog.total}`) : null,
      n.remindAt ? h("span", { class: "row-chip" }, icon(n.repeat ? "restore" : "bell", 11), reminderChipLabel(n.remindAt, n.repeat)) : null,
      apps.length ? h("span", { class: "row-chip", title: apps.map(appName).join(", ") }, appStack(apps, 13, 3), appsLabel(apps)) : null,
    );
  }

  // ---- drag to reorder (handle on the right) -----------------------------
  function bindDrag(handle: HTMLElement, rowEl: HTMLElement) {
    handle.addEventListener("pointerdown", (down) => {
      if (down.button !== 0) return;
      down.preventDefault();
      handle.setPointerCapture(down.pointerId);
      const rect = rowEl.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const slot = h("div", { class: "row-slot" });
      slot.style.height = `${rect.height}px`;
      rowEl.replaceWith(slot);
      list.append(rowEl);
      rowEl.classList.add("dragging");
      rowEl.style.width = `${rect.width}px`;
      const offset = down.clientY - rect.top;

      const place = (y: number) => {
        rowEl.style.top = `${y - offset - listRect.top + list.scrollTop}px`;
      };
      place(down.clientY);

      const moveFn = (e: PointerEvent) => {
        place(e.clientY);
        const rows = Array.from(list.querySelectorAll<HTMLElement>(".row:not(.dragging)"));
        const before = rows.find((x) => {
          const b = x.getBoundingClientRect();
          return e.clientY < b.top + b.height / 2;
        });
        if (before) list.insertBefore(slot, before);
        else list.insertBefore(slot, rowEl);
        // auto-scroll near edges
        if (e.clientY < listRect.top + 24) list.scrollTop -= 8;
        else if (e.clientY > listRect.bottom - 24) list.scrollTop += 8;
      };
      const upFn = () => {
        handle.removeEventListener("pointermove", moveFn);
        handle.removeEventListener("pointerup", upFn);
        handle.removeEventListener("pointercancel", upFn);
        rowEl.classList.remove("dragging");
        rowEl.style.top = "";
        rowEl.style.width = "";
        slot.replaceWith(rowEl);
        const ids = Array.from(list.querySelectorAll<HTMLElement>(".row")).map((x) => x.dataset.id!);
        // optimistic reorder
        const pos = new Map(ids.map((id, i) => [id, i]));
        const slots = state.notes.filter((n) => pos.has(n.id)).map((n) => n.order).sort((a, b) => a - b);
        const notes = state.notes.map((n) => (pos.has(n.id) ? { ...n, order: slots[pos.get(n.id)!] } : n));
        update({ notes });
        void actions.reorder(ids);
      };
      handle.addEventListener("pointermove", moveFn);
      handle.addEventListener("pointerup", upFn);
      handle.addEventListener("pointercancel", upFn);
    });
  }

  // ---- paint ----------------------------------------------------------------
  function paint() {
    if (!isListView(state.view)) return;
    const view = state.view as keyof typeof TITLES;
    heading.textContent = TITLES[view];
    const notes = visibleNotes();
    count.textContent = `${notes.length} note${notes.length === 1 ? "" : "s"}`;
    if (search.value !== state.query) search.value = state.query;

    const n = state.checked.size;
    bulk.hidden = n === 0;
    list.classList.toggle("selecting", n > 0); // keep checkboxes visible while selecting
    bulkLabel.textContent = `${n} selected`;
    bulkArchive.textContent = view === "archive" ? "Restore" : "Archive";
    bulkArchive.onclick = () =>
      void actions.setStatus([...state.checked], view === "archive" ? "active" : "archived");

    const draggable = state.settings.sort === "manual" && !state.query.trim() && notes.length > 1;
    if (!notes.length) {
      const [t, d] = state.query ? ["No matches", "Try a different word."] : EMPTY[view];
      list.replaceChildren(h("div", { class: "empty-list" }, h("div", { class: "empty-title" }, t), h("div", { class: "t-muted" }, d)));
      return;
    }
    list.replaceChildren(...notes.map((x) => row(x, draggable)));
    list.querySelector(".row.selected")?.scrollIntoView({ block: "nearest" });
  }

  subscribe((changed) => {
    if (["notes", "view", "query", "checked", "selectedId", "settings"].some((k) => changed.has(k as never))) paint();
  });
  paint();

  return Object.assign(el, { focusSearch: () => search.focus(), repaint: paint });
}
