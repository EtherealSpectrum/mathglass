import { KEYS } from '../core/constants.js';
import { $, on } from '../core/dom.js';
import { set } from '../core/storage.js';
import { state } from './settings.js';

const TEMPLATES = [
  {
    "id": "cases",
    "label": "Σύστημα Εξισώσεων (cases)",
    "snippet": "[tex]\\begin{cases}\n2x + 3y = 8 \\\\\nx - y = -1\n\\end{cases}[/tex]"
  },
  {
    "id": "piecewise",
    "label": "Κλαδική Συνάρτηση (cases)",
    "snippet": "[tex]f(x) = \\begin{cases}\nx^2 - 1, & x \\ge 0 \\\\\n2x + 3, & x < 0\n\\end{cases}[/tex]"
  },
  {
    "id": "aligned",
    "label": "Στοίχιση Βημάτων (aligned)",
    "snippet": "[tex]\\begin{aligned}\nI &= \\int_0^1 (x^2 + 2x)\\,dx \\\\\n  &= \\left[\\frac{x^3}{3} + x^2\\right]_0^1 \\\\\n  &= \\frac{4}{3}\n\\end{aligned}[/tex]"
  },
  {
    "id": "monotonia",
    "label": "Πίνακας Μονοτονίας (array)",
    "snippet": "[tex]\\begin{array}{c|ccccc}\nx & -\\infty & & x_1 & & +\\infty \\\\\n\\hline\nf'(x) & & + & 0 & - & \\\\\n\\hline\nf(x) & & \\nearrow & f(x_1) & \\searrow &\n\\end{array}[/tex]"
  },
  {
    "id": "pmatrix",
    "label": "Πίνακας / Μήτρα (pmatrix)",
    "snippet": "[tex]A = \\begin{pmatrix}\na_{11} & a_{12} & a_{13} \\\\\na_{21} & a_{22} & a_{23} \\\\\na_{31} & a_{32} & a_{33}\n\\end{pmatrix}[/tex]"
  },
  {
    "id": "exercise-hide",
    "label": "Άσκηση με Κρυφή Λύση ([hide])",
    "snippet": "[b]Εκφώνηση:[/b] Να λυθεί στο $\\mathbb{R}$ η εξίσωση $x^2 - 5x + 6 = 0$.\n\n[hide=Ενδεικτική Λύση]\n[list=1]\n[*] Υπολογίζουμε τη διακρίνουσα: $\\Delta = (-5)^2 - 4 \\cdot 1 \\cdot 6 = 1 > 0$.\n[*] Οι ρίζες δίνονται από τον τύπο:\n[tex]x_{1,2} = \\frac{5 \\pm \\sqrt{1}}{2} \\implies x_1 = 2,\\quad x_2 = 3[/tex]\n[/list]\n[b]Απάντηση:[/b] $S = \\{2, 3\\}$\n[/hide]"
  }
];

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
  const taCs = getComputedStyle(ta);
  const preCs = getComputedStyle(pre);
  const taBorderW = (parseFloat(taCs.borderLeftWidth) || 0) + (parseFloat(taCs.borderRightWidth) || 0);
  const preBorderW = (parseFloat(preCs.borderLeftWidth) || 0) + (parseFloat(preCs.borderRightWidth) || 0);
  const taSb = Math.max(0, ta.offsetWidth - ta.clientWidth - taBorderW);
  const preSb = Math.max(0, pre.offsetWidth - pre.clientWidth - preBorderW);
  const deltaSb = taSb - preSb;
  const basePr = parseFloat(taCs.paddingRight) || 0;
  pre.style.paddingRight = deltaSb !== 0 ? `${Math.max(0, basePr + deltaSb)}px` : '';
  pre.scrollTop = ta.scrollTop;
  pre.scrollLeft = ta.scrollLeft;
}

function insertTemplateSnippet(ta, snippet) {
  ta.focus();
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd ?? ta.value.length;
  const needsGap = s > 0 && ta.value[s - 1] !== '\n' ? '\n\n' : '';
  const text = needsGap + snippet;
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { }
  if (!ok) ta.setRangeText(text, s, e, 'end');
  state.notepadUserScrolled = false;
  window.__renderHybridPreview?.(true, true);
  window.__refreshSyntaxHighlight?.();
  window.__refreshNotepadCaret?.(true);
  set(KEYS.notepadText, ta.value);
  requestAnimationFrame(() => {
    syncHighlightOverlay(ta, $('#notepad-highlight'));
    window.__refreshNotepadCaret?.(true);
  });
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

  const isVisible = document.body.classList.contains('notepad-open')
    && !document.body.classList.contains('notepad-reader-mode')
    && document.activeElement === ta
    && (ta.selectionStart === ta.selectionEnd);

  if (!isVisible) {
    caretEl.style.display = 'none';
    wrap.classList.remove('np-custom-caret-active');
    return;
  }

  const cs = getComputedStyle(ta);
  mirror.style.fontSize = ta.style.fontSize || cs.fontSize;
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

  const padLeft = parseFloat(cs.paddingLeft) || 14;
  const taSb = Math.max(0, ta.offsetWidth - ta.clientWidth);
  const maxCaretX = Math.max(padLeft, wrap.clientWidth - taSb - 4);

  let left = measured.left - wrapRect.left - scrollClampX;
  const top = measured.top - wrapRect.top - scrollClampY;
  const fallbackH = Math.round((parseFloat(cs.fontSize) || 16) * 1.28);
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
    caretEl.classList.remove('is-blinking');
    void caretEl.offsetWidth;
    caretEl.classList.add('is-blinking');
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

  const cs = getComputedStyle(ta);
  mirror.style.fontSize = ta.style.fontSize || cs.fontSize;
  mirror.style.paddingRight = '';

  const pos = Math.max(0, Math.min(ta.value.length, (ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd) ?? ta.value.length));
  const val = (ta.value || '').replace(/\r\n?/g, '\n');

  const measured = prepareMirrorAndMeasure(mirror, val, pos, () => {
    syncHighlightOverlay(ta, mirror);
    if (pre) syncHighlightOverlay(ta, pre);
  });

  const wrapRect = wrap.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0) return;

  const padTop = parseFloat(cs.paddingTop) || 10;
  const padBottom = parseFloat(cs.paddingBottom) || 10;
  const fallbackH = Math.round((parseFloat(cs.fontSize) || 16) * 1.28);
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
  const tplBtn = $('#notepad-templates-btn');
  const tplBar = $('#notepad-templates-bar');

  window.__refreshNotepadCaret = (resetBlink = false) => updateNotepadEditorCaret(resetBlink);
  window.__ensureNotepadCaretVisible = () => ensureNotepadCaretVisible();

  if (ta) {
    const syncOverlay = () => syncHighlightOverlay(ta, pre);
    const refreshCaret = (resetBlink = false) => requestAnimationFrame(() => updateNotepadEditorCaret(resetBlink));
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

  if (tplBtn && tplBar && ta) {
    tplBar.innerHTML =
      '<span class="notepad-templates-label">Πρότυπα:</span>' +
      TEMPLATES.map(
        t => `<button type="button" class="notepad-tpl-chip" data-tpl-id="${t.id}" title="Εισαγωγή προτύπου: ${t.label}">${t.label}</button>`
      ).join('');

    on(tplBtn, 'mousedown', e => e.preventDefault(), false, sig);
    on(tplBar, 'mousedown', e => {
      if (e.target.closest('button')) e.preventDefault();
    }, false, sig);

    on(tplBtn, 'click', () => {
      const open = tplBar.classList.toggle('active');
      tplBtn.classList.toggle('active', open);
      tplBtn.setAttribute('aria-pressed', String(open));
      requestAnimationFrame(() => updateNotepadEditorCaret(false));
    }, false, sig);

    tplBar.querySelectorAll('[data-tpl-id]').forEach(btn => {
      on(btn, 'click', () => {
        const tpl = TEMPLATES.find(x => x.id === btn.getAttribute('data-tpl-id'));
        if (tpl) insertTemplateSnippet(ta, tpl.snippet);
      }, false, sig);
    });
  }

  const npBar = $('.notepad-bar');
  if (npBar) {
    on(npBar, 'mousedown', e => {
      if (e.target.closest('button')) e.preventDefault();
    }, false, sig);
  }

  const readerBtn = $('#notepad-reader-btn');
  const setReaderMode = next => {
    const target = typeof next === 'boolean' ? next : !document.body.classList.contains('notepad-reader-mode');
    document.body.classList.toggle('notepad-reader-mode', target);
    if (readerBtn) {
      readerBtn.classList.toggle('active', target);
      readerBtn.setAttribute('aria-pressed', String(target));
      readerBtn.textContent = target ? '✕ Έξοδος' : '📖 Ανάγνωση';
      readerBtn.title = target
        ? 'Έξοδος από Λειτουργία Ανάγνωσης (Esc / Alt+F)'
        : 'Λειτουργία Ανάγνωσης — Πλήρης οθόνη ζωντανής προεπισκόπησης (Alt+F)';
    }
    if (target) {
      window.__renderHybridPreview?.(true, false);
    } else {
      window.__focusActiveEditor?.();
    }
    updateNotepadEditorCaret(false);
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'latex-panel-reader-mode', active: target }, '*'); } catch { }
    }
  };
  window.__toggleNotepadReaderMode = setReaderMode;
  if (readerBtn) {
    on(readerBtn, 'mousedown', e => e.preventDefault(), false, sig);
    on(readerBtn, 'click', () => setReaderMode(), false, sig);
  }
}
