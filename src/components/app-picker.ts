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

let closeOpen: (() => void) | null = null;

/** Light brand colours need a dark glyph to stay visible. */
function glyphColor(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 186 ? "#111111" : "#ffffff";
}

/** An app's icon, best available (crisp vector logos win over bitmaps):
 *  1. its full-colour logo on a white tile
 *  2. its real icon (read from the PC, when installed)
 *  3. its one-colour logo on a brand-colour tile
 *  4. its initial on a brand-colour tile */
export function appIconEl(exe: string, size = 20): HTMLElement {
  const logo = appLogo(exe);
  const color = appColor(exe);
  const tile = () => {
    const t = h("span", { class: "app-ico app-tile", "aria-hidden": "true" });
    t.style.width = t.style.height = `${size}px`;
    return t;
  };
  if (logo && !logo.mono) {
    const t = tile();
    t.innerHTML = logo.svg; // static, bundled SVG (generated), not user data
    t.classList.add("full");
    t.style.background = "#ffffff";
    return t;
  }
  const src = appIcon(exe);
  if (src) {
    return h("img", { class: "app-ico", src, alt: "", width: size, height: size, draggable: "false" });
  }
  const t = tile();
  t.style.background = color;
  t.style.color = glyphColor(color);
  if (logo) {
    t.innerHTML = logo.svg;
    t.classList.add("mono");
  } else {
    t.textContent = appName(exe).charAt(0).toUpperCase();
    t.style.fontSize = `${Math.round(size * 0.5)}px`;
  }
  return t;
}

/** A small row of overlapping app icons (for chips, rows, the picker footer). */
export function appStack(exes: string[], size = 15, max = 3): HTMLElement {
  return h("span", { class: "app-stack" }, ...exes.slice(0, max).map((e) => appIconEl(e, size)));
}

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

  const search = h("input", { type: "search", class: "ap-search", placeholder: "Search apps", "aria-label": "Search apps", spellcheck: "false" });
  const tabs = h("div", { class: "ap-tabs", role: "tablist", "aria-label": "Categories" });
  const left = h("button", { class: "ap-scroll left", title: "Scroll categories left", "aria-label": "Scroll categories left" }, icon("chevronLeftSm", 15));
  const right = h("button", { class: "ap-scroll right", title: "Scroll categories right", "aria-label": "Scroll categories right" }, icon("chevronRightSm", 15));
  const body = h("div", { class: "ap-body" });
  const chosen = h("div", { class: "ap-chosen" });
  const count = h("span", { class: "ap-count" });
  const clear = h("button", { class: "dt-btn" }, "Clear");
  const done = h("button", { class: "dt-btn primary" }, "Done");
  const pop = h(
    "div",
    { class: `app-picker${opts.dark ? " dark" : ""}`, role: "dialog", "aria-label": "Show this note while using" },
    h("div", { class: "ap-head" }, icon("search", 15), search),
    h("div", { class: "ap-tabs-wrap" }, left, tabs, right),
    body,
    h("div", { class: "ap-foot" }, chosen, count, h("span", { class: "grow" }), clear, done),
  );
  document.body.append(pop);

  // ---- category tabs, with arrows when the row overflows ---------------------------
  const tabDefs = [
    { id: "all", name: "All", icon: "grid" as const },
    ...CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
  ];
  const tabEls = tabDefs.map((t) => {
    const b = h("button", { class: "ap-tab", role: "tab", "aria-selected": String(t.id === category) }, icon(t.icon, 13), t.name);
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
      selected.length ? appStack(selected, 22, MAX_APPS) : h("span", { class: "ap-none" }, "Every app"),
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
        class: `ap-cell${full ? " full" : ""}`,
        "aria-pressed": String(on),
        "data-exe": app.exe,
        title: full ? `${app.name} (you can pick up to ${MAX_APPS} apps)` : app.name,
      },
      h("span", { class: "ap-cell-ico" }, appIconEl(app.exe, 34), on ? h("span", { class: "ap-tick" }, icon("check", 11)) : null),
      h("span", { class: "ap-cell-name" }, app.name),
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
        { class: "ap-every", "aria-pressed": String(!selected.length) },
        h("span", { class: "ap-every-ico" }, icon("grid", 15)),
        h("span", { class: "ap-every-text" },
          h("strong", null, "Every app"),
          h("span", null, `Or pick up to ${MAX_APPS} apps: the note shows while one is in front`)),
        !selected.length ? h("span", { class: "ap-check" }, icon("check", 15)) : null,
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
      if (category === "all" || q) nodes.push(h("div", { class: "ap-section" }, icon(cat.icon, 12), cat.name));
      nodes.push(h("div", { class: "ap-grid" }, ...apps.map(cell)));
    }
    if (!cells.length && q) nodes.push(h("div", { class: "ap-empty" }, "No apps match “" + search.value.trim() + "”"));
    body.replaceChildren(...nodes);
    body.scrollTop = scroll;
    if (active >= cells.length) active = cells.length - 1;
    cells[active]?.classList.add("active");
  };

  // ---- keyboard -----------------------------------------------------------------------
  const COLS = 4;
  const move = (d: number) => {
    if (!cells.length) return;
    active = active < 0 ? 0 : Math.max(0, Math.min(cells.length - 1, active + d));
    cells.forEach((c, i) => c.classList.toggle("active", i === active));
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
