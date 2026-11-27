// syncCursor — ενημερώνει highlight/slot χωρίς full render.
import { state } from '../settings.js';
import { previewState } from './state.js';
import { getActiveCursorPos, getSelectionBounds, injectLatexCaret } from './caret.js';
import { buildBalancedCandidate } from './balanced.js';
import {
  applyLatexSelectionHighlight,
  clearLatexSelectionHighlight,
  applyActiveSlotHighlight,
  clearActiveSlotHighlight,
} from '../../core/latex-click.js';
import { render } from './render.js';

export function syncCursor() {
  if (!state.ta) return;
  const pos = getActiveCursorPos(state.ta);
  const sel = getSelectionBounds(state.ta);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const srcChanged = state.ta.value !== previewState.lastRenderedSrc ||
    state.alignLeft !== previewState.lastRenderedAlign ||
    isLight !== previewState.lastRenderedTheme;
  const selChanged = sel.start !== previewState.lastSelStart || sel.end !== previewState.lastSelEnd;

  if (!srcChanged && !selChanged && pos === previewState.lastCursorPos) return;

  if (!srcChanged && state.preview && state.ta.value.trim()) {
    const targetRoot = state.preview.querySelector('.preview-partial-math') || state.preview;
    if (sel.active && (previewState.lastWasSelection || state.previewCaretEnabled === false)) {
      previewState.lastCursorPos = pos;
      previewState.lastSelStart = sel.start;
      previewState.lastSelEnd = sel.end;
      previewState.lastWasSelection = true;
      clearActiveSlotHighlight(targetRoot);
      clearLatexSelectionHighlight(targetRoot);
      applyLatexSelectionHighlight(state.ta.value, sel.start, sel.end, targetRoot, {
        displayMode: true,
        alignLeft: state.alignLeft,
        buildBalancedCandidate,
      });
      return;
    }
    if (!sel.active && state.previewCaretEnabled === false) {
      previewState.lastCursorPos = pos;
      previewState.lastSelStart = sel.start;
      previewState.lastSelEnd = sel.end;
      previewState.lastWasSelection = false;
      clearLatexSelectionHighlight(targetRoot);
      if (state.slotHintsEnabled !== false) {
        applyActiveSlotHighlight(state.ta.value, pos, targetRoot, {
          displayMode: true,
          alignLeft: state.alignLeft,
          buildBalancedCandidate,
          injectLatexCaret,
        });
      } else {
        clearActiveSlotHighlight(targetRoot);
      }
      return;
    }
  }

  render(false);
}