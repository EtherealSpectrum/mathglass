// js/popup/preview/index.js
//
// Public API του preview module — re-export όλων των συναρτήσεων + init()
// που δένει όλα τα event listeners στην προεπισκόπηση.

// ─── Imports (στην κορυφή, όπως πρέπει) ─────────────────────────────────────
import { $, on, clamp, rafThrottle } from '../../core/dom.js';
import { KEYS } from '../../core/constants.js';
import { get, set, mirrorGet, mirrorSet } from '../../core/storage.js';
import { computeAutoScale } from '../../core/scale.js';
import { state, setSize } from '../settings.js';
import { replaceRangePreservingUndo } from '../../core/latex-nav.js';
import { resolveLatexOffsetAtPoint } from '../../core/latex-click.js';
import { buildBalancedCandidate } from './balanced.js';
import { injectLatexCaret, findCaretElement } from './caret.js';
import { render } from './render.js';
import { syncCursor } from './sync.js';
import { ensureTextareaOffsetVisible, getMinH, measureMinHeight } from './scroll.js';
import { previewState } from './state.js';

// ─── Re-exports (public API) ────────────────────────────────────────────────
export {
  CARET_COLOR_HEX,
  injectLatexCaret,
  findCaretElement,
  markCaretElement,
  getActiveCursorPos,
  getSelectionBounds,
} from './caret.js';

export { buildBalancedCandidate } from './balanced.js';
export { renderPartialLatexHtml } from './partial.js';
export { renderLatexWithCaret, render } from './render.js';
export { syncCursor } from './sync.js';
export { scrollToCursor, measureMinHeight, ensureTextareaOffsetVisible } from './scroll.js';
export { previewState } from './state.js';

// ─── init() — δένει όλα τα listeners ────────────────────────────────────────
export function init(ac) {
  const sig = ac.signal;

  window.__renderPreview = (shouldScroll = false) => render(shouldScroll);
  window.__syncPreviewCursor = syncCursor;

  // Helper: unwrap εξωτερικών math delimiters (για paste)
  const unwrapOuterMathDelims = rawText => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return rawText;
    const pairs = [
      ['$$', '$$'],
      ['\\[', '\\]'],
      ['\\(', '\\)'],
      ['[latex]', '[/latex]'],
      ['[tex]', '[/tex]'],
      ['$', '$'],
    ];
    for (const [open, close] of pairs) {
      if (trimmed.length >= open.length + close.length) {
        const low = trimmed.toLowerCase();
        if (low.startsWith(open) && low.endsWith(close)) {
          const inner = trimmed.slice(open.length, trimmed.length - close.length);
          if (!inner.includes(close)) return inner.trim();
        }
      }
    }
    return rawText;
  };

  let dragStart = null;
  let suppressNextClick = false;

  // ── mousedown (drag start) ────────────────────────────────────────────────
  on(state.previewWrap, 'mousedown', e => {
    if (e.button !== 0 || !state.ta || !state.preview) return;
    if (state.previewClickCursorLock || state.previewEditEnabled === false) {
      dragStart = null;
      return;
    }
    if (e.target.closest('.preview-controls, .preview-error-msg, .mg-nav-led, button, a')) {
      dragStart = null;
      return;
    }
    dragStart = { x: e.clientX, y: e.clientY, target: e.target };
  }, false, sig);

  // ── mouseup (drag end → selection) ────────────────────────────────────────
  on(state.previewWrap, 'mouseup', e => {
    if (!dragStart || e.button !== 0 || !state.ta || !state.preview) return;
    const startInfo = dragStart;
    dragStart = null;
    if (state.previewClickCursorLock || state.previewEditEnabled === false) return;
    const dist = Math.hypot(e.clientX - startInfo.x, e.clientY - startInfo.y);
    const sel = window.getSelection();
    const hasDomSel = Boolean(sel && !sel.isCollapsed && sel.toString().length > 0);
    if (dist < 5 && !hasDomSel) return;

    const raw = state.ta.value || '';
    if (!raw.trim()) return;
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const opts = {
      displayMode: true,
      alignLeft: state.alignLeft,
      isLight,
      buildBalancedCandidate,
      injectLatexCaret,
      findCaretElement,
    };
    const p1 = resolveLatexOffsetAtPoint(raw, startInfo.x, startInfo.y, state.preview, { ...opts, clickTarget: startInfo.target });
    const p2 = resolveLatexOffsetAtPoint(raw, e.clientX, e.clientY, state.preview, { ...opts, clickTarget: e.target });
    if (p1 === p2) return;

    try { sel?.removeAllRanges(); } catch { }
    const s = Math.min(p1, p2);
    const en = Math.max(p1, p2);
    const dir = p2 < p1 ? 'backward' : 'forward';
    state.previewNavActive = true;
    window.__syncNavIndicators?.();
    try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
    state.ta.setSelectionRange(s, en, dir);
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 0);
    syncCursor();
  }, false, sig);

  // ── click (WYSIWYG + error jump) ──────────────────────────────────────────
  on(state.previewWrap, 'click', e => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (!state.ta || !state.preview) return;

    // Κλικ στο μήνυμα σφάλματος → μετάβαση στο σημείο
    const errJumpEl = e.target.closest('.preview-error-msg[data-err-pos]');
    if (errJumpEl) {
      const rawVal = state.ta.value || '';
      const jumpPos = clamp(parseInt(errJumpEl.dataset.errPos, 10) || 0, 0, rawVal.length);
      try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
      state.ta.setSelectionRange(jumpPos, jumpPos);
      ensureTextareaOffsetVisible(state.ta, jumpPos);
      previewState.lastCursorPos = -1;
      previewState.lastSelStart = -1;
      previewState.lastSelEnd = -1;
      syncCursor();
      return;
    }
    if (e.target.closest('.preview-controls, .preview-error-msg, .mg-nav-led, button, a')) return;
    if (state.previewClickCursorLock || state.previewEditEnabled === false) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return;

    const prevTop = state.previewWrap.scrollTop;
    const prevLeft = state.previewWrap.scrollLeft;
    const raw = state.ta.value || '';

    if (!raw.trim()) {
      state.previewNavActive = true;
      window.__syncNavIndicators?.();
      try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
      render(false);
      return;
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const pos = resolveLatexOffsetAtPoint(raw, e.clientX, e.clientY, state.preview, {
      displayMode: true,
      alignLeft: state.alignLeft,
      isLight,
      clickTarget: e.target,
      buildBalancedCandidate,
      injectLatexCaret,
      findCaretElement,
    });

    state.previewNavActive = true;
    window.__syncNavIndicators?.();
    try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
    state.ta.setSelectionRange(pos, pos);
    window.__maybeAutoWrapEditorSlot?.();
    ensureTextareaOffsetVisible(state.ta, state.ta.selectionStart ?? pos);
    previewState.lastCursorPos = -1;
    previewState.lastSelStart = -1;
    previewState.lastSelEnd = -1;
    syncCursor();
    state.previewWrap.scrollTop = prevTop;
    state.previewWrap.scrollLeft = prevLeft;
    previewState.lastProg = { left: state.previewWrap.scrollLeft, top: state.previewWrap.scrollTop };
  }, false, sig);

  // ── copy (επιστρέφει καθαρό LaTeX) ────────────────────────────────────────
  on(state.previewWrap, 'copy', e => {
    if (!state.ta || !state.preview || !e.clipboardData) return;
    const raw = state.ta.value || '';
    if (!raw) return;

    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0 && state.preview.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const rawRects = Array.from(range.getClientRects()).filter(r => r.width >= 1.5 && r.height >= 4);
      let copied = raw;

      if (rawRects.length > 0) {
        const r0 = rawRects[0];
        const r1 = rawRects[rawRects.length - 1];
        const kEl = state.preview.querySelector('.katex-html') || state.preview.querySelector('.katex') || state.preview;
        const kRect = kEl.getBoundingClientRect();
        const coversFull = kRect.width > 4 && r0.left <= kRect.left + 4 && r1.right >= kRect.right - 4;
        if (!coversFull) {
          const opts = {
            displayMode: true,
            alignLeft: state.alignLeft,
            isLight,
            buildBalancedCandidate,
            injectLatexCaret,
            findCaretElement,
          };
          const p1 = resolveLatexOffsetAtPoint(raw, r0.left + 1, (r0.top + r0.bottom) / 2, state.preview, opts);
          const p2 = resolveLatexOffsetAtPoint(raw, r1.right - 1, (r1.top + r1.bottom) / 2, state.preview, opts);
          const a = Math.min(p1, p2);
          const b = Math.max(p1, p2);
          if (b > a) copied = raw.slice(a, b);
        }
      }

      e.preventDefault();
      e.clipboardData.setData('text/plain', copied);
      return;
    }

    if (state.previewWrap.contains(document.activeElement)) {
      const s = state.ta.selectionStart ?? 0;
      const en = state.ta.selectionEnd ?? s;
      if (en > s) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', raw.slice(s, en));
      }
    }
  }, false, sig);

  // ── paste (LaTeX → textarea) ──────────────────────────────────────────────
  on(state.previewWrap, 'paste', e => {
    if (!state.ta || state.previewEditEnabled === false) {
      if (state.previewEditEnabled === false) e.preventDefault();
      return;
    }
    const plain = e.clipboardData?.getData('text/plain');
    if (typeof plain !== 'string' || !plain) return;
    e.preventDefault();
    const cleaned = unwrapOuterMathDelims(plain);
    const s = state.ta.selectionStart ?? state.ta.value.length;
    const en = state.ta.selectionEnd ?? s;
    state.previewNavActive = true;
    window.__syncNavIndicators?.();
    try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
    replaceRangePreservingUndo(state.ta, s, en, cleaned, s + cleaned.length, s + cleaned.length);
    window.__draftUserEdited = true;
    const follow = Boolean(state.previewFollowEnabled);
    if (follow) state.userScrolled = false;
    render(follow);
    window.__refreshSyntaxHighlight?.();
    set(KEYS.draft, state.ta.value);
  }, false, sig);

  // ── wheel (οριζόντιο scroll) ──────────────────────────────────────────────
  on(state.previewWrap, 'wheel', e => {
    if (e.ctrlKey || e.metaKey) return;
    if (state.previewWrap.scrollWidth <= state.previewWrap.clientWidth) return;
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const maxY = state.previewWrap.scrollHeight - state.previewWrap.clientHeight;
    if (maxY > 1) {
      const down = e.deltaY > 0;
      const atEnd = down ? state.previewWrap.scrollTop >= maxY - 1 : state.previewWrap.scrollTop <= 1;
      if (!atEnd) return;
    }
    const before = state.previewWrap.scrollLeft;
    state.previewWrap.scrollLeft += e.deltaY;
    if (state.previewWrap.scrollLeft !== before) e.preventDefault();
  }, { passive: false }, sig);

  // ── scroll (ανίχνευση user vs programmatic) ───────────────────────────────
  on(state.previewWrap, 'scroll', () => {
    if (previewState.progScrolling) return;
    const lp = previewState.lastProg;
    const same = Math.abs(state.previewWrap.scrollLeft - lp.left) < 2 &&
                 Math.abs(state.previewWrap.scrollTop - lp.top) < 2;
    if (!same) state.userScrolled = true;
  }, { passive: true }, sig);

  // ── ResizeObserver για min-height ─────────────────────────────────────────
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(measureMinHeight);
    ro.observe(state.preview);
    sig.addEventListener('abort', () => ro.disconnect(), { once: true });
  }

  // ── Resizer (drag ύψους preview) ──────────────────────────────────────────
  const rz = $('#resizer-middle');
  let start = null;
  const minHGetter = () => Math.max(50, getMinH());
  const applySavedHeight = h => {
    if (!(typeof h === 'number' && h > 0)) return;
    const maxH = Math.max(minHGetter(), (document.querySelector('main')?.clientHeight || innerHeight) - 62);
    const clamped = clamp(Math.round(h), 50, maxH);
    document.documentElement.style.setProperty('--preview-height', clamped + 'px');
  };

  on(rz, 'pointerdown', e => {
    e.preventDefault();
    start = {
      y: e.clientY,
      h: state.previewWrap.offsetHeight,
      max: Math.max(minHGetter(), (document.querySelector('main')?.clientHeight || innerHeight) - 62),
      val: state.previewWrap.offsetHeight,
    };
    rz.classList.add('active');
    document.body.classList.add('is-resizing');
    rz.setPointerCapture(e.pointerId);
  }, false, sig);

  on(rz, 'pointermove', e => {
    if (!start) return;
    const v = Math.round(clamp(start.h + (start.y - e.clientY), minHGetter(), start.max));
    start.val = v;
    document.documentElement.style.setProperty('--preview-height', v + 'px');
    mirrorSet(KEYS.previewHeight, v);
    window.__reportNaturalSize?.(50);
  }, false, sig);

  const endRz = e => {
    if (!start) return;
    const finalV = start.val;
    start = null;
    try { rz.releasePointerCapture(e.pointerId); } catch { }
    rz.classList.remove('active');
    document.body.classList.remove('is-resizing');
    set(KEYS.previewHeight, finalV);
  };
  on(rz, 'pointerup', endRz, false, sig);
  on(rz, 'pointercancel', endRz, false, sig);

  const cachedH = mirrorGet(KEYS.previewHeight, 'num');
  if (cachedH > 0) applySavedHeight(cachedH);
  get([KEYS.previewHeight]).then(r => {
    if (typeof r[KEYS.previewHeight] === 'number') applySavedHeight(r[KEYS.previewHeight]);
  });

  // ── Window resize → auto-scaling ──────────────────────────────────────────
  on(window, 'resize', rafThrottle(() => {
    if (state.toolbarScaleAuto) setSize('toolbar', computeAutoScale('toolbar'), true);
    if (state.previewScaleAuto) setSize('preview', computeAutoScale('preview'), true);
    if (state.editorScaleAuto) setSize('editor', computeAutoScale('editor'), true);
    if (state.notepadScaleAuto) setSize('notepad', computeAutoScale('notepad'), true);
    if (state.notepadPreviewScaleAuto) setSize('notepadPreview', computeAutoScale('notepadPreview'), true);
    if (state.notepadToolbarScaleAuto) setSize('notepadToolbar', computeAutoScale('notepadToolbar'), true);
    if (state.headerBtnScaleAuto) setSize('headerBtn', computeAutoScale('headerBtn'), true);
  }), false, sig);
}