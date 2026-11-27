// Public API του latex module — re-export όλων των δημόσιων συναρτήσεων.
//
// Χρησιμοποιείται από το latex-nav.js (legacy shim) και από οπουδήποτε αλλού
// χρειάζεται το latex navigation API.

export { extractAllMathRangesForNav } from './ranges.js';
export { computeCtrlArrowTarget } from './ctrl-arrows.js';
export { computeTabJumpTarget } from './tab-jump.js';
export { replaceRangePreservingUndo } from './replace-undo.js';
export { findPrecedingFractionOperandStart } from './fraction.js';
export { collectLatexCaretStops, computeSmartLatexArrowTarget } from './smart-arrows.js';
export { parseMathStructures } from './structures.js';
export {
  isVisibleMathSpaceAt,
  skipInvisibleMathWhitespaceBack,
  skipInvisibleMathWhitespaceForward,
} from './whitespace.js';
export {
  computeWysiwygMathEdit,
  computeWysiwygVerticalArrowTarget,
} from './wysiwyg-edit.js';