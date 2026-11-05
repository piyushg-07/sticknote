// Reminder panel: everything about a note's reminder in one clean place.
//
//   [In 1 hour] [This evening] [Tomorrow] [Next Mon]      quick picks
//   ‹  November 2026  ›                                   calendar
//   Mo Tu We Th Fr Sa Su …
//   TIME    [–]05[+] : [–]30[+]  [AM|PM]
//   REPEAT  [ Daily        Every day ⌄ ]
//   Daily at 9:00 AM, starting Tue 12 Nov
//   Remove                                     Cancel  Set reminder
//
// Keyboard: arrows move the day, PageUp/PageDown change month, Enter sets,
// Esc cancels.
import { h } from "../lib/dom";
import { icon } from "../lib/icons";
import { REPEAT_LABEL } from "../lib/time";
import type { Repeat } from "../lib/types";
import { dropdown } from "./dropdown";

const ordinalSuffix = (n: number) =>
  n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");

const MINUTE_STEP = 5;
const REPEATS: (Repeat | null)[] = [null, "daily", "weekdays", "weekly", "monthly"];

let closeOpen: (() => void) | null = null;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export interface ReminderValue {
  at?: number;
  repeat?: Repeat;
}

export function showReminderPicker(
  anchor: HTMLElement,
  value: ReminderValue,
  onSet: (at: number | null, repeat: Repeat | null) => void,
  opts: { dark?: boolean } = {},
) {
  closeOpen?.();
  const existing = !!value.at;

  // Start from the current reminder, else one hour from now (rounded to 5 min).
  const start = new Date(value.at ?? Date.now() + 60 * 60_000);
  start.setSeconds(0, 0);
  if (!value.at) start.setMinutes(Math.ceil(start.getMinutes() / MINUTE_STEP) * MINUTE_STEP);
  let day = dayStart(start);
  let hour = start.getHours();
  let minute = start.getMinutes();
  let repeat: Repeat | null = value.repeat ?? null;
  let view = new Date(day.getFullYear(), day.getMonth(), 1);

  const quick = h("div", { class: "rp-quick" });
  const monthLabel = h("div", { class: "dt-month", "aria-live": "polite" });
  const prev = h("button", { class: "dt-nav", title: "Previous month", "aria-label": "Previous month" }, icon("chevronLeftSm", 16));
  const next = h("button", { class: "dt-nav", title: "Next month", "aria-label": "Next month" }, icon("chevronRightSm", 16));
  const grid = h("div", { class: "dt-grid", role: "grid", "aria-label": "Choose a day" });
  const hourVal = h("span", { class: "dt-num" });
  const minVal = h("span", { class: "dt-num" });
  const am = h("button", { class: "dt-ampm" }, "AM");
  const pm = h("button", { class: "dt-ampm" }, "PM");
  // Declared before anything that reads them (the dropdown does, right away).
  const chosen = () => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
  const isPast = (d: Date) => d.getTime() < Date.now() - 60_000;

  // Repeat: custom dropdown whose hints follow the chosen day/time.
  const repeatHint = (r: Repeat | null): string | undefined => {
    const c = chosen();
    if (r === "daily") return "Every day";
    if (r === "weekdays") return "Mon – Fri";
    if (r === "weekly") return `Every ${c.toLocaleDateString(undefined, { weekday: "long" })}`;
    if (r === "monthly") return `Every month on the ${c.getDate()}${ordinalSuffix(c.getDate())}`;
    return "Just once";
  };
  const repeatMenu = dropdown<Repeat | null>({
    label: "Repeat",
    value: repeat,
    dark: opts.dark,
    options: () => REPEATS.map((r) => ({ value: r, label: r ? REPEAT_LABEL[r] : "Never", hint: repeatHint(r) })),
    onChange: (r) => {
      repeat = r;
      paint();
    },
  });
  const repeats = repeatMenu.el;
  const summary = h("div", { class: "dt-summary" });
  const remove = h("button", { class: "dt-btn danger" }, "Remove");
  const cancel = h("button", { class: "dt-btn" }, "Cancel");
  const setBtn = h("button", { class: "dt-btn primary" }, existing ? "Update" : "Set reminder");

  const stepper = (val: HTMLElement, label: string, step: (d: number) => void) =>
    h("div", { class: "dt-stepper", role: "group", "aria-label": label },
      h("button", { class: "dt-step", "aria-label": `Earlier ${label.toLowerCase()}`, onclick: () => step(-1) }, icon("minus", 13)),
      val,
      h("button", { class: "dt-step", "aria-label": `Later ${label.toLowerCase()}`, onclick: () => step(1) }, icon("plus", 13)),
    );

  const pop = h(
    "div",
    { class: `dt-picker rp${opts.dark ? " dark" : ""}`, role: "dialog", "aria-label": "Reminder" },
    quick,
    h("div", { class: "dt-head" }, prev, monthLabel, next),
    grid,
    h("div", { class: "rp-row" },
      h("div", { class: "rp-label" }, icon("bell", 12), "Time"),
      h("div", { class: "dt-fine" },
        stepper(hourVal, "Hour", (d) => {
          hour = (hour >= 12 ? 12 : 0) + (((hour % 12) + d + 12) % 12);
          paint();
        }),
        h("span", { class: "dt-colon" }, ":"),
        stepper(minVal, "Minutes", (d) => {
          minute = (minute + d * MINUTE_STEP + 60) % 60;
          paint();
        }),
        h("div", { class: "dt-ampm-group", role: "group", "aria-label": "AM or PM" }, am, pm),
      ),
    ),
    h("div", { class: "rp-row" }, h("div", { class: "rp-label" }, icon("restore", 12), "Repeat"), repeats),
    h("div", { class: "dt-foot" },
      summary,
      h("div", { class: "dt-actions" }, existing ? remove : null, h("span", { class: "grow" }), cancel, setBtn),
    ),
  );
  document.body.append(pop);

  const setTo = (d: Date) => {
    day = dayStart(d);
    hour = d.getHours();
    minute = d.getMinutes();
    view = new Date(day.getFullYear(), day.getMonth(), 1);
    paint();
  };

  // ---- quick picks (relative to now) ---------------------------------------------
  function quickPicks(): { label: string; at: Date }[] {
    const now = new Date();
    const out: { label: string; at: Date }[] = [];
    const inHour = new Date(now.getTime() + 60 * 60_000);
    inHour.setSeconds(0, 0);
    inHour.setMinutes(Math.ceil(inHour.getMinutes() / MINUTE_STEP) * MINUTE_STEP);
    out.push({ label: "In 1 hour", at: inHour });
    const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
    if (evening.getTime() - now.getTime() > 60 * 60_000) out.push({ label: "This evening", at: evening });
    out.push({ label: "Tomorrow", at: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0) });
    const toMon = (8 - now.getDay()) % 7 || 7;
    out.push({ label: "Next Mon", at: new Date(now.getFullYear(), now.getMonth(), now.getDate() + toMon, 9, 0) });
    return out;
  }

  // ---- paint --------------------------------------------------------------------------
  function paint() {
    const today = dayStart(new Date());
    const c = chosen();

    quick.replaceChildren(
      ...quickPicks().map((q) => {
        const b = h("button", { class: `rp-pick${c.getTime() === q.at.getTime() ? " on" : ""}`, title: `${fmtDay(q.at)} · ${fmtTime(q.at)}` }, q.label);
        b.addEventListener("click", () => setTo(q.at));
        return b;
      }),
    );

    monthLabel.textContent = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    prev.disabled = view <= new Date(today.getFullYear(), today.getMonth(), 1);
    const names = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }));
    const offset = (view.getDay() + 6) % 7;
    const cells: HTMLElement[] = names.map((n) => h("div", { class: "dt-wd", "aria-hidden": "true" }, n));
    for (let i = 0; i < 42; i++) {
      const d = new Date(view.getFullYear(), view.getMonth(), 1 - offset + i);
      const outside = d.getMonth() !== view.getMonth();
      const b = h(
        "button",
        {
          class: `dt-day${outside ? " outside" : ""}${sameDay(d, today) ? " today" : ""}${sameDay(d, day) ? " selected" : ""}`,
          role: "gridcell",
          "aria-selected": String(sameDay(d, day)),
          "aria-label": d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
          tabindex: sameDay(d, day) ? 0 : -1,
        },
        String(d.getDate()),
      );
      b.disabled = d < today;
      b.addEventListener("click", () => {
        day = dayStart(d);
        if (outside) view = new Date(d.getFullYear(), d.getMonth(), 1);
        paint();
      });
      cells.push(b);
    }
    grid.replaceChildren(...cells);

    hourVal.textContent = String(hour % 12 || 12);
    minVal.textContent = String(minute).padStart(2, "0");
    am.setAttribute("aria-pressed", String(hour < 12));
    pm.setAttribute("aria-pressed", String(hour >= 12));

    repeatMenu.set(repeat);

    const past = isPast(c);
    let text: HTMLElement;
    if (past) text = h("span", { class: "dt-warn" }, "That time has passed. Pick a later time.");
    else if (!repeat) text = h("span", null, "Remind me ", h("strong", null, `${fmtDay(c)} · ${fmtTime(c)}`));
    else {
      const when =
        repeat === "weekly" ? `every ${c.toLocaleDateString(undefined, { weekday: "long" })} at ${fmtTime(c)}`
        : repeat === "monthly" ? `every month on the ${c.getDate()}${ordinalSuffix(c.getDate())} at ${fmtTime(c)}`
        : repeat === "weekdays" ? `every weekday at ${fmtTime(c)}`
        : `every day at ${fmtTime(c)}`;
      text = h("span", null, "Remind me ", h("strong", null, when), `, starting ${fmtDay(c)}`);
    }
    summary.replaceChildren(text);
    summary.title = text.textContent ?? "";
    setBtn.disabled = past;
  }

  // ---- actions --------------------------------------------------------------------------
  am.addEventListener("click", () => {
    if (hour >= 12) hour -= 12;
    paint();
  });
  pm.addEventListener("click", () => {
    if (hour < 12) hour += 12;
    paint();
  });
  prev.addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    paint();
  });
  next.addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    paint();
  });
  cancel.addEventListener("click", () => close());
  remove.addEventListener("click", () => {
    close();
    onSet(null, null);
  });
  setBtn.addEventListener("click", () => {
    if (isPast(chosen())) return;
    close();
    onSet(chosen().getTime(), repeat);
  });

  // ---- keyboard ---------------------------------------------------------------------------
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector(".dd-menu")) return; // the open dropdown handles keys
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Enter") {
      if ((document.activeElement as HTMLElement)?.closest(".dd-button, .dt-btn, .rp-pick")) return; // let it act
      e.preventDefault();
      e.stopPropagation();
      setBtn.click();
    } else if (e.key in moves && (document.activeElement as HTMLElement)?.classList.contains("dt-day")) {
      e.preventDefault();
      const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + moves[e.key]);
      if (d >= dayStart(new Date())) {
        day = d;
        view = new Date(d.getFullYear(), d.getMonth(), 1);
        paint();
        grid.querySelector<HTMLElement>(".dt-day.selected")?.focus();
      }
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      (e.key === "PageUp" ? prev : next).click();
    }
  };
  const onDown = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!pop.contains(t) && !anchor.contains(t) && !t.closest?.(".dd-menu")) close();
  };
  function close() {
    repeatMenu.close();
    pop.remove();
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onDown, true);
    closeOpen = null;
  }
  closeOpen = close;
  document.addEventListener("keydown", onKey, true);
  setTimeout(() => document.addEventListener("mousedown", onDown, true), 0);

  paint();
  // Place under the anchor (or above), kept on screen.
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const ph = pop.offsetHeight;
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  const below = r.bottom + 6;
  const above = r.top - ph - 6;
  const top = below + ph <= window.innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, window.innerHeight - ph - 8);
  pop.style.top = `${top}px`;
  grid.querySelector<HTMLElement>(".dt-day.selected")?.focus();
}
