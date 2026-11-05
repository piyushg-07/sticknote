// Note colour names. The actual colour values live in styles/tokens.css
// (--note-N-bg / --note-N-strong); JS only ever deals with the index.
export const NOTE_COLORS = ["Sky", "Mint", "Lavender", "Butter", "Rose", "Peach", "Aqua", "Mist"] as const;
export const COLOR_COUNT = NOTE_COLORS.length;
