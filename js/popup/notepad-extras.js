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
  const deltaSb = Math.max(0, taSb - preSb);
  const basePr = parseFloat(taCs.paddingRight) || 0;
  pre.style.paddingRight = deltaSb > 0 ? `${basePr + deltaSb}px` : '';
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
  window.__renderHybridPreview?.();
  window.__refreshSyntaxHighlight?.();
  set(KEYS.notepadText, ta.value);
  requestAnimationFrame(() => syncHighlightOverlay(ta, $('#notepad-highlight')));
}

export function init(ac) {
  const sig = ac.signal;
  const ta = $('#notepad-input');
  const pre = $('#notepad-highlight');
  const counterEl = $('#notepad-counter');
  const tplBtn = $('#notepad-templates-btn');
  const tplBar = $('#notepad-templates-bar');

  if (ta && pre) {
    const syncOverlay = () => syncHighlightOverlay(ta, pre);
    for (const ev of ['scroll', 'input', 'click', 'keyup', 'mouseup', 'focus']) {
      on(ta, ev, syncOverlay, ev === 'scroll' ? { passive: true } : false, sig);
    }
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncOverlay);
      ro.observe(ta);
      sig.addEventListener('abort', () => ro.disconnect(), { once: true });
    }
    requestAnimationFrame(syncOverlay);
  }

  if (ta && counterEl) {
    const sync = () => {
      updateCounter(ta, counterEl);
      if (pre) syncHighlightOverlay(ta, pre);
    };
    on(ta, 'input', sync, false, sig);

    const origRender = window.__renderHybridPreview;
    if (typeof origRender === 'function') {
      window.__renderHybridPreview = function (...args) {
        const res = origRender.apply(this, args);
        sync();
        return res;
      };
    }
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
      window.__renderHybridPreview?.();
    } else {
      window.__focusActiveEditor?.();
    }
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