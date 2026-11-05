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

interface ChipParts {
  el: HTMLButtonElement;
  label: HTMLSpanElement;
}

function chip(ic: IconName, title: string): ChipParts {
  const label = h("span", { class: "meta-label" });
  const el = h("button", { class: "meta-chip empty", title, "aria-label": title }, icon(ic, 14), label);
  return { el, label };
}

// ---- reminder ---------------------------------------------------------------------

/** Bell chip: opens the reminder panel (quick picks, calendar, time, repeat). */
export function reminderChip(opts: { dark?: boolean; onSet: (at: number | null, repeat: Repeat | null) => void }) {
  const { el, label } = chip("bell", "Remind me");
  let value: { at?: number; repeat?: Repeat } = {};

  el.addEventListener("click", () => showReminderPicker(el, value, opts.onSet, { dark: opts.dark }));

  const set = (note: Note) => {
    value = { at: note.remindAt, repeat: note.repeat };
    const on = !!note.remindAt;
    el.classList.toggle("empty", !on);
    el.classList.toggle("repeating", !!note.repeat);
    label.textContent = on ? reminderChipLabel(note.remindAt!, note.repeat) : "";
    el.title = on ? `Reminder: ${reminderChipLabel(note.remindAt!, note.repeat)}` : "Remind me";
  };
  return { el, set };
}

// ---- apps -----------------------------------------------------------------------------

/** App chip: overlapping icons + "VS Code +2"; opens the app picker. */
export function appChip(opts: { dark?: boolean; onSet: (apps: string[]) => void }) {
  const label = h("span", { class: "meta-label" });
  const glyph = h("span", { class: "meta-glyph" }, icon("appWindow", 14));
  const el = h("button", { class: "meta-chip empty" }, glyph, label);
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
    el.classList.toggle("empty", !any);
    label.textContent = appsLabel(current);
    glyph.replaceChildren(any ? appStack(current, 15, 3) : icon("appWindow", 14));
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
