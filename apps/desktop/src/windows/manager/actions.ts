// Every user-initiated mutation in the manager goes through here, so UI
// modules stay declarative and error handling is uniform.
import { api, errorText } from "../../lib/api";
import { toast } from "../../components/toast";
import type { Status } from "../../lib/types";
import { noteById, state, update } from "./state";

async function guard<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch (e) {
    toast(errorText(e), { error: true });
    return undefined;
  }
}

/** Hooks the detail pane registers so pending edits are saved first. */
export const hooks = {
  flushEditor: async () => {},
  focusTitle: () => {},
};

export const actions = {
  async reload() {
    const notes = await api.listNotes();
    const patch: Parameters<typeof update>[0] = { notes };
    if (state.selectedId && !notes.some((n) => n.id === state.selectedId)) patch.selectedId = null;
    const checked = new Set([...state.checked].filter((id) => notes.some((n) => n.id === id)));
    if (checked.size !== state.checked.size) patch.checked = checked;
    update(patch);
  },

  async select(id: string | null) {
    if (id === state.selectedId) return;
    await hooks.flushEditor();
    update({ selectedId: id });
    if (id && noteById(id)?.alert) void api.clearAlert(id).catch(() => {});
  },

  async create() {
    await hooks.flushEditor();
    const n = await guard(api.createNote());
    if (!n) return;
    const view = state.view === "all" || state.view === "deck" ? state.view : "all";
    update({ notes: [n, ...state.notes], selectedId: n.id, view, query: "" });
    requestAnimationFrame(() => hooks.focusTitle());
  },

  async remove(ids: string[]) {
    if (!ids.length) return;
    await guard(api.deleteNotes(ids));
    update({ checked: new Set() });
  },

  async setStatus(ids: string[], status: Status) {
    if (!ids.length) return;
    await hooks.flushEditor();
    await guard(api.setStatus(ids, status));
    update({ checked: new Set() });
    const verb = status === "archived" ? "Archived" : "Restored";
    toast(ids.length > 1 ? `${verb} ${ids.length} notes` : `${verb} note`, {
      key: "status",
      action: { label: "Undo", run: () => void api.setStatus(ids, status === "archived" ? "active" : "archived") },
    });
  },

  async toggleDeck(id: string) {
    const n = noteById(id);
    if (!n) return;
    if (n.status === "archived") {
      await guard(api.setStatus([id], "active"));
      return;
    }
    await guard(api.setOnDeck(id, !n.onDeck));
  },

  async setColor(id: string, color: number) {
    await guard(api.setColor(id, color));
  },

  async cycleColor(id: string) {
    await guard(api.cycleColor(id));
  },

  async openWindow(id: string) {
    await hooks.flushEditor();
    await guard(api.openNoteWindow(id));
  },

  async undo(token = 0) {
    await guard(api.undoDelete(token));
  },

  async reorder(ids: string[]) {
    await guard(api.reorderNotes(ids));
  },

  async exportNotes(format: "json" | "markdown", ids?: string[]) {
    await hooks.flushEditor();
    const ok = await guard(api.exportNotes(format, ids));
    if (ok) toast("Export saved");
  },
};
