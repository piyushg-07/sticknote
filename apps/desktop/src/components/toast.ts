// Toasts with an optional action (used for "Note deleted · Undo").
import { h } from "../lib/dom";
import { icon } from "../lib/icons";

let host: HTMLElement | null = null;

export interface ToastHandle {
  close(): void;
  readonly el: HTMLElement;
}

export function toast(
  message: string,
  opts: { action?: { label: string; run: () => void }; duration?: number; error?: boolean; key?: string } = {},
): ToastHandle {
  if (!host) {
    host = h("div", { class: "toast-host", role: "status", "aria-live": "polite" });
    document.body.append(host);
  }
  if (opts.key) host.querySelector(`[data-key="${CSS.escape(opts.key)}"]`)?.remove();

  const duration = opts.duration ?? 4000;
  const progress = h("div", { class: "progress" });
  progress.style.animationDuration = `${duration}ms`;
  const el = h(
    "div",
    { class: `toast${opts.error ? " error" : ""}`, "data-key": opts.key ?? null },
    h("span", { class: "msg truncate" }, message),
    opts.action &&
      h("button", {
        class: "btn btn-sm",
        onclick: () => {
          opts.action!.run();
          close();
        },
      }, opts.action.label),
    h("button", { class: "toast-x", title: "Dismiss", "aria-label": "Dismiss", onclick: () => close() }, icon("close", 12)),
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
