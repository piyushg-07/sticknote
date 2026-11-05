// About page.
import { api } from "../../lib/api";
import { h } from "../../lib/dom";
import { icon, type IconName } from "../../lib/icons";
import appIcon from "../../app-icon.png";
import { CARD, CARD_TIGHT, PAGE, PAGE_INNER, PAGE_TITLE_TEXT, SET_DESC, SET_TITLE } from "./settings-view";

const POINTS: [IconName, string, string][] = [
  ["shield", "100% local", "Notes never leave this PC. No account, no cloud, no telemetry, no ads."],
  ["bolt", "Light on resources", "Event-driven: no polling, no background timers. Note windows are destroyed, not hidden, when closed."],
  ["edge", "Out of the way", "No taskbar button or Alt+Tab entry for notes. The deck hides over fullscreen apps."],
];

export function aboutView(): HTMLElement {
  const version = h("span", { class: "text-fg-muted" });
  void api.getAppInfo().then((i) => {
    version.textContent = `Version ${i.version}`;
  });

  return h(
    "section",
    { class: PAGE },
    h("div", { class: PAGE_INNER },
      h("div", { class: "flex items-center gap-5 pt-2 pb-3" },
        h("img", { class: "rounded-xl shadow-md", src: appIcon, alt: "", width: 64, height: 64, draggable: "false" }),
        h("div", null,
          h("h1", { class: PAGE_TITLE_TEXT }, "Peekin"),
          h("div", { class: "text-fg-muted" }, "Sticky notes that live on the edge of your screen."),
          version,
        ),
      ),
      h("div", { class: "grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3" },
        ...POINTS.map(([ic, t, d]) =>
          h("div", { class: CARD_TIGHT },
            h("div", { class: "mb-2 grid size-9 place-items-center rounded-md bg-accent-soft text-accent-text" }, icon(ic, 18)),
            h("div", { class: SET_TITLE }, t),
            h("div", { class: SET_DESC }, d),
          ),
        ),
      ),
      h("div", { class: CARD },
        h("div", { class: SET_TITLE }, "Credits"),
        h("div", { class: SET_DESC },
          "Fonts: Excalifont (Excalidraw) and Nunito (Vernon Adams), both under the SIL Open Font License 1.1. Built with Tauri."),
      ),
    ),
  );
}
