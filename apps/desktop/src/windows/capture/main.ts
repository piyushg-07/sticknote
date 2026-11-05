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
const LEAVE_MS = 160; // --animate-cap-out in styles/tw/capture.css
const SAVED_MS = 280; // --animate-cap-saved

let color = 3; // Butter until the user picks another; remembered between uses
let busy = false;
let shown = false;

const text = h("textarea", {
  class:
    "m-0 min-h-0 flex-1 resize-none border-0 bg-transparent px-[18px] py-1.5 font-hand text-note-body leading-[1.4] text-note-ink caret-note-ink outline-0 placeholder:text-note-ink-muted [&::-webkit-scrollbar-thumb]:bg-note-ink-faint",
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
/** Keyboard hint keys, restyled for note paper. */
const capKbd =
  "inline-flex h-[18px] items-center whitespace-nowrap rounded-sm border border-note-ink-faint bg-white/45 px-[5px] font-ui text-2xs text-note-ink";
const openBtn = h("button", {
  class:
    "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-sm px-2.5 font-ui text-sm text-note-ink transition-[background-color] duration-[120ms] hover:bg-black/7",
  title: "Save and open as a full note" }, "Open as note", icon("external", 13));
const card = h(
  "div",
  {
    // data-on-note: components inside (swatches, app stacks) restyle for note paper.
    "data-on-note": true,
    // Invisible until data-anim="enter" (tw/capture.css); leave / saved play
    // their exit from the hidden base, as before.
    class:
      "flex h-full flex-col rounded-[18px] bg-note text-note-ink opacity-0 shadow-[0_10px_28px_rgb(0_0_0/0.28),0_1px_3px_rgb(0_0_0/0.14)] transition-[background-color] duration-200 ease-in-out data-[anim=enter]:animate-cap-in data-[anim=enter]:opacity-100 data-[anim=leave]:animate-cap-out data-[anim=leave]:opacity-100 data-[anim=saved]:animate-cap-saved data-[anim=saved]:opacity-100",
  },
  h(
    "div",
    {
      // small swatches, selected one ringed in ink
      class:
        "flex items-center gap-2 pt-[14px] pr-4 pb-1 pl-[18px] [&_[role=radiogroup]]:gap-1 [&_[role=radio]]:size-3.5 [&_[role=radio][aria-checked=true]]:shadow-[inset_0_0_0_2px_var(--color-note-ink)]",
    },
    h("span", { class: "flex-1 font-ui text-xs font-semibold uppercase tracking-caps text-note-ink-muted" }, "Quick note"),
    picker.el,
  ),
  text,
  h("div", { class: "flex items-center gap-2 pt-1 pr-2.5 pb-2.5 pl-[18px]" },
    h(
      "span",
      { class: "min-w-0 flex-1 truncate font-ui text-xs text-note-ink-muted" },
      h("kbd", { class: capKbd }, "Enter"),
      " save   ",
      h("kbd", { class: capKbd }, "Esc"),
      " close",
    ),
    openBtn,
  ),
);
document.getElementById("app")!.append(card);

function paintColor() {
  card.dataset.color = String(color);
  picker.set(color);
}

function play(anim: "enter" | "leave" | "saved") {
  delete card.dataset.anim;
  void card.offsetWidth; // restart the animation
  card.dataset.anim = anim;
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
