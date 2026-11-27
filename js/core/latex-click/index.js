// Public API του latex-click module — re-export όλων των δημόσιων συναρτήσεων.

export { caretPointFromXY, getTextOffsetInElement, resolveLatexOffsetAtPoint } from './probe-resolve.js';
export { applyLatexSelectionHighlight, clearLatexSelectionHighlight } from './selection.js';
export { findActiveStructuralSlot, applyActiveSlotHighlight, clearActiveSlotHighlight } from './slot-highlight.js';