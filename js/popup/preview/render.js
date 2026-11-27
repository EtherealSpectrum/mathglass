// renderLatexWithCaret + render (κύριο rendering).
import { clamp } from '../../core/dom.js';
import { translateLatexErrorToGreek } from '../../core/errors.js';
import {
  applyLatexSelectionHighlight,
  clearActiveSlotHighlight,
  applyActiveSlotHighlight,
} from '../../core/latex-click.js';
import { state } from '../settings.js';
import { previewState, KATEX_CACHE_MAX, katexPreviewCache } from './state.js';
import {
  injectLatexCaret,
  markCaretElement,
  getActiveCursorPos,
  getSelectionBounds,
} from './caret.js';
import { buildBalancedCandidate } from './balanced.js';
import { renderPartialLatexHtml } from './partial.js';
import { scrollToCursor, measureMinHeight } from './scroll.js';

export function renderLatexWithCaret(rawMath, cursorOffset, alignLeft, displayMode = true, isLight = false) {
  const leadLen = rawMath.length - rawMath.trimStart().length;
  const trimmed = rawMath.trim();
  if (!trimmed) return { html: '', ok: true, error: null };

  if (typeof cursorOffset !== 'number') {
    const cacheKey = `${displayMode ? 1 : 0}:${alignLeft ? 1 : 0}:${isLight ? 1 : 0}:${trimmed}`;
    if (katexPreviewCache.has(cacheKey)) {
      const hit = katexPreviewCache.get(cacheKey);
      katexPreviewCache.delete(cacheKey);
      katexPreviewCache.set(cacheKey, hit);
      return hit;
    }
    let result;
    try {
      const html = katex.renderToString(trimmed, {
        throwOnError: true,
        displayMode,
        fleqn: alignLeft,
      });
      result = { html, ok: true, error: null };
    } catch (err) {
      result = {
        html: renderPartialLatexHtml(rawMath, err, alignLeft, displayMode, isLight, null),
        ok: false,
        error: err,
      };
    }
    if (katexPreviewCache.size >= KATEX_CACHE_MAX) {
      katexPreviewCache.delete(katexPreviewCache.keys().next().value);
    }
    katexPreviewCache.set(cacheKey, result);
    return result;
  }

  const localPos = clamp(cursorOffset - leadLen, 0, trimmed.length);
  const withCaret = injectLatexCaret(trimmed, localPos);

  try {
    const html = katex.renderToString(withCaret, {
      throwOnError: true,
      displayMode,
      fleqn: alignLeft,
    });
    return { html, ok: true, error: null };
  } catch {
    try {
      const html = katex.renderToString(trimmed, {
        throwOnError: true,
        displayMode,
        fleqn: alignLeft,
      });
      return { html, ok: true, error: null };
    } catch (err) {
      return {
        html: renderPartialLatexHtml(rawMath, err, alignLeft, displayMode, isLight, cursorOffset),
        ok: false,
        error: err,
      };
    }
  }
}

export function render(shouldScroll = false) {
  if (!state.ta || !state.preview || !state.previewWrap) return;
  const raw = state.ta.value;
  const src = raw.trim();
  const cursorPos = getActiveCursorPos(state.ta);
  const sel = getSelectionBounds(state.ta);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const follow = Boolean(shouldScroll) && Boolean(state.previewFollowEnabled) && !state.userScrolled;
  const prevScrollLeft = state.previewWrap.scrollLeft;
  const prevScrollTop = state.previewWrap.scrollTop;

  previewState.lastRenderedSrc = raw;
  previewState.lastRenderedAlign = state.alignLeft;
  previewState.lastRenderedTheme = isLight;
  previewState.lastCursorPos = cursorPos;
  previewState.lastSelStart = sel.start;
  previewState.lastSelEnd = sel.end;
  previewState.lastWasSelection = sel.active;

  previewState.progScrolling = true;
  try {
    if (!src) {
      state.previewWrap.classList.remove('error');
      const showEmptyCaret = !sel.active && state.previewCaretEnabled !== false && state.previewEditEnabled !== false && state.previewNavActive;
      state.preview.innerHTML = (showEmptyCaret ? '<span class="mg-np-text-caret" aria-hidden="true"></span>' : '') +
        '<span class="placeholder">Η προεπισκόπηση θα εμφανιστεί εδώ…</span>';
    } else {
      const showCaret = !sel.active && state.previewCaretEnabled !== false;
      const res = renderLatexWithCaret(raw, showCaret ? cursorPos : null, state.alignLeft, true, isLight);
      if (res.ok) {
        state.previewWrap.classList.remove('error');
        state.preview.innerHTML = res.html;
      } else {
        state.previewWrap.classList.add('error');
        state.preview.innerHTML = '';

        if (res.html) {
          const partialWrap = document.createElement('div');
          partialWrap.className = 'preview-partial-wrap';
          const mathDiv = document.createElement('div');
          mathDiv.className = 'preview-partial-math';
          mathDiv.innerHTML = res.html;
          partialWrap.appendChild(mathDiv);
          state.preview.appendChild(partialWrap);
        }

        const errDiv = document.createElement('div');
        errDiv.className = 'preview-error-msg';
        errDiv.textContent = translateLatexErrorToGreek(res.error);
        if (typeof res.error?.position === 'number') {
          const leadLen = raw.length - raw.trimStart().length;
          errDiv.dataset.errPos = String(clamp(leadLen + res.error.position, 0, raw.length));
          errDiv.classList.add('is-clickable');
          errDiv.title = 'Κλικ για μετάβαση στο σημείο σφάλματος';
          const hint = document.createElement('span');
          hint.className = 'preview-error-jump';
          hint.textContent = ' (κλικ για μετάβαση)';
          errDiv.appendChild(hint);
        }
        state.preview.appendChild(errDiv);
      }
      const targetRoot = state.preview.querySelector('.preview-partial-math') || state.preview;
      if (sel.active) {
        clearActiveSlotHighlight(targetRoot);
        applyLatexSelectionHighlight(raw, sel.start, sel.end, targetRoot, {
          displayMode: true,
          alignLeft: state.alignLeft,
          buildBalancedCandidate,
        });
      } else {
        if (state.previewCaretEnabled !== false) {
          markCaretElement(state.preview);
        }
        if (state.slotHintsEnabled !== false) {
          applyActiveSlotHighlight(raw, cursorPos, targetRoot, {
            displayMode: true,
            alignLeft: state.alignLeft,
            buildBalancedCandidate,
            injectLatexCaret,
          });
        } else {
          clearActiveSlotHighlight(targetRoot);
        }
      }
    }
    if (!follow) {
      state.previewWrap.scrollLeft = prevScrollLeft;
      state.previewWrap.scrollTop = prevScrollTop;
    }
  } finally {
    previewState.lastProg = { left: state.previewWrap.scrollLeft, top: state.previewWrap.scrollTop };
    requestAnimationFrame(() => { previewState.progScrolling = false; });
  }

  measureMinHeight();
  if (follow) requestAnimationFrame(scrollToCursor);
}