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

// Labels, counts and the name fade + slide out as the card narrows.
const FADE =
  "[transition:opacity_200ms_var(--ease-out),translate_260ms_var(--ease-out)] group-data-collapsed/sb:pointer-events-none group-data-collapsed/sb:-translate-x-1.5 group-data-collapsed/sb:opacity-0";
// Shared item geometry: 40px tall, icon at a fixed 11px from the left.
const ITEM = "relative z-1 flex h-10 items-center gap-3 whitespace-nowrap rounded-lg pr-2.5 pl-[11px] text-md";
const LABEL =
  "flex-1 truncate text-left [transition:opacity_200ms_var(--ease-out),translate_260ms_var(--ease-out)] group-data-collapsed/sb:pointer-events-none group-data-collapsed/sb:-translate-x-1.5 group-data-collapsed/sb:opacity-0";

export function sidebar() {
  const items = new Map<ManagerView, { el: HTMLButtonElement; count?: HTMLElement }>();

  const nav = (view: ManagerView, label: string, ic: IconName, withCount: boolean) => {
    const count = withCount
      ? h("span", {
          class: `${FADE} min-w-[22px] rounded-full bg-surface-active px-[7px] py-px text-center text-xs font-medium text-fg-muted tabular-nums group-aria-[current=true]/item:bg-accent-soft group-aria-[current=true]/item:text-accent-text`,
        })
      : undefined;
    const el = h(
      "button",
      {
        class: `${ITEM} group/item text-fg-muted transition-[color,background-color] duration-[120ms] hover:bg-surface-hover hover:text-fg aria-[current=true]:bg-transparent aria-[current=true]:font-semibold aria-[current=true]:text-accent-text`,
        "data-view": view,
        "data-tip": label,
        "aria-label": label,
        onclick: () => update({ view, query: "", checked: new Set() }),
      },
      icon(ic, 18),
      h("span", { class: LABEL }, label),
      count,
    );
    items.set(view, { el, count });
    return el;
  };

  // The highlight that glides to the active item (the item itself stays transparent).
  const indicator = h("div", {
    class:
      "pointer-events-none absolute top-0 right-2.5 left-2.5 z-0 rounded-lg bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent-soft)] transition-[transform,height] duration-[340ms] ease-out data-instant:transition-none motion-reduce:transition-none",
    "aria-hidden": "true",
  });
  // Edge toggle: a small round button centred on the card's right edge line, shown on hover.
  const toggleBtn = h(
    "button",
    {
      class:
        "absolute top-1/2 -right-[13px] z-5 -mt-[13px] grid size-[26px] scale-[0.85] place-items-center rounded-full border border-line-strong bg-surface text-fg-muted opacity-0 shadow-sm [transition:opacity_160ms,scale_200ms_var(--ease-out),color_120ms,background-color_120ms] group-hover/sb:scale-100 group-hover/sb:opacity-100 hover:border-accent hover:bg-accent hover:text-on-accent focus-visible:scale-100 focus-visible:opacity-100 [&_.icon]:stroke-[1.9]",
    },
    icon("panelClose", 15),
  );
  // Dock tooltip (shown beside an icon while collapsed).
  const tip = h("div", {
    class:
      "pointer-events-none fixed z-80 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md bg-toast px-2.5 py-1.5 text-sm font-medium text-toast-fg opacity-0 shadow-lg [transition:opacity_140ms,translate_200ms_var(--ease-out)] data-shown:translate-x-0 data-shown:opacity-100",
    role: "tooltip",
  });

  const inner = h(
    "div",
    { class: "relative flex h-full flex-col gap-0.5 overflow-hidden rounded-[inherit] px-2.5 pb-2.5" },
    indicator,
    h("div", { class: "flex h-[58px] flex-none items-center gap-2.5 pl-[7px]", "data-tauri-drag-region": true },
      h("img", { class: "pointer-events-none flex-none rounded-md", src: appIcon, alt: "", width: 26, height: 26, draggable: "false" }),
      h("span", { class: `${FADE} font-display text-lg font-bold tracking-[-0.01em] whitespace-nowrap`, "data-tauri-drag-region": true }, "Peekin"),
    ),
    h("button", {
      class: `${ITEM} mt-0.5 mb-2.5 bg-accent font-semibold text-on-accent shadow-[0_2px_8px_var(--accent-glow),inset_0_1px_0_rgb(255_255_255/0.16)] transition-[background-color,scale,box-shadow] duration-[120ms] hover:bg-accent-hover hover:shadow-[0_4px_14px_var(--accent-glow),inset_0_1px_0_rgb(255_255_255/0.16)] active:scale-[0.97] [&_.icon]:stroke-[2.3]`,
      "data-tip": "New note  ·  Ctrl+N", "aria-label": "New note", onclick: () => void actions.create() },
      icon("plus", 18), h("span", { class: LABEL }, "New note")),
    h("nav", { class: "flex flex-col gap-0.5", "aria-label": "Notes" },
      // In the dock this heading becomes a short divider (same height, so nothing
      // shifts under the gliding highlight).
      h("div", {
        class:
          "relative flex h-7 items-end px-[11px] pb-1.5 text-2xs font-semibold tracking-[0.06em] whitespace-nowrap text-fg-faint uppercase [transition:opacity_200ms_var(--ease-out),translate_260ms_var(--ease-out)] after:absolute after:bottom-2.5 after:left-1/2 after:-ml-[9px] after:h-0.5 after:w-[18px] after:rounded-[2px] after:bg-line-strong after:opacity-0 after:transition-opacity after:duration-200 after:ease-out after:content-[''] group-data-collapsed/sb:pointer-events-none group-data-collapsed/sb:text-transparent group-data-collapsed/sb:after:opacity-100",
      }, "Notes"),
      nav("all", "All notes", "notes", true),
      nav("deck", "On the deck", "deck", true),
      nav("archive", "Archive", "archiveBox", true),
    ),
    h("div", { class: "flex-1" }),
    h("nav", { class: "flex flex-col gap-0.5", "aria-label": "App" }, nav("settings", "Settings", "settings", false), nav("about", "About", "info", false)),
  );
  // A floating card. Icons keep the same position in both states (fixed left
  // padding), so collapsing is just the card narrowing while labels fade.
  const el = h(
    "aside",
    {
      class:
        "group/sb relative my-2.5 ml-2.5 w-[196px] flex-none rounded-[18px] border border-line bg-sidebar shadow-sm transition-[width] duration-[320ms] ease-out data-collapsed:w-[62px] motion-reduce:transition-none",
    },
    inner,
    toggleBtn,
  );
  document.body.append(tip);

  // ---- active highlight -------------------------------------------------------
  const moveIndicator = (animate = true) => {
    const active = items.get(state.view)?.el;
    if (!active) return;
    if (!animate) indicator.toggleAttribute("data-instant", true);
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = `${active.offsetHeight}px`;
    if (!animate) requestAnimationFrame(() => indicator.removeAttribute("data-instant"));
  };

  // ---- collapse -------------------------------------------------------------------
  const isCollapsed = () => el.hasAttribute("data-collapsed");
  const setCollapsed = (v: boolean) => {
    el.toggleAttribute("data-collapsed", v);
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
    tip.removeAttribute("data-shown");
  }
  inner.addEventListener("pointerover", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!target || !isCollapsed()) return hideTip();
    const r = target.getBoundingClientRect();
    tip.textContent = target.dataset.tip!;
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.style.left = `${r.right + 14}px`;
    tip.toggleAttribute("data-shown", true);
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
