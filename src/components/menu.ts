// Lightweight popover menu anchored to a button.
import { h } from "../lib/dom";
import { icon, type IconName } from "../lib/icons";

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

export function showMenu(anchor: HTMLElement, entries: MenuEntry[], opts: MenuOptions = {}) {
  closeMenu();
  const items: HTMLButtonElement[] = [];
  const el = h(
    "div",
    { class: `menu${opts.variant ? ` menu-${opts.variant}` : ""}`, role: "menu" },
    ...entries.map((e) => {
      if ("separator" in e) return h("div", { class: "menu-sep", role: "separator" });
      if ("heading" in e) return h("div", { class: "menu-label t-caps" }, e.heading);
      const b = h(
        "button",
        {
          class: "menu-item",
          role: "menuitem",
          onclick: () => {
            closeMenu();
            e.run();
          },
        },
        e.icon ? icon(e.icon) : null,
        h("span", { class: "truncate" }, e.label),
        e.hint ? h("span", { class: "hint" }, e.hint) : null,
        e.checked ? h("span", { class: "check" }, icon("check")) : null,
      );
      if (e.danger) b.classList.add("btn-danger");
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
