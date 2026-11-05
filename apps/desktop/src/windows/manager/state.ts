// Manager window state: one small observable store + derived selectors.
import type { ManagerView, Note, Settings, SortMode } from "../../lib/types";

export interface State {
  notes: Note[];
  settings: Settings;
  view: ManagerView;
  selectedId: string | null;
  query: string;
  checked: Set<string>;
}

type Key = keyof State;
type Listener = (changed: Set<Key>) => void;

export const state: State = {
  notes: [],
  settings: {
    theme: "auto",
    edge: "right",
    hideFullscreen: true,
    sort: "manual",
    showDeck: true,
    startWithWindows: false,
    portable: false,
    dataDir: "",
  },
  view: "all",
  selectedId: null,
  query: "",
  checked: new Set(),
};

const listeners = new Set<Listener>();
let pending = new Set<Key>();
let scheduled = false;

export function subscribe(fn: Listener) {
  listeners.add(fn);
}

/** Update state; listeners run once per frame with every key that changed. */
export function update(patch: Partial<State>) {
  for (const k of Object.keys(patch) as Key[]) {
    (state as unknown as Record<Key, unknown>)[k] = patch[k];
    pending.add(k);
  }
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const changed = pending;
    pending = new Set();
    listeners.forEach((l) => l(changed));
  });
}

// ---- selectors ---------------------------------------------------------------

export function noteById(id: string | null): Note | undefined {
  return id ? state.notes.find((n) => n.id === id) : undefined;
}

function inView(n: Note, view: ManagerView): boolean {
  if (view === "deck") return n.status === "active" && n.onDeck;
  if (view === "archive") return n.status === "archived";
  return true;
}

export function counts() {
  let deck = 0;
  let archive = 0;
  for (const n of state.notes) {
    if (n.status === "archived") archive++;
    else if (n.onDeck) deck++;
  }
  return { all: state.notes.length, deck, archive };
}

const SORTERS: Record<SortMode, (a: Note, b: Note) => number> = {
  manual: (a, b) => a.order - b.order,
  updated: (a, b) => b.updated - a.updated,
  created: (a, b) => b.created - a.created,
  title: (a, b) => (a.title || a.text).localeCompare(b.title || b.text, undefined, { sensitivity: "base" }),
};

export function visibleNotes(): Note[] {
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  return state.notes
    .filter((n) => inView(n, state.view))
    .filter((n) => {
      if (!terms.length) return true;
      const hay = `${n.title}\n${n.text}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    })
    .sort(SORTERS[state.settings.sort]);
}

export const isListView = (v: ManagerView) => v === "all" || v === "deck" || v === "archive";
