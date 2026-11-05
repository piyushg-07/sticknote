// Peekin website: a live, playable copy of the deck inside a laptop.
// Styling is Tailwind utilities only; state lives in data-* attributes
// (data-on, data-active, data-peeking, data-hint) so variants do the rest.
//
//   .laptop > screen > os    ← a fixed-size "desktop" scaled to fit
//     appwin                 ← the app in front (switch it in the taskbar)
//     deck                   ← note tabs on the right edge (hover = peek)
//     peek / note window     ← peek card, open note window
//     capture / toast        ← quick capture, reminder notification
//     taskbar
//   tour                     ← "try these" checklist that guides the visitor
import "./style.css";
import { LOGOS } from "./logos";

// ---- tiny DOM helpers -----------------------------------------------------------------
type Kid = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | null | undefined> | null = null,
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(k);
  return el;
}
/** replaceChildren, skipping empty slots. */
function fill(el: Element, ...kids: Kid[]) {
  el.replaceChildren(...kids.filter((k): k is Node | string => k !== null && k !== undefined && k !== false));
}
const flag = (el: Element, name: string, on: boolean) => el.toggleAttribute(`data-${name}`, on);

function svg(paths: string, cls = "size-4"): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", `ico ${cls}`);
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = paths; // static, authored below
  return s;
}
const I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.2" r="1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

// ---- palette (same papers as the desktop app) -----------------------------------------
const PAPER: [string, string, string][] = [
  ["Sky", "#cfe0f7", "#4a86c5"],
  ["Mint", "#bde8d2", "#3fa77a"],
  ["Lavender", "#ddd1f6", "#8a6cd1"],
  ["Butter", "#fbe59a", "#d4a72c"],
  ["Rose", "#f8cad7", "#c9628a"],
  ["Peach", "#fad4a8", "#e08a3c"],
  ["Aqua", "#c2e8ec", "#3a9daa"],
  ["Mist", "#dde0ec", "#7d84a3"],
];
/** Expose a note colour to an element's utilities as --nb (paper) / --ns (stripe). */
function paper<E extends HTMLElement>(el: E, c: number): E {
  el.style.setProperty("--nb", PAPER[c][1]);
  el.style.setProperty("--ns", PAPER[c][2]);
  return el;
}

// ---- apps ----------------------------------------------------------------------------------
type AppId = "chrome" | "code" | "figma" | "slack" | "notion";
const APPS: { id: AppId; name: string; exe: string }[] = [
  { id: "chrome", name: "Chrome", exe: "chrome.exe" },
  { id: "code", name: "VS Code", exe: "code.exe" },
  { id: "figma", name: "Figma", exe: "figma.exe" },
  { id: "slack", name: "Slack", exe: "slack.exe" },
  { id: "notion", name: "Notion", exe: "notion.exe" },
];
const appName = (id: AppId) => APPS.find((a) => a.id === id)!.name;
function logo(id: AppId, size: number, cls = ""): HTMLElement {
  const s = h("span", { class: `logo inline-grid shrink-0 ${cls}`, "aria-hidden": "true" });
  s.innerHTML = LOGOS[APPS.find((a) => a.id === id)!.exe]; // bundled SVG, not user data
  s.style.width = s.style.height = `${size}px`;
  return s;
}

// ---- notes ---------------------------------------------------------------------------------
interface Item {
  text: string;
  done: boolean;
}
interface Note {
  id: number;
  title: string;
  body: string;
  color: number;
  apps: AppId[];
  items: Item[] | null;
  alert?: boolean;
}

const seed = (): Note[] => [
  { id: 1, title: "Flights to Lisbon", body: "Compare TAP and the low-cost options.\nKeep it under €180 return.", color: 0, apps: ["chrome"], items: null },
  { id: 2, title: "Read later", body: "That long piece on calm software.\nSave the recipe tab too.", color: 7, apps: ["chrome"], items: null },
  {
    id: 3,
    title: "Before merging",
    body: "",
    color: 2,
    apps: ["code"],
    items: [
      { text: "Run the test suite", done: true },
      { text: "Update the changelog", done: false },
      { text: "Remove debug logs", done: false },
    ],
  },
  { id: 4, title: "Design review", body: "Hero spacing on the 8px grid.\nTry a softer shadow on cards.", color: 4, apps: ["figma"], items: null },
  { id: 5, title: "Standup", body: "Reply in the thread before 10:30.\nMention the release date.", color: 6, apps: ["slack"], items: null },
  {
    id: 6,
    title: "Groceries",
    body: "",
    color: 3,
    apps: [],
    items: [
      { text: "Oat milk", done: false },
      { text: "Eggs", done: true },
      { text: "Basil", done: false },
      { text: "Coffee beans", done: false },
    ],
  },
  { id: 7, title: "Weekend", body: "Try the new ramen place.\nCall about the bike service.", color: 1, apps: [], items: null },
  { id: 8, title: "Ideas", body: "A tiny app that lives on the edge of the screen…", color: 5, apps: [], items: null },
];

let notes = seed();
let front: AppId = "chrome";
let openId: number | null = null;
let nextId = 100;
let nextColor = 0;
const CAPTURE_COLORS = [3, 0, 1, 4, 2, 5, 6];
const find = (id: number) => notes.find((n) => n.id === id);
const forFront = (n: Note) => n.apps.includes(front);

// ---- tour ----------------------------------------------------------------------------------
const STEPS = [
  { id: "peek", text: "Hover a tab on the right edge to peek" },
  { id: "open", text: "Click a tab to open the note" },
  { id: "switch", text: "Switch to VS Code in the taskbar" },
  { id: "capture", text: "Press + to jot a quick note" },
  { id: "remind", text: "Open a note and set a reminder" },
] as const;
type StepId = (typeof STEPS)[number]["id"];
const done = new Set<StepId>();

// ---- skeleton ------------------------------------------------------------------------------
const root = document.getElementById("demo")!;
const os = h("div", { class: "absolute left-0 top-0 origin-top-left select-none overflow-hidden text-[13px] text-ink" });
const screen = h("div", { class: "relative aspect-[1000/625] overflow-hidden rounded-md bg-black" }, os);
const laptop = h(
  "div",
  { class: "w-full drop-shadow-[0_32px_40px_rgb(17_24_39/0.16)]" },
  h(
    "div",
    { class: "rounded-t-[22px] bg-gradient-to-b from-[#2b2d33] to-[#1b1c20] px-[2.2%] pt-[2.2%] shadow-[inset_0_0_0_1.5px_#4a4d55]" },
    h(
      "div",
      { class: "relative pb-[2.2%]" },
      h("span", { class: "absolute -top-[1.4%] left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0d0e10] ring-1 ring-[#34363d]", "aria-hidden": "true" }),
      screen,
    ),
  ),
  h(
    "div",
    { class: "relative -mx-[6%] h-[clamp(12px,2.2vw,20px)] rounded-b-[16px_14px] bg-gradient-to-b from-[#e3e6eb] via-[#c3c7ce] to-[#a7abb3]", "aria-hidden": "true" },
    h("span", { class: "absolute left-1/2 top-0 h-2/5 w-[15%] -translate-x-1/2 rounded-b-[10px] bg-black/10" }),
  ),
);

const appwin = h("div", { class: "absolute" });
const col = h("div", { class: "flex flex-col items-end gap-[7px]" });
const addBtn = h(
  "button",
  {
    class:
      "mr-1 grid size-[30px] place-items-center rounded-full bg-white text-faint shadow-[0_2px_10px_rgb(17_24_39/0.14),0_0_0_1px_#e8ebef] transition duration-200 hover:rotate-90 hover:text-brand aria-expanded:rotate-90 aria-expanded:text-brand data-hint:animate-ring-hint",
    title: "Quick note (Ctrl+Alt+N)",
    "aria-label": "Quick note",
    "aria-expanded": "false",
  },
  svg(I.plus, "size-[15px] stroke-[2.4]"),
);
const deck = h(
  "div",
  { class: "absolute bottom-12 right-0 top-0 z-[4] flex flex-col items-end justify-center gap-2 py-4", role: "toolbar", "aria-label": "Notes on the screen edge" },
  col,
  addBtn,
);
const peek = h("div", {
  class:
    "pointer-events-none absolute right-[50px] z-[5] w-[236px] cursor-pointer rounded-[14px] bg-(--nb) px-4 pb-3 pt-3.5 text-note-ink opacity-0 shadow-[0_14px_34px_rgb(17_24_39/0.22),0_2px_6px_rgb(17_24_39/0.1)] transition-[clip-path,opacity,top] duration-300 ease-out-expo [clip-path:inset(0_0_0_100%_round_14px)] data-on:pointer-events-auto data-on:opacity-100 data-on:[clip-path:inset(0_round_14px)]",
  "aria-hidden": "true",
});
const noteHost = h("div", { class: "absolute right-16 top-[30px] z-[5]" });
const capInput = h("input", {
  class: "border-0 bg-transparent font-hand text-[19px] leading-tight text-note-ink outline-none placeholder:text-note-ink/55",
  placeholder: "Jot something down…",
  "aria-label": "Quick note",
  maxlength: 60,
});
const capture = paper(
  h(
    "form",
    {
      class:
        "pointer-events-none absolute bottom-16 right-11 z-[5] grid w-[250px] origin-bottom-right translate-x-4 scale-[0.97] gap-1.5 rounded-[14px] bg-(--nb) px-4 pb-2.5 pt-3.5 text-note-ink opacity-0 shadow-[0_16px_36px_rgb(17_24_39/0.24)] transition duration-300 ease-out-expo data-on:pointer-events-auto data-on:translate-x-0 data-on:scale-100 data-on:opacity-100",
    },
    capInput,
    h("span", { class: "text-[11px] text-note-ink/60" }, "Enter to add · Esc to close"),
  ),
  3,
);
const toast = h("div", {
  class:
    "pointer-events-none absolute bottom-[60px] right-3.5 z-[7] flex w-[290px] translate-y-4 cursor-pointer gap-3 rounded-xl bg-white p-3.5 opacity-0 shadow-[0_16px_40px_rgb(17_24_39/0.22),0_0_0_1px_#e8ebef] transition duration-300 ease-out-expo data-on:pointer-events-auto data-on:translate-y-0 data-on:opacity-100",
  role: "status",
  "aria-live": "polite",
});
const clock = h("span");
const tbApps = new Map<AppId, HTMLButtonElement>();
const taskbar = h(
  "div",
  { class: "absolute inset-x-0 bottom-0 z-[6] flex h-12 items-center justify-center gap-1 border-t border-white/70 bg-white/75 backdrop-blur-xl backdrop-saturate-150" },
  h(
    "span",
    { class: "grid size-10 place-items-center", "aria-hidden": "true" },
    h("span", { class: "grid grid-cols-2 gap-[2px]" }, ...[0, 1, 2, 3].map(() => h("i", { class: "size-[7px] rounded-[2px] bg-brand" }))),
  ),
  ...APPS.map((a) => {
    const b = h(
      "button",
      {
        class:
          "relative grid size-10 place-items-center rounded-md transition hover:bg-ink/5 aria-pressed:bg-ink/[0.06] data-hint:animate-ring-hint after:absolute after:bottom-0.5 after:left-1/2 after:h-[3px] after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-faint after:transition-all after:duration-200 aria-pressed:after:w-4 aria-pressed:after:bg-brand",
        title: a.name,
        "aria-label": `Switch to ${a.name}`,
        "aria-pressed": "false",
      },
      logo(a.id, 20),
    );
    b.addEventListener("click", () => setFront(a.id));
    tbApps.set(a.id, b);
    return b;
  }),
  h("span", { class: "absolute right-4 flex items-center gap-2.5 text-xs text-ink", "aria-hidden": "true" }, svg(I.wifi, "size-3.5"), clock),
);
os.append(
  h(
    "div",
    { class: "absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_10%,#e6f1fc_0%,#eef2fb_45%,#f7eef5_100%)]", "aria-hidden": "true" },
    h("div", { class: "absolute inset-0 bg-[radial-gradient(30%_30%_at_75%_70%,rgb(79_168_232/0.18),transparent_70%)]" }),
  ),
  appwin,
  deck,
  peek,
  noteHost,
  capture,
  toast,
  taskbar,
);

const tourList = h("ol", { class: "grid gap-1" });
const tourCount = h("span", { class: "text-[13px] font-semibold tabular-nums text-faint" });
const tourFill = h("i", { class: "block h-full w-0 rounded-full bg-brand transition-[width] duration-500 ease-out-expo" });
const tourDone = h(
  "p",
  { class: "mt-4 rounded-xl bg-brand-50 px-3.5 py-3 text-sm text-ink", hidden: true },
  h("strong", null, "You've got it."),
  " That's Peekin. ",
  h("a", { href: "https://github.com/piyushg-07/sticknote/releases/latest", class: "font-semibold text-brand-700 hover:underline" }, "Get it for Windows →"),
);
const resetBtn = h(
  "button",
  { class: "mt-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-faint transition hover:bg-brand-50 hover:text-ink" },
  svg(I.reset, "size-3.5"),
  "Reset demo",
);
const tour = h(
  "aside",
  { class: "mx-auto w-full max-w-[560px] rounded-3xl border border-line bg-white p-6 shadow-[0_10px_30px_-12px_rgb(17_24_39/0.12)] lg:max-w-none", "aria-label": "Things to try" },
  h("p", { class: "text-xs font-bold uppercase tracking-[0.12em] text-brand" }, "Live demo"),
  h("div", { class: "mt-1 flex items-baseline justify-between" }, h("h3", { class: "font-display text-xl font-extrabold tracking-tight" }, "Try these"), tourCount),
  h("span", { class: "mb-4 mt-3 block h-1 overflow-hidden rounded-full bg-brand-50" }, tourFill),
  tourList,
  tourDone,
  resetBtn,
);
root.append(laptop, tour);

// ---- scale the fixed-size desktop to the laptop screen -----------------------------------
let scale = 1;
let W = 1000;
let H = 625;
new ResizeObserver(() => {
  const w = screen.clientWidth;
  const compact = w < 560; // phones: a taller, narrower desktop stays readable
  W = compact ? 660 : 1000;
  H = compact ? 520 : 625;
  scale = w / W;
  screen.style.aspectRatio = `${W} / ${H}`;
  Object.assign(os.style, { width: `${W}px`, height: `${H}px`, transform: `scale(${scale})` });
  Object.assign(appwin.style, compact
    ? { left: "22px", top: "18px", right: "22px", bottom: "66px" }
    : { left: "26px", top: "22px", right: "230px", bottom: "70px" });
}).observe(screen);

// ---- the app in front -------------------------------------------------------------------
const WIN = "absolute inset-0 flex flex-col overflow-hidden rounded-[10px] shadow-[0_18px_50px_rgb(17_24_39/0.16),0_0_0_1px_rgb(17_24_39/0.06)]";

function titleBar(id: AppId, title: string, dark = false): HTMLElement {
  const line = dark ? "border-[#2c2c33] text-[#8b8f99]" : "border-line text-faint";
  return h(
    "div",
    { class: `flex h-[34px] items-center gap-2 border-b pl-3 text-xs font-semibold ${line}` },
    logo(id, 14),
    h("span", null, title),
    h("span", { class: "flex-1" }),
    h(
      "span",
      { class: "flex h-full", "aria-hidden": "true" },
      h("i", { class: "grid w-[42px] place-items-center" }, h("b", { class: "block w-2.5 border-t border-current" })),
      h("i", { class: "grid w-[42px] place-items-center" }, h("b", { class: "block size-2.5 border border-current" })),
      h("i", { class: "grid w-[42px] place-items-center text-[13px] font-normal not-italic" }, "✕"),
    ),
  );
}
const bars = (...widths: number[]) => widths.map((w) => h("span", { class: "mb-3 block h-2.5 rounded-full bg-[#e9edf2]", style: `width:${w}%` }));

function appView(id: AppId): HTMLElement {
  switch (id) {
    case "chrome":
      return h(
        "div",
        { class: `${WIN} bg-white` },
        titleBar(id, "Flights · Lisbon"),
        h("div", { class: "mx-3 my-2 flex items-center gap-2 rounded-full bg-paper px-3.5 py-[7px] text-xs text-faint" }, h("span", { class: "h-[9px] w-2 rounded-sm bg-faint" }), "flights.example.com/lisbon"),
        h(
          "div",
          { class: "flex-1 bg-paper px-6 py-2.5" },
          h("div", { class: "mb-3.5 flex gap-2" }, ...["From: Berlin", "To: Lisbon", "12 – 19 Jun"].map((t) => h("span", { class: "flex-1 rounded-lg bg-white px-3 py-2.5 text-xs ring-1 ring-line" }, t))),
          ...[
            ["07:15 → 10:05", "Direct · 2h 50m", "€164"],
            ["09:40 → 13:55", "1 stop · 4h 15m", "€139"],
            ["13:20 → 16:10", "Direct · 2h 50m", "€211"],
            ["18:05 → 20:55", "Direct · 2h 50m", "€178"],
          ].map(([t, d, p]) =>
            h(
              "div",
              { class: "mb-2 flex items-center gap-3.5 rounded-[10px] bg-white px-4 py-3 ring-1 ring-line" },
              h("span", { class: "size-[26px] rounded-lg bg-gradient-to-br from-brand to-[#8a6cd1]" }),
              h("div", null, h("b", { class: "block text-[13px]" }, t), h("small", { class: "text-[11.5px] text-faint" }, d)),
              h("em", { class: "ml-auto text-[15px] font-bold not-italic text-[#1e8e3e]" }, p),
            ),
          ),
        ),
      );
    case "code": {
      const C = { k: "text-[#c586c0]", f: "text-[#dcdcaa]", s: "text-[#ce9178]", c: "text-[#6a9955]", p: "text-[#d4d4d8]" };
      const code: [keyof typeof C | "n", string][] = [
        ["k", "export async function "], ["f", "checkout"], ["p", "(cart: Cart) {"], ["n", ""],
        ["c", "  // TODO: validate coupon"], ["n", ""],
        ["k", "  const "], ["p", "total = cart.items.reduce(sum, 0);"], ["n", ""],
        ["k", "  if "], ["p", "(total <= 0) "], ["k", "return "], ["s", '"empty"'], ["p", ";"], ["n", ""],
        ["k", "  await "], ["f", "charge"], ["p", "(cart.user, total);"], ["n", ""],
        ["p", "}"],
      ];
      const lines: HTMLElement[] = [];
      let line = h("div");
      for (const [kind, text] of code) {
        if (kind === "n") {
          lines.push(line);
          line = h("div");
        } else line.append(h("span", { class: C[kind] }, text));
      }
      lines.push(line);
      return h(
        "div",
        { class: `${WIN} bg-[#1f1f24] text-[#d4d4d8]` },
        titleBar(id, "checkout.ts · shop", true),
        h(
          "div",
          { class: "flex min-h-0 flex-1" },
          h(
            "div",
            { class: "flex w-[150px] flex-col whitespace-pre bg-[#18181c] py-2.5 text-xs text-[#9a9aa5]" },
            ...["src", "  cart.ts", "  checkout.ts", "  coupons.ts", "tests", "README.md"].map((f, i) =>
              h("span", { class: `px-3.5 py-[3px] ${i === 2 ? "bg-[#2a2d3a] text-[#e7e7ea]" : ""}` }, f),
            ),
          ),
          h(
            "div",
            { class: "flex-1 whitespace-pre py-3.5 font-mono text-[12.5px] leading-[1.75]" },
            ...lines.map((l, i) => h("div", { class: "flex" }, h("i", { class: "w-11 pr-4 text-right not-italic text-[#5b5b66]" }, String(i + 1)), l)),
          ),
        ),
      );
    }
    case "figma":
      return h(
        "div",
        { class: `${WIN} bg-white` },
        titleBar(id, "Website · Hero v3"),
        h(
          "div",
          { class: "flex min-h-0 flex-1" },
          h(
            "div",
            { class: "flex w-[150px] flex-col gap-0.5 border-r border-line p-3 text-[11.5px] text-faint" },
            ...["Frame / Hero", "Heading", "Buttons", "Laptop", "Frame / Features"].map((t, i) => h("span", { class: i === 0 ? "font-semibold text-ink" : "" }, t)),
          ),
          h(
            "div",
            { class: "grid flex-1 place-items-center bg-paper bg-[radial-gradient(#e3e7ec_1px,transparent_1px)] [background-size:16px_16px]" },
            h(
              "div",
              { class: "relative aspect-[4/3] w-[62%] rounded bg-white ring-[1.5px] ring-[#0d99ff]" },
              h("i", { class: "absolute left-1/2 top-[14%] h-[9%] w-[64%] -translate-x-1/2 rounded bg-ink/85" }),
              h("i", { class: "absolute left-1/2 top-[28%] h-[5%] w-[46%] -translate-x-1/2 rounded bg-[#e9edf2]" }),
              h("i", { class: "absolute left-1/2 top-[38%] h-[8%] w-[22%] -translate-x-1/2 rounded-full bg-brand" }),
              h("i", { class: "absolute left-1/2 top-[54%] h-[36%] w-[70%] -translate-x-1/2 rounded bg-gradient-to-br from-[#cfe0f7] to-[#f8cad7]" }),
            ),
          ),
          h("div", { class: "w-[150px] border-l border-line px-3.5 py-4" }, ...bars(80, 60, 70, 40, 65, 55)),
        ),
      );
    case "slack":
      return h(
        "div",
        { class: `${WIN} bg-white` },
        titleBar(id, "# standup"),
        h(
          "div",
          { class: "flex min-h-0 flex-1" },
          h(
            "div",
            { class: "flex w-40 flex-col gap-[3px] bg-[#3f0e40] px-2.5 py-3.5 text-[12.5px] text-[#cfc3cf]" },
            h("b", { class: "mx-1.5 mb-2.5 text-sm text-white" }, "Acme"),
            ...["# general", "# standup", "# design", "# random"].map((c) =>
              h("span", { class: `rounded-md px-2 py-[3px] ${c === "# standup" ? "bg-[#1164a3] text-white" : ""}` }, c),
            ),
          ),
          h(
            "div",
            { class: "flex-1 px-5 py-4" },
            ...([
              ["Sam", "Morning! Updates in thread, please.", 2],
              ["Ana", "Shipped the coupon fix, reviewing #482 next.", 4],
              ["Lee", "Design review moved to 3 pm.", 6],
            ] as const).map(([who, text, c]) =>
              h(
                "div",
                { class: "mb-4 flex gap-3" },
                paper(h("span", { class: "size-[34px] shrink-0 rounded-lg bg-(--ns)" }), c),
                h("div", null, h("b", null, who), h("p", { class: "mt-0.5 text-ink/85" }, text)),
              ),
            ),
          ),
        ),
      );
    case "notion":
      return h(
        "div",
        { class: `${WIN} bg-white` },
        titleBar(id, "Q3 planning"),
        h(
          "div",
          { class: "flex-1 px-14 py-8" },
          h("h4", { class: "mb-1.5 font-display text-[26px] font-extrabold" }, "Q3 planning"),
          h("p", { class: "mb-5 text-faint" }, "Goals, owners and dates for the next quarter."),
          ...bars(92, 78, 85, 60),
          h("div", { class: "my-2 mb-5 rounded-lg bg-brand-50 px-3.5 py-3 text-mute" }, "No notes for Notion yet: open a note and tie it to this app."),
          ...bars(70, 88),
        ),
      );
  }
}

function setFront(id: AppId) {
  tbApps.forEach((b, a) => b.setAttribute("aria-pressed", String(a === id)));
  if (id === front) return;
  front = id;
  hidePeek();
  const view = appView(id);
  view.classList.add("animate-fade-up");
  appwin.replaceChildren(view);
  renderDeck();
  if (openId !== null) renderNoteWin(); // its "Show while using" hint mentions the app
  markDone("switch");
}

// ---- deck ----------------------------------------------------------------------------------
const TAB =
  "relative grid h-11 w-[34px] place-items-center rounded-l-[11px] bg-(--nb) shadow-[-2px_3px_10px_rgb(17_24_39/0.14),inset_3px_0_0_var(--ns)] transition-[translate,width,transform,box-shadow] duration-300 ease-out-expo hover:-translate-x-1.5 hover:shadow-[-4px_6px_16px_rgb(17_24_39/0.2),inset_3px_0_0_var(--ns)] focus-visible:-translate-x-1.5 data-peeking:-translate-x-1.5 data-active:w-10 data-active:shadow-[-2px_3px_10px_rgb(17_24_39/0.14),inset_5px_0_0_var(--ns)] data-hint:animate-tab-hint";

function tabEl(n: Note, sticker: boolean): HTMLButtonElement {
  const items = n.items;
  const t = paper(
    h(
      "button",
      {
        class: TAB,
        "data-id": n.id,
        "data-active": n.id === openId,
        "aria-label": `${n.title}${sticker ? ` (for ${appName(front)})` : ""}`,
      },
      h("span", { class: "font-hand text-xl uppercase leading-none text-note-ink/55", "aria-hidden": "true" }, n.title.trim().charAt(0) || "·"),
      items
        ? h(
            "span",
            { class: "absolute bottom-1.5 left-2 right-1.5 h-[3px] overflow-hidden rounded-full bg-note-ink/10" },
            h("i", { class: "block h-full rounded-full bg-(--ns) transition-[width] duration-300", style: `width:${(items.filter((i) => i.done).length / items.length) * 100}%` }),
          )
        : null,
      n.alert ? h("span", { class: "absolute left-[7px] top-[5px] size-2 animate-dot rounded-full bg-[#f08a24] ring-2 ring-(--nb)" }) : null,
      sticker ? h("span", { class: "absolute right-[calc(100%+9px)] top-1/2 grid -translate-y-1/2 opacity-90 drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.25)]" }, logo(front, 18)) : null,
    ),
    n.color,
  );
  t.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") showPeek(n.id);
  });
  t.addEventListener("focus", () => showPeek(n.id));
  t.addEventListener("click", () => openNote(n.id));
  return t;
}

function renderDeck() {
  // FLIP: remember where each tab was, rebuild, then slide them into place.
  const before = new Map<string, number>();
  col.querySelectorAll<HTMLElement>("[data-id]").forEach((t) => before.set(t.dataset.id!, t.getBoundingClientRect().top));

  const mine = notes.filter(forFront);
  const rest = notes.filter((n) => !n.apps.length);
  fill(
    col,
    mine.length
      ? h(
          "div",
          {
            class:
              "flex flex-col items-end gap-[7px] rounded-l-[14px] bg-gradient-to-br from-white/60 to-white/25 py-1.5 pl-1.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.7),0_4px_18px_rgb(17_24_39/0.08)] backdrop-blur-md",
          },
          ...mine.map((n) => tabEl(n, true)),
        )
      : null,
    mine.length && rest.length ? h("span", { class: "my-0.5 mr-1.5 h-0.5 w-[22px] rounded-full bg-ink/20", "aria-hidden": "true" }) : null,
    ...rest.map((n) => tabEl(n, false)),
  );

  col.querySelectorAll<HTMLElement>("[data-id]").forEach((t) => {
    const old = before.get(t.dataset.id!);
    if (old === undefined) {
      t.classList.add("animate-tab-in");
      t.addEventListener("animationend", () => t.classList.remove("animate-tab-in"), { once: true });
      return;
    }
    const dy = (old - t.getBoundingClientRect().top) / scale;
    if (Math.abs(dy) < 0.5) return;
    t.style.transition = "none";
    t.style.transform = `translateY(${dy}px)`;
    void t.offsetWidth;
    t.style.transition = "";
    t.style.transform = "";
  });
  updateHints();
}

// ---- peek ----------------------------------------------------------------------------------
let peekId: number | null = null;
let peekTimer = 0;

function showPeek(id: number, autoHideMs = 0) {
  clearTimeout(peekTimer);
  const n = find(id);
  const tab = col.querySelector<HTMLElement>(`[data-id="${id}"]`);
  if (!n || !tab || openId === id) return hidePeek();
  peekId = id;
  paper(peek, n.color);
  const doneCount = n.items?.filter((i) => i.done).length ?? 0;
  fill(
    peek,
    forFront(n)
      ? h("div", { class: "mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/60 py-[3px] pl-[5px] pr-2.5 text-[11px] font-semibold text-note-ink/70" }, logo(front, 14), `For ${appName(front)}`)
      : null,
    h("div", { class: "font-display text-base font-extrabold leading-tight" }, n.title || "Untitled"),
    n.items
      ? h(
          "ul",
          { class: "mt-2 font-hand text-base leading-normal" },
          ...n.items.slice(0, 5).map((i) =>
            h(
              "li",
              { class: `flex items-center gap-2 ${i.done ? "text-note-ink/55 line-through" : ""}` },
              h("span", { class: `size-3 rounded-[3px] ring-[1.5px] ring-inset ring-(--ns) ${i.done ? "bg-(--ns)" : ""}` }),
              i.text,
            ),
          ),
        )
      : h("p", { class: "mt-1.5 whitespace-pre-line font-hand text-[17px] leading-snug" }, n.body.trim() || "Empty note"),
    h("div", { class: "mt-2.5 text-[11px] font-semibold text-note-ink/60" }, n.items ? `${doneCount} of ${n.items.length} done` : "Click to open"),
  );
  const top = (tab.getBoundingClientRect().top - os.getBoundingClientRect().top) / scale;
  peek.style.top = `${Math.max(12, Math.min(top - 10, H - 60 - peek.offsetHeight))}px`;
  flag(peek, "on", true);
  col.querySelectorAll("[data-id]").forEach((t) => flag(t, "peeking", t === tab));
  markDone("peek");
  if (autoHideMs) peekTimer = window.setTimeout(() => hidePeek(), autoHideMs);
}

function hidePeek(delay = 0) {
  clearTimeout(peekTimer);
  const hide = () => {
    flag(peek, "on", false);
    col.querySelectorAll("[data-peeking]").forEach((t) => flag(t, "peeking", false));
    peekId = null;
  };
  if (delay) peekTimer = window.setTimeout(hide, delay);
  else hide();
}

deck.addEventListener("pointerleave", () => hidePeek(160));
peek.addEventListener("pointerenter", () => clearTimeout(peekTimer));
peek.addEventListener("pointerleave", () => hidePeek(160));
peek.addEventListener("click", () => peekId !== null && openNote(peekId));

// ---- note window ---------------------------------------------------------------------------
let remindTimer = 0;
let remindFor: number | null = null;
let remindLeft = 0;

function openNote(id: number) {
  const n = find(id);
  if (!n) return;
  openId = id;
  n.alert = false;
  hidePeek();
  renderNoteWin(true);
  renderDeck();
  markDone("peek"); // touch screens open straight away
  markDone("open");
}

function closeNote() {
  openId = null;
  noteHost.replaceChildren();
  renderDeck();
}

function renderNoteWin(animate = false) {
  if (openId === null) return noteHost.replaceChildren();
  const n = find(openId);
  if (!n) return closeNote();

  const title = h("input", {
    class: "min-w-0 flex-1 border-0 bg-transparent py-1 font-display text-[17px] font-extrabold leading-tight text-note-ink outline-none",
    value: n.title,
    "aria-label": "Note title",
    maxlength: 40,
    spellcheck: "false",
  });
  title.addEventListener("input", () => {
    n.title = title.value;
    renderDeck();
  });

  let body: HTMLElement;
  if (n.items) {
    body = h(
      "ul",
      { class: "px-4 pb-2.5 pt-1.5 font-hand text-lg leading-normal" },
      ...n.items.map((item) => {
        const text = h("span", { class: item.done ? "text-note-ink/55 line-through" : "" }, item.text);
        const box = h("input", { type: "checkbox", checked: item.done, class: "size-[15px] cursor-pointer accent-(--ns)" });
        box.addEventListener("change", () => {
          item.done = box.checked;
          text.className = item.done ? "text-note-ink/55 line-through" : "";
          renderDeck();
        });
        return h("li", null, h("label", { class: "flex cursor-pointer items-center gap-2.5" }, box, text));
      }),
    );
  } else {
    const ta = h("textarea", {
      class: "block h-[120px] w-full resize-none border-0 bg-transparent px-4 py-1.5 font-hand text-lg leading-snug text-note-ink outline-none placeholder:text-note-ink/50",
      "aria-label": "Note text",
      spellcheck: "false",
      placeholder: "Write something…",
    });
    ta.value = n.body;
    ta.addEventListener("input", () => (n.body = ta.value));
    body = ta;
  }

  const colors = h(
    "div",
    { class: "flex gap-[7px]", role: "radiogroup", "aria-label": "Colour" },
    ...PAPER.map(([name], i) => {
      const b = paper(
        h("button", {
          class:
            "size-[18px] rounded-full bg-(--nb) shadow-[inset_0_0_0_1.5px_var(--ns)] transition hover:scale-110 aria-checked:shadow-[inset_0_0_0_1.5px_var(--ns),0_0_0_2px_#fff,0_0_0_3.5px_var(--ns)]",
          role: "radio",
          "aria-checked": String(i === n.color),
          title: name,
          "aria-label": name,
        }),
        i,
      );
      b.addEventListener("click", () => {
        n.color = i;
        renderNoteWin();
        renderDeck();
      });
      return b;
    }),
  );

  const apps = h(
    "div",
    { class: "flex gap-1" },
    ...APPS.map((a) => {
      const on = n.apps.includes(a.id);
      const b = h(
        "button",
        {
          class:
            "grid size-7 place-items-center rounded-lg opacity-45 grayscale-[0.6] transition hover:opacity-80 aria-pressed:bg-white/75 aria-pressed:opacity-100 aria-pressed:grayscale-0 aria-pressed:ring-[1.5px] aria-pressed:ring-(--ns)",
          "aria-pressed": String(on),
          title: `Show while using ${a.name}`,
          "aria-label": `Show while using ${a.name}`,
        },
        logo(a.id, 16),
      );
      b.addEventListener("click", () => {
        n.apps = on ? n.apps.filter((x) => x !== a.id) : [...n.apps, a.id];
        renderNoteWin();
        renderDeck();
      });
      return b;
    }),
  );
  const names = n.apps.map(appName).join(" or ");
  const appHint = !n.apps.length
    ? "On the deck with every app"
    : n.apps.includes(front)
      ? `On the deck while ${names} is in front`
      : `Hidden now: shows while ${names} is in front`;

  const pending = remindFor === n.id;
  const bell = h(
    "button",
    {
      class: `inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-semibold transition data-hint:animate-ring-hint ${
        pending ? "bg-(--ns) text-white" : "bg-white/70 text-note-ink hover:bg-white"
      }`,
      "aria-live": "polite",
      "data-bell": true,
    },
    svg(I.bell, "size-3.5"),
    pending ? `Reminder in ${remindLeft} s` : "Remind me in 5 s",
  );
  bell.addEventListener("click", () => startReminder(n.id));

  const close = h(
    "button",
    { class: "grid size-7 place-items-center rounded-lg text-note-ink/60 transition hover:bg-note-ink/10 hover:text-note-ink", title: "Close", "aria-label": "Close note" },
    svg(I.close, "size-3.5"),
  );
  close.addEventListener("click", closeNote);

  const win = paper(
    h(
      "div",
      {
        class: `w-[318px] origin-[100%_30%] overflow-hidden rounded-[14px] bg-(--nb) text-note-ink shadow-[0_22px_50px_rgb(17_24_39/0.24),0_2px_8px_rgb(17_24_39/0.1)] ${animate ? "animate-pop-in" : ""}`,
        role: "dialog",
        "aria-label": n.title || "Note",
      },
      h("div", { class: "flex items-center gap-1.5 border-t-4 border-(--ns) pb-1 pl-4 pr-2 pt-2.5" }, title, close),
      body,
      h(
        "div",
        { class: "grid gap-2.5 bg-white/35 px-4 pb-3.5 pt-3" },
        colors,
        h("div", { class: "flex items-center gap-2" }, h("span", { class: "whitespace-nowrap text-[11.5px] font-semibold text-note-ink/60" }, "Show while using"), apps),
        h("p", { class: "-mt-1 text-[11.5px] text-note-ink/60" }, appHint),
        bell,
      ),
    ),
    n.color,
  );
  noteHost.replaceChildren(win);
  updateHints();
}

// ---- reminders ----------------------------------------------------------------------------
function startReminder(id: number) {
  if (remindFor !== null) return;
  remindFor = id;
  remindLeft = 5;
  renderNoteWin();
  remindTimer = window.setInterval(() => {
    remindLeft -= 1;
    if (remindLeft > 0) {
      if (openId === id) renderNoteWin();
      return;
    }
    clearInterval(remindTimer);
    remindFor = null;
    fireReminder(id);
  }, 1000);
}

let toastTimer = 0;
function fireReminder(id: number) {
  const n = find(id);
  if (!n) return;
  n.alert = openId !== id;
  if (openId === id) renderNoteWin();
  renderDeck();
  showPeek(id, 3500); // the card pops out of the edge (if it's on the deck now)

  fill(
    toast,
    h("img", { src: "/logo.svg", alt: "", width: 28, height: 28, class: "size-7" }),
    h(
      "div",
      null,
      h("small", { class: "block text-[11px] text-faint" }, "Peekin · Reminder"),
      h("b", { class: "my-0.5 block text-[13.5px]" }, n.title || "Untitled"),
      h("span", { class: "text-xs text-faint" }, "Click to open the note"),
    ),
  );
  toast.onclick = () => {
    flag(toast, "on", false);
    openNote(id);
  };
  flag(toast, "on", true);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => flag(toast, "on", false), 6000);
  markDone("remind");
}

// ---- quick capture -------------------------------------------------------------------------
function openCapture() {
  hidePeek();
  flag(capture, "on", true);
  addBtn.setAttribute("aria-expanded", "true");
  capInput.focus({ preventScroll: true });
}
function closeCapture() {
  flag(capture, "on", false);
  addBtn.setAttribute("aria-expanded", "false");
}
addBtn.addEventListener("click", () => (capture.hasAttribute("data-on") ? closeCapture() : openCapture()));
capture.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = capInput.value.trim();
  if (!text) return closeCapture();
  notes.push({ id: nextId++, title: text, body: "", color: CAPTURE_COLORS[nextColor++ % CAPTURE_COLORS.length], apps: [], items: null });
  capInput.value = "";
  paper(capture, CAPTURE_COLORS[nextColor % CAPTURE_COLORS.length]);
  closeCapture();
  renderDeck();
  markDone("capture");
});
capInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.stopPropagation();
    closeCapture();
  }
});

// ---- tour ----------------------------------------------------------------------------------
function markDone(id: StepId) {
  if (done.has(id)) return;
  done.add(id);
  renderTour();
  updateHints();
}

function renderTour() {
  const current = STEPS.find((s) => !done.has(s.id))?.id;
  fill(
    tourList,
    ...STEPS.map((s, i) => {
      const isDone = done.has(s.id);
      const isCur = s.id === current;
      return h(
        "li",
        { class: `flex items-center gap-3 rounded-xl px-2.5 py-2 text-[14.5px] transition ${isCur ? "bg-brand-50 font-semibold text-ink" : isDone ? "text-faint" : "text-mute"}` },
        h(
          "span",
          {
            class: `grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${isDone ? "bg-brand text-white" : isCur ? "bg-ink text-white" : "ring-[1.5px] ring-inset ring-line"}`,
            "aria-hidden": "true",
          },
          isDone ? svg(I.check, "size-[13px] stroke-[3]") : String(i + 1),
        ),
        h("span", { class: isDone ? "line-through decoration-faint" : "" }, s.text),
        isDone ? h("span", { class: "sr-only" }, " (done)") : null,
      );
    }),
  );
  tourCount.textContent = `${done.size} / ${STEPS.length}`;
  tourFill.style.width = `${(done.size / STEPS.length) * 100}%`;
  tourDone.hidden = done.size < STEPS.length;
}

/** Gently pulse whatever the next step needs you to touch. */
function updateHints() {
  os.querySelectorAll("[data-hint]").forEach((el) => flag(el, "hint", false));
  const current = STEPS.find((s) => !done.has(s.id))?.id;
  const firstTab = col.querySelector("[data-id]:not([data-active])");
  const target =
    current === "peek" || current === "open"
      ? firstTab
      : current === "switch"
        ? tbApps.get(front === "code" ? "figma" : "code")
        : current === "capture"
          ? addBtn
          : current === "remind"
            ? (noteHost.querySelector("[data-bell]") ?? firstTab)
            : null;
  if (target) flag(target, "hint", true);
}

resetBtn.addEventListener("click", () => {
  clearInterval(remindTimer);
  clearTimeout(toastTimer);
  remindFor = null;
  notes = seed();
  openId = null;
  nextColor = 0;
  noteHost.replaceChildren();
  flag(toast, "on", false);
  closeCapture();
  hidePeek();
  front = "notion"; // so setFront redraws Chrome
  setFront("chrome");
  done.clear();
  renderTour();
  renderDeck();
});

// ---- "apps" section: the logos, each wearing a mini note ----------------------------------
const cloud = document.getElementById("app-cloud");
if (cloud) {
  APPS.forEach((a, i) => {
    const tile = h(
      "div",
      { class: "group relative grid aspect-square place-items-center rounded-2xl border border-line bg-white shadow-[0_8px_24px_-12px_rgb(17_24_39/0.15)] transition duration-300 hover:-translate-y-1" },
      logo(a.id, 40, "transition duration-300 group-hover:scale-110"),
      paper(h("span", { class: "absolute -right-1.5 -top-1.5 h-4 w-6 rotate-6 rounded-[4px] bg-(--nb) shadow-[inset_0_2px_0_var(--ns),0_2px_6px_rgb(17_24_39/0.12)] transition duration-300 group-hover:rotate-0", "aria-hidden": "true" }), [0, 2, 4, 6, 3][i]),
      h("span", { class: "sr-only" }, a.name),
    );
    cloud.append(tile);
  });
}

// ---- the page's own deck: section links as tabs on the real screen edge -----------------
const SITE_TABS: [string, string, number][] = [
  ["Try the live demo", "#try", 0],
  ["Works with your apps", "#apps", 3],
  ["What's inside", "#features", 1],
];
document.body.append(
  h(
    "nav",
    { class: "fixed right-0 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-end gap-2 xl:flex", "aria-label": "Jump to section" },
    ...SITE_TABS.map(([label, href, c]) =>
      paper(
        h(
          "a",
          {
            href,
            class:
              "group flex h-11 w-[34px] items-center overflow-hidden whitespace-nowrap rounded-l-[11px] bg-(--nb) pl-3.5 text-[13px] font-semibold text-note-ink shadow-[-2px_3px_10px_rgb(17_24_39/0.12),inset_3px_0_0_var(--ns)] transition-[width] duration-300 ease-out-expo hover:w-52 focus-visible:w-52",
          },
          h("span", { class: "opacity-0 transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" }, label),
          svg(I.arrow, "ml-auto mr-3 size-3.5 shrink-0 opacity-0 transition group-hover:opacity-60 group-focus-visible:opacity-60"),
        ),
        c,
      ),
    ),
  ),
);

// ---- keyboard + clock ----------------------------------------------------------------------
let demoInView = false;
new IntersectionObserver(([e]) => (demoInView = e.isIntersecting), { threshold: 0.35 }).observe(laptop);
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "n" && demoInView) {
    e.preventDefault();
    openCapture();
  } else if (e.key === "Escape" && laptop.contains(document.activeElement)) {
    if (capture.hasAttribute("data-on")) closeCapture();
    else if (openId !== null) closeNote();
  }
});
os.addEventListener("pointerdown", (e) => {
  const t = e.target as Element;
  if (capture.hasAttribute("data-on") && !capture.contains(t) && !addBtn.contains(t)) closeCapture();
});

const tick = () => (clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
tick();
setInterval(tick, 20_000);

// ---- go ------------------------------------------------------------------------------------
appwin.replaceChildren(appView(front));
tbApps.forEach((b, a) => b.setAttribute("aria-pressed", String(a === front)));
renderTour();
renderDeck();
