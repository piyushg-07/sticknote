// Tiny DOM builder. Strings become text nodes (never HTML), so user content
// can't inject markup. The only HTML ever assigned is sanitised note bodies,
// via `setRich`.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener> & {
  class?: string;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === "class") {
        el.className = String(v);
      } else if (v === true) {
        el.setAttribute(k, "");
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(typeof c === "string" || typeof c === "number" ? String(c) : c);
  }
}

export function clear(el: Element) {
  el.replaceChildren();
}

/** Render sanitised note HTML (from the Rust sanitizer) into `el`. */
export function setRich(el: HTMLElement, sanitizedHtml: string) {
  el.innerHTML = sanitizedHtml;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: number | undefined;
  const d = (...a: A) => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      t = undefined;
      fn(...a);
    }, ms);
  };
  d.flush = (...a: A) => {
    if (t !== undefined) {
      clearTimeout(t);
      t = undefined;
      fn(...a);
    }
  };
  d.pending = () => t !== undefined;
  return d;
}

export function displayTitle(title: string, text: string): string {
  if (title.trim()) return title;
  const first = text.split("\n").find((l) => l.trim());
  return first ? first.replace(/^(- |\[[ x]\] |\d+\. )/, "").slice(0, 60) : "Untitled";
}

export function preview(text: string): string {
  return text.replace(/\s*\n\s*/g, "  ").trim();
}
