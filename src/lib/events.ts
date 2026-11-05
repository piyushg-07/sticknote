// Backend → webview events. Names mirror src-tauri/src/state.rs::events.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ChangedPayload, DeletedPayload, Edge, ManagerView, Settings } from "./types";

interface EventMap {
  "notes:changed": ChangedPayload;
  "notes:deleted": DeletedPayload;
  "notes:restored": number;
  "settings:changed": Settings;
  "deck:note-windows": string[];
  "manager:navigate": ManagerView;
  /** a spare note window is being given a note to show */
  "note:bind": { label: string; id: string };
  /** a hidden note window is being shown again (payload: its label) */
  "note:shown": string;
  /** a reminder is due: its note should catch the eye */
  "reminder:fired": { id: string; title: string; due: number; missed: boolean };
  /** the app in front changed (lower-case exe name) */
  "context:app": string;
  /** the quick-capture card is being shown (payload: deck edge) */
  "capture:show": Edge;
}

export function on<K extends keyof EventMap>(name: K, cb: (payload: EventMap[K]) => void): Promise<UnlistenFn> {
  return listen<EventMap[K]>(name, (e) => cb(e.payload));
}
