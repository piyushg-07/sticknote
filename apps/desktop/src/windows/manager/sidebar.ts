// Sidebar: a floating card with the app identity, New note, the note views
// (with counts) and Settings / About.
//  * a highlight glides to the active item
//  * collapses into a slim floating dock (edge button or Ctrl+\); icons never
//    move, labels fade, and hovering an icon in the dock shows its label
//  * the collapsed/expanded choice is remembered on this PC
import { h } from "../../lib/dom";
import { icon, type IconName } from "../../lib/icons";
import type { ManagerView } from "../../lib/types";
import { counts, state, subscribe, update } from "./state";
import { actions } from "./actions";
import appIcon from "../../app-icon.png";

const STORE_KEY = "peekin.sidebar.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === "1";
  } catch {
    return false;
  }
}
function saveCollapsed(v: boolean) {
  try {
    localStorage.setItem(STORE_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable: just don't remember */
  }
}

export function sidebar() {
  const items = new Map<ManagerView, { el: HTMLButtonElement; count?: HTMLElement }>();

  const nav = (view: ManagerView, label: string, ic: IconName, withCount: boolean) => {
    const count = withCount ? h("span", { class: "nav-count" }) : undefined;
    const el = h(
      "button",
      {
        class: "nav-item",
        "data-view": view,
        "data-tip": label,
        "aria-label": label,
        onclick: () => update({ view, query: "", checked: new Set() }),
      },
      icon(ic, 18),
      h("span", { class: "nav-label" }, label),
      count,
    );
    items.set(view, { el, count });
    return el;
  };

  const indicator = h("div", { class: "nav-indicator", "aria-hidden": "true" });
  const toggleBtn = h("button", { class: "sb-toggle" }, icon("panelClose", 15));
  const tip = h("div", { class: "sb-tip", role: "tooltip" });

  const inner = h(
    "div",
    { class: "sb-inner" },
    indicator,
    h("div", { class: "sb-head", "data-tauri-drag-region": true },
      h("img", { class: "sb-logo", src: appIcon, alt: "", width: 26, height: 26, draggable: "false" }),
      h("span", { class: "sb-name", "data-tauri-drag-region": true }, "Peekin"),
    ),
    h("button", { class: "new-note", "data-tip": "New note  ·  Ctrl+N", "aria-label": "New note", onclick: () => void actions.create() },
      icon("plus", 18), h("span", { class: "nav-label" }, "New note")),
    h("nav", { class: "nav", "aria-label": "Notes" },
      h("div", { class: "nav-heading" }, "Notes"),
      nav("all", "All notes", "notes", true),
      nav("deck", "On the deck", "deck", true),
      nav("archive", "Archive", "archiveBox", true),
    ),
    h("div", { class: "sb-spacer" }),
    h("nav", { class: "nav", "aria-label": "App" }, nav("settings", "Settings", "settings", false), nav("about", "About", "info", false)),
  );
  const el = h("aside", { class: "sidebar" }, inner, toggleBtn);
  document.body.append(tip);

  // ---- active highlight -------------------------------------------------------
  const moveIndicator = (animate = true) => {
    const active = items.get(state.view)?.el;
    if (!active) return;
    if (!animate) indicator.classList.add("instant");
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = `${active.offsetHeight}px`;
    if (!animate) requestAnimationFrame(() => indicator.classList.remove("instant"));
  };

  // ---- collapse -------------------------------------------------------------------
  const isCollapsed = () => document.documentElement.classList.contains("sb-collapsed");
  const setCollapsed = (v: boolean) => {
    document.documentElement.classList.toggle("sb-collapsed", v);
    const label = v ? "Expand sidebar" : "Collapse sidebar";
    toggleBtn.replaceChildren(icon(v ? "panelOpen" : "panelClose", 15));
    toggleBtn.title = `${label} (Ctrl+\\)`;
    toggleBtn.setAttribute("aria-label", label);
    toggleBtn.setAttribute("aria-expanded", String(!v));
    saveCollapsed(v);
    hideTip();
  };
  const toggle = () => setCollapsed(!isCollapsed());
  toggleBtn.addEventListener("click", toggle);
  setCollapsed(readCollapsed());

  // ---- dock tooltips (collapsed only) ---------------------------------------------------
  function hideTip() {
    tip.classList.remove("shown");
  }
  inner.addEventListener("pointerover", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!target || !isCollapsed()) return hideTip();
    const r = target.getBoundingClientRect();
    tip.textContent = target.dataset.tip!;
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.style.left = `${r.right + 14}px`;
    tip.classList.add("shown");
  });
  inner.addEventListener("pointerleave", hideTip);

  // ---- counts + active state ---------------------------------------------------------
  const paint = (animate = true) => {
    const c = counts();
    for (const [view, { el, count }] of items) {
      el.setAttribute("aria-current", String(state.view === view));
      if (count) count.textContent = String(c[view as "all" | "deck" | "archive"]);
    }
    moveIndicator(animate);
  };
  subscribe((changed) => {
    if (changed.has("notes") || changed.has("view")) paint();
  });
  requestAnimationFrame(() => paint(false));
  window.addEventListener("resize", () => moveIndicator(false));

  return Object.assign(el, { toggle });
}
