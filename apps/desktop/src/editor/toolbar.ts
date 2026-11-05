// Formatting toolbar for a note:
//   B  I  U  S  |  ☑  •  1.  |  🔗  |  Aa                         …
// Buttons reflect the formatting at the caret. "Aa" picks the note's
// typeface; "…" holds extra actions.
import { h } from "../lib/dom";
import { icon, type IconName } from "../lib/icons";
import { showMenu } from "../components/menu";
import type { NoteFont } from "../lib/types";
import type { Editor } from "./editor";
import { cx } from "../lib/ui";

// On note paper: ink-coloured, quiet until hovered or active.
const BTN =
  "grid h-7 min-w-7 place-items-center rounded-sm px-1 text-note-ink opacity-72 transition-[background-color,opacity] duration-[120ms] hover:opacity-100 hover:not-aria-pressed:bg-black/7 aria-pressed:bg-black/10 aria-pressed:opacity-100";
// Letter buttons: each glyph previews its format.
const GLYPH = {
  b: "font-ui text-md leading-none font-bold",
  i: "font-[family-name:Georgia,'Times_New_Roman',serif] text-md leading-none italic",
  u: "font-ui text-md leading-none underline underline-offset-2",
  s: "font-ui text-md leading-none line-through",
  aa: "font-ui text-sm leading-none",
};

const FONTS: { value: NoteFont; label: string }[] = [
  { value: "hand", label: "Handwritten" },
  { value: "normal", label: "Normal" },
  { value: "rounded", label: "Rounded" },
  { value: "typewriter", label: "Typewriter" },
];

export interface ToolbarOptions {
  getFont: () => NoteFont;
  setFont: (f: NoteFont) => void;
  /** Extra entries for the "…" menu. */
  more: () => { label: string; icon?: IconName; run: () => void }[];
}

type StateKey = keyof ReturnType<Editor["states"]>;

export function toolbar(editor: Editor, opts: ToolbarOptions) {
  const btns = new Map<StateKey, HTMLButtonElement>();

  const glyph = (key: StateKey, text: string, cls: string, title: string, run: () => void) => {
    const b = h("button", { class: cx(BTN, cls), title, "aria-label": title, "aria-pressed": "false" }, text);
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the caret
    b.addEventListener("click", run);
    btns.set(key, b);
    return b;
  };
  const iconBtn = (key: StateKey | null, ic: IconName, title: string, run: () => void) => {
    const b = h("button", { class: BTN, title, "aria-label": title, "aria-pressed": "false" }, icon(ic, 16));
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", run);
    if (key) btns.set(key, b);
    return b;
  };
  const sep = () => h("span", { class: "mx-[5px] h-4 w-px bg-note-ink-faint", "aria-hidden": "true" });

  const fontBtn = h("button", { class: cx(BTN, GLYPH.aa), title: "Font", "aria-label": "Font" }, "Aa");
  fontBtn.addEventListener("mousedown", (e) => e.preventDefault());
  fontBtn.addEventListener("click", () =>
    showMenu(
      fontBtn,
      FONTS.map((f) => ({ label: f.label, font: f.value, checked: opts.getFont() === f.value, run: () => opts.setFont(f.value) })),
      { variant: "dark", align: "start" },
    ),
  );

  const moreBtn = iconBtn(null, "more", "More", () =>
    showMenu(moreBtn, opts.more().map((m) => ({ ...m })), { variant: "dark", align: "start" }),
  );

  const el = h(
    "div",
    { class: "flex items-center gap-0.5 text-note-ink", role: "toolbar", "aria-label": "Formatting" },
    glyph("bold", "B", GLYPH.b, "Bold (Ctrl+B)", () => editor.bold()),
    glyph("italic", "I", GLYPH.i, "Italic (Ctrl+I)", () => editor.italic()),
    glyph("underline", "U", GLYPH.u, "Underline (Ctrl+U)", () => editor.underline()),
    glyph("strike", "S", GLYPH.s, "Strikethrough (Ctrl+Shift+X)", () => editor.strike()),
    sep(),
    iconBtn("check", "checkCircle", "Task list (Ctrl+Shift+L)", () => editor.checklist()),
    iconBtn("bullets", "bullets", "Bullets (Ctrl+Shift+8)", () => editor.bullets()),
    iconBtn("numbered", "numbered", "Numbered list (Ctrl+Shift+7)", () => editor.numbered()),
    sep(),
    iconBtn("link", "link", "Link (Ctrl+K)", () => void editor.link()),
    sep(),
    fontBtn,
    h("span", { class: "flex-1" }),
    moreBtn,
  );

  // Reflect formatting at the caret; event driven (selection/input only).
  const refresh = () => {
    const s = editor.states();
    for (const [k, b] of btns) b.setAttribute("aria-pressed", String(!!s[k]));
  };
  document.addEventListener("selectionchange", refresh);
  editor.el.addEventListener("input", refresh);
  el.addEventListener("click", () => requestAnimationFrame(refresh));

  return { el, refresh };
}
