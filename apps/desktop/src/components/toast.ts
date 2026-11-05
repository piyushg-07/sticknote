// Toasts with an optional action (used for "Note deleted · Undo").
import { h } from "../lib/dom";
import { icon } from "../lib/icons";
import { cx } from "../lib/ui";

let host: HTMLElement | null = null;

export interface ToastHandle {
  close(): void;
  readonly el: HTMLElement;
}

const TOAST =
  "pointer-events-auto relative flex min-w-[260px] animate-toast-in items-center gap-3 overflow-hidden rounded-lg py-2 pr-2 pl-4 text-md text-toast-fg shadow-lg";
const ACTION =
  "inline-flex h-7 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent bg-white/10 px-2 text-sm font-medium text-white transition-[background-color,border-color,transform] duration-[120ms] hover:bg-white/18 active:translate-y-[0.5px]";
const CLOSE =
  "grid size-7 place-items-center rounded-sm text-[rgb(242_242_246/0.7)] hover:bg-white/12 hover:text-white";

export function toast(
  message: string,
  opts: { action?: { label: string; run: () => void }; duration?: number; error?: boolean; key?: string } = {},
): ToastHandle {
  if (!host) {
    host = h("div", {
      class: "pointer-events-none fixed bottom-5 left-1/2 z-60 flex -translate-x-1/2 flex-col gap-2",
      role: "status",
      "aria-live": "polite",
    });
    document.body.append(host);
  }
  if (opts.key) host.querySelector(`[data-key="${CSS.escape(opts.key)}"]`)?.remove();

  const duration = opts.duration ?? 4000;
  const progress = h("div", { class: "absolute bottom-0 left-0 h-0.5 w-full origin-left animate-toast-progress bg-accent" });
  progress.style.animationDuration = `${duration}ms`;
  const el = h(
    "div",
    { class: cx(TOAST, opts.error ? "bg-[#4a1d1a]" : "bg-toast"), "data-key": opts.key ?? null },
    h("span", { class: "min-w-0 flex-1 truncate" }, message),
    opts.action &&
      h("button", {
        class: ACTION,
        onclick: () => {
          opts.action!.run();
          close();
        },
      }, opts.action.label),
    h("button", { class: CLOSE, title: "Dismiss", "aria-label": "Dismiss", onclick: () => close() }, icon("close", 12)),
    progress,
  );
  host.append(el);
  const timer = window.setTimeout(() => close(), duration);
  function close() {
    clearTimeout(timer);
    el.remove();
  }
  return { close, el };
}

export function closeToast(key: string) {
  host?.querySelector(`[data-key="${CSS.escape(key)}"]`)?.remove();
}
