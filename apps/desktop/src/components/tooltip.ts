// Styled tooltips for every control that has a `title`.
//
// One delegated listener per window: on hover, an element's `title` moves to
// `data-tooltip` (so the native tooltip never shows) and a styled tooltip
// appears after a short delay — instantly while moving between controls.
// A shortcut in the title, e.g. "Delete (Ctrl+Backspace)", is shown as key
// chips. Hidden on click, key press, scroll and blur.
import { h } from "../lib/dom";

const DELAY = 450; // first tooltip
const WARM_MS = 700; // after one was shown, the next appears instantly
const GAP = 8;

// Dark pill with an arrow (::before, aimed by --arrow-x); data-side flips the
// arrow and the entrance offset, data-shown fades it in.
const TIP =
  "pointer-events-none fixed z-200 flex max-w-[280px] items-center gap-2 rounded-[9px] bg-toast px-2.5 py-1.5 font-ui text-sm leading-[1.35] font-medium text-toast-fg opacity-0 shadow-[0_6px_20px_rgb(0_0_0/0.28),0_0_0_1px_rgb(255_255_255/0.06)] [transform:translateY(-3px)_scale(0.98)] [transition:opacity_120ms_var(--ease-out),transform_160ms_var(--ease-out)] before:absolute before:left-[calc(var(--arrow-x,50%)-5px)] before:size-2.5 before:rotate-45 before:rounded-[2px] before:bg-inherit before:content-[''] data-[side=above]:[transform:translateY(3px)_scale(0.98)] data-[side=above]:before:-bottom-1 data-[side=below]:before:-top-1 data-shown:opacity-100 data-shown:[transform:none]!";
const KEY = "inline-flex h-[18px] items-center whitespace-nowrap rounded-xs bg-white/14 px-[5px] font-ui text-2xs font-semibold";

const SHORTCUT = /\s*\(((?:Ctrl|Alt|Shift|Esc|Enter|Del)[^)]*)\)/;

let tip: HTMLDivElement | null = null;
let target: HTMLElement | null = null;
let timer: number | undefined;
let lastHidden = 0;

function textOf(el: HTMLElement): string | null {
  const title = el.getAttribute("title");
  if (title) {
    el.dataset.tooltip = title;
    el.removeAttribute("title"); // suppress the native tooltip
  }
  return el.dataset.tooltip || null;
}

function build(text: string): HTMLDivElement {
  const m = text.match(SHORTCUT);
  const label = m ? text.replace(m[0], "").replace(/\s+—\s+/, " — ").trim() : text;
  const keys = m ? m[1].split(/\s*\+\s*(?=.)/).filter(Boolean) : [];
  return h(
    "div",
    { class: TIP, role: "tooltip" },
    h("span", { class: "relative" }, label),
    keys.length ? h("span", { class: "relative inline-flex gap-[3px]" }, ...keys.map((k) => h("kbd", { class: KEY }, k))) : null,
  ) as HTMLDivElement;
}

function show(el: HTMLElement) {
  const text = textOf(el);
  if (!text) return;
  hide(false);
  tip = build(text);
  document.body.append(tip);

  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const th = tip.offsetHeight;
  const below = r.bottom + GAP + th <= window.innerHeight - 4;
  const top = below ? r.bottom + GAP : r.top - GAP - th;
  const left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 6));
  tip.style.top = `${Math.max(4, top)}px`;
  tip.style.left = `${left}px`;
  // Arrow points at the control's centre even when the tooltip is clamped.
  tip.style.setProperty("--arrow-x", `${Math.max(10, Math.min(r.left + r.width / 2 - left, w - 10))}px`);
  tip.dataset.side = below ? "below" : "above";
  requestAnimationFrame(() => {
    if (tip) tip.dataset.shown = "";
  });
}

function hide(remember = true) {
  clearTimeout(timer);
  timer = undefined;
  if (tip) {
    tip.remove();
    tip = null;
    if (remember) lastHidden = performance.now();
  }
}

export function initTooltips(root: ParentNode = document) {
  root.addEventListener("pointerover", (e) => {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>("[title], [data-tooltip]");
    if (!el || el === target) return;
    target = el;
    hide();
    textOf(el); // move the title now so the native tooltip never appears
    const warm = performance.now() - lastHidden < WARM_MS;
    timer = window.setTimeout(() => target === el && show(el), warm ? 0 : DELAY);
  });
  root.addEventListener("pointerout", (e) => {
    if (!target) return;
    const to = (e as PointerEvent).relatedTarget as Node | null;
    if (to && target.contains(to)) return;
    target = null;
    hide();
  });
  const dismiss = () => {
    target = null;
    hide(false);
  };
  root.addEventListener("pointerdown", dismiss, true);
  window.addEventListener("keydown", dismiss, true);
  window.addEventListener("scroll", dismiss, true);
  window.addEventListener("blur", dismiss);
}
