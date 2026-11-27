// Module-level state του preview — shared μεταξύ render/scroll/sync/init.
//
// ΣΗΜΑΝΤΙΚΟ: Αυτό το αρχείο ΔΕΝ importάρει τίποτα — μόνο exports.
// Έτσι αποφεύγονται circular dependencies.

export const previewState = {
  lastProg: { left: -1, top: -1 },
  minH: 50,
  progScrolling: false,
  lastRenderedSrc: null,
  lastRenderedAlign: null,
  lastRenderedTheme: null,
  lastCursorPos: -1,
  lastSelStart: -1,
  lastSelEnd: -1,
  lastWasSelection: false,
};

// KaTeX preview cache (για renderLatexWithCaret χωρίς caret)
export const KATEX_CACHE_MAX = 180;
export const katexPreviewCache = new Map();