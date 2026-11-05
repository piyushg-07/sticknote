// Quick capture: type, Enter, done — the thought becomes a tab on the deck.
//  * Enter saves · Shift+Enter adds a line · Esc closes
//  * closing (Esc or clicking away) keeps the draft for next time
//  * "Open as note" saves it and opens the full note window
// The window stays loaded and hidden between uses, so it appears instantly.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "../../lib/api";
import { on } from "../../lib/events";
import { setTheme } from "../../lib/theme";
import { h } from "../../lib/dom";
import { icon } from "../../lib/icons";
import { swatches } from "../../components/swatches";
import { initTooltips } from "../../components/tooltip";

initTooltips();

const win = getCurrentWindow();
const LEAVE_MS = 160;
const SAVED_MS = 280;

let color = 3; // Butter until the user picks another; remembered between uses
let busy = false;
let shown = false;

const text = h("textarea", {
  class: "cap-text",
  placeholder: "What's on your mind?",
  spellcheck: "true",
  maxlength: 20000,
  "aria-label": "New note",
});
const picker = swatches((c) => {
  color = c;
  paintColor();
  text.focus();
});
const openBtn = h("button", { class: "cap-open", title: "Save and open as a full note" }, "Open as note", icon("external", 13));
const card = h(
  "div",
  { class: "cap" },
  h("div", { class: "cap-head" }, h("span", { class: "cap-title" }, "Quick note"), picker.el),
  text,
  h("div", { class: "cap-foot" },
    h("span", { class: "cap-hint" }, h("kbd", null, "Enter"), " save   ", h("kbd", null, "Esc"), " close"),
    openBtn,
  ),
);
card.classList.add("on-note");
document.getElementById("app")!.append(card);

function paintColor() {
  card.dataset.color = String(color);
  picker.set(color);
}

function play(cls: "enter" | "leave" | "saved") {
  card.classList.remove("enter", "leave", "saved");
  void card.offsetWidth; // restart the animation
  card.classList.add(cls);
}

async function hide(how: "leave" | "saved") {
  if (!shown) return;
  shown = false;
  play(how);
  await new Promise((r) => setTimeout(r, how === "saved" ? SAVED_MS : LEAVE_MS));
  await win.hide();
}

async function save(openAfter: boolean) {
  if (busy) return;
  const value = text.value.trim();
  if (!value && !openAfter) return void hide("leave");
  busy = true;
  try {
    const note = await api.quickNote(value, color);
    text.value = "";
    if (openAfter) {
      await hide("leave");
      await api.openNoteWindow(note.id);
    } else {
      await hide("saved");
    }
  } finally {
    busy = false;
  }
}

text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    void save(true); // Ctrl+Enter: save and open as a full note
  } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void save(false);
  } else if (e.key === "Escape") {
    e.preventDefault();
    void hide("leave"); // the draft stays for next time
  }
});
openBtn.addEventListener("click", () => void save(true));

// Clicking elsewhere closes the card; the draft is kept.
window.addEventListener("blur", () => {
  if (shown && !busy) void hide("leave");
});

void on("capture:show", (edge) => {
  shown = true;
  card.style.setProperty("--from-edge", edge === "right" ? "1" : "-1");
  paintColor();
  play("enter");
  text.focus();
  text.setSelectionRange(text.value.length, text.value.length);
});
void on("settings:changed", (s) => setTheme(s.theme));

void api.getSettings().then((s) => setTheme(s.theme));
paintColor();
