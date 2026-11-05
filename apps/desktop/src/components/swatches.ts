import { h } from "../lib/dom";
import { NOTE_COLORS } from "../lib/colors";

// Each swatch's own data-color supplies its paper (bg-note). The selected one
// becomes a ring in the colour's strong shade, or in note ink when the picker
// sits on note paper (an ancestor with `data-on-note`). Callers resize via
// descendant variants on [role=radiogroup] / [role=radio].
const SWATCH =
  "size-[18px] rounded-full bg-note shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] transition-transform duration-[120ms] ease-out hover:scale-115 aria-checked:bg-transparent aria-checked:shadow-[inset_0_0_0_2px_var(--note-strong)] in-data-on-note:aria-checked:shadow-[inset_0_0_0_2px_var(--color-note-ink)]";

/** Eight-colour picker. Returns the element and a setter for the selection. */
export function swatches(onPick: (color: number) => void) {
  const buttons = NOTE_COLORS.map((name, i) =>
    h("button", {
      class: SWATCH,
      "data-color": i,
      role: "radio",
      "aria-label": name,
      title: name,
      onclick: () => onPick(i),
    }),
  );
  const el = h("div", { class: "flex items-center gap-1.5", role: "radiogroup", "aria-label": "Note colour" }, ...buttons);
  const set = (color: number) =>
    buttons.forEach((b, i) => b.setAttribute("aria-checked", String(i === color)));
  return { el, set };
}
