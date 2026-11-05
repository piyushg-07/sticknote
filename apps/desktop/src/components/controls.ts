// Small form controls: toggle switch and segmented control.
import { h } from "../lib/dom";

export function toggle(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const el = h("button", { class: "toggle", role: "switch", "aria-label": label, "aria-checked": String(checked) });
  el.addEventListener("click", () => {
    const next = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(next));
    onChange(next);
  });
  return el;
}

export function segmented<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
) {
  const buttons = options.map((o) =>
    h("button", { "aria-pressed": String(o.value === value), "data-value": o.value }, o.label),
  );
  const el = h("div", { class: "segmented", role: "group", "aria-label": label }, ...buttons);
  buttons.forEach((b, i) =>
    b.addEventListener("click", () => {
      buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onChange(options[i].value);
    }),
  );
  return el;
}
