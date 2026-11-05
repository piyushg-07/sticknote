// Rich-text note editor on top of contenteditable.
//
// Features: bold/italic/underline, bullet / numbered / check lists,
// auto-lists ("- ", "1. ", "[ ] " at line start; Backspace right after
// reverts), checklist toggling, Ctrl+K links, Ctrl+click to open links, and
// plain-text paste (no foreign markup ever enters a note).
//
// The DOM produced here is re-sanitised by the Rust side on every save.

import { api } from "../lib/api";
import { matchKey } from "../lib/keys";
import { setRich } from "../lib/dom";
import { openLinkPopover } from "./link";

type ListKind = "bullet" | "numbered" | "check" | "checked";

const TRIGGERS: Record<string, ListKind> = {
  "-": "bullet",
  "*": "bullet",
  "1.": "numbered",
  "[ ]": "check",
  "[]": "check",
  "[x]": "checked",
  "[X]": "checked",
};

export interface EditorOptions {
  onChange: () => void;
  placeholder?: string;
}

export class Editor {
  readonly el: HTMLDivElement;
  private opts: EditorOptions;
  private lastAuto: { kind: ListKind; trigger: string } | null = null;

  constructor(el: HTMLDivElement, opts: EditorOptions) {
    this.el = el;
    this.opts = opts;
    el.contentEditable = "true";
    el.spellcheck = true;
    el.classList.add("rich");
    el.setAttribute("role", "textbox");
    el.setAttribute("aria-multiline", "true");
    if (opts.placeholder) el.dataset.placeholder = opts.placeholder;
    document.execCommand("defaultParagraphSeparator", false, "div");

    el.addEventListener("keydown", (e) => this.onKeyDown(e));
    el.addEventListener("keyup", (e) => {
      if (e.key === "Control") el.classList.remove("ctrl");
    });
    el.addEventListener("blur", () => el.classList.remove("ctrl"));
    el.addEventListener("beforeinput", (e) => this.onBeforeInput(e));
    el.addEventListener("input", (e) => this.onInput(e as InputEvent));
    el.addEventListener("mousedown", (e) => this.onMouseDown(e));
    el.addEventListener("click", (e) => this.onClick(e));
    el.addEventListener("paste", (e) => this.onPaste(e));
    el.addEventListener("drop", (e) => this.onDrop(e));
  }

  setHTML(html: string) {
    setRich(this.el, html);
    this.lastAuto = null;
  }

  getHTML(): string {
    const hasStructure = this.el.querySelector("li");
    if (!hasStructure && !this.el.textContent?.trim()) return "";
    return this.el.innerHTML;
  }

  focus(atEnd = true) {
    this.el.focus();
    if (!atEnd) return;
    const sel = getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(this.el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  hasFocus() {
    return document.activeElement === this.el;
  }

  // ---- commands ---------------------------------------------------------

  bold() {
    this.exec("bold");
  }
  italic() {
    this.exec("italic");
  }
  underline() {
    this.exec("underline");
  }
  strike() {
    this.exec("strikeThrough");
  }

  /** Which formats are active at the caret (drives toolbar highlighting). */
  states() {
    const inside = this.caretNode() !== null;
    const list = inside ? this.currentList() : null;
    const q = (c: string) => inside && document.queryCommandState(c);
    return {
      bold: q("bold"),
      italic: q("italic"),
      underline: q("underline"),
      strike: q("strikeThrough"),
      check: !!list?.classList.contains("checklist"),
      bullets: list?.tagName === "UL" && !list.classList.contains("checklist"),
      numbered: list?.tagName === "OL",
      link: inside && !!this.closest(this.caretNode(), "A"),
    };
  }

  /** Move ticked checklist items below the unticked ones, per list. */
  moveCompletedToBottom(): boolean {
    let moved = false;
    this.el.querySelectorAll<HTMLUListElement>("ul.checklist").forEach((ul) => {
      const items = Array.from(ul.children) as HTMLElement[];
      const done = items.filter((li) => li.getAttribute("data-checked") === "true");
      const todo = items.filter((li) => li.getAttribute("data-checked") !== "true");
      const reordered = [...todo, ...done];
      if (reordered.some((li, i) => li !== items[i])) {
        ul.append(...reordered);
        moved = true;
      }
    });
    if (moved) this.changed();
    return moved;
  }

  bullets() {
    const ul = this.currentList();
    if (ul?.classList.contains("checklist")) {
      ul.classList.remove("checklist");
      ul.querySelectorAll(":scope > li").forEach((li) => li.removeAttribute("data-checked"));
      this.changed();
    } else {
      this.exec("insertUnorderedList");
    }
  }

  numbered() {
    this.exec("insertOrderedList");
  }

  checklist() {
    const list = this.currentList();
    if (list?.classList.contains("checklist")) {
      this.exec("insertUnorderedList"); // toggles the item out of the list
      return;
    }
    if (!list || list.tagName !== "UL") document.execCommand("insertUnorderedList");
    this.markChecklist(false);
    this.changed();
  }

  async link() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !this.el.contains(sel.anchorNode)) {
      this.focus();
    }
    const range = getSelection()!.getRangeAt(0).cloneRange();
    const existing = this.closest(range.startContainer, "A") as HTMLAnchorElement | null;
    const url = await openLinkPopover(this.el, range, existing?.getAttribute("href") ?? "");
    this.el.focus();
    const s = getSelection()!;
    s.removeAllRanges();
    s.addRange(range);
    if (url === null) return;
    if (url === "") {
      if (existing) {
        existing.replaceWith(...Array.from(existing.childNodes));
        this.changed();
      }
      return;
    }
    if (existing) {
      existing.setAttribute("href", url);
    } else if (range.collapsed) {
      const a = document.createElement("a");
      a.href = url;
      a.textContent = url;
      range.insertNode(a);
      const after = document.createRange();
      after.setStartAfter(a);
      after.collapse(true);
      s.removeAllRanges();
      s.addRange(after);
    } else {
      document.execCommand("createLink", false, url);
    }
    this.changed();
  }

  // ---- internals --------------------------------------------------------

  private exec(cmd: string) {
    if (!this.hasFocus()) this.el.focus();
    document.execCommand(cmd);
    this.changed();
  }

  private changed() {
    this.lastAuto = null;
    this.opts.onChange();
  }

  private closest(node: Node | null, tag: string): HTMLElement | null {
    let n: Node | null = node;
    while (n && n !== this.el) {
      if (n.nodeType === 1 && (n as HTMLElement).tagName === tag) return n as HTMLElement;
      n = n.parentNode;
    }
    return null;
  }

  /**
   * The node the caret sits in. When the selection is anchored on an element
   * (e.g. <ul> right after execCommand), resolve to the child at the offset so
   * `closest("LI")` finds the item being edited.
   */
  private caretNode(): Node | null {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return null;
    let n = sel.anchorNode;
    if (!n || !this.el.contains(n)) return null;
    if (n.nodeType === 1 && n.nodeName !== "LI") {
      const kids = n.childNodes;
      const pick = kids[Math.min(sel.anchorOffset, kids.length - 1)] ?? kids[sel.anchorOffset - 1];
      if (pick) n = pick;
      // descend to the first <li> if we landed on a list
      while (n.nodeType === 1 && (n.nodeName === "UL" || n.nodeName === "OL") && n.firstChild) n = n.firstChild;
    }
    return n;
  }

  private currentList(): HTMLElement | null {
    const li = this.closest(this.caretNode(), "LI");
    return (li?.parentElement as HTMLElement) ?? null;
  }

  private markChecklist(checked: boolean) {
    const li = this.closest(this.caretNode(), "LI");
    const ul = li?.parentElement;
    if (!li || !ul || ul.tagName !== "UL") return;
    ul.classList.add("checklist");
    ul.querySelectorAll(":scope > li").forEach((item) => {
      if (!item.hasAttribute("data-checked")) item.setAttribute("data-checked", "false");
    });
    li.setAttribute("data-checked", String(checked));
  }

  /**
   * Chromium merges a new <ul> into an adjacent one. If a bullet item landed
   * in a checklist (or a task in a bullet list), split it and the items after
   * it into their own list so each list keeps its own kind.
   */
  private isolateFromNeighbours(wantCheck: boolean) {
    const li = this.closest(this.caretNode(), "LI");
    const ul = li?.parentElement;
    if (!li || !ul || ul.tagName !== "UL") return;
    const isCheck = ul.classList.contains("checklist");
    const others = Array.from(ul.children).filter((c) => c !== li);
    const mismatched = wantCheck ? !isCheck && others.length > 0 : isCheck;
    if (!mismatched) return;

    const sel = getSelection()!;
    const fresh = document.createElement("ul");
    const tail: Element[] = [];
    for (let n: Element | null = li; n; n = n.nextElementSibling) tail.push(n);
    // Items after ours that belong to the old list go into a third list.
    const rest = tail.slice(1);
    ul.after(fresh);
    fresh.append(li);
    if (rest.length) {
      const back = ul.cloneNode(false) as HTMLElement;
      back.append(...rest);
      fresh.after(back);
    }
    if (!wantCheck) li.removeAttribute("data-checked");
    if (!ul.children.length) ul.remove();
    // Moving nodes invalidates the old selection; put the caret back in the item.
    const r = document.createRange();
    r.setStart(li, 0); // the trigger was just removed, so the caret belongs at the start
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /** Text between the start of the caret's line and the caret. */
  private lineBeforeCaret(): { text: string; range: Range } | null {
    const sel = getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return null;
    const node = sel.anchorNode;
    if (!node || !this.el.contains(node)) return null;

    const range = document.createRange();
    if (node.nodeType === 1 && sel.anchorOffset > 0 && node.childNodes[sel.anchorOffset - 1]?.nodeName === "BR") {
      return null; // caret right after a line break: nothing typed on this line yet
    }

    // Nearest block ancestor (div/p) holding the caret, or the editor root.
    let block: Node = node.nodeType === 1 ? node : node.parentNode!;
    while (block !== this.el && !/^(DIV|P)$/.test(block.nodeName)) block = block.parentNode!;

    // First candidate for "something before the caret" inside the block.
    let prev: Node | null;
    if (node === block) {
      prev = block.childNodes[sel.anchorOffset - 1] ?? null;
    } else {
      let child: Node = node;
      while (child.parentNode && child.parentNode !== block) child = child.parentNode;
      prev = child.previousSibling;
    }
    // The line starts after the closest preceding block-level sibling / <br>.
    while (prev && !/^(DIV|P|UL|OL|BR)$/.test(prev.nodeName)) prev = prev.previousSibling;
    if (prev) range.setStartAfter(prev);
    else range.setStart(block, 0);
    range.setEnd(sel.anchorNode!, sel.anchorOffset);
    return { text: range.toString(), range };
  }

  private onBeforeInput(e: InputEvent) {
    if (e.inputType !== "insertText" || e.data !== " ") return;
    if (this.closest(this.caretNode(), "LI")) return;
    const line = this.lineBeforeCaret();
    if (!line) return;
    const kind = TRIGGERS[line.text];
    if (!kind) return;

    e.preventDefault();
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(line.range);
    document.execCommand("delete");

    if (kind === "numbered") {
      document.execCommand("insertOrderedList");
    } else {
      document.execCommand("insertUnorderedList");
      const isCheck = kind === "check" || kind === "checked";
      this.isolateFromNeighbours(isCheck);
      if (isCheck) this.markChecklist(kind === "checked");
    }
    this.opts.onChange();
    this.lastAuto = { kind, trigger: line.text };
  }

  /** Backspace straight after an auto-list conversion restores the typed text. */
  private revertAutoList(): boolean {
    const auto = this.lastAuto;
    this.lastAuto = null;
    if (!auto) return false;
    const li = this.closest(this.caretNode(), "LI");
    if (!li) return false;
    const sel = getSelection()!;
    const r = document.createRange();
    r.selectNodeContents(li);
    r.setEnd(sel.anchorNode!, sel.anchorOffset);
    if (r.toString() !== "") return false;

    document.execCommand(auto.kind === "numbered" ? "insertOrderedList" : "insertUnorderedList");
    document.execCommand("insertText", false, `${auto.trigger} `);
    this.lastAuto = null;
    this.opts.onChange();
    return true;
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === "Control") this.el.classList.add("ctrl");

    if (e.key === "Backspace" && !e.ctrlKey && this.lastAuto) {
      if (this.revertAutoList()) {
        e.preventDefault();
        return;
      }
    }
    if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) this.lastAuto = null;

    const bind: [string, () => void][] = [
      ["Ctrl+B", () => this.bold()],
      ["Ctrl+I", () => this.italic()],
      ["Ctrl+U", () => this.underline()],
      ["Ctrl+Shift+X", () => this.strike()],
      ["Ctrl+Shift+L", () => this.checklist()],
      ["Ctrl+Shift+8", () => this.bullets()],
      ["Ctrl+Shift+7", () => this.numbered()],
      ["Ctrl+K", () => void this.link()],
    ];
    for (const [combo, fn] of bind) {
      if (matchKey(e, combo)) {
        e.preventDefault();
        fn();
        return;
      }
    }

    if (e.key === "Tab" && this.closest(this.caretNode(), "LI")) {
      e.preventDefault();
      document.execCommand(e.shiftKey ? "outdent" : "indent");
      this.opts.onChange();
    }
  }

  private onInput(e: InputEvent) {
    if (e.inputType === "insertParagraph") {
      // Chromium clones attributes into the new <li>; a new task starts unchecked.
      const li = this.closest(this.caretNode(), "LI");
      if (li?.parentElement?.classList.contains("checklist")) li.setAttribute("data-checked", "false");
    }
    // Let the :empty placeholder show again once everything is erased.
    if (!this.el.textContent && !this.el.querySelector("li") && this.el.innerHTML !== "") {
      this.el.innerHTML = "";
    }
    this.opts.onChange();
  }

  private checkboxHit(e: MouseEvent): HTMLElement | null {
    const li = (e.target as HTMLElement).closest?.("li");
    if (!li || !this.el.contains(li) || !li.parentElement?.classList.contains("checklist")) return null;
    const rect = li.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(li).fontSize) || 16;
    return e.clientX - rect.left <= size * 1.3 ? li : null;
  }

  private onMouseDown(e: MouseEvent) {
    const li = this.checkboxHit(e);
    if (!li) return;
    e.preventDefault();
    li.setAttribute("data-checked", li.getAttribute("data-checked") === "true" ? "false" : "true");
    this.changed();
  }

  private onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest?.("a");
    if (a && e.ctrlKey) {
      e.preventDefault();
      const href = a.getAttribute("href");
      if (href) void api.openLink(href).catch(() => {});
    } else if (a) {
      e.preventDefault();
    }
  }

  private onPaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (text) document.execCommand("insertText", false, text);
  }

  private onDrop(e: DragEvent) {
    e.preventDefault();
    const text = e.dataTransfer?.getData("text/plain") ?? "";
    if (!text) return;
    const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (pos) {
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(pos);
    }
    document.execCommand("insertText", false, text);
  }
}
