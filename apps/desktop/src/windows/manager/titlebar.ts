// Window chrome: the draggable top bar of the main area with the window
// controls. (The app identity lives at the top of the sidebar.)
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../../lib/api";
import { h } from "../../lib/dom";
import { icon } from "../../lib/icons";

export function topbar(): HTMLElement {
  const win = getCurrentWindow();
  const maxBtn = h("button", { class: "win-btn", title: "Maximize", "aria-label": "Maximize" }, icon("maximize", 13));

  const syncMax = async () => {
    const m = await win.isMaximized();
    maxBtn.replaceChildren(icon(m ? "restoreWin" : "maximize", 13));
    maxBtn.title = m ? "Restore" : "Maximize";
  };
  window.addEventListener("resize", () => void syncMax());
  maxBtn.addEventListener("click", () => void win.toggleMaximize());

  return h(
    "header",
    { class: "topbar", "data-tauri-drag-region": true },
    h("div", { class: "win-controls" },
      h("button", { class: "win-btn", title: "Minimize", "aria-label": "Minimize", onclick: () => void win.minimize() }, icon("minus", 13)),
      maxBtn,
      h("button", { class: "win-btn close", title: "Close", "aria-label": "Close", onclick: () => void api.closeSelf() }, icon("close", 13)),
    ),
  );
}
