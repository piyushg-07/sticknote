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
    { class: "tooltip", role: "tooltip" },
    h("span", { class: "tooltip-text" }, label),
    keys.length ? h("span", { class: "tooltip-keys" }, ...keys.map((k) => h("kbd", null, k))) : null,
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
  requestAnimationFrame(() => tip?.classList.add("shown"));
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
