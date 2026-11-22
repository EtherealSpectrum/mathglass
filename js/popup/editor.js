import { KEYS } from '../core/constants.js';
import { $, on, rafThrottle } from '../core/dom.js';
import { computeCtrlArrowTarget, computeSmartLatexArrowTarget, computeTabJumpTarget, replaceRangePreservingUndo } from '../core/latex-nav.js';
import { set } from '../core/storage.js';
import { state } from './settings.js';
import { isAutoDollarWrapEnabled, isCursorInsideKaTeX } from './notepad.js';

function isEscapedAt(str, idx) {
  let b = 0;
  for (let k = idx - 1; k >= 0 && str[k] === '\\'; k--) b++;
  return (b % 2) === 1;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

export function init(ac) {
  const sig = ac.signal;
  let pendingScroll = false;
  let pendingClickFocus = null;
  const flushPreview = rafThrottle(() => {
    const shouldScroll = pendingScroll && Boolean(state.previewFollowEnabled);
    pendingScroll = false;
    if (shouldScroll) {
      state.userScrolled = false;
      window.__renderPreview?.(true);
    } else {
      window.__syncPreviewCursor?.();
    }
  });
  let saveTimer = null;
  const scheduleDraftSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => set(KEYS.draft, state.ta.value), 200);
  };

  on(state.ta, 'pointerdown', () => {
    state.previewNavActive = false;
    window.__syncNavIndicators?.();
    pendingClickFocus = document.activeElement !== state.ta
      ? { top: state.ta.scrollTop, left: state.ta.scrollLeft, at: performance.now() }
      : null;
  }, true, sig);

  on(state.ta, 'input', () => {
    window.__draftUserEdited = true;
    const follow = Boolean(state.previewFollowEnabled);
    if (follow) state.userScrolled = false;
    pendingScroll = follow;
    flushPreview();
    scheduleDraftSave();
  }, false, sig);

  const syncCursor = () => flushPreview();
  on(state.ta, 'keyup', syncCursor, false, sig);
  on(state.ta, 'mouseup', syncCursor, false, sig);
  on(state.ta, 'click', syncCursor, false, sig);
  on(state.ta, 'select', syncCursor, false, sig);
  on(state.ta, 'focus', () => {
    if (pendingClickFocus && performance.now() - pendingClickFocus.at < 250) {
      const { top, left } = pendingClickFocus;
      pendingClickFocus = null;
      if (Math.abs(state.ta.scrollTop - top) > 2 || Math.abs(state.ta.scrollLeft - left) > 2) {
        state.ta.scrollTop = top;
        state.ta.scrollLeft = left;
      }
      const pre = $('#latex-highlight');
      if (pre) { pre.scrollTop = state.ta.scrollTop; pre.scrollLeft = state.ta.scrollLeft; }
    }
    syncCursor();
  }, false, sig);
  on(document, 'selectionchange', () => {
    if (document.activeElement === state.ta) syncCursor();
  }, false, sig);

  on(state.ta, 'keydown', e => {
    if (NAV_KEYS.has(e.key) && state.previewFollowEnabled) {
      state.userScrolled = false;
      pendingScroll = true;
    }

    const isAltGr = e.ctrlKey && e.altKey && !e.metaKey;
    const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;

    if (state.autoBracesEnabled && (noMod || isAltGr)) {
      const val = state.ta.value || '';
      const s = state.ta.selectionStart ?? val.length;
      const en = state.ta.selectionEnd ?? s;
      const sel = val.slice(s, en);

      if (e.key === '{' && !isEscapedAt(val, s)) {
        e.preventDefault();
        replaceRangePreservingUndo(state.ta, s, en, `{${sel}}`, s + 1, s + 1 + sel.length);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        scheduleDraftSave();
        return;
      }
      if (e.key === '}' && s === en && val[s] === '}' && !isEscapedAt(val, s)) {
        e.preventDefault();
        state.ta.setSelectionRange(s + 1, s + 1);
        if (state.previewFollowEnabled) pendingScroll = true;
        flushPreview();
        return;
      }
      if (noMod && e.key === 'Backspace' && s === en && s > 0 && val[s - 1] === '{' && val[s] === '}' && !isEscapedAt(val, s - 1)) {
        e.preventDefault();
        replaceRangePreservingUndo(state.ta, s - 1, s + 1, '', s - 1, s - 1);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        scheduleDraftSave();
        return;
      }
      if ((e.key === '^' || e.key === '_') && !isEscapedAt(val, s) && (sel.length > 0 || val[s] !== '{')) {
        e.preventDefault();
        const ins = `${e.key}{${sel}}`;
        replaceRangePreservingUndo(state.ta, s, en, ins, s + 2, s + 2 + sel.length);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        scheduleDraftSave();
        return;
      }
      if (noMod && e.key === 'Tab') {
        const caretPos = (state.ta.selectionDirection === 'backward' ? s : en);
        const target = computeTabJumpTarget(val, caretPos, e.shiftKey ? -1 : 1);
        if (target !== null && target !== caretPos) {
          e.preventDefault();
          state.ta.setSelectionRange(target, target);
          if (state.previewFollowEnabled) pendingScroll = true;
          flushPreview();
          return;
        }
      }
    }

    if (state.intuitiveNavEnabled && state.previewNavActive && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const s = state.ta.selectionStart ?? 0;
      const en = state.ta.selectionEnd ?? s;
      if (e.shiftKey || s === en) {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const caretPos = (state.ta.selectionDirection === 'backward' ? state.ta.selectionStart : state.ta.selectionEnd) ?? state.ta.value.length;
        const target = computeSmartLatexArrowTarget(state.ta.value, caretPos, dir, null, true);
        if (target !== null && target !== caretPos) {
          e.preventDefault();
          if (e.shiftKey) {
            const anchor = state.ta.selectionDirection === 'backward' ? state.ta.selectionEnd : state.ta.selectionStart;
            const start = Math.min(anchor, target);
            const end = Math.max(anchor, target);
            const selDir = target < anchor ? 'backward' : 'forward';
            state.ta.setSelectionRange(start, end, selDir);
          } else {
            state.ta.setSelectionRange(target, target);
          }
          flushPreview();
        }
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const caretPos = (state.ta.selectionDirection === 'backward' ? state.ta.selectionStart : state.ta.selectionEnd) ?? state.ta.value.length;
      const fullRange = [{ type: 'math', start: 0, end: state.ta.value.length, contentStart: 0, contentEnd: state.ta.value.length }];
      const target = computeCtrlArrowTarget(state.ta.value, caretPos, dir, fullRange);
      if (target !== null && target !== caretPos) {
        e.preventDefault();
        if (e.shiftKey) {
          const anchor = state.ta.selectionDirection === 'backward' ? state.ta.selectionEnd : state.ta.selectionStart;
          const start = Math.min(anchor, target);
          const end = Math.max(anchor, target);
          const selDir = target < anchor ? 'backward' : 'forward';
          state.ta.setSelectionRange(start, end, selDir);
        } else {
          state.ta.setSelectionRange(target, target);
        }
        flushPreview();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !window.mathglassDesktop?.isDesktop) {
      const insBtn = document.getElementById('insert-btn');
      if (insBtn) { e.preventDefault(); insBtn.click(); }
    }
  }, false, sig);
}

export function insertSnippet(before, after) {
  const inNotepad = document.body.classList.contains('notepad-open');
  const npTa = inNotepad ? $('#notepad-input') : null;
  const target = npTa || state.ta;
  if (!target) return { start: 0, wrappedDollar: false, target: null };

  try { target.focus({ preventScroll: true }); } catch { target.focus(); }
  const s = target.selectionStart ?? target.value.length;
  const e = target.selectionEnd ?? target.value.length;
  const sel = target.value.slice(s, e);

  const shouldWrapDollar = Boolean(npTa) && isAutoDollarWrapEnabled() && !isCursorInsideKaTeX(target.value, s);
  const actualBefore = shouldWrapDollar ? '$' + before : before;
  const actualAfter = shouldWrapDollar ? after + '$' : after;
  const text = actualBefore + sel + actualAfter;

  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { }
  if (!ok) {
    target.setRangeText(text, s, e, 'preserve');
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  let pos = s + actualBefore.length + sel.length + (shouldWrapDollar ? actualAfter.length : 0);
  if (!sel.length && actualAfter.length) pos = s + actualBefore.length;
  target.setSelectionRange(pos, pos);

  const follow = Boolean(state.previewFollowEnabled);
  if (npTa) {
    if (follow) state.notepadUserScrolled = false;
    window.__renderHybridPreview?.(true, follow);
    window.__refreshSyntaxHighlight?.();
    window.__refreshNotepadCaret?.();
    set(KEYS.notepadText, target.value);
  } else {
    window.__draftUserEdited = true;
    if (follow) state.userScrolled = false;
    window.__renderPreview?.(follow);
    window.__refreshSyntaxHighlight?.();
    set(KEYS.draft, target.value);
  }
  return { start: s, wrappedDollar: shouldWrapDollar, target };
}
