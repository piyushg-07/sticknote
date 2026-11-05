// The deck: note tabs on the screen edge.
//  * resting: a slim column of coloured pills
//  * pointer arrives: pills grow into leaning tabs
//  * hover a tab: the note card unfolds out of that tab; the tabs above and
//    below slide out of the way so nothing is covered. Moving to another tab
//    glides the same card there and cross-fades its content.
//  * click a tab / the card: the note opens in its own window
//  * drag a tab (or the open card) by its title: reorder
//
// Smoothness: hover animations touch only compositor-friendly properties —
// the card reveals with `clip-path`, its title strip and the neighbouring
// tabs move with transforms. The tab column never re-lays out while you
// hover, and the window is sized once when the pointer arrives.
import { api } from "../../lib/api";
import { on } from "../../lib/events";
import { setTheme } from "../../lib/theme";
import { displayTitle, h, setRich } from "../../lib/dom";
import { icon } from "../../lib/icons";
import { agoLong, clockLabel } from "../../lib/time";
import { checklistProgress } from "../../lib/progress";
import { appName, loadIcons } from "../../lib/apps";
import { appIconEl } from "../../components/app-picker";
import type { Edge, Note } from "../../lib/types";

const SWITCH_DELAY = 50; // tiny dwell when sweeping across tabs (prevents flicker)
const LEAVE_DELAY = 650; // how long the deck waits before turning back into pills
const SLACK = 28; // px of forgiveness around the deck before it counts as "left"
const ANIM_MS = 380; // must match --deck-anim in deck.css
const CLOSE_MS = 200; // must match .card-wrap.leaving in deck.css
/** How the pushed-aside tabs meet the open card: negative = they tuck a few
 *  px under its edge (as in Peeky Notes), so there is no visible gap. */
const GAP = -6;
const TOAST_MS = 10_000;
const SHADOW_ROOM = 22;
const REMINDER_PEEK_MS = 8000; // how long a fired reminder keeps its card out

// ---- DOM -------------------------------------------------------------------
const root = document.getElementById("deck")!;
const stack = h("div", { class: "stack" });
const plus = h("button", { class: "plus", title: "New note (Ctrl+Alt+N)", "aria-label": "New note" }, icon("plus", 14));
const more = h("button", { class: "more", title: "Show all notes" });
const glass = h("div", { class: "pill-glass", "aria-hidden": "true" });
const pillDivider = h("div", { class: "pill-divider", "aria-hidden": "true" });
/** App stickers beside notes for the app in front (own layer: tabs clip). */
const tagLayer = h("div", { class: "app-tags", "aria-hidden": "true" });
const column = h("div", { class: "column" }, glass, pillDivider, stack, tagLayer, plus);

const cardLabel = h("span", { class: "tab-label" });
const cardStrip = h("div", { class: "card-strip" }, cardLabel);
/** The visible content layer. Switching notes cross-fades a new layer over it. */
let cardContent = h("div", { class: "card-content" });
const card = h("div", { class: "card", role: "button", "aria-hidden": "true" }, cardStrip, cardContent);
// The wrapper carries the shadow: clip-path on the card would cut it off.
const cardWrap = h("div", { class: "card-wrap" }, card);
root.append(column, cardWrap);

// ---- state -----------------------------------------------------------------
let notes: Note[] = [];
let edge: Edge = "right";
let openWindows = new Set<string>();
let engaged = false; // pointer is on the deck: window widened, tabs showing
let openTab: HTMLElement | null = null; // tab whose card is showing
let tabHs: number[] = [];
let hasMore = false;
let pointer = { x: -1, y: -1 }; // last pointer position, screen coordinates
let engaging: Promise<void> = Promise.resolve();
let hoverTimer: number | undefined;
let leaveTimer: number | undefined;
let shrinkTimer: number | undefined;
let hideTimer: number | undefined;
let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;
let dragging = false;
let frontApp: string | null = null; // app in front (for notes tied to an app)
let pointerNear = false;
let alertTimer: number | undefined;
/** note id → when its missed reminder was due (for the card's label) */
const missed = new Map<string, number>();
let lastSize = "";

const cssNum = (name: string) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
const noteOf = (tab: HTMLElement) => notes.find((n) => n.id === tab.dataset.id);
const tabs = () => Array.from(stack.querySelectorAll<HTMLElement>(".tab"));

// ---- window sizing ---------------------------------------------------------
// Computed from the geometry tokens (never measured mid-animation).
function fullHeight() {
  return cssNum("--deck-gutter") * 2 + tabHs.reduce((a, b) => a + b - 6, 0) + 40 + (hasMore ? 26 : 0);
}
function pillHeight() {
  return cssNum("--deck-gutter") * 2 + pillLayout(tabHs.length, appGroup).total + GLASS_PAD * 2;
}

function measure() {
  let w: number;
  let hgt: number;
  if (engaged) {
    // Room for the tabs pushed apart around the tallest card, decided once.
    w = cssNum("--deck-peek-w") + SHADOW_ROOM;
    hgt = fullHeight() + cssNum("--deck-peek-max-h") + 16;
  } else if (root.classList.contains("compact")) {
    // pills' centre + half the glass capsule + room for its shadow
    w = cssNum("--deck-pill-inset") + cssNum("--deck-pill-w") / 2 + cssNum("--deck-glass-w") / 2 + 10;
    if (appGroup) w += TAG + 6; // stickers sit just outside the capsule
    hgt = pillHeight();
  } else {
    w = cssNum("--deck-tab-w") + 5 + SHADOW_ROOM;
    hgt = fullHeight();
  }
  if (toastEl) {
    w = Math.max(w, cssNum("--deck-tab-w") + 16 + 240 + 14);
    hgt = Math.max(hgt, 64);
  }
  return { w: Math.ceil(w), h: Math.ceil(Math.min(hgt, window.screen.availHeight)) };
}

let resized: (() => void) | null = null;
window.addEventListener("resize", () => {
  resized?.();
  resized = null;
});

/** Fit the window to the content; resolves once the new size is applied. */
async function fit(): Promise<void> {
  const { w, h: hh } = measure();
  const key = `${w}x${hh}`;
  if (key === lastSize) return;
  lastSize = key;
  const done = new Promise<void>((res) => {
    resized = res;
    setTimeout(res, 80);
  });
  await api.deckResize(w, hh);
  await done;
}

// ---- tabs ----------------------------------------------------------------------
function tabHeights(list: Note[]): number[] {
  const base = list.map((n) => Math.min(118, Math.max(64, 40 + displayTitle(n.title, n.text).length * 6.5)));
  const avail = window.screen.availHeight - 140 - cssNum("--deck-peek-max-h");
  const total = base.reduce((a, b) => a + b - 6, 0);
  if (total <= avail) return base;
  const k = avail / total;
  return base.map((v) => Math.max(40, Math.floor(v * k)));
}

/** Notes the deck shows right now: active, on the deck, and either for every
 *  app or for the app currently in front. */
const forFrontApp = (n: Note) => !!frontApp && !!n.apps?.includes(frontApp);

/** Notes the deck shows right now: active, on the deck, and either for every
 *  app or for the app in front. Notes for the app in front come first. */
function deckNotes(): Note[] {
  const visible = notes
    .filter((n) => n.status === "active" && n.onDeck && (!n.apps?.length || forFrontApp(n)))
    .sort((a, b) => a.order - b.order);
  return [...visible.filter(forFrontApp), ...visible.filter((n) => !forFrontApp(n))];
}

/** How many of the shown tabs are for the app in front (they're first). */
let appGroup = 0;

function render() {
  if (dragging) return;
  root.dataset.edge = edge;
  const list = deckNotes();
  const heights = tabHeights(list);

  // Show as many as fit (with room for an open card); the rest live in All notes.
  const avail = window.screen.availHeight - 120 - cssNum("--deck-peek-max-h");
  let used = 0;
  let shown = 0;
  for (const hh of heights) {
    if (used + hh - 6 > avail) break;
    used += hh - 6;
    shown++;
  }
  tabHs = heights.slice(0, shown);
  hasMore = list.length > shown;

  const reopen = openTab?.dataset.id;
  openTab = null;
  appGroup = list.slice(0, shown).filter(forFrontApp).length;
  const tabEls = list.slice(0, shown).map((n, i) => {
      const label = displayTitle(n.title, n.text);
      const prog = checklistProgress(n.text);
      const tab = h(
        "div",
        {
          class: `tab${openWindows.has(n.id) ? " active" : ""}${n.alert ? " alert" : ""}${prog ? " has-progress" : ""}${forFrontApp(n) ? " for-app" : ""}`,
          "data-id": n.id,
          "data-color": n.color,
          role: "button",
          tabindex: 0,
          "aria-label": prog ? `${label}, ${prog.done} of ${prog.total} done` : label,
        },
        h("div", { class: "tab-strip" }, h("span", { class: "tab-label" }, label)),
        prog ? h("span", { class: "tab-progress", "aria-hidden": "true" }) : null,
        n.alert ? h("span", { class: "tab-alert", "aria-hidden": "true" }) : null,
      );
      tab.style.setProperty("--tab-h", `${heights[i]}px`);
      if (prog) tab.style.setProperty("--progress", String(prog.ratio));
      bindTab(tab);
      return tab;
  });
  stack.replaceChildren(...tabEls); // notes for the app in front come first
  if (hasMore) {
    more.textContent = `+${list.length - shown}`;
    if (!more.isConnected) column.insertBefore(more, plus);
  } else more.remove();

  layoutPills();
  setCompact(!engaged, false);
  const tab = reopen && engaged ? stack.querySelector<HTMLElement>(`.tab[data-id="${reopen}"]`) : null;
  if (tab) openCard(tab, false);
  else resetCard();
  void fit();
}

/** Where each tab's pill sits: a tight, evenly spaced column centred on the
 *  deck. Stored as a per-tab offset (--pill-dy) so pill ↔ tab is a pure
 *  translate + clip animation. */
/** An element's untransformed top, measured from the column's top edge.
 *  (Walks offsetParents: the tab stack's shadow filter can make *it* the
 *  offsetParent, which would otherwise drop the column's padding.) */
function topInColumn(el: HTMLElement): number {
  let y = 0;
  let e: HTMLElement | null = el;
  while (e && e !== column) {
    y += e.offsetTop;
    e = e.offsetParent as HTMLElement | null;
  }
  return y;
}

const DIVIDER_H = 12; // gap with a hairline between app notes and the rest
const GLASS_PAD = 7; // capsule padding above/below the pills

const TAG = 18; // sticker size

/** One small logo sticker per note for the app in front, on the outer side
 *  of its tab (tab mode) or beside its pill (pill mode). */
function layoutTags(pillCentres: number[]) {
  if (!appGroup || !frontApp) {
    tagLayer.replaceChildren();
    return;
  }
  const name = appName(frontApp);
  tagLayer.replaceChildren(
    ...tabs()
      .slice(0, appGroup)
      .map((t, i) => {
        const tag = h("span", { class: "app-tag", "data-id": t.dataset.id!, title: `For ${name}` }, appIconEl(frontApp!, TAG));
        tag.style.setProperty("--y-tab", `${Math.round(topInColumn(t) + 9)}px`);
        tag.style.setProperty("--y-pill", `${Math.round(pillCentres[i] - TAG / 2)}px`);
        return tag;
      }),
  );
}

const tagFor = (tab: HTMLElement) => tagLayer.querySelector<HTMLElement>(`.app-tag[data-id="${tab.dataset.id}"]`);

/** Pill-mode geometry: one centred column of pills inside a glass capsule.
 *  Notes for the app in front sit first, under that app's icon, then a
 *  divider, then everything else. */
function pillLayout(count: number, group: number) {
  const step = cssNum("--deck-pill-h") + cssNum("--deck-pill-gap");
  const divider = group && group < count ? DIVIDER_H : 0;
  return { step, divider, total: count * step + divider };
}

function layoutPills() {
  const all = tabs();
  const { step, divider, total } = pillLayout(all.length, appGroup);
  const top = column.offsetHeight / 2 - total / 2;
  const centres: number[] = [];
  let y = top;
  all.forEach((t, i) => {
    if (i === appGroup && divider) {
      pillDivider.style.setProperty("--y", `${Math.round(y + divider / 2)}px`);
      y += divider;
    }
    const tabMid = topInColumn(t) + t.offsetHeight / 2;
    t.style.setProperty("--pill-dy", `${Math.round(y + step / 2 - tabMid)}px`);
    centres.push(y + step / 2);
    y += step;
  });
  glass.style.setProperty("--y", `${Math.round(top - GLASS_PAD)}px`);
  glass.style.setProperty("--h", `${Math.round(total + GLASS_PAD * 2)}px`);
  const show = (el: HTMLElement, on: boolean) => (el.style.display = on ? "" : "none");
  show(glass, all.length > 0);
  show(pillDivider, !!divider);
  layoutTags(centres);
}

/** Resting state is pills; the deck becomes tabs while the pointer is on it. */
function setCompact(on: boolean, animate = true) {
  if (root.classList.contains("compact") === on) return;
  if (!animate) root.classList.add("instant");
  root.classList.toggle("compact", on);
  if (!animate) {
    void root.offsetHeight;
    requestAnimationFrame(() => root.classList.remove("instant"));
  }
}

// ---- the card ------------------------------------------------------------------
const SWAP_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function contentFor(n: Note): HTMLElement[] {
  const body = h("div", { class: "peek-body rich" });
  setRich(body, n.body);
  const prog = checklistProgress(n.text);
  const bar = prog ? h("span", { class: "peek-bar" }, h("span")) : null;
  bar?.style.setProperty("--progress", String(prog!.ratio));
  return [
    ...(n.alert
      ? [h("div", { class: `peek-alert${missed.has(n.id) ? " missed" : ""}` }, icon("bell", 12),
          missed.has(n.id) ? `Missed · ${clockLabel(missed.get(n.id)!)}` : "Reminder")]
      : []),
    ...(forFrontApp(n)
      ? [h("div", { class: "peek-for" }, appIconEl(frontApp!, 16), `For ${appName(frontApp!)}`)]
      : []),
    h("div", { class: "peek-title truncate" }, displayTitle(n.title, n.text)),
    body,
    h(
      "div",
      { class: "peek-foot" },
      prog ? h("span", { class: "peek-progress" }, bar, `${prog.done} of ${prog.total} done`) : null,
      h("span", null, `Edited ${agoLong(n.updated)}`),
    ),
  ];
}

function setCardMeta(n: Note) {
  card.dataset.color = String(n.color);
  card.dataset.font = n.font;
  card.dataset.id = n.id;
}

/** Fill the card in place (first open / re-render). */
function fillCard(n: Note) {
  setCardMeta(n);
  cardLabel.textContent = displayTitle(n.title, n.text);
  card.querySelectorAll(".card-content").forEach((l) => l !== cardContent && l.remove());
  cardContent.replaceChildren(...contentFor(n));
}

/** Switch to another note: the new content layer is added (so its height is
 *  known before anything moves), then old and new cross-fade while sliding a
 *  few pixels in the direction the card travels. */
function swapCard(n: Note, dir: number) {
  setCardMeta(n);
  // Drop layers left over from an earlier, still-running swap.
  card.querySelectorAll(".card-content").forEach((l) => l !== cardContent && l.remove());
  const old = cardContent;
  const next = h("div", { class: "card-content" }, ...contentFor(n));
  card.append(next);
  cardContent = next;

  const shift = 10 * dir;
  old.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: `translateY(${-shift}px)` },
    ],
    { duration: 160, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  ).onfinish = () => old.remove();
  next.animate(
    [
      { opacity: 0, transform: `translateY(${shift}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration: 300, delay: 60, easing: SWAP_EASE, fill: "backwards" },
  );

  // Title strip: quick cross-fade of the label.
  cardLabel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: "forwards" }).onfinish = () => {
    cardLabel.textContent = displayTitle(n.title, n.text);
    cardLabel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: SWAP_EASE, fill: "forwards" });
  };
}

/** Untransformed position of a tab in window coordinates. */
function tabBox(tab: HTMLElement) {
  const top = column.getBoundingClientRect().top + topInColumn(tab);
  return { top, height: tab.offsetHeight };
}

/** Clip rectangle (as an inset) that shows only the part of the card where
 *  `tab` sits — the card's closed state. */
function tabClip(tabTop: number, tabH: number, cardY: number, cardH: number) {
  const W = card.offsetWidth;
  const visibleW = cssNum("--deck-tab-w") + cssNum("--deck-overhang");
  const t = Math.max(0, tabTop - cardY);
  const b = Math.max(0, cardY + cardH - tabTop - tabH);
  return edge === "right"
    ? `inset(${t}px 0px ${b}px ${W - visibleW}px round 11px 0 0 11px)`
    : `inset(${t}px ${W - visibleW}px ${b}px 0px round 0 11px 11px 0)`;
}

/** Slide the tabs above up and the tabs below down to clear the card. */
function pushNeighbours(open: HTMLElement | null, cardY = 0, cardH = 0) {
  let i = -1;
  const all = tabs();
  const at = open ? all.indexOf(open) : -1;
  let up = 0;
  let down = 0;
  if (open) {
    const { top, height } = tabBox(open);
    up = Math.max(0, top - cardY) + GAP;
    down = Math.max(0, cardY + cardH - top - height) + GAP;
  }
  for (const t of all) {
    i++;
    const shift = at < 0 || i === at ? 0 : i < at ? -up : down;
    t.style.setProperty("--shift", `${shift}px`);
    const tag = tagFor(t);
    tag?.style.setProperty("--shift", `${shift}px`);
    tag?.classList.toggle("off", i === at); // the open card names the app itself
  }
  plus.style.setProperty("--shift", `${at < 0 ? 0 : down}px`);
  more.style.setProperty("--shift", `${at < 0 ? 0 : down}px`);
}

/** Open (or move) the card onto `tab`. */
function openCard(tab: HTMLElement, animate = true) {
  const n = noteOf(tab);
  if (!n || tab === openTab) return;
  clearTimeout(hideTimer);
  clearTimeout(shrinkTimer);
  cardWrap.classList.remove("leaving"); // reopening mid-close just continues
  const switching = openTab !== null && card.classList.contains("open");
  openTab?.classList.remove("under");
  openTab = tab;

  if (switching) {
    // New content first (so the final height is known), then one smooth move
    // of card, height and neighbours to their final place.
    const prevY = parseFloat(root.style.getPropertyValue("--card-y")) || 0;
    const nextY = tabBox(tab).top;
    swapCard(n, nextY >= prevY ? 1 : -1);
    place(tab);
    tab.classList.add("under");
    return;
  }

  // First open: start clipped to the tab, then unfold.
  fillCard(n);
  card.classList.add("snap");
  const geo = place(tab);
  card.style.clipPath = tabClip(geo.tabTop, geo.tabH, geo.y, geo.h);
  card.classList.add("visible");
  card.classList.remove("open");
  void card.offsetWidth; // commit the closed state
  if (animate) card.classList.remove("snap");
  card.style.clipPath = "";
  card.classList.add("open");
  tab.classList.add("under");
  card.setAttribute("aria-hidden", "false");
  if (!animate) requestAnimationFrame(() => card.classList.remove("snap"));
}

/** Compute and apply the card's position/size next to `tab`. */
function place(tab: HTMLElement) {
  const { top: tabTop, height: tabH } = tabBox(tab);
  const content = cardContent.scrollHeight;
  const hgt = Math.round(
    Math.max(tabH, cssNum("--deck-peek-min-h"), Math.min(content, cssNum("--deck-peek-max-h"))),
  );
  const y = Math.round(
    Math.max(8, Math.min(tabTop + tabH / 2 - hgt / 2, window.innerHeight - hgt - 8)),
  );
  root.style.setProperty("--card-y", `${y}px`);
  root.style.setProperty("--card-h", `${hgt}px`);
  // Where the tab sits inside the card (for the strip in its closed state).
  root.style.setProperty("--tab-mid", `${tabTop + tabH / 2 - y - hgt / 2}px`);
  pushNeighbours(tab, y, hgt);
  return { y, h: hgt, tabTop, tabH };
}

/** Close: the card fades and slides into the edge while its tab fades back
 *  in and the neighbours return. Quick and clean, no folding. */
function closeCard() {
  const tab = openTab;
  if (!tab) return;
  openTab = null;
  pushNeighbours(null);
  tab.classList.remove("under");
  cardWrap.classList.add("leaving");
  card.setAttribute("aria-hidden", "true");
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (openTab) return;
    card.classList.add("snap");
    card.classList.remove("open", "visible");
    cardWrap.classList.remove("leaving");
    card.style.clipPath = "";
    requestAnimationFrame(() => card.classList.remove("snap"));
  }, CLOSE_MS);
}

/** Hide the card immediately (re-render, drag start). */
function resetCard() {
  clearTimeout(hideTimer);
  openTab = null;
  cardWrap.classList.remove("leaving");
  card.classList.add("snap");
  card.classList.remove("open", "visible");
  card.style.clipPath = "";
  pushNeighbours(null);
  stack.querySelectorAll(".tab.under").forEach((t) => t.classList.remove("under"));
  requestAnimationFrame(() => card.classList.remove("snap"));
}

// ---- engage / disengage --------------------------------------------------------
function engage(target?: HTMLElement): Promise<void> {
  clearTimeout(leaveTimer);
  leaveTimer = undefined;
  if (!engaged) {
    engaged = true;
    clearTimeout(shrinkTimer);
    engaging = fit().then(() => {
      if (!engaged) return;
      setCompact(false);
      // Tabs grow under a pointer that may not move again: once they
      // settle, open whichever tab is under it.
      window.setTimeout(() => {
        if (!engaged || openTab || dragging) return;
        const tab = tabAtPointer();
        if (tab) openCard(tab);
      }, ANIM_MS + 20);
    });
  }
  if (target) {
    void engaging.then(() => {
      if (engaged && !dragging) openCard(target);
    });
  }
  return engaging;
}

function disengage() {
  clearTimeout(hoverTimer);
  clearTimeout(leaveTimer);
  leaveTimer = undefined;
  if (!engaged) return;
  engaged = false;
  const hadCard = openTab !== null;
  closeCard();
  // Card first, then the tabs turn back into pills, then the window shrinks.
  clearTimeout(shrinkTimer);
  shrinkTimer = window.setTimeout(() => {
    if (engaged) return;
    setCompact(true);
    shrinkTimer = window.setTimeout(() => {
      if (!engaged) void fit();
    }, ANIM_MS);
  }, hadCard ? CLOSE_MS : 0);
}

function tabAtPointer(): HTMLElement | null {
  const el = document.elementFromPoint(pointer.x - window.screenX, pointer.y - window.screenY);
  const tab = el?.closest<HTMLElement>(".tab") ?? null;
  return tab && stack.contains(tab) ? tab : null;
}

// ---- hover tracking (event driven, no polling) ------------------------------------
/** Pointer on or near the deck (or its card)? Geometry with slack, so gaps
 *  between tabs, the "+" and the card's edges never count as leaving. */
function nearDeck(e: PointerEvent): boolean {
  if ((e.target as HTMLElement).closest?.(".deck-toast, .card-wrap")) return true;
  const r = column.getBoundingClientRect();
  let top = r.top;
  let bottom = r.bottom;
  if (openTab) {
    const c = card.getBoundingClientRect();
    top = Math.min(top, c.top);
    bottom = Math.max(bottom, c.bottom);
  }
  if (e.clientY < top - SLACK || e.clientY > bottom + SLACK) return false;
  const reach = engaged
    ? (openTab ? cssNum("--deck-peek-w") : cssNum("--deck-tab-w") + 5) + SLACK
    : cssNum("--deck-pill-w") + cssNum("--deck-pill-inset") * 2 + SLACK;
  const fromEdge = edge === "right" ? window.innerWidth - e.clientX : e.clientX;
  return fromEdge <= reach;
}

document.addEventListener("pointermove", (e) => {
  pointer = { x: e.screenX, y: e.screenY };
  if (dragging) return;
  pointerNear = nearDeck(e);
  if (pointerNear) void engage();
  else scheduleLeave();
});
document.documentElement.addEventListener("pointerleave", () => {
  pointerNear = false;
  scheduleLeave();
});

function scheduleLeave() {
  if (leaveTimer !== undefined || !engaged) return;
  leaveTimer = window.setTimeout(() => {
    leaveTimer = undefined;
    disengage();
  }, LEAVE_DELAY);
}

// ---- tab interactions --------------------------------------------------------------
function bindTab(tab: HTMLElement) {
  tab.addEventListener("pointerenter", () => {
    if (dragging || tab === openTab) return;
    clearTimeout(hoverTimer);
    if (!engaged || !openTab) {
      void engage(tab); // first hover opens straight away
      return;
    }
    hoverTimer = window.setTimeout(() => void engage(tab), SWITCH_DELAY);
  });
  tab.addEventListener("pointerleave", () => clearTimeout(hoverTimer));
  tab.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void api.openNoteWindow(tab.dataset.id!);
    }
  });
  tab.addEventListener("pointerdown", (down) => pressTab(tab, tab, down));
}

// Pressing the open card behaves like pressing its tab (click opens, drag reorders).
card.addEventListener("pointerdown", (down) => {
  if (openTab) pressTab(openTab, card, down);
});

/** Click → open the note; drag (5px+) → reorder with a dashed drop slot. */
function pressTab(tab: HTMLElement, source: HTMLElement, down: PointerEvent) {
  if (down.button !== 0) return;
  if ((down.target as HTMLElement).closest("a")) down.preventDefault();
  const startY = down.clientY;
  let slot: HTMLElement | null = null;
  let startTop = 0;
  source.setPointerCapture(down.pointerId);

  const move = (e: PointerEvent) => {
    const dy = e.clientY - startY;
    if (!dragging && Math.abs(dy) < 5) return;
    if (!dragging) {
      dragging = true;
      clearTimeout(hoverTimer);
      resetCard();
      startTop = tab.getBoundingClientRect().top;
      tagLayer.classList.add("off");
      slot = h("div", { class: "slot" });
      slot.style.height = `${tab.offsetHeight}px`;
      tab.replaceWith(slot);
      root.append(tab);
      tab.classList.add("floating");
    }
    tab.style.top = `${startTop + dy}px`;
    const siblings = Array.from(stack.children).filter((c) => c !== slot) as HTMLElement[];
    const before = siblings.find((s) => {
      const r = s.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (before) stack.insertBefore(slot!, before);
    else stack.append(slot!);
  };

  const up = () => {
    source.removeEventListener("pointermove", move);
    source.removeEventListener("pointerup", up);
    source.removeEventListener("pointercancel", up);
    if (!dragging) {
      disengage();
      void api.openNoteWindow(tab.dataset.id!);
      return;
    }
    tab.classList.remove("floating");
    tab.style.top = "";
    tagLayer.classList.remove("off");
    slot!.replaceWith(tab);
    dragging = false;
    const ids = Array.from(stack.children).map((c) => (c as HTMLElement).dataset.id!).filter(Boolean);
    ids.forEach((id, i) => {
      const note = notes.find((x) => x.id === id);
      if (note) note.order = i - 1e6; // optimistic local order
    });
    void api.reorderNotes(ids);
  };

  source.addEventListener("pointermove", move);
  source.addEventListener("pointerup", up);
  source.addEventListener("pointercancel", up);
}

// ---- "+" -------------------------------------------------------------------------
plus.addEventListener("pointerenter", () => clearTimeout(hoverTimer));
plus.addEventListener("pointerdown", () => {
  plus.classList.remove("pressed");
  void plus.offsetWidth;
  plus.classList.add("pressed");
});
plus.addEventListener("animationend", () => plus.classList.remove("pressed"));
plus.addEventListener("click", async () => {
  await new Promise((r) => setTimeout(r, 140)); // let the press feedback play
  disengage();
  await api.openCapture(); // quick capture card beside the deck
});
more.addEventListener("click", () => void api.openManager("deck"));

// ---- undo toast ------------------------------------------------------------------
function showToast(title: string, count: number, token: number) {
  hideToast(false);
  const label = count > 1 ? `Deleted ${count} notes` : `Deleted “${title}”`;
  toastEl = h(
    "div",
    { class: "deck-toast", role: "status" },
    h("span", null, label),
    h("button", {
      onclick: async () => {
        hideToast();
        await api.undoDelete(token).catch(() => {});
      },
    }, "Undo"),
    h("button", { class: "toast-x", title: "Dismiss", "aria-label": "Dismiss", onclick: () => hideToast() }, icon("close", 12)),
  );
  root.append(toastEl);
  void fit();
  toastTimer = window.setTimeout(() => hideToast(), TOAST_MS);
}

function hideToast(refit = true) {
  clearTimeout(toastTimer);
  if (!toastEl) return;
  toastEl.remove();
  toastEl = null;
  if (refit) void fit();
}

// ---- data ----------------------------------------------------------------------------
/** Apps whose icon/logo the deck has already asked for. */
const iconsRequested = new Set<string>();

async function reload() {
  notes = await api.listNotes();
  render();
  // Icons only for apps notes are tied to, each requested once.
  const fresh = [...new Set(notes.flatMap((n) => n.apps ?? []))].filter((e) => !iconsRequested.has(e));
  if (fresh.length) {
    fresh.forEach((e) => iconsRequested.add(e));
    void loadIcons(fresh, false).then(() => render());
  }
}

void on("notes:changed", () => void reload());

// A reminder is due: pop its card out of the deck for a few seconds.
void on("reminder:fired", async ({ id, due, missed: wasMissed }) => {
  if (wasMissed) missed.set(id, due);
  else missed.delete(id);
  await reload();
  const tab = stack.querySelector<HTMLElement>(`.tab[data-id="${id}"]`);
  if (!tab) return; // not on the deck right now; the notification covers it
  await engage(tab);
  clearTimeout(alertTimer);
  alertTimer = window.setTimeout(() => {
    if (!pointerNear) disengage();
  }, REMINDER_PEEK_MS);
});

// Notes tied to an app come and go as you switch apps.
void on("context:app", (exe) => {
  const before = deckNotes().map((n) => n.id).join() + "|" + appGroup;
  frontApp = exe;
  const after = deckNotes().map((n) => n.id).join() + "|" + deckNotes().filter(forFrontApp).length;
  if (after !== before) render(); // same frame: no timers, no animation delay
});
void on("notes:deleted", (p) => showToast(p.title, p.count, p.token));
void on("notes:restored", () => hideToast());
void on("deck:note-windows", (ids) => {
  openWindows = new Set(ids);
  tabs().forEach((t) => t.classList.toggle("active", openWindows.has(t.dataset.id!)));
});
void on("settings:changed", (s) => {
  setTheme(s.theme);
  if (s.edge !== edge) {
    edge = s.edge;
    lastSize = "";
    render();
  }
});

(async () => {
  frontApp = (await api.contextApps()).current;
  const s = await api.getSettings();
  setTheme(s.theme);
  edge = s.edge;
  await reload();
})();
