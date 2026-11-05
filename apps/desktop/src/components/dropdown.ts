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
import { cx } from "../lib/ui";

// The button takes its colours from the reminder panel around it (--dt-*),
// falling back to the theme. The menu opens on <body>, so it's told `dark`.
const BUTTON =
  "group/dd flex h-8 w-full items-center gap-2 rounded-[9px] border border-[color:var(--dt-line,var(--border))] bg-[color:var(--dt-chip,var(--surface-2))] pr-2.5 pl-3 text-left font-ui text-sm font-medium text-[color:var(--dt-fg,var(--text))] transition-[border-color,box-shadow] duration-[120ms] hover:not-aria-expanded:border-accent-border aria-expanded:border-accent aria-expanded:shadow-[0_0_0_3px_var(--accent-soft)]";
const STYLE = {
  light: {
    menu: "fixed z-90 flex animate-pop-in flex-col rounded-lg border border-line bg-surface p-1 font-ui shadow-lg",
    item: "text-fg data-active:bg-surface-hover",
    hint: "text-fg-faint",
    check: "text-accent-text",
  },
  dark: {
    menu: "fixed z-90 flex animate-pop-in flex-col rounded-lg border border-white/10 bg-[#26262a] p-1 font-ui shadow-lg",
    item: "text-toast-fg data-active:bg-white/8",
    hint: "text-[rgb(244_244_245/0.45)]",
    check: "text-[#7cc4f2]",
  },
};
const ITEM = "flex h-[34px] items-center gap-3 whitespace-nowrap rounded-md pr-2.5 pl-3 text-left text-sm";

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
  const s = opts.dark ? STYLE.dark : STYLE.light;
  const text = h("span", { class: "min-w-0 flex-1 truncate" });
  const chevron = icon("chevronRightSm", 14);
  chevron.classList.add(
    ..."rotate-90 opacity-60 transition-transform duration-200 ease-out group-aria-expanded/dd:-rotate-90".split(" "),
  );
  const button = h(
    "button",
    { class: BUTTON, "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": opts.label },
    text,
    chevron,
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
    items.forEach((b, k) => b.toggleAttribute("data-active", k === active));
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
        { class: cx(ITEM, s.item), role: "option", "aria-selected": String(selected) },
        h("span", { class: selected ? "flex-1 font-semibold" : "flex-1" }, o.label),
        o.hint ? h("span", { class: cx("text-xs", s.hint) }, o.hint) : null,
        h("span", { class: cx("grid w-3.5", s.check) }, selected ? icon("check", 14) : null),
      );
      b.addEventListener("click", () => choose(o.value));
      b.addEventListener("pointermove", () => setActive(items.indexOf(b)));
      return b;
    });
    // data-dd-menu: lets panels around the dropdown recognise its menu.
    menu = h("div", { class: s.menu, role: "listbox", "aria-label": opts.label, "data-dd-menu": true }, ...items);
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
