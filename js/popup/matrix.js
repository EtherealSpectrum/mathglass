import { $, on } from '../core/dom.js';
import { state } from './settings.js';

let savedCols = 3;
let previewsRendered = false;
const modal = () => $('#matrix-modal');

function colsVisibility(type) {
  const c = $('#matrix-cols'); if (!c) return;
  const aligned = type === 'aligned';
  if (aligned) { const v = parseInt(c.value, 10); if (v > 0) savedCols = v; c.value = 2; }
  else if (c.disabled) c.value = savedCols;
  c.disabled = aligned;
  c.parentElement.style.opacity = aligned ? '0.35' : '';
  c.parentElement.style.pointerEvents = aligned ? 'none' : '';
}

function ensureMatrixPreviewsRendered() {
  if (previewsRendered) return;
  previewsRendered = true;
  document.querySelectorAll('.matrix-preview[data-latex]').forEach(el => {
    try { katex.render(el.getAttribute('data-latex'), el, { throwOnError: false }); } catch { }
  });
}

export function open(type) {
  ensureMatrixPreviewsRendered();
  const r = document.querySelector(`input[name="matrix-type"][value="${type}"]`);
  if (r) r.checked = true;
  $('#matrix-rows').value = 3;
  $('#matrix-cols').value = type === 'cases' ? 2 : 3;
  colsVisibility(type);
  modal().classList.add('active');
}

export function init(ac) {
  const sig = ac.signal;
  window.__openMatrixBuilder = open;
  const close = () => modal().classList.remove('active');
  on($('#close-matrix'), 'click', close, false, sig);
  on($('#cancel-matrix'), 'click', close, false, sig);
  on(modal(), 'click', e => { if (e.target === modal()) close(); }, false, sig);
  document.querySelectorAll('input[name="matrix-type"]').forEach(r =>
    on(r, 'change', () => colsVisibility(r.value), false, sig));
  on($('#apply-matrix'), 'click', () => {
    const type = document.querySelector('input[name="matrix-type"]:checked')?.value || 'matrix';
    const rows = Math.max(1, Math.min(10, parseInt($('#matrix-rows').value, 10) || 3));
    const cols = Math.max(1, Math.min(10, parseInt($('#matrix-cols').value, 10) || 3));
    let latex;
    if (type === 'aligned') {
      latex = '\\begin{aligned}\n' + Array.from({ length: rows }, (_, r) => '&= ' + (r < rows - 1 ? '\\\\\n' : '\n')).join('') + '\\end{aligned}';
    } else {
      latex = `\\begin{${type}}\n` + Array.from({ length: rows }, () => Array.from({ length: cols }, () => '').join(' & ') + ' \\\\\n').join('') + `\\end{${type}}`;
    }
    const res = window.__insertSnippet(latex, '');
    const firstPos = res.start + (res.wrappedDollar ? 1 : 0) + latex.indexOf('\n') + 1;
    (res.target || state.ta)?.setSelectionRange(firstPos, firstPos);
    close();
  }, false, sig);
}
