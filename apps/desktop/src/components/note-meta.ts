// The two "meta" chips shown in a note's header:
//  * Reminder  – bell; shows "Today 5:00 PM" when set
//  * App       – window icon; shows "VS Code" when the note is tied to an app
// Both open a menu. Used by the note window and the All notes window.
import { h } from "../lib/dom";
import { icon, type IconName } from "../lib/icons";
import { appIcon, appLogo, appName, loadIcons } from "../lib/apps";
import { appStack, appsLabel, showAppPicker } from "./app-picker";
import { reminderChipLabel } from "../lib/time";
import { showReminderPicker } from "./reminder-picker";
import type { Note, Repeat } from "../lib/types";
import { cx } from "../lib/ui";

// Empty chips (data-empty) are just a quiet icon; set chips read as a small
// labelled pill. On note paper they take the note's ink; `onPage` chips sit on
// the window (the All notes detail header) and use theme colours.
const CHIP =
  "group/chip inline-flex h-[26px] max-w-[150px] items-center gap-[5px] whitespace-nowrap rounded-full pr-[9px] pl-2 font-ui text-xs font-semibold transition-[background-color,opacity] duration-[120ms] data-empty:w-7 data-empty:justify-center data-empty:p-0 [&_.icon]:stroke-2";
const ON_NOTE =
  "bg-black/7 text-note-ink hover:bg-black/12 data-empty:bg-transparent data-empty:opacity-60 data-empty:hover:bg-black/7 data-empty:hover:opacity-100";
const ON_PAGE =
  "bg-surface-2 text-fg-muted hover:bg-surface-active hover:text-fg data-empty:bg-transparent data-empty:text-fg-faint data-empty:hover:bg-surface-hover data-empty:hover:text-fg";
const LABEL = "overflow-hidden text-ellipsis group-data-empty/chip:hidden";

interface ChipOptions {
  /** the note window: menus and pickers open dark */
  dark?: boolean;
  /** on the window background rather than note paper: theme colours */
  onPage?: boolean;
}

interface ChipParts {
  el: HTMLButtonElement;
  label: HTMLSpanElement;
}

function chip(ic: IconName, title: string, onPage?: boolean): ChipParts {
  const label = h("span", { class: LABEL });
  const el = h("button", { class: cx(CHIP, onPage ? ON_PAGE : ON_NOTE), "data-empty": true, title, "aria-label": title }, icon(ic, 14), label);
  return { el, label };
}

// ---- reminder ---------------------------------------------------------------------

/** Bell chip: opens the reminder panel (quick picks, calendar, time, repeat). */
export function reminderChip(opts: ChipOptions & { onSet: (at: number | null, repeat: Repeat | null) => void }) {
  const { el, label } = chip("bell", "Remind me", opts.onPage);
  let value: { at?: number; repeat?: Repeat } = {};

  el.addEventListener("click", () => showReminderPicker(el, value, opts.onSet, { dark: opts.dark }));

  const set = (note: Note) => {
    value = { at: note.remindAt, repeat: note.repeat };
    const on = !!note.remindAt;
    el.toggleAttribute("data-empty", !on);
    el.toggleAttribute("data-repeating", !!note.repeat);
    label.textContent = on ? reminderChipLabel(note.remindAt!, note.repeat) : "";
    el.title = on ? `Reminder: ${reminderChipLabel(note.remindAt!, note.repeat)}` : "Remind me";
  };
  return { el, set };
}

// ---- apps -----------------------------------------------------------------------------

/** App chip: overlapping icons + "VS Code +2"; opens the app picker. */
export function appChip(opts: ChipOptions & { onSet: (apps: string[]) => void }) {
  const label = h("span", { class: LABEL });
  const glyph = h("span", { class: "inline-grid place-items-center" }, icon("appWindow", 14));
  const el = h("button", { class: cx(CHIP, opts.onPage ? ON_PAGE : ON_NOTE), "data-empty": true }, glyph, label);
  let current: string[] = [];

  el.addEventListener("click", () =>
    showAppPicker(
      el,
      current,
      (apps) => {
        current = apps;
        paint();
        opts.onSet(apps);
      },
      { dark: opts.dark },
    ),
  );

  function paint() {
    const any = current.length > 0;
    el.toggleAttribute("data-empty", !any);
    label.textContent = appsLabel(current);
    glyph.replaceChildren(any ? appStack(current, 15, 3, "note") : icon("appWindow", 14));
    const title = any
      ? `Shown only while using ${current.map(appName).join(", ")}`
      : "Show on the deck with every app";
    el.title = title;
    el.setAttribute("aria-label", title);
  }
  const set = (note: Note) => {
    current = note.apps ?? [];
    paint();
    // Real icons / logos load lazily; repaint once they're in.
    if (current.some((a) => !appIcon(a) && !appLogo(a))) void loadIcons(current).then(paint).catch(() => {});
  };
  return { el, set };
}
