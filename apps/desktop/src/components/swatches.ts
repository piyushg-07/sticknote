import { h } from "../lib/dom";
import { NOTE_COLORS } from "../lib/colors";

/** Eight-colour picker. Returns the element and a setter for the selection. */
export function swatches(onPick: (color: number) => void) {
  const buttons = NOTE_COLORS.map((name, i) =>
    h("button", {
      class: "swatch",
      "data-color": i,
      role: "radio",
      "aria-label": name,
      title: name,
      onclick: () => onPick(i),
    }),
  );
  const el = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Note colour" }, ...buttons);
  const set = (color: number) =>
    buttons.forEach((b, i) => b.setAttribute("aria-checked", String(i === color)));
  return { el, set };
}
