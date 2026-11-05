// Tailwind class strings for the deck. Every string is a complete literal
// (Tailwind scans this file); compose them with `cx()`.
//
// State lives in data attributes, read through variants:
//   on the root (#deck):  data-edge="right|left"  → deck-r: / deck-l:
//                         data-compact (pills)    → deck-pill:
//                         data-instant            → deck-instant:
//   (custom variants, defined in src/styles/tw/deck.css)
//   on a tab:   data-active, data-under, data-floating, data-alert, data-progress
//   on the card (group/card): data-visible, data-open, data-snap
//   elsewhere:  data-leaving (card wrap), data-off (stickers), data-pressed ("+")
//
// Geometry tokens (--deck-tab-w, --deck-anim …) are defined on <html> in
// deck.html: main.ts reads them from document.documentElement.

// ---- column -------------------------------------------------------------------
export const COLUMN =
  "absolute top-1/2 flex flex-col py-(--deck-gutter) [transform:translateY(-50%)] [transition:right_var(--deck-anim)_var(--deck-ease),left_var(--deck-anim)_var(--deck-ease)] deck-r:right-0 deck-r:items-end deck-l:left-0 deck-l:items-start deck-instant:[transition:none]!";

/** Tab/pill shadow lives on the stack: a box-shadow would be clipped away by
 *  the tabs' clip-path. */
export const STACK =
  "flex flex-col [align-items:inherit] [transition:filter_var(--deck-anim)_var(--deck-ease)] deck-r:[filter:drop-shadow(-2px_2px_5px_rgba(0,0,0,0.2))] deck-l:[filter:drop-shadow(2px_2px_5px_rgba(0,0,0,0.2))] deck-pill:[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.35))]";

// ---- tabs ----------------------------------------------------------------------
// Pills are the tabs themselves, clipped down to a small capsule and slid into
// a tight column (--pill-dy). Tabs never change size, so pill ↔ tab animates
// only clip-path and translate.
export const TAB = [
  "relative flex h-[var(--tab-h,76px)] w-[calc(var(--w)_+_var(--deck-overhang))] -my-[3px] cursor-pointer touch-none items-start overflow-hidden bg-note text-note-ink will-change-[clip-path,translate]",
  "[--w:var(--deck-tab-w)] hover:z-2 hover:[--w:calc(var(--deck-tab-w)_+_5px)] [translate:0_var(--shift,0px)]",
  "[transition:width_220ms_var(--deck-ease),clip-path_var(--deck-anim)_var(--deck-ease),transform_var(--deck-anim)_var(--deck-ease),translate_var(--deck-anim)_var(--deck-ease),box-shadow_240ms_var(--ease-in-out),opacity_180ms_var(--ease-out)]",
  // leaning like a fanned deck of cards
  "nth-[3n+2]:[--lean:-2px] nth-[3n+2]:[--tilt:-1.4deg] nth-[3n+3]:[--lean:-4px] nth-[3n+3]:[--tilt:1deg]",
  "deck-r:-mr-(--deck-overhang) deck-r:flex-row deck-r:origin-[right_center] deck-r:rounded-[11px_0_0_11px] deck-r:[box-shadow:-2px_2px_8px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(0,0,0,0.04)] deck-r:[transform:translateX(var(--lean,0px))_rotate(var(--tilt,0deg))] deck-r:[clip-path:inset(0px_0px_0px_0px_round_11px_0px_0px_11px)]",
  "deck-l:-ml-(--deck-overhang) deck-l:flex-row-reverse deck-l:origin-[left_center] deck-l:rounded-[0_11px_11px_0] deck-l:[box-shadow:2px_2px_8px_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(0,0,0,0.04)] deck-l:[transform:translateX(calc(var(--lean,0px)_*_-1))_rotate(calc(var(--tilt,0deg)_*_-1))] deck-l:[clip-path:inset(0px_0px_0px_0px_round_0px_11px_11px_0px)]",
  // pill mode: `!` because the lean (nth-child) and hover rules are more
  // specific than a :where() variant; pills must sit straight and never widen
  "deck-pill:[--lean:0px]! deck-pill:[--tilt:0deg]! deck-pill:[--w:var(--deck-tab-w)]! deck-pill:[translate:0_var(--pill-dy,0px)]",
  "deck-pill:deck-r:[clip-path:inset(calc((var(--tab-h,76px)_-_var(--deck-pill-h))_/_2)_calc(var(--deck-overhang)_+_var(--deck-pill-inset))_calc((var(--tab-h,76px)_-_var(--deck-pill-h))_/_2)_calc(100%_-_var(--deck-overhang)_-_var(--deck-pill-inset)_-_var(--deck-pill-w))_round_999px)]",
  "deck-pill:deck-l:[clip-path:inset(calc((var(--tab-h,76px)_-_var(--deck-pill-h))_/_2)_calc(100%_-_var(--deck-overhang)_-_var(--deck-pill-inset)_-_var(--deck-pill-w))_calc((var(--tab-h,76px)_-_var(--deck-pill-h))_/_2)_calc(var(--deck-overhang)_+_var(--deck-pill-inset))_round_999px)]",
  // pill: checklist progress fills from the bottom (aligned to the visible capsule)
  "deck-pill:data-progress:[background:linear-gradient(to_top,var(--note-bg)_0_calc(50%_-_var(--deck-pill-h)_/_2),var(--note-strong)_0_calc(50%_-_var(--deck-pill-h)_/_2_+_var(--progress,0)_*_var(--deck-pill-h)),var(--note-bg)_0)]",
  // pill: a reminder takes the alert colour and gently pulses
  "deck-pill:data-alert:[background:var(--color-alert)]! deck-pill:data-alert:animate-deck-pill-pulse motion-reduce:animate-none!",
  // the tab under the open card hides (the card stands in for it)
  "data-under:opacity-0 data-under:[transition-duration:220ms,var(--deck-anim),var(--deck-anim),var(--deck-anim),240ms,0ms]",
  // drag & drop
  "data-floating:absolute data-floating:z-10! data-floating:my-0 data-floating:[transition:none] data-floating:[translate:none] data-floating:[clip-path:none]!",
  "deck-r:data-floating:right-0 deck-r:data-floating:[box-shadow:-4px_10px_24px_rgba(0,0,0,0.3)] deck-l:data-floating:left-0 deck-l:data-floating:[box-shadow:4px_10px_24px_rgba(0,0,0,0.3)]",
  // no animation for layout restores
  "deck-instant:[transition:none]!",
  // a tab whose note window is open shows an inner marker
  "data-active:after:absolute data-active:after:top-[10px] data-active:after:bottom-[10px] data-active:after:w-[3px] data-active:after:rounded-full data-active:after:bg-note-strong data-active:after:[transition:opacity_160ms] deck-r:data-active:after:left-1 deck-l:data-active:after:right-1 deck-pill:data-active:after:opacity-0",
].join(" ");

export const TAB_STRIP =
  "grid h-[var(--tab-h,76px)] w-(--deck-tab-w) flex-none place-items-center [transition:height_var(--deck-anim)_var(--deck-ease),background_240ms,opacity_160ms] deck-pill:opacity-0";

/** Vertical title (tab strip and the card's strip). */
const LABEL =
  "pointer-events-none overflow-hidden text-ellipsis whitespace-nowrap font-ui text-2xs/[inherit] font-semibold uppercase tracking-[0.06em] text-note-ink-muted [writing-mode:vertical-rl] deck-r:[transform:rotate(180deg)]";
export const TAB_LABEL = `${LABEL} max-h-[calc(var(--tab-h,76px)_-_18px)]`;

/** Slim vertical checklist track on the side nearest the screen edge. */
export const TAB_PROGRESS =
  "pointer-events-none absolute bottom-[10px] h-[calc(var(--tab-h,76px)_-_20px)] w-[3px] overflow-hidden rounded-[3px] bg-[rgba(0,0,0,0.1)] [transition:opacity_160ms] deck-r:left-[23px] deck-l:left-[calc(var(--deck-overhang)_+_4px)] deck-pill:opacity-0 after:absolute after:inset-x-0 after:bottom-0 after:h-[calc(var(--progress,0)_*_100%)] after:rounded-[inherit] after:bg-note-strong after:[transition:height_var(--deck-anim)_var(--deck-ease)]";

/** Reminder dot (pulses a few times, then rests), top outer corner. */
export const TAB_ALERT =
  "pointer-events-none absolute top-[6px] size-2 rounded-full bg-alert [box-shadow:0_0_0_2px_var(--note-bg)] animate-deck-alert-pulse motion-reduce:animate-none! deck-r:left-[6px] deck-l:left-[calc(var(--deck-overhang)_+_var(--deck-tab-w)_-_14px)] deck-pill:opacity-0";

/** Dashed drop slot while dragging. */
export const SLOT =
  "m-0 w-[calc(var(--deck-tab-w)_+_var(--deck-overhang))] border-2 border-dashed border-[rgba(255,255,255,0.75)] bg-[rgba(0,0,0,0.18)] deck-r:-mr-(--deck-overhang) deck-r:rounded-[11px_0_0_11px] deck-r:border-r-0 deck-l:-ml-(--deck-overhang) deck-l:rounded-[0_11px_11px_0] deck-l:border-l-0";

// ---- the note card ----------------------------------------------------------------
/** The wrapper carries the shadow (clip-path on the card would cut it off).
 *  Closing: a short fade + slide into the edge (CLOSE_MS in main.ts). */
export const CARD_WRAP =
  "pointer-events-none invisible absolute top-0 z-5 [transform:translateY(var(--card-y,0px))] [filter:drop-shadow(0_10px_22px_rgba(0,0,0,0.3))_drop-shadow(0_1px_3px_rgba(0,0,0,0.14))] [transition:transform_var(--deck-anim)_var(--deck-ease),opacity_120ms_var(--ease-out),translate_120ms_var(--ease-out)] has-[>[data-visible]]:visible has-[>[data-open]]:pointer-events-auto deck-r:-right-(--deck-overhang) deck-l:-left-(--deck-overhang) data-leaving:pointer-events-none! data-leaving:opacity-0 data-leaving:[transition:transform_var(--deck-anim)_var(--deck-ease),opacity_200ms_cubic-bezier(0.4,0,1,1),translate_200ms_cubic-bezier(0.4,0,1,1)] deck-r:data-leaving:[translate:18px_0] deck-l:data-leaving:[translate:-18px_0] deck-instant:[transition:none]!";

/** Revealed out of the hovered tab with clip-path; data-snap sets a state
 *  without animating (itself and everything inside). */
export const CARD =
  "group/card relative h-[var(--card-h,200px)] w-[calc(var(--deck-peek-w)_+_var(--deck-overhang))] cursor-pointer overflow-hidden bg-note text-note-ink will-change-[clip-path] [transition:clip-path_var(--deck-anim)_var(--deck-ease),height_var(--deck-anim)_var(--deck-ease),background_240ms_var(--ease-in-out)] deck-r:data-open:[clip-path:inset(0px_0px_0px_0px_round_14px_0_0_14px)] deck-l:data-open:[clip-path:inset(0px_0px_0px_0px_round_0_14px_14px_0)] data-snap:[transition:none]! [&[data-snap]_*]:[transition:none]!";

/** Title strip: sits where the tab is when closed, slides to the card's outer
 *  side as it opens. */
export const CARD_STRIP =
  "absolute top-0 grid h-full w-(--deck-tab-w) place-items-center bg-[rgba(0,0,0,0.05)] [transition:transform_var(--deck-anim)_var(--deck-ease)] deck-r:left-0 deck-r:[transform:translateX(calc(var(--deck-peek-w)_-_var(--deck-tab-w)))] deck-l:right-0 deck-l:[transform:translateX(calc((var(--deck-peek-w)_-_var(--deck-tab-w))_*_-1))] group-data-open/card:[transform:none]!";
export const CARD_LABEL = `${LABEL} max-h-[170px] [translate:0_var(--tab-mid,0px)] [transition:translate_var(--deck-anim)_var(--deck-ease)] group-data-open/card:[translate:none]`;

export const CARD_CONTENT =
  "absolute top-0 flex w-[calc(var(--deck-peek-w)_-_var(--deck-tab-w))] flex-col pt-4 pr-4 pb-3 pl-3 deck-r:left-(--deck-tab-w) deck-l:left-(--deck-overhang) deck-l:pr-3 deck-l:pl-4";

/** Each piece of card content: arrives in a short stagger, leaves fast. */
export const CARD_ITEM =
  "opacity-0 [transform:translateX(14px)] [transition:opacity_120ms_var(--ease-in-out),transform_120ms_var(--ease-in-out)] deck-l:[transform:translateX(-14px)] group-data-open/card:opacity-100 group-data-open/card:[transform:none]! motion-reduce:delay-0!";
/** Open-state transition per position (title → body → footer stagger). */
export const CARD_ITEM_STAGGER = [
  "group-data-open/card:[transition:opacity_260ms_var(--ease-in-out)_90ms,transform_var(--deck-anim)_var(--deck-ease)_90ms]",
  "group-data-open/card:[transition:opacity_260ms_var(--ease-in-out)_140ms,transform_var(--deck-anim)_var(--deck-ease)_140ms]",
  "group-data-open/card:[transition:opacity_260ms_var(--ease-in-out)_190ms,transform_var(--deck-anim)_var(--deck-ease)_190ms]",
  "group-data-open/card:[transition:opacity_260ms_var(--ease-in-out)_230ms,transform_var(--deck-anim)_var(--deck-ease)_230ms]",
  "group-data-open/card:[transition:opacity_260ms_var(--ease-in-out)_270ms,transform_var(--deck-anim)_var(--deck-ease)_270ms]",
];

export const PEEK_ALERT =
  "mb-2 inline-flex items-center gap-[5px] self-start rounded-full bg-alert py-[3px] pr-[9px] pl-[7px] font-ui text-2xs/[inherit] font-bold uppercase tracking-[0.06em] text-white data-missed:bg-[#b7791f] [&_.icon]:stroke-[2.4]";
export const PEEK_FOR =
  "mb-2 inline-flex items-center gap-1.5 self-start rounded-full bg-[rgba(0,0,0,0.07)] py-[3px] pr-[10px] pl-[3px] font-ui text-xs/[inherit] font-semibold text-note-ink";
export const PEEK_TITLE = "mb-1 truncate font-ui text-lg/[inherit] font-semibold";
/** Body: note font at peek size, fading out at the bottom. */
export const PEEK_BODY =
  "rich min-h-12 flex-1 overflow-hidden text-[length:calc(17px_*_var(--note-font-scale,1))] leading-[1.35] [mask-image:linear-gradient(to_bottom,#000_80%,transparent)]";
export const PEEK_FOOT =
  "mt-2 flex items-center gap-3 whitespace-nowrap font-ui text-xs/[inherit] text-note-ink-muted";
export const PEEK_PROGRESS = "inline-flex items-center gap-1.5 font-semibold text-note-ink";
export const PEEK_BAR = "relative h-1 w-11 overflow-hidden rounded-[4px] bg-[rgba(0,0,0,0.1)]";
export const PEEK_BAR_FILL =
  "absolute inset-y-0 left-0 w-[calc(var(--progress,0)_*_100%)] rounded-[inherit] bg-note-strong";

// ---- pill mode: glass capsule, divider, app stickers --------------------------------
/** A long glass capsule behind the pills (a transparent window can't blur the
 *  desktop: translucent fill, bright rim, soft shadow). Behind the pills: the
 *  column is its own stacking context. */
export const PILL_GLASS =
  "pointer-events-none absolute top-[var(--y,0px)] -z-1 h-[var(--h,0px)] w-(--glass-w) rounded-full border border-[rgba(255,255,255,0.75)] bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.34))] opacity-0 [backdrop-filter:blur(14px)_saturate(160%)] [box-shadow:0_8px_22px_rgba(0,0,0,0.2),0_1px_3px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(0,0,0,0.05)] [transition:opacity_200ms_var(--ease-out),top_var(--deck-anim)_var(--deck-ease),height_var(--deck-anim)_var(--deck-ease)] deck-r:right-[calc(var(--pill-x)_-_var(--glass-w)_/_2)] deck-l:left-[calc(var(--pill-x)_-_var(--glass-w)_/_2)] deck-pill:opacity-100 deck-instant:[transition:none] dark:border-[rgba(255,255,255,0.14)] dark:bg-[linear-gradient(180deg,rgba(40,40,46,0.72),rgba(20,20,24,0.5))] dark:[box-shadow:0_8px_22px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.14)]";

/** Hairline between the app's notes and everything else. */
export const PILL_DIVIDER =
  "pointer-events-none absolute top-[var(--y,0px)] -mt-[0.75px] h-[1.5px] w-[9px] rounded-[2px] bg-[rgba(0,0,0,0.22)] opacity-0 [transition:opacity_200ms_var(--ease-out),top_var(--deck-anim)_var(--deck-ease),height_var(--deck-anim)_var(--deck-ease)] deck-r:right-[calc(var(--pill-x)_-_4.5px)] deck-l:left-[calc(var(--pill-x)_-_4.5px)] deck-pill:opacity-100 deck-instant:[transition:none] dark:bg-[rgba(255,255,255,0.25)]";

/** Sticker layer (own layer: the tabs clip). */
export const APP_TAGS = "pointer-events-none absolute inset-0 z-4 [transition:opacity_160ms] data-off:opacity-0";
/** A small app logo just outside a tab (tab mode) or beside its pill. */
export const APP_TAG =
  "absolute top-[var(--y-tab,0px)] grid opacity-[0.82] [translate:0_var(--shift,0px)] [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.3))] [transition:top_var(--deck-anim)_var(--deck-ease),right_var(--deck-anim)_var(--deck-ease),left_var(--deck-anim)_var(--deck-ease),translate_var(--deck-anim)_var(--deck-ease),opacity_160ms] group-hover/deck:opacity-100 data-off:opacity-0! deck-r:right-[calc(var(--deck-tab-w)_+_3px)] deck-l:left-[calc(var(--deck-tab-w)_+_3px)] deck-pill:top-[var(--y-pill,0px)] deck-pill:deck-r:right-[calc(var(--pill-x)_+_var(--glass-w)_/_2_+_3px)] deck-pill:deck-l:left-[calc(var(--pill-x)_+_var(--glass-w)_/_2_+_3px)] deck-instant:[transition:none]";

// ---- "+" and overflow chip ------------------------------------------------------------
/** "+": hover fills it with the accent, spins the plus and shows a "New note"
 *  label; pressing squeezes it and sends out a ripple (data-pressed). */
export const PLUS = [
  "relative mx-[2px] mt-[14px] mb-0 grid size-[26px] cursor-pointer place-items-center rounded-full bg-white text-[#2b2a33] [box-shadow:0_2px_8px_rgba(0,0,0,0.3)] [translate:0_var(--shift,0px)]",
  "[transition:transform_220ms_var(--deck-ease),background_180ms,color_180ms,box-shadow_220ms,opacity_200ms,height_var(--deck-anim)_var(--deck-ease),margin_var(--deck-anim)_var(--deck-ease),translate_var(--deck-anim)_var(--deck-ease)]",
  "hover:bg-accent hover:text-white hover:[transform:scale(1.15)] hover:[box-shadow:0_4px_14px_var(--accent-glow),0_0_0_4px_var(--accent-soft)]",
  "active:[transform:scale(0.9)] active:[transition-duration:80ms]",
  "dark:bg-[#1c1c1f] dark:text-[#f4f4f5]",
  "deck-pill:pointer-events-none deck-pill:opacity-0 deck-pill:[transform:scale(0.6)]",
  "[&_.icon]:stroke-[2.2] [&_.icon]:[transition:transform_300ms_var(--deck-ease)] [&:hover_.icon]:[transform:rotate(90deg)]",
  // label that slides out beside the button on hover
  "after:pointer-events-none after:absolute after:top-1/2 after:rounded-full after:bg-toast after:px-[10px] after:py-1 after:font-ui after:text-xs/[inherit] after:font-semibold after:whitespace-nowrap after:text-toast-fg after:opacity-0 after:content-['New_note'] after:[box-shadow:0_4px_12px_rgba(0,0,0,0.3)] after:[transition:opacity_160ms_var(--ease-in-out),transform_260ms_var(--deck-ease)] hover:after:opacity-100",
  "deck-r:after:right-[calc(100%_+_10px)] deck-r:after:[transform:translate(8px,-50%)_scale(0.95)] deck-l:after:left-[calc(100%_+_10px)] deck-l:after:[transform:translate(-8px,-50%)_scale(0.95)]",
  // click ripple
  "data-pressed:before:pointer-events-none data-pressed:before:absolute data-pressed:before:inset-0 data-pressed:before:rounded-full data-pressed:before:border-2 data-pressed:before:border-solid data-pressed:before:border-accent data-pressed:before:animate-deck-ripple",
].join(" ");

export const MORE =
  "mt-2 rounded-full bg-[rgba(30,30,36,0.85)] px-[6px] py-[2px] text-2xs/[inherit] font-semibold text-white [translate:0_var(--shift,0px)] [transition:translate_var(--deck-anim)_var(--deck-ease),opacity_200ms,transform_220ms_var(--deck-ease)] deck-pill:pointer-events-none deck-pill:opacity-0 deck-pill:[transform:scale(0.6)]";

// ---- undo toast -------------------------------------------------------------------------
export const TOAST =
  "absolute bottom-(--deck-gutter) flex w-[240px] items-center gap-2 rounded-lg bg-toast py-[6px] pr-[6px] pl-[12px] font-ui text-sm/[inherit] text-toast-fg [box-shadow:0_8px_24px_rgba(0,0,0,0.35)] animate-deck-toast-in deck-r:right-[calc(var(--deck-tab-w)_+_16px)] deck-l:left-[calc(var(--deck-tab-w)_+_16px)]";
export const TOAST_TEXT = "min-w-0 flex-1 truncate";
export const TOAST_UNDO = "h-[26px] rounded-sm bg-accent px-[10px] font-semibold text-white";
export const TOAST_X =
  "grid h-[26px] w-[26px] place-items-center rounded-sm bg-transparent p-0 font-normal text-[rgba(242,242,246,0.7)] hover:bg-[rgba(255,255,255,0.1)] hover:text-white";
