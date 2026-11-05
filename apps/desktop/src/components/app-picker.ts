// App picker: "show this note only while using…" (up to MAX_APPS apps).
//
//   [ Search apps                                   ]
//   ‹ [All] [Developers] [AI] [Designers] [Video] … ›   ← category tabs + arrows
//   ┌──────────────────────────────────────────────┐
//   │ ◻ Every app                                   │
//   │ DEVELOPERS                                    │
//   │ [VS✓] [Cu] [AG✓] [Zed] …                      │   ← icon grid, multi-select
//   └──────────────────────────────────────────────┘
//   [icons] 2 / 5                        Clear  Done
// Changes apply as you click. Type to search; arrow keys move; Enter toggles;
// Esc / Done / clicking outside closes.
import { h } from "../lib/dom";
import { icon } from "../lib/icons";
import { CATEGORIES, appColor, appIcon, appLogo, appName, loadIcons, type CatalogApp } from "../lib/apps";
import { MAX_APPS } from "../lib/types";
import { cx } from "../lib/ui";

let closeOpen: (() => void) | null = null;

/** Light brand colours need a dark glyph to stay visible. */
function glyphColor(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 186 ? "#111111" : "#ffffff";
}

/** An app's icon, best available (crisp vector logos win over bitmaps):
 *  1. its full-colour logo, centred on a white tile
 *  2. its real icon (read from the PC, when installed)
 *  3. its one-colour logo on a brand-colour tile
 *  4. its initial on a brand-colour tile */
export function appIconEl(exe: string, size = 20): HTMLElement {
  return iconEl(exe, size);
}

// Marker classes `app-ico` / `app-tile` / `full` / `mono` carry no styles of
// their own; they let a wrapper restyle the icon (e.g. the deck's app tag).
const ICO = "app-ico inline-grid flex-none place-items-center object-contain";
const TILE = "app-tile font-ui leading-none font-bold text-white [&_svg]:block";
// Full-colour logos sit centred on a white tile with a little breathing room;
// one-colour glyphs sit a little smaller on the brand colour.
const FULL = "full bg-white [&_svg]:size-[60%]";
const SHADOW_FULL = "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08),0_1px_3px_rgb(0_0_0/0.16)]";
const MONO = "mono [&_svg]:size-[58%]";
const SHADOW_BRAND = "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14),0_1px_3px_rgb(0_0_0/0.2)]";

/** appIconEl with layout overrides: `radius` replaces the 22% rounding and
 *  `ring` replaces the tile shadow (complete class strings). */
function iconEl(exe: string, size: number, o: { radius?: string; ring?: string } = {}): HTMLElement {
  const logo = appLogo(exe);
  const color = appColor(exe);
  const radius = o.radius ?? "rounded-[22%]";
  const tile = (kind: string, shadow: string) => {
    const t = h("span", { class: cx(ICO, TILE, radius, kind, o.ring ?? shadow), "aria-hidden": "true" });
    t.style.width = t.style.height = `${size}px`;
    return t;
  };
  if (logo && !logo.mono) {
    const t = tile(FULL, SHADOW_FULL);
    t.innerHTML = logo.svg; // static, bundled SVG (generated), not user data
    return t;
  }
  const src = appIcon(exe);
  if (src) {
    return h("img", { class: cx(ICO, radius, o.ring), src, alt: "", width: size, height: size, draggable: "false" });
  }
  const t = tile(logo ? MONO : "", SHADOW_BRAND);
  t.style.background = color;
  t.style.color = glyphColor(color);
  if (logo) {
    t.innerHTML = logo.svg;
  } else {
    t.textContent = appName(exe).charAt(0).toUpperCase();
    t.style.fontSize = `${Math.round(size * 0.5)}px`;
  }
  return t;
}

// Each stacked icon is ringed in what it sits on, so the overlaps read.
const RING = {
  surface:
    "shadow-[0_0_0_1.5px_var(--surface)] in-data-on-note:shadow-[0_0_0_1.5px_var(--note-bg,var(--surface))]",
  note: "shadow-[0_0_0_1.5px_var(--note-bg,var(--surface))]",
};

/** A small row of overlapping app icons (for chips, rows, the picker footer).
 *  `ring`: "note" on note paper (also automatic under a `data-on-note` ancestor). */
export function appStack(exes: string[], size = 15, max = 3, ring: "surface" | "note" = "surface"): HTMLElement {
  return h(
    "span",
    { class: "inline-flex items-center" },
    ...exes.slice(0, max).map((e, i) => {
      const el = iconEl(e, size, { ring: RING[ring] });
      if (i > 0) el.classList.add("-ml-[5px]");
      return el;
    }),
  );
}

// The picker's palette lives in custom properties so one set of utilities
// serves both the theme-coloured and the always-dark (note window) picker.
const AP_LIGHT =
  "bg-surface [--ap-fg:var(--text)] [--ap-muted:var(--text-faint)] [--ap-line:var(--border)] [--ap-hover:var(--surface-hover)] [--ap-sel:var(--accent-soft)] [--ap-sel-line:var(--accent-border)] [--ap-chip:var(--surface-2)] [--ap-accent:var(--accent-text)] [--ap-raised:var(--surface)] [--ap-bg:var(--surface)]";
const AP_DARK =
  "bg-toast [--ap-fg:var(--toast-fg)] [--ap-muted:rgb(244_244_245/0.45)] [--ap-line:rgb(255_255_255/0.08)] [--ap-hover:rgb(255_255_255/0.07)] [--ap-sel:rgb(79_168_232/0.2)] [--ap-sel-line:rgb(79_168_232/0.6)] [--ap-chip:rgb(255_255_255/0.08)] [--ap-accent:#7cc4f2] [--ap-raised:#2a2a2e] [--ap-bg:var(--toast-bg)]";
const AP =
  "fixed z-75 flex w-[404px] max-w-[calc(100vw-16px)] animate-pop-in flex-col overflow-hidden rounded-[16px] border border-(--ap-line) font-ui text-(--ap-fg) shadow-lg";
const SCROLL =
  "absolute top-px z-2 grid size-7 place-items-center rounded-full border border-(--ap-line) bg-(--ap-raised) text-(--ap-fg) shadow-[0_2px_8px_rgb(0_0_0/0.18)] transition-[background-color,scale] duration-[120ms] hover:border-accent hover:bg-accent hover:text-white active:scale-94";
const TAB =
  "inline-flex h-[30px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full bg-(--ap-chip) pr-3 pl-2.5 text-sm font-medium text-(--ap-fg) transition-[background-color,color] duration-[120ms] hover:not-aria-selected:bg-(--ap-hover) aria-selected:bg-accent aria-selected:text-white";
const CELL =
  "flex min-w-0 flex-col items-center gap-[7px] rounded-[12px] border border-transparent px-1 pt-3 pb-[9px] text-(--ap-fg) transition-[background-color,border-color,scale] duration-[120ms] active:scale-96";
const FOOT_BTN = "h-[30px] rounded-md px-3 text-xs font-semibold transition-[background-color] duration-[120ms] disabled:opacity-40";

/** "VS Code", or "VS Code +2" for several apps. */
export function appsLabel(exes: string[]): string {
  if (!exes.length) return "";
  return exes.length === 1 ? appName(exes[0]) : `${appName(exes[0])} +${exes.length - 1}`;
}

export function showAppPicker(
  anchor: HTMLElement,
  current: string[],
  onChange: (apps: string[]) => void,
  opts: { dark?: boolean } = {},
) {
  closeOpen?.();

  let selected = [...current];
  let category = "all";
  let cells: HTMLButtonElement[] = [];
  let active = -1;

  const search = h("input", {
    type: "search",
    class: "min-w-0 flex-1 border-0 bg-transparent text-md text-(--ap-fg) outline-0 placeholder:text-(--ap-muted) [&::-webkit-search-cancel-button]:hidden",
    placeholder: "Search apps",
    "aria-label": "Search apps",
    spellcheck: "false",
  });
  // A soft fade at both ends hints that the row scrolls.
  const tabs = h("div", {
    class:
      "flex gap-1.5 overflow-x-auto border-b border-(--ap-line) px-3 pb-3 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent_0,#000_14px,#000_calc(100%_-_22px),transparent)] [&::-webkit-scrollbar]:hidden",
    role: "tablist",
    "aria-label": "Categories",
  });
  const left = h("button", { class: cx(SCROLL, "left-1.5"), title: "Scroll categories left", "aria-label": "Scroll categories left" }, icon("chevronLeftSm", 15));
  const right = h("button", { class: cx(SCROLL, "right-1.5"), title: "Scroll categories right", "aria-label": "Scroll categories right" }, icon("chevronRightSm", 15));
  const body = h("div", { class: "max-h-[360px] overflow-y-auto px-3 pt-2 pb-3" });
  const chosen = h("div", { class: "flex min-h-6 items-center" });
  const count = h("span", { class: "text-xs font-semibold text-(--ap-muted) tabular-nums" });
  const clear = h("button", { class: cx(FOOT_BTN, "text-(--ap-fg) hover:bg-(--ap-hover)") }, "Clear");
  const done = h("button", { class: cx(FOOT_BTN, "bg-accent text-white hover:bg-accent-hover") }, "Done");
  const pop = h(
    "div",
    { class: cx(AP, opts.dark ? AP_DARK : AP_LIGHT), role: "dialog", "aria-label": "Show this note while using" },
    h("div", { class: "flex h-[46px] items-center gap-2 px-4 text-(--ap-muted)" }, icon("search", 15), search),
    h("div", { class: "relative" }, left, tabs, right),
    body,
    h("div", { class: "flex items-center gap-2.5 border-t border-(--ap-line) px-3 py-2.5" }, chosen, count, h("span", { class: "flex-1" }), clear, done),
  );
  document.body.append(pop);

  // ---- category tabs, with arrows when the row overflows ---------------------------
  const tabDefs = [
    { id: "all", name: "All", icon: "grid" as const },
    ...CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
  ];
  const tabEls = tabDefs.map((t) => {
    const b = h("button", { class: TAB, role: "tab", "aria-selected": String(t.id === category) }, icon(t.icon, 13), t.name);
    b.addEventListener("click", () => {
      category = t.id;
      tabEls.forEach((x, i) => x.setAttribute("aria-selected", String(tabDefs[i].id === category)));
      b.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
      body.scrollTop = 0;
      render();
    });
    return b;
  });
  tabs.append(...tabEls);
  const syncArrows = () => {
    left.hidden = tabs.scrollLeft <= 2;
    right.hidden = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 2;
  };
  left.addEventListener("click", () => tabs.scrollBy({ left: -180, behavior: "smooth" }));
  right.addEventListener("click", () => tabs.scrollBy({ left: 180, behavior: "smooth" }));
  tabs.addEventListener("scroll", syncArrows, { passive: true });
  tabs.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        tabs.scrollLeft += e.deltaY; // the mouse wheel scrolls the row sideways
        e.preventDefault();
      }
    },
    { passive: false },
  );

  // ---- selection (applies as you click) -----------------------------------------------
  const commit = () => {
    onChange([...selected]);
    paintFoot();
    render();
  };
  const toggle = (exe: string) => {
    if (selected.includes(exe)) selected = selected.filter((e) => e !== exe);
    else if (selected.length < MAX_APPS) selected = [...selected, exe];
    else return; // already at the limit (the tile's tooltip says so)
    commit();
  };
  const paintFoot = () => {
    chosen.replaceChildren(
      selected.length ? appStack(selected, 22, MAX_APPS) : h("span", { class: "text-sm text-(--ap-muted)" }, "Every app"),
    );
    count.textContent = `${selected.length} / ${MAX_APPS}`;
    clear.disabled = !selected.length;
  };

  // ---- grid ---------------------------------------------------------------------------
  const cell = (app: CatalogApp) => {
    const on = selected.includes(app.exe);
    const full = !on && selected.length >= MAX_APPS;
    const b = h(
      "button",
      {
        // pressed: selected; full: at the limit, so other tiles dim (their
        // tooltip explains why); data-active: keyboard focus
        class: cx(
          CELL,
          on
            ? "border-(--ap-sel-line) bg-(--ap-sel)"
            : full
              ? "opacity-40 data-active:bg-(--ap-hover)"
              : "hover:bg-(--ap-hover) data-active:bg-(--ap-hover)",
        ),
        "aria-pressed": String(on),
        "data-exe": app.exe,
        title: full ? `${app.name} (you can pick up to ${MAX_APPS} apps)` : app.name,
      },
      h(
        "span",
        { class: "relative grid size-[38px] place-items-center" },
        iconEl(app.exe, 34, { radius: "rounded-[10px]" }),
        on
          ? h(
              "span",
              {
                class:
                  "absolute -right-[3px] -bottom-[3px] grid size-[17px] place-items-center rounded-full bg-accent text-white shadow-[0_0_0_2px_var(--ap-bg)] [&_.icon]:stroke-[3.2]",
              },
              icon("check", 11),
            )
          : null,
      ),
      h("span", { class: "max-w-full truncate text-xs" }, app.name),
    );
    b.addEventListener("click", () => toggle(app.exe));
    cells.push(b);
    return b;
  };

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const scroll = body.scrollTop;
    cells = [];
    const nodes: HTMLElement[] = [];

    if (!q) {
      const every = h(
        "button",
        {
          class:
            "mt-1 mb-2 flex w-full items-center gap-3 rounded-[12px] border border-(--ap-line) px-3 py-2.5 text-left text-(--ap-fg) transition-[background-color,border-color] duration-[120ms] hover:not-aria-pressed:bg-(--ap-hover) aria-pressed:border-(--ap-sel-line) aria-pressed:bg-(--ap-sel)",
          "aria-pressed": String(!selected.length),
        },
        h("span", { class: "grid size-[30px] place-items-center rounded-[9px] bg-(--ap-chip)" }, icon("grid", 15)),
        h("span", { class: "flex flex-1 flex-col text-xs text-(--ap-muted)" },
          h("strong", { class: "text-md font-semibold text-(--ap-fg)" }, "Every app"),
          h("span", null, `Or pick up to ${MAX_APPS} apps: the note shows while one is in front`)),
        !selected.length ? h("span", { class: "grid text-(--ap-accent)" }, icon("check", 15)) : null,
      );
      every.addEventListener("click", () => {
        selected = [];
        commit();
      });
      nodes.push(every);
    }

    const seen = new Set<string>();
    for (const cat of CATEGORIES) {
      if (category !== "all" && cat.id !== category) continue;
      const apps = cat.apps.filter((app) => {
        if (q && !app.name.toLowerCase().includes(q) && !app.exe.includes(q)) return false;
        if (q && seen.has(app.exe)) return false; // one result per app when searching
        seen.add(app.exe);
        return true;
      });
      if (!apps.length) continue;
      if (category === "all" || q) nodes.push(
          h(
            "div",
            { class: "flex items-center gap-1.5 px-1 pt-3 pb-2 text-2xs font-semibold tracking-[0.06em] text-(--ap-muted) uppercase" },
            icon(cat.icon, 12),
            cat.name,
          ),
        );
      nodes.push(h("div", { class: "grid grid-cols-4 gap-1" }, ...apps.map(cell)));
    }
    if (!cells.length && q) nodes.push(h("div", { class: "px-3 py-6 text-center text-sm text-(--ap-muted)" }, "No apps match “" + search.value.trim() + "”"));
    body.replaceChildren(...nodes);
    body.scrollTop = scroll;
    if (active >= cells.length) active = cells.length - 1;
    cells[active]?.toggleAttribute("data-active", true);
  };

  // ---- keyboard -----------------------------------------------------------------------
  const COLS = 4;
  const move = (d: number) => {
    if (!cells.length) return;
    active = active < 0 ? 0 : Math.max(0, Math.min(cells.length - 1, active + d));
    cells.forEach((c, i) => c.toggleAttribute("data-active", i === active));
    cells[active].scrollIntoView({ block: "nearest" });
  };
  const onKey = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
    const inSearch = document.activeElement === search;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" && inSearch) {
      e.preventDefault();
      search.blur();
      move(0);
    } else if (e.key in keys && !inSearch) {
      e.preventDefault();
      move(keys[e.key]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const target = cells[active] ?? (search.value.trim() ? cells[0] : undefined);
      if (target) target.click();
      else close();
    }
  };

  // ---- open / close ---------------------------------------------------------------------
  const onDown = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  function close() {
    pop.remove();
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onDown, true);
    window.removeEventListener("blur", close);
    closeOpen = null;
  }
  closeOpen = close;

  clear.addEventListener("click", () => {
    selected = [];
    commit();
  });
  done.addEventListener("click", () => close());
  search.addEventListener("input", () => {
    active = -1;
    render();
  });
  document.addEventListener("keydown", onKey, true);
  setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
  window.addEventListener("blur", close);

  paintFoot();
  render();
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const ph = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  pop.style.top = `${Math.max(8, r.bottom + 6 + ph > window.innerHeight ? r.top - ph - 6 : r.bottom + 6)}px`;
  syncArrows();
  search.focus();

  // Swap in real icons and logos once loaded (first time only).
  void loadIcons(selected).then(() => {
    if (closeOpen === close) {
      paintFoot();
      render();
    }
  });
}
