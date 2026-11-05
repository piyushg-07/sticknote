// Lightweight popover menu anchored to a button.
import { h } from "../lib/dom";
import { icon, type IconName } from "../lib/icons";
import { caps, cx } from "../lib/ui";

export type MenuEntry =
  | { label: string; icon?: IconName; checked?: boolean; run: () => void; danger?: boolean; font?: string; hint?: string }
  | { separator: true }
  | { heading: string };

let open: { el: HTMLElement; dispose: () => void } | null = null;

export function closeMenu() {
  open?.dispose();
}

export interface MenuOptions {
  /** "dark" matches the note window menus. */
  variant?: "dark";
  align?: "start" | "end";
}

// Light (theme) menu vs the always-dark menu used inside note windows.
const STYLE = {
  light: {
    menu: "fixed z-50 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-lg animate-pop-in",
    item: "flex h-8 w-full items-center gap-3 rounded-sm px-3 text-left text-md hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
    text: "text-fg",
    icon: "text-fg-muted",
    hint: "text-fg-faint",
  },
  dark: {
    menu: "fixed z-50 min-w-[190px] rounded-lg border border-white/6 bg-toast p-1 text-toast-fg shadow-lg animate-pop-in",
    item: "flex h-[34px] w-full items-center gap-3 rounded-sm px-3 text-left text-md hover:bg-white/8 focus-visible:bg-white/8 focus-visible:outline-none",
    text: "text-toast-fg",
    icon: "text-[rgb(242_242_246/0.7)]",
    hint: "text-[rgb(244_244_245/0.45)]",
  },
};

const withClass = (el: SVGSVGElement, cls: string) => {
  el.classList.add(...cls.split(" "));
  return el;
};

export function showMenu(anchor: HTMLElement, entries: MenuEntry[], opts: MenuOptions = {}) {
  closeMenu();
  const s = opts.variant === "dark" ? STYLE.dark : STYLE.light;
  const items: HTMLButtonElement[] = [];
  const el = h(
    "div",
    { class: s.menu, role: "menu" },
    ...entries.map((e) => {
      if ("separator" in e) return h("div", { class: "mx-2 my-1 h-px bg-line", role: "separator" });
      if ("heading" in e) return h("div", { class: cx(caps, "px-3 pt-2 pb-1") }, e.heading);
      const b = h(
        "button",
        {
          class: cx(s.item, e.danger ? "text-danger hover:bg-danger-soft" : s.text),
          role: "menuitem",
          onclick: () => {
            closeMenu();
            e.run();
          },
        },
        e.icon ? withClass(icon(e.icon), s.icon) : null,
        // A font entry previews its typeface (data-font sets --note-font).
        h("span", { class: e.font ? "truncate font-note text-lg" : "truncate" }, e.label),
        e.hint ? h("span", { class: cx("ml-auto whitespace-nowrap pl-3 text-xs", s.hint) }, e.hint) : null,
        e.checked ? h("span", { class: e.hint ? "ml-2" : "ml-auto" }, withClass(icon("check"), s.icon)) : null,
      );
      if (e.font) b.dataset.font = e.font;
      items.push(b);
      return b;
    }),
  );
  document.body.append(el);

  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  const x = opts.align === "start" ? r.left : r.right - w;
  el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  el.style.top = `${r.bottom + 6 + hgt > window.innerHeight ? r.top - hgt - 6 : r.bottom + 6}px`;

  const onDown = (ev: MouseEvent) => {
    if (!el.contains(ev.target as Node) && ev.target !== anchor) closeMenu();
  };
  const onKey = (ev: KeyboardEvent) => {
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (ev.key === "Escape") {
      ev.stopPropagation();
      closeMenu();
      anchor.focus();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
  };
  setTimeout(() => document.addEventListener("mousedown", onDown), 0);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("blur", closeMenu);
  items[0]?.focus({ preventScroll: true });

  open = {
    el,
    dispose: () => {
      el.remove();
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", closeMenu);
      open = null;
    },
  };
}
