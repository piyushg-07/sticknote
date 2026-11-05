// Shared data contracts. Mirrors src-tauri/src/models.rs.

export type Status = "active" | "archived";
export type Theme = "auto" | "light" | "dark";
export type Edge = "left" | "right";
export type NoteFont = "hand" | "normal" | "rounded" | "typewriter";
export const MAX_APPS = 5;

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly";
export type SortMode = "manual" | "updated" | "created" | "title";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Note {
  id: string;
  title: string;
  /** Sanitised HTML — produced by the Rust side, safe to render. */
  body: string;
  /** Plain-text projection for previews and search. */
  text: string;
  color: number;
  font: NoteFont;
  status: Status;
  onDeck: boolean;
  order: number;
  created: number;
  updated: number;
  bounds?: Bounds;
  /** When to remind (ms since epoch); cleared once it fires. */
  remindAt?: number;
  /** repeat the reminder; the next time is scheduled when it fires */
  repeat?: Repeat;
  /** A reminder fired and the note hasn't been opened since. */
  alert: boolean;
  /** Only shown on the deck while one of these apps (exe names) is in
   *  front; empty = every app. At most MAX_APPS. */
  apps?: string[];
}

export interface ContextApps {
  current: string | null;
  recent: string[];
}

export interface NotePatch {
  title?: string;
  body?: string;
}

export interface Settings {
  theme: Theme;
  edge: Edge;
  hideFullscreen: boolean;
  sort: SortMode;
  showDeck: boolean;
  startWithWindows: boolean;
  portable: boolean;
  dataDir: string;
}

export type SettingsPatch = Partial<Omit<Settings, "dataDir">>;

export interface AppInfo {
  name: string;
  version: string;
  dataDir: string;
}

export interface DeletedPayload {
  token: number;
  count: number;
  title: string;
}

export interface ChangedPayload {
  origin: string | null;
  ids: string[];
}

export type ManagerView = "all" | "deck" | "archive" | "settings" | "about";
