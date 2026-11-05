// Shared Tailwind class strings for the app's primitive controls. Compose with
// `cx()`; every window uses these instead of re-spelling the utilities.
// Modifiers (btnPrimary, btnSm, iconBtnDanger…) use `!` so they always beat the
// base string: with utilities, the CSS order decides, not the class order.
// (Keep each string literal and complete: Tailwind scans this file.)

/** Join class names, skipping falsy ones. */
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// ---- Buttons ----------------------------------------------------------------------
export const btn =
  "inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-line bg-surface px-3 text-md font-medium text-fg transition-[background-color,border-color,transform] duration-[120ms] hover:bg-surface-2 active:translate-y-px";
export const btnPrimary =
  "border-transparent! bg-accent! text-on-accent! shadow-[0_1px_2px_var(--accent-glow),inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-accent-hover!";
export const btnGhost = "border-transparent! bg-transparent! hover:bg-surface-hover!";
export const btnDanger = "text-danger! hover:bg-danger-soft!";
export const btnSm = "h-7! px-2! text-sm!";

export const iconBtn =
  "inline-grid size-[30px] place-items-center rounded-md text-fg-muted transition-colors duration-[120ms] hover:bg-surface-hover hover:text-fg aria-pressed:bg-accent-soft aria-pressed:text-accent-text disabled:pointer-events-none disabled:opacity-35";
export const iconBtnDanger = "text-danger! hover:bg-danger-soft! hover:text-danger!";

// ---- Inputs -----------------------------------------------------------------------
export const field =
  "flex h-[34px] items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-fg-muted transition-[border-color,box-shadow] duration-[120ms] focus-within:border-accent-border focus-within:shadow-[0_0_0_3px_var(--accent-soft)]";
export const fieldInput = "min-w-0 flex-1 border-0 bg-transparent text-md text-fg outline-none placeholder:text-fg-faint";

// ---- Toggle switch (button[role=switch][aria-checked]) ----------------------------
export const toggle =
  "relative h-[22px] w-10 shrink-0 rounded-full bg-line-strong transition-colors duration-200 ease-out after:absolute after:left-[3px] after:top-[3px] after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-200 after:ease-out after:content-[''] aria-checked:bg-accent aria-checked:after:translate-x-[18px]";

// ---- Segmented control (wrapper + buttons with aria-pressed) ------------------------
export const segmented = "inline-flex gap-0.5 rounded-md bg-surface-2 p-[3px]";
export const segmentedBtn =
  "h-7 rounded-sm px-3 text-sm text-fg-muted transition-colors duration-[120ms] hover:text-fg aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-text";

// ---- Keyboard key -------------------------------------------------------------------
export const kbd =
  "inline-flex h-6 items-center whitespace-nowrap rounded-sm border border-line-strong bg-kbd px-2 font-ui text-sm text-fg";

// ---- Typography helpers ---------------------------------------------------------------
export const caps = "text-2xs font-semibold uppercase tracking-[0.06em] text-fg-muted";
