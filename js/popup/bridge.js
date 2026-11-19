import { MSG, KEYS } from '../core/constants.js';
import { $, on } from '../core/dom.js';
import { state, applyTheme, applyTransparency, applyBlur, applyToolbarHidden, applyPreviewHidden } from './settings.js';
import { get, set, remove } from '../core/storage.js';
import * as toolbar from './toolbar.js';
import * as notepad from './notepad.js';

let skipSave = false;

function flushDrafts() {
  if (skipSave) return;
  if (state.ta) set(KEYS.draft, state.ta.value);
  const npTa = $('#notepad-input');
  if (npTa) set(KEYS.notepadText, npTa.value);
}

export const __insertIntoPageFn = function (code) {
  function isEditable(e) {
    if (!e) return false;
    const tag = e.tagName ? e.tagName.toLowerCase() : '';
    if (tag === 'textarea') return true;
    if (tag === 'input') return ['text', 'search', 'email', 'url'].includes((e.type || 'text').toLowerCase());
    if (e.isContentEditable) return true;
    return false;
  }

  let el = (typeof window.__latexGetLastFocused === 'function') ? window.__latexGetLastFocused() : null;
  if (!isEditable(el)) el = document.activeElement;
  if (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  if (!isEditable(el)) {
    const form = document.forms ? document.forms['postform'] : null;
    if (form?.elements?.message) el = form.elements['message'];
  }
  if (!isEditable(el)) {
    const cand = Array.prototype.slice.call(document.querySelectorAll('textarea'))
      .filter(t => t.offsetParent !== null && !t.disabled && !t.readOnly);
    if (cand.length) el = cand[0];
  }
  if (!isEditable(el)) return { success: false };

  if (el.isContentEditable) {
    el.focus();
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(code);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else el.textContent += code;
    } catch { el.textContent += code; }
  } else {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + code + el.value.slice(end);
    const pos = start + code.length;
    try { el.selectionStart = el.selectionEnd = pos; } catch { }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.focus();
  }
  return { success: true };
};

export function reportNaturalSize(delay) {
  if (window.parent === window) return;
  clearTimeout(reportNaturalSize._t);
  reportNaturalSize._t = setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    const q = s => document.querySelector(s);
    const headerH = q('.standalone-header')?.offsetHeight || 0;
    const tbEl = q('#toolbars-container');
    const tbH = (tbEl && !tbEl.classList.contains('hidden')) ? tbEl.offsetHeight : 0;
    const rzEl = q('#resizer-middle');
    const rzH = (rzEl && !rzEl.classList.contains('hidden')) ? rzEl.offsetHeight : 0;
    const ftH = q('footer')?.offsetHeight || 120;
    const pvHidden = q('.preview-outer')?.classList.contains('hidden');
    const pvMin = pvHidden ? 0 : Math.max(50, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--preview-min-height')) || 50);
    window.parent.postMessage({ type: MSG.PANEL_NATURAL_SIZE, height: Math.ceil(headerH + tbH + 50 - rzH + pvMin + ftH + 12) }, '*');
  })), delay ?? 60);
}

export function init(ac) {
  const sig = ac.signal;
  window.__reportNaturalSize = reportNaturalSize;
  window.__insertIntoPageFn = __insertIntoPageFn;

  on(window, 'message', e => {
    const d = e.data;
    if (!d) return;
    if (d.type === MSG.PANEL_WILL_CLOSE) {
      skipSave = true;
      remove(KEYS.draft);
      return;
    }
    if (d.type === MSG.PANEL_SAVE_DRAFT) {
      flushDrafts();
      return;
    }
    if (d.type === MSG.PANEL_ACTION) {
      switch (d.action) {
        case 'set-panel-anchors': toolbar.setPanelAnchors(d); break;
        case 'toggle-settings': toolbar.toggleSettingsFromPanel(d.anchorLeft); break;
        case 'toggle-recent': toolbar.toggleRecentFromPanel(d.anchorLeft); break;
        case 'toggle-notepad': notepad.toggleNotepad(); break;
        case 'close-popups': toolbar.closeAllPopups(); break;
        case 'focus-editor': try { window.focus(); } catch { } window.__focusActiveEditor?.(); break;
        case 'run-shortcut': window.__handlePanelShortcut?.(d); break;
        case 'set-theme': applyTheme(d.theme, false); break;
        case 'set-transparency': applyTransparency(d.level, false); break;
        case 'set-blur': applyBlur(d.enabled, false); break;
        case 'set-toolbar-hidden':
          applyToolbarHidden(d.hidden, false);
          toolbar.closeAllPopups();
          reportNaturalSize(60);
          break;
        case 'set-preview-hidden':
          applyPreviewHidden(d.hidden, false);
          reportNaturalSize(60);
          break;
      }
    }
  }, false, sig);

  if (window.parent === window) {
    const api = (typeof browser !== 'undefined' ? browser : chrome).runtime;
    try { api.sendMessage({ action: MSG.INJECT_TRACKER }).catch(() => { }); } catch { }
  }

  on(window, 'pagehide', flushDrafts, false, sig);
  on(document, 'visibilitychange', () => { if (document.hidden) flushDrafts(); }, false, sig);

  on(window, 'wheel', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || window.parent === window) return;
    let el = e.target;
    while (el && el !== document.body && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      const canY = cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowY === 'overlay';
      const canX = cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'overlay';
      const v = canY && (el.scrollHeight - el.clientHeight) > 1;
      const h = canX && (el.scrollWidth - el.clientWidth) > 1;
      const hd = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (v && ((e.deltaY > 0 && el.scrollTop < el.scrollHeight - el.clientHeight - 1) || (e.deltaY < 0 && el.scrollTop > 1))) return;
      if (h && (hd || !v) && ((e.deltaX > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth - 1) || (e.deltaX < 0 && el.scrollLeft > 1))) return;
      el = el.parentElement;
    }
    e.preventDefault();
    window.parent.postMessage({ type: MSG.PANEL_SCROLL, deltaX: e.deltaX, deltaY: e.deltaY }, '*');
  }, { passive: false }, sig);

  get([KEYS.draft]).then(r => {
    if (typeof r[KEYS.draft] === 'string' && !window.__draftUserEdited) {
      state.ta.value = r[KEYS.draft];
      window.__renderPreview?.();
      window.__refreshSyntaxHighlight?.();
      window.__syncHighlightFont?.('latex-input');
    }
  });
}
