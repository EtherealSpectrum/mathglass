import { KEYS } from '../core/constants.js';
import { $, on, rafThrottle } from '../core/dom.js';
import { set } from '../core/storage.js';
import { state } from './settings.js';
import { isAutoDollarWrapEnabled, isCursorInsideKaTeX } from './notepad.js';

export function init(ac) {
  const sig = ac.signal;
  const render = rafThrottle(() => window.__renderPreview?.());
  let saveTimer = null;
  const scheduleDraftSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => set(KEYS.draft, state.ta.value), 200);
  };

  on(state.ta, 'input', () => {
    window.__draftUserEdited = true;
    state.userScrolled = false;
    render();
    scheduleDraftSave();
  }, false, sig);

  on(state.ta, 'keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); document.getElementById('insert-btn').click(); }
  }, false, sig);
}

export function insertSnippet(before, after) {
  const inNotepad = document.body.classList.contains('notepad-open');
  const npTa = inNotepad ? $('#notepad-input') : null;
  const target = npTa || state.ta;
  if (!target) return { start: 0, wrappedDollar: false, target: null };

  target.focus();
  const s = target.selectionStart ?? target.value.length;
  const e = target.selectionEnd ?? target.value.length;
  const sel = target.value.slice(s, e);

  const shouldWrapDollar = Boolean(npTa) && isAutoDollarWrapEnabled() && !isCursorInsideKaTeX(target.value, s);
  const actualBefore = shouldWrapDollar ? '$' + before : before;
  const actualAfter = shouldWrapDollar ? after + '$' : after;
  const text = actualBefore + sel + actualAfter;

  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch {}
  if (!ok) {
    target.setRangeText(text, s, e, 'preserve');
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  let pos = s + actualBefore.length + sel.length + (shouldWrapDollar ? actualAfter.length : 0);
  if (!sel.length && actualAfter.length) pos = s + actualBefore.length;
  target.setSelectionRange(pos, pos);

  if (npTa) {
    window.__renderHybridPreview?.();
    window.__refreshSyntaxHighlight?.();
    set(KEYS.notepadText, target.value);
  } else {
    window.__draftUserEdited = true;
    window.__renderPreview?.();
    window.__refreshSyntaxHighlight?.();
    set(KEYS.draft, target.value);
  }
  return { start: s, wrappedDollar: shouldWrapDollar, target };
}
