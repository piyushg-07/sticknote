// About page.
import { api } from "../../lib/api";
import { h } from "../../lib/dom";
import { icon, type IconName } from "../../lib/icons";
import appIcon from "../../app-icon.png";

const POINTS: [IconName, string, string][] = [
  ["shield", "100% local", "Notes never leave this PC. No account, no cloud, no telemetry, no ads."],
  ["bolt", "Light on resources", "Event-driven: no polling, no background timers. Note windows are destroyed, not hidden, when closed."],
  ["edge", "Out of the way", "No taskbar button or Alt+Tab entry for notes. The deck hides over fullscreen apps."],
];

export function aboutView(): HTMLElement {
  const version = h("span", { class: "t-muted" });
  void api.getAppInfo().then((i) => {
    version.textContent = `Version ${i.version}`;
  });

  return h(
    "section",
    { class: "page about-page" },
    h("div", { class: "page-inner" },
      h("div", { class: "about-hero" },
        h("img", { src: appIcon, alt: "", width: 64, height: 64, draggable: "false" }),
        h("div", null,
          h("h1", { class: "page-title" }, "Peekin"),
          h("div", { class: "t-muted" }, "Sticky notes that live on the edge of your screen."),
          version,
        ),
      ),
      h("div", { class: "about-grid" },
        ...POINTS.map(([ic, t, d]) =>
          h("div", { class: "set-card about-point" }, h("div", { class: "about-icon" }, icon(ic, 18)), h("div", { class: "set-title" }, t), h("div", { class: "set-desc" }, d)),
        ),
      ),
      h("div", { class: "set-card" },
        h("div", { class: "set-title" }, "Credits"),
        h("div", { class: "set-desc" },
          "Fonts: Excalifont (Excalidraw) and Nunito (Vernon Adams), both under the SIL Open Font License 1.1. Built with Tauri."),
      ),
    ),
  );
}
