// A small custom dropdown (replaces native <select>, which can't be styled).
//
//   [ Daily                       ⌄ ]
//    ┌──────────────────────────────┐
//    │ Never                         │
//    │ Daily        Every day      ✓ │
//    │ Weekdays     Mon – Fri        │
//    └──────────────────────────────┘
// Opens on click / Enter / Space / ↓. Arrow keys move, Enter picks, Esc
// closes just the dropdown.
import { h } from "../lib/dom";
import { icon } from "../lib/icons";

export interface DropdownOption<T> {
  value: T;
  label: string;
  /** muted text on the right, e.g. "Mon – Fri" */
  hint?: string;
}

export function dropdown<T>(opts: {
  label: string;
  options: () => DropdownOption<T>[];
  value: T;
  onChange: (v: T) => void;
  dark?: boolean;
}) {
  let value = opts.value;
  const text = h("span", { class: "dd-value" });
  const button = h(
    "button",
    { class: "dd-button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": opts.label },
    text,
    icon("chevronRightSm", 14),
  );
  let menu: HTMLElement | null = null;
  let items: HTMLButtonElement[] = [];
  let active = 0;

  const paint = () => {
    text.textContent = opts.options().find((o) => o.value === value)?.label ?? "";
  };

  const close = () => {
    menu?.remove();
    menu = null;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onDown, true);
  };

  const choose = (v: T) => {
    value = v;
    paint();
    close();
    button.focus();
    opts.onChange(v);
  };

  const setActive = (i: number) => {
    active = (i + items.length) % items.length;
    items.forEach((b, k) => b.classList.toggle("active", k === active));
  };

  function onKey(e: KeyboardEvent) {
    if (!menu) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // close only the dropdown, not the panel around it
      close();
      button.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setActive(active + (e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      items[active]?.click();
    }
  }
  function onDown(e: MouseEvent) {
    if (menu && !menu.contains(e.target as Node) && !button.contains(e.target as Node)) close();
  }

  const open = () => {
    const options = opts.options();
    items = options.map((o) => {
      const selected = o.value === value;
      const b = h(
        "button",
        { class: "dd-item", role: "option", "aria-selected": String(selected) },
        h("span", { class: "dd-label" }, o.label),
        o.hint ? h("span", { class: "dd-hint" }, o.hint) : null,
        h("span", { class: "dd-check" }, selected ? icon("check", 14) : null),
      );
      b.addEventListener("click", () => choose(o.value));
      b.addEventListener("pointermove", () => setActive(items.indexOf(b)));
      return b;
    });
    menu = h("div", { class: `dd-menu${opts.dark ? " dark" : ""}`, role: "listbox", "aria-label": opts.label }, ...items);
    document.body.append(menu);

    const r = button.getBoundingClientRect();
    menu.style.minWidth = `${r.width}px`;
    const mh = menu.offsetHeight;
    const below = r.bottom + 4 + mh <= window.innerHeight - 8;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - mh - 4)}px`;
    button.setAttribute("aria-expanded", "true");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    document.addEventListener("keydown", onKey, true);
    setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);
  };

  button.addEventListener("click", () => (menu ? close() : open()));
  button.addEventListener("keydown", (e) => {
    if (!menu && (e.key === "ArrowDown" || e.key === " ")) {
      e.preventDefault();
      e.stopPropagation();
      open();
    }
  });
  paint();

  return {
    el: button,
    set(v: T) {
      value = v;
      paint();
    },
    /** refresh the shown label (e.g. when option texts depend on other state) */
    refresh: paint,
    close,
  };
}
