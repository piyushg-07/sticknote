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
import { btn, btnDanger, btnGhost, btnSm, cx, field, fieldInput, iconBtn } from "../../lib/ui";

const BULK_BTN = cx(btn, btnSm, btnGhost);
const CHIP =
  "inline-flex h-5 items-center gap-[5px] whitespace-nowrap rounded-full px-[7px] text-2xs font-semibold tabular-nums [&_.icon]:stroke-[2.2]";
const CHIP_IDLE = "bg-surface-active text-fg-muted";
const CHIP_DONE = "bg-accent-soft text-accent-text";

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
  const heading = h("h2", { class: "m-0 flex-1 font-display text-2xl font-bold tracking-[-0.015em]" });
  const sortBtn = h("button", { class: iconBtn, title: "Sort", "aria-label": "Sort notes" }, icon("sort"));
  const ioBtn = h("button", { class: iconBtn, title: "Import & export", "aria-label": "Import and export" }, icon("fileIO"));

  const search = h("input", { class: cx(fieldInput, "[&::-webkit-search-cancel-button]:hidden"), type: "search", placeholder: "Search notes", "aria-label": "Search notes", spellcheck: "false" });
  const count = h("span", { class: "whitespace-nowrap text-xs text-fg-faint tabular-nums" });
  const searchField = h("label", {
    class: cx(field, "mb-3 h-[38px]! rounded-lg! border-transparent! focus-within:border-accent-border!"),
  }, icon("search", 15), search, count);

  const bulkLabel = h("span", { class: "flex-1 text-sm font-semibold text-accent-text" });
  const bulkArchive = h("button", { class: BULK_BTN });
  const bulk = h(
    "div",
    { class: "mb-3 flex animate-bulk-in items-center gap-2 rounded-lg bg-accent-soft py-1 pr-1 pl-3", hidden: true },
    bulkLabel,
    h("div", { class: "flex items-center" },
      bulkArchive,
      h("button", { class: BULK_BTN, onclick: () => void actions.exportNotes("json", [...state.checked]) }, "Export"),
      h("button", { class: cx(BULK_BTN, btnDanger), onclick: () => void actions.remove([...state.checked]) }, "Delete"),
      h("button", { class: iconBtn, title: "Clear selection", "aria-label": "Clear selection", onclick: () => update({ checked: new Set() }) }, icon("close", 14)),
    ),
  );

  const list = h("div", {
    class: "group/list relative -mx-2 min-h-0 flex-1 overflow-y-auto px-2",
    role: "listbox",
    tabindex: 0,
    "aria-label": "Notes",
    "data-note-list": true,
    "data-no-ring": true,
  });
  const el = h(
    "section",
    { class: "flex min-h-0 w-[340px] flex-none flex-col narrow:w-[290px]" },
    h("div", { class: "mb-3 flex min-h-10 items-center gap-2" }, heading, h("div", { class: "flex gap-0.5" }, sortBtn, ioBtn)),
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
      // Selection checkbox: only shown on hover or while selecting.
      class:
        "-mr-3 grid h-[18px] w-0 flex-none place-items-center overflow-hidden rounded-full border-[1.5px] border-line-strong text-on-accent opacity-0 transition-[width,margin,opacity,background-color] duration-[120ms] group-hover/row:mr-0 group-hover/row:w-[18px] group-hover/row:opacity-100 group-data-selecting/list:mr-0 group-data-selecting/list:w-[18px] group-data-selecting/list:opacity-100 hover:border-accent-border aria-checked:border-accent aria-checked:bg-accent [&_.icon]:stroke-3",
      role: "checkbox",
      "aria-checked": String(checked),
      "aria-label": "Select note",
      onclick: (e: Event) => {
        e.stopPropagation();
        toggleCheck(n.id);
      },
    }, checked ? icon("check", 12) : null);

    const handle = draggable
      ? h("span", {
          class:
            "grid w-[18px] cursor-grab touch-none place-items-center self-stretch text-fg-faint opacity-0 transition-opacity duration-[120ms] group-hover/row:opacity-100 group-data-dragging/row:cursor-grabbing group-data-dragging/row:opacity-100",
          title: "Drag to reorder", "aria-hidden": "true" }, icon("grip", 14))
      : null;

    const r = h(
      "div",
      {
        class:
          "group/row relative mb-0.5 flex min-h-16 items-center gap-3 rounded-lg py-2.5 pr-2.5 pl-3 transition-[background-color] duration-[120ms] hover:bg-surface-hover aria-selected:bg-accent-soft group-focus-visible/list:aria-selected:shadow-[inset_0_0_0_2px_var(--accent-border)] data-dragging:absolute data-dragging:z-5 data-dragging:cursor-grabbing data-dragging:bg-surface data-dragging:shadow-lg",
        role: "option",
        "aria-selected": String(selected),
        "data-id": n.id,
        "data-color": n.color,
        title: "Double-click to open in its own window",
      },
      check,
      // colour dot of the note
      h("span", { class: "mt-[5px] size-2.5 flex-none self-start rounded-full bg-note-strong" }),
      h("div", { class: "min-w-0 flex-1" },
        h("div", { class: "flex items-center gap-2" },
          // a warm dot when a reminder is due
          n.alert
            ? h("span", { class: "size-2 flex-none rounded-full bg-alert shadow-[0_0_0_3px_rgb(242_104_60/0.18)]", title: "Reminder is due" })
            : null,
          h("span", { class: "min-w-0 flex-1 truncate text-md font-semibold" }, displayTitle(n.title, n.text)),
          n.status === "archived"
            ? h("span", { class: "rounded-full bg-surface-active px-[7px] py-px text-[10px] font-semibold tracking-[0.04em] text-fg-muted uppercase" }, "Archived")
            : null,
          h("span", { class: "whitespace-nowrap text-xs text-fg-faint tabular-nums" }, ago(n.updated)),
        ),
        h("div", { class: "mt-0.5 truncate font-hand text-lg leading-[1.35] text-fg-muted" }, preview(n.title ? n.text : n.text.split("\n").slice(1).join("\n")) || " "),
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
    const bar = prog ? h(
          "span",
          { class: "relative h-1 w-[22px] overflow-hidden rounded-xs bg-line-strong" },
          h("span", { class: "absolute inset-y-0 left-0 w-[calc(var(--progress,0)*100%)] rounded-[inherit] bg-accent" }),
        ) : null;
    bar?.style.setProperty("--progress", String(prog!.ratio));
    return h(
      "div",
      { class: "mt-1.5 flex flex-wrap gap-1.5" },
      prog ? h("span", { class: cx(CHIP, prog.done === prog.total ? CHIP_DONE : CHIP_IDLE) }, bar, `${prog.done}/${prog.total}`) : null,
      n.remindAt ? h("span", { class: cx(CHIP, CHIP_IDLE) }, icon(n.repeat ? "restore" : "bell", 11), reminderChipLabel(n.remindAt, n.repeat)) : null,
      apps.length ? h("span", { class: cx(CHIP, CHIP_IDLE), title: apps.map(appName).join(", ") }, appStack(apps, 13, 3), appsLabel(apps)) : null,
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
      const slot = h("div", { class: "mb-0.5 rounded-lg border-2 border-dashed border-accent-border bg-accent-soft" });
      slot.style.height = `${rect.height}px`;
      rowEl.replaceWith(slot);
      list.append(rowEl);
      rowEl.toggleAttribute("data-dragging", true);
      rowEl.style.width = `${rect.width}px`;
      const offset = down.clientY - rect.top;

      const place = (y: number) => {
        rowEl.style.top = `${y - offset - listRect.top + list.scrollTop}px`;
      };
      place(down.clientY);

      const moveFn = (e: PointerEvent) => {
        place(e.clientY);
        const rows = Array.from(list.querySelectorAll<HTMLElement>("[role=option]:not([data-dragging])"));
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
        rowEl.removeAttribute("data-dragging");
        rowEl.style.top = "";
        rowEl.style.width = "";
        slot.replaceWith(rowEl);
        const ids = Array.from(list.querySelectorAll<HTMLElement>("[role=option]")).map((x) => x.dataset.id!);
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
    list.toggleAttribute("data-selecting", n > 0); // keep checkboxes visible while selecting
    bulkLabel.textContent = `${n} selected`;
    bulkArchive.textContent = view === "archive" ? "Restore" : "Archive";
    bulkArchive.onclick = () =>
      void actions.setStatus([...state.checked], view === "archive" ? "active" : "archived");

    const draggable = state.settings.sort === "manual" && !state.query.trim() && notes.length > 1;
    if (!notes.length) {
      const [t, d] = state.query ? ["No matches", "Try a different word."] : EMPTY[view];
      list.replaceChildren(
        h("div", { class: "px-4 py-8 text-center text-sm" },
          h("div", { class: "mb-1 text-md font-semibold text-fg" }, t),
          h("div", { class: "text-fg-muted" }, d),
        ),
      );
      return;
    }
    list.replaceChildren(...notes.map((x) => row(x, draggable)));
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }

  subscribe((changed) => {
    if (["notes", "view", "query", "checked", "selectedId", "settings"].some((k) => changed.has(k as never))) paint();
  });
  paint();

  return Object.assign(el, { focusSearch: () => search.focus(), repaint: paint });
}
