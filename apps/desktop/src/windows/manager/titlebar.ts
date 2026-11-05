// Window chrome: the draggable top bar of the main area with the window
// controls. (The app identity lives at the top of the sidebar.)
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../../lib/api";
import { h } from "../../lib/dom";
import { icon } from "../../lib/icons";

const WIN_BTN = "grid h-10 w-[46px] place-items-center text-fg-muted transition-colors duration-[120ms]";
const WIN_BTN_HOVER = "hover:bg-surface-hover hover:text-fg";
const WIN_BTN_CLOSE = "hover:bg-[#e81123] hover:text-white";

export function topbar(): HTMLElement {
  const win = getCurrentWindow();
  const maxBtn = h("button", { class: `${WIN_BTN} ${WIN_BTN_HOVER}`, title: "Maximize", "aria-label": "Maximize" }, icon("maximize", 13));

  const syncMax = async () => {
    const m = await win.isMaximized();
    maxBtn.replaceChildren(icon(m ? "restoreWin" : "maximize", 13));
    maxBtn.title = m ? "Restore" : "Maximize";
  };
  window.addEventListener("resize", () => void syncMax());
  maxBtn.addEventListener("click", () => void win.toggleMaximize());

  return h(
    "header",
    { class: "flex h-10 flex-none justify-end", "data-tauri-drag-region": true },
    h("div", { class: "flex" },
      h("button", { class: `${WIN_BTN} ${WIN_BTN_HOVER}`, title: "Minimize", "aria-label": "Minimize", onclick: () => void win.minimize() }, icon("minus", 13)),
      maxBtn,
      h("button", { class: `${WIN_BTN} ${WIN_BTN_CLOSE}`, title: "Close", "aria-label": "Close", onclick: () => void api.closeSelf() }, icon("close", 13)),
    ),
  );
}
