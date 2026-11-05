// Human-friendly time formatting.
import type { Repeat } from "./types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Compact relative time: "now", "3m", "2h", "5d", then a short date. */
export function ago(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms);
  if (d < MIN) return "now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  if (d < DAY) return `${Math.floor(d / HOUR)}h`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d`;
  return shortDate(ms);
}

/** Longer phrase: "just now", "3m ago". */
export function agoLong(ms: number): string {
  const a = ago(ms);
  if (a === "now") return "just now";
  return /^\d+[mhd]$/.test(a) ? `${a} ago` : a;
}

export function shortDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// ---- reminders ------------------------------------------------------------------

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "Today 5:00 PM", "Tomorrow 9:00 AM", "Mon 9:00 AM", "12 Nov, 9:00 AM". */
export function reminderLabel(ms: number): string {
  const d = new Date(ms);
  const days = Math.round((startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / DAY);
  if (days === 0) return `Today ${clock(d)}`;
  if (days === 1) return `Tomorrow ${clock(d)}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${clock(d)}`;
  return `${shortDate(ms)}, ${clock(d)}`;
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** Chip label: "Today 5:00 PM", or for repeats "Daily · 9:00 AM",
 *  "Weekly · Mon 9:00 AM", "Monthly · 12th 9:00 AM". */
export function reminderChipLabel(ms: number, repeat?: Repeat): string {
  if (!repeat) return reminderLabel(ms);
  const d = new Date(ms);
  if (repeat === "weekly") return `Weekly · ${d.toLocaleDateString(undefined, { weekday: "short" })} ${clock(d)}`;
  if (repeat === "monthly") return `Monthly · ${ordinal(d.getDate())} ${clock(d)}`;
  return `${REPEAT_LABEL[repeat]} · ${clock(d)}`;
}

export function clockLabel(ms: number): string {
  return clock(new Date(ms));
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

export function fullDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
