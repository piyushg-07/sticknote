// Keyboard combo matching: matchKey(e, "Ctrl+Shift+L").

export function matchKey(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.pop()!;
  const want = { ctrl: false, shift: false, alt: false, meta: false };
  for (const p of parts) if (p in want) want[p as keyof typeof want] = true;
  if (e.ctrlKey !== want.ctrl || e.shiftKey !== want.shift || e.altKey !== want.alt || e.metaKey !== want.meta) {
    return false;
  }
  const k = e.key.toLowerCase();
  if (key === "." ) return k === "." || e.code === "Period";
  if (key === "8") return k === "8" || k === "*" || e.code === "Digit8";
  if (key === "7") return k === "7" || k === "&" || e.code === "Digit7";
  if (key === "backspace") return k === "backspace";
  if (key === "\\") return k === "\\" || e.code === "Backslash";
  if (key === "esc") return k === "escape";
  return k === key || e.code.toLowerCase() === `key${key}`;
}

export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement).isContentEditable;
}
