// Typed wrappers around every backend command. Windows never call `invoke`
// directly, so the IPC surface lives in one auditable place.
import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  Bounds,
  DeletedPayload,
  ContextApps,
  ManagerView,
  Note,
  NoteFont,
  Repeat,
  NotePatch,
  Settings,
  SettingsPatch,
  Status,
} from "./types";

export const api = {
  // notes
  listNotes: () => invoke<Note[]>("list_notes"),
  getNote: (id: string) => invoke<Note>("get_note", { id }),
  createNote: () => invoke<Note>("create_note"),
  updateNote: (id: string, patch: NotePatch) => invoke<Note>("update_note", { id, patch }),
  setColor: (id: string, color: number) => invoke<void>("set_color", { id, color }),
  cycleColor: (id: string) => invoke<number>("cycle_color", { id }),
  setFont: (id: string, font: NoteFont) => invoke<void>("set_font", { id, font }),
  setStatus: (ids: string[], status: Status) => invoke<void>("set_status", { ids, status }),
  setReminder: (id: string, at: number | null, repeat: Repeat | null = null) =>
    invoke<void>("set_reminder", { id, at, repeat }),
  clearAlert: (id: string) => invoke<void>("clear_alert", { id }),
  setNoteApps: (id: string, apps: string[]) => invoke<void>("set_note_apps", { id, apps }),
  quickNote: (text: string, color?: number) => invoke<Note>("quick_note", { text, color }),
  setOnDeck: (id: string, onDeck: boolean) => invoke<void>("set_on_deck", { id, onDeck }),
  deleteNotes: (ids: string[]) => invoke<DeletedPayload>("delete_notes", { ids }),
  undoDelete: (token = 0) => invoke<string[]>("undo_delete", { token }),
  reorderNotes: (ids: string[]) => invoke<void>("reorder_notes", { ids }),
  saveNoteBounds: (id: string, bounds: Bounds) => invoke<void>("save_note_bounds", { id, bounds }),

  // settings
  getSettings: () => invoke<Settings>("get_settings"),
  updateSettings: (patch: SettingsPatch) => invoke<Settings>("update_settings", { patch }),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),

  // windows
  openNoteWindow: (id: string, anchorY?: number) => invoke<void>("open_note_window", { id, anchorY }),
  openManager: (view?: ManagerView) => invoke<void>("open_manager", { view }),
  takeInitialView: () => invoke<ManagerView | null>("take_initial_view"),
  deckResize: (width: number, height: number) => invoke<void>("deck_resize", { width, height }),
  closeSelf: () => invoke<void>("close_self"),
  noteReady: () => invoke<void>("note_ready"),
  noteId: () => invoke<string | null>("note_id"),
  openCapture: () => invoke<void>("open_capture"),
  contextApps: () => invoke<ContextApps>("context_apps"),
  appIcons: (exes: string[]) => invoke<[string, string | null][]>("app_icons", { exes }),
  quit: () => invoke<void>("quit_app"),

  // io
  exportNotes: (format: "json" | "markdown", ids?: string[]) =>
    invoke<boolean>("export_notes", { format, ids }),
  openLink: (url: string) => invoke<void>("open_link", { url }),
};

/** Normalise backend errors (plain strings) for display. */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
