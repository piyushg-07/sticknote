// Small inline popover for adding/editing a link (Ctrl+K).
import { h } from "../lib/dom";

/** Normalise user input into a safe URL, or null if it isn't one. */
function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return "";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) s = `mailto:${s}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Resolves with the URL, "" to remove the link, or null if cancelled.
 */
export function openLinkPopover(anchor: HTMLElement, range: Range, initial: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h("input", {
      class: "h-7 w-[220px] rounded-sm border border-line bg-surface-2 px-2 text-sm text-fg",
      type: "text", placeholder: "Paste or type a link", value: initial, spellcheck: "false" });
    const pop = h("div", {
      class: "fixed z-70 flex animate-pop-in gap-1 rounded-md border border-line bg-surface p-1 font-ui shadow-lg",
      role: "dialog",
      "aria-label": "Add link",
    }, input);
    document.body.append(pop);

    const rect = range.getBoundingClientRect();
    const base = rect.width || rect.height ? rect : anchor.getBoundingClientRect();
    const top = Math.min(base.bottom + 6, window.innerHeight - 44);
    const left = Math.max(8, Math.min(base.left, window.innerWidth - 240));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;

    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      pop.remove();
      resolve(v);
    };

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const url = normalizeUrl(input.value);
        if (url === null) {
          input.setCustomValidity("Only web and email links are allowed");
          input.reportValidity();
          return;
        }
        finish(url);
      }
    });
    input.addEventListener("blur", () => finish(null));
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}
