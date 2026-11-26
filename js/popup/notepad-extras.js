import { $, on } from '../core/dom.js';
import { state } from './settings.js';

const overlayMetricsCache = new WeakMap();
let cachedTaMetrics = null;

function getCachedTextareaMetrics(ta) {
  if (!ta) return null;
  if (cachedTaMetrics && cachedTaMetrics.ta === ta && cachedTaMetrics.fontSize === ta.style.fontSize) {
    return cachedTaMetrics;
  }
  const cs = getComputedStyle(ta);
  cachedTaMetrics = {
    ta,
    fontSize: ta.style.fontSize,
    computedFontSize: cs.fontSize,
    fontSizeNum: parseFloat(cs.fontSize) || 16,
    padLeft: parseFloat(cs.paddingLeft) || 14,
    padTop: parseFloat(cs.paddingTop) || 10,
    padBottom: parseFloat(cs.paddingBottom) || 10,
  };
  return cachedTaMetrics;
}

window.__invalidateNotepadMetricsCache = () => {
  cachedTaMetrics = null;
};

function updateCounter(ta, counterEl) {
  if (!ta || !counterEl) return;
  const val = ta.value || '';
  const trimmed = val.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const chars = val.length;
  counterEl.textContent = `${words} λέξεις · ${chars} χαρακτήρες`;
}

function syncHighlightOverlay(ta, pre) {
  if (!ta || !pre) return;
  const key = `${ta.offsetWidth}:${ta.clientWidth}:${pre.offsetWidth}:${pre.clientWidth}:${ta.style.fontSize}:${pre.style.fontSize}`;
  if (overlayMetricsCache.get(pre) !== key) {
    overlayMetricsCache.set(pre, key);
    const taCs = getComputedStyle(ta);
    const preCs = getComputedStyle(pre);
    const taBorderW = (parseFloat(taCs.borderLeftWidth) || 0) + (parseFloat(taCs.borderRightWidth) || 0);
    const preBorderW = (parseFloat(preCs.borderLeftWidth) || 0) + (parseFloat(preCs.borderRightWidth) || 0);
    const taSb = Math.max(0, ta.offsetWidth - ta.clientWidth - taBorderW);
    const preSb = Math.max(0, pre.offsetWidth - pre.clientWidth - preBorderW);
    const deltaSb = taSb - preSb;
    const basePr = parseFloat(taCs.paddingRight) || 0;
    pre.style.paddingRight = deltaSb !== 0 ? `${Math.max(0, basePr + deltaSb)}px` : '';
  }
  pre.scrollTop = ta.scrollTop;
  pre.scrollLeft = ta.scrollLeft;
}

function prepareMirrorAndMeasure(mirror, val, pos, syncPaddingAndScroll) {
  const isEmptyLine = (pos === 0 || val[pos - 1] === '\n') && (pos === val.length || val[pos] === '\n');
  if (!isEmptyLine) {
    mirror.textContent = val;
    syncPaddingAndScroll();
    const tn = mirror.firstChild;
    if (tn && tn.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      if (pos < val.length && val[pos] !== '\n') {
        const code = val.charCodeAt(pos);
        const end = (code >= 0xD800 && code <= 0xDBFF && pos + 1 < val.length) ? pos + 2 : pos + 1;
        range.setStart(tn, pos);
        range.setEnd(tn, end);
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const r = rects[0];
          return { left: r.left, top: r.top, height: r.height };
        }
      } else if (pos > 0 && val[pos - 1] !== '\n') {
        const code = val.charCodeAt(pos - 1);
        const start = (code >= 0xDC00 && code <= 0xDFFF && pos >= 2) ? pos - 2 : pos - 1;
        range.setStart(tn, start);
        range.setEnd(tn, pos);
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const r = rects[rects.length - 1];
          return { left: r.right, top: r.top, height: r.height };
        }
      }
    }
  }

  mirror.textContent = '';
  const before = document.createTextNode(val.slice(0, pos));
  const probe = document.createElement('span');
  probe.className = 'np-caret-probe';
  probe.textContent = '\u200b';
  const after = document.createTextNode(val.slice(pos) || ' ');
  mirror.append(before, probe, after);
  syncPaddingAndScroll();
  const r = probe.getBoundingClientRect();
  return { left: r.left, top: r.top, height: r.height };
}

function updateNotepadEditorCaret(resetBlink = false) {
  const wrap = $('#notepad-highlight-wrap');
  const ta = $('#notepad-input');
  const pre = $('#notepad-highlight');
  const mirror = $('#notepad-caret-mirror');
  const caretEl = $('#notepad-editor-caret');
  if (!wrap || !ta || !mirror || !caretEl) return;

  const inReaderMode = document.body.classList.contains('notepad-reader-mode');
  const isVisible = document.body.classList.contains('notepad-open')
    && !inReaderMode
    && document.activeElement === ta
    && (ta.selectionStart === ta.selectionEnd);

  if (!isVisible) {
    caretEl.style.display = 'none';
    wrap.classList.remove('np-custom-caret-active');
    return;
  }

  const metrics = getCachedTextareaMetrics(ta);
  mirror.style.fontSize = ta.style.fontSize || metrics.computedFontSize;
  mirror.style.paddingRight = '';

  const pos = Math.max(0, Math.min(ta.value.length, ta.selectionEnd ?? ta.value.length));
  const val = (ta.value || '').replace(/\r\n?/g, '\n');

  const measured = prepareMirrorAndMeasure(mirror, val, pos, () => {
    syncHighlightOverlay(ta, mirror);
    if (pre) syncHighlightOverlay(ta, pre);
  });

  const wrapRect = wrap.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0) {
    caretEl.style.display = 'none';
    wrap.classList.remove('np-custom-caret-active');
    return;
  }

  const syntaxActive = document.documentElement.getAttribute('data-syntax') === 'true' && pre && pre.scrollHeight > 0;
  const refScrollTop = syntaxActive ? pre.scrollTop : ta.scrollTop;
  const refScrollLeft = syntaxActive ? pre.scrollLeft : ta.scrollLeft;
  const scrollClampY = refScrollTop - mirror.scrollTop;
  const scrollClampX = refScrollLeft - mirror.scrollLeft;

  const padLeft = metrics.padLeft;
  const taSb = Math.max(0, ta.offsetWidth - ta.clientWidth);
  const maxCaretX = Math.max(padLeft, wrap.clientWidth - taSb - 4);

  let left = measured.left - wrapRect.left - scrollClampX;
  const top = measured.top - wrapRect.top - scrollClampY;
  const fallbackH = Math.round(metrics.fontSizeNum * 1.28);
  const height = Math.max(14, Math.round(measured.height || fallbackH));

  if (left > maxCaretX && left <= maxCaretX + 16) {
    left = maxCaretX;
  }

  if (top + height < 2 || top > wrap.clientHeight - 2 || left < 2 || left > wrap.clientWidth - 2) {
    caretEl.style.display = 'none';
    wrap.classList.add('np-custom-caret-active');
    return;
  }

  caretEl.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
  caretEl.style.height = `${height}px`;
  caretEl.style.display = 'block';
  wrap.classList.add('np-custom-caret-active');

  if (resetBlink) {
    if (!caretEl.classList.contains('is-blinking')) {
      caretEl.classList.add('is-blinking');
    } else if (typeof caretEl.getAnimations === 'function') {
      const anims = caretEl.getAnimations();
      if (anims.length > 0) {
        for (const a of anims) {
          try { a.currentTime = 0; } catch { }
        }
      } else {
        caretEl.classList.remove('is-blinking');
        requestAnimationFrame(() => caretEl.classList.add('is-blinking'));
      }
    } else {
      caretEl.classList.remove('is-blinking');
      requestAnimationFrame(() => caretEl.classList.add('is-blinking'));
    }
  } else if (!caretEl.classList.contains('is-blinking')) {
    caretEl.classList.add('is-blinking');
  }
}

function ensureNotepadCaretVisible() {
  const wrap = $('#notepad-highlight-wrap');
  const ta = $('#notepad-input');
  const pre = $('#notepad-highlight');
  const mirror = $('#notepad-caret-mirror');
  if (!wrap || !ta || !mirror) return;
  if (!document.body.classList.contains('notepad-open') || document.body.classList.contains('notepad-reader-mode')) return;

  const metrics = getCachedTextareaMetrics(ta);
  mirror.style.fontSize = ta.style.fontSize || metrics.computedFontSize;
  mirror.style.paddingRight = '';

  const pos = Math.max(0, Math.min(ta.value.length, (ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd) ?? ta.value.length));
  const val = (ta.value || '').replace(/\r\n?/g, '\n');

  const measured = prepareMirrorAndMeasure(mirror, val, pos, () => {
    syncHighlightOverlay(ta, mirror);
    if (pre) syncHighlightOverlay(ta, pre);
  });

  const wrapRect = wrap.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0) return;

  const padTop = metrics.padTop;
  const padBottom = metrics.padBottom;
  const fallbackH = Math.round(metrics.fontSizeNum * 1.28);
  const h = Math.max(14, Math.round(measured.height || fallbackH));
  const relTop = measured.top - wrapRect.top - (ta.scrollTop - mirror.scrollTop);
  const maxScrollTop = Math.max(0, ta.scrollHeight - ta.clientHeight);

  if (relTop < padTop) {
    ta.scrollTop = Math.max(0, ta.scrollTop - (padTop - relTop) - 6);
  } else if (relTop + h > ta.clientHeight - padBottom) {
    ta.scrollTop = Math.min(maxScrollTop, ta.scrollTop + (relTop + h - (ta.clientHeight - padBottom)) + 6);
  }
  if (pre) syncHighlightOverlay(ta, pre);
  updateNotepadEditorCaret(true);
}

export function init(ac) {
  const sig = ac.signal;
  const ta = $('#notepad-input');
  const pre = $('#notepad-highlight');
  const counterEl = $('#notepad-counter');

  window.__refreshNotepadCaret = (resetBlink = false) => updateNotepadEditorCaret(resetBlink);
  window.__ensureNotepadCaretVisible = () => ensureNotepadCaretVisible();

  if (ta) {
    const syncOverlay = () => syncHighlightOverlay(ta, pre);
    let caretRafId = 0;
    let caretPendingReset = false;
    const refreshCaret = (resetBlink = false) => {
      if (resetBlink) caretPendingReset = true;
      if (caretRafId) return;
      caretRafId = requestAnimationFrame(() => {
        caretRafId = 0;
        const rb = caretPendingReset;
        caretPendingReset = false;
        updateNotepadEditorCaret(rb);
      });
    };
    let pendingClickFocus = null;

    on(ta, 'pointerdown', () => {
      pendingClickFocus = document.activeElement !== ta
        ? { top: ta.scrollTop, left: ta.scrollLeft, at: performance.now() }
        : null;
    }, true, sig);

    on(ta, 'focus', () => {
      if (pendingClickFocus && performance.now() - pendingClickFocus.at < 250) {
        const { top, left } = pendingClickFocus;
        pendingClickFocus = null;
        if (Math.abs(ta.scrollTop - top) > 2 || Math.abs(ta.scrollLeft - left) > 2) {
          ta.scrollTop = top;
          ta.scrollLeft = left;
        }
      }
      if (pre) syncOverlay();
      refreshCaret(true);
    }, false, sig);

    for (const ev of ['scroll', 'input', 'click', 'keyup', 'mouseup']) {
      on(ta, ev, () => {
        if (pre) syncOverlay();
        refreshCaret(ev === 'input' || ev === 'keyup' || ev === 'click');
      }, ev === 'scroll' ? { passive: true } : false, sig);
    }
    on(ta, 'keydown', () => refreshCaret(true), false, sig);
    on(ta, 'blur', () => updateNotepadEditorCaret(false), false, sig);
    on(document, 'selectionchange', () => {
      if (document.activeElement === ta) refreshCaret(false);
    }, false, sig);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (pre) syncOverlay();
        updateNotepadEditorCaret(false);
      });
      ro.observe(ta);
      sig.addEventListener('abort', () => ro.disconnect(), { once: true });
    }
    requestAnimationFrame(() => {
      if (pre) syncOverlay();
      updateNotepadEditorCaret(false);
    });
  }

  if (ta && counterEl) {
    const sync = () => {
      updateCounter(ta, counterEl);
      if (pre) syncHighlightOverlay(ta, pre);
      updateNotepadEditorCaret(false);
    };
    on(ta, 'input', sync, false, sig);
    window.__refreshNotepadCounter = sync;
    sync();
  }

  const npFooter = $('.notepad-footer');
  if (npFooter) {
    on(npFooter, 'mousedown', e => {
      if (e.target.closest('button')) e.preventDefault();
    }, false, sig);
  }

  const readerBtn = $('#notepad-reader-btn');
  const readerEditBtn = $('#notepad-reader-edit-btn');
  let prevModeBeforeReader = 'wysiwyg';
  let lastSavedNotepadViewMode = 'wysiwyg';
  let panelReaderFsActive = false;

  const getNotepadViewMode = () => {
    if (!document.body.classList.contains('notepad-reader-mode')) return 'split';
    return document.body.classList.contains('notepad-reader-edit') ? 'wysiwyg' : 'reader';
  };

  const setNotepadViewMode = (mode, opts = {}) => {
    const target = (mode === 'split' || mode === 'reader') ? mode : 'wysiwyg';
    const current = getNotepadViewMode();
    if (target === 'reader' && current !== 'reader') {
      prevModeBeforeReader = current;
    }
    if (target === 'wysiwyg' || target === 'split') {
      lastSavedNotepadViewMode = target;
    }

    document.body.classList.toggle('notepad-reader-mode', target !== 'split');
    document.body.classList.toggle('notepad-reader-edit', target === 'wysiwyg');

    if (readerEditBtn) {
      readerEditBtn.classList.toggle('active', target === 'split');
      readerEditBtn.setAttribute('aria-pressed', String(target === 'split'));
      if (target === 'wysiwyg') {
        readerEditBtn.textContent = 'Κώδικας LaTeX';
        readerEditBtn.title = 'Εμφάνιση πηγαίου κώδικα LaTeX / phpBB (διπλή προβολή) (Alt+W)';
      } else if (target === 'split') {
        readerEditBtn.textContent = 'WYSIWYG (Ctrl+W)';
        readerEditBtn.title = 'Επιστροφή σε πλήρη WYSIWYG γραφή (απόκρυψη κώδικα) (Alt+W)';
      } else {
        readerEditBtn.textContent = 'Επεξεργασία';
        readerEditBtn.title = 'Επεξεργασία σημειωματάριου WYSIWYG (Alt+W)';
      }
    }

    if (readerBtn) {
      const inReader = target === 'reader';
      readerBtn.classList.toggle('active', inReader);
      readerBtn.setAttribute('aria-pressed', String(inReader));
      readerBtn.textContent = inReader ? 'Έξοδος' : 'Ανάγνωση';
      readerBtn.title = inReader
        ? 'Έξοδος από Λειτουργία Ανάγνωσης (Esc / Alt+F)'
        : 'Λειτουργία Ανάγνωσης — Πλήρης οθόνη ζωντανής προεπισκόπησης (Alt+F)';
    }

    if (target === 'wysiwyg') {
      window.__setNotepadPreviewNav?.(true);
      requestAnimationFrame(() => {
        if (!opts.silentFocus && ta) {
          try { ta.focus({ preventScroll: true }); } catch { try { ta.focus(); } catch { } }
        }
        window.__renderHybridPreview?.(true, false);
        updateNotepadEditorCaret(false);
      });
    } else if (target === 'split') {
      window.__setNotepadPreviewNav?.(false);
      requestAnimationFrame(() => {
        if (!opts.silentFocus && ta) {
          try { ta.focus({ preventScroll: true }); } catch { try { ta.focus(); } catch { } }
        }
        window.__refreshSyntaxHighlight?.();
        window.__renderHybridPreview?.(true, false);
        updateNotepadEditorCaret(false);
      });
    } else {
      window.__setNotepadPreviewNav?.(false);
      window.__renderHybridPreview?.(true, false);
      updateNotepadEditorCaret(false);
    }

    const wantPanelFs = target === 'reader';
    if (window.parent !== window && wantPanelFs !== panelReaderFsActive) {
      panelReaderFsActive = wantPanelFs;
      try { window.parent.postMessage({ type: 'latex-panel-reader-mode', active: wantPanelFs }, '*'); } catch { }
    }
    window.__notifyPanelState?.();
  };

  window.__getLastNotepadViewMode = () => lastSavedNotepadViewMode;
  window.__suspendNotepadViewModeForEditor = () => {
    const cur = getNotepadViewMode();
    lastSavedNotepadViewMode = (cur === 'split' || (cur === 'reader' && prevModeBeforeReader === 'split'))
      ? 'split'
      : 'wysiwyg';
    if (panelReaderFsActive && window.parent !== window) {
      panelReaderFsActive = false;
      try { window.parent.postMessage({ type: 'latex-panel-reader-mode', active: false }, '*'); } catch { }
    }
  };
  window.__getNotepadViewMode = getNotepadViewMode;
  window.__setNotepadViewMode = setNotepadViewMode;
  window.__toggleNotepadReaderEditMode = next => {
    if (typeof next === 'boolean') {
      setNotepadViewMode(next ? 'wysiwyg' : 'split');
    } else {
      setNotepadViewMode(getNotepadViewMode() === 'wysiwyg' ? 'split' : 'wysiwyg');
    }
  };
  window.__toggleNotepadReaderMode = next => {
    const cur = getNotepadViewMode();
    const enter = typeof next === 'boolean' ? next : (cur !== 'reader');
    if (enter) {
      setNotepadViewMode('reader');
    } else {
      setNotepadViewMode(prevModeBeforeReader === 'split' ? 'split' : 'wysiwyg');
    }
  };

  if (readerEditBtn) {
    on(readerEditBtn, 'mousedown', e => e.preventDefault(), false, sig);
    on(readerEditBtn, 'click', () => {
      const cur = getNotepadViewMode();
      setNotepadViewMode(cur === 'wysiwyg' ? 'split' : 'wysiwyg');
    }, false, sig);
  }
  if (readerBtn) {
    on(readerBtn, 'mousedown', e => e.preventDefault(), false, sig);
    on(readerBtn, 'click', () => {
      window.__toggleNotepadReaderMode?.();
    }, false, sig);
  }
}
