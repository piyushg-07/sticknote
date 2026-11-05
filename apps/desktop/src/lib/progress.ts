// Checklist progress, read from a note's plain-text projection (the Rust side
// writes ticked items as "[x] …" and open ones as "[ ] …").

export interface Progress {
  done: number;
  total: number;
  /** 0..1 */
  ratio: number;
}

export function checklistProgress(text: string): Progress | null {
  let done = 0;
  let total = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("[x] ")) {
      done++;
      total++;
    } else if (line.startsWith("[ ] ")) {
      total++;
    }
  }
  return total ? { done, total, ratio: done / total } : null;
}
