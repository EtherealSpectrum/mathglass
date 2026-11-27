// Public API του actions module — re-export όλων των δημόσιων συναρτήσεων.
//
// Δομή:
//   1. Imports (για το init() παρακάτω)
//   2. Re-exports (public API)
//   3. init() — δένει όλα τα event listeners

// ─── Imports για το init() ──────────────────────────────────────────────────
import { $, on } from '../../core/dom.js';
import { state, recordEquationHistory } from '../settings.js';
import { wrappedCode } from './wrap.js';
import { copyText } from './clipboard.js';
import { insertTextToPage } from './insert.js';
import { runExport } from './export-runners.js';

// ─── Re-exports (public API) ────────────────────────────────────────────────
export { wrappedCode } from './wrap.js';
export { copyText } from './clipboard.js';
export { insertTextToPage } from './insert.js';
export { runExport } from './export-runners.js';

export {
  feedback,
  showErrorToast,
  triggerDownload,
  blobToDataUrl,
} from './shared.js';

export {
  getInlineKatexCss,
  mountExportStyleTag,
  PHPBB_EXPORT_CSS,
} from './export-css.js';

export {
  convertBbcodeChunkToMarkdown,
  convertNotepadToMarkdown,
  escapeLatexText,
  convertNotepadToLatex,
} from './export-text.js';

export {
  exportCanvas,
  buildExportContainer,
  prepareExportImages,
  waitForImgElement,
  fetchExternalImageAsDataUrl,
  fitOverflowingExportBlocks,
  getAvailableBlockWidth,
} from './export-canvas.js';

// ─── init() — δένει όλα τα event listeners ──────────────────────────────────
export function init(ac) {
  const sig = ac.signal;

  on($('#copy-btn'), 'click', function () {
    if (state.ta?.value?.trim()) recordEquationHistory(state.ta.value);
    copyText(wrappedCode(), this);
  }, false, sig);

  on($('#insert-btn'), 'click', function () {
    if (state.ta?.value?.trim()) recordEquationHistory(state.ta.value);
    insertTextToPage(wrappedCode(), this);
  }, false, sig);

  const bindMenu = (btnSel, menuSel, mode) => {
    const btn = $(btnSel), menu = $(menuSel);
    if (!btn || !menu) return;
    on(btn, 'click', e => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains('active');
      document.querySelectorAll('.export-menu.active').forEach(m => m.classList.remove('active'));
      if (willOpen) menu.classList.add('active');
    }, false, sig);
    menu.querySelectorAll('[data-export-fmt]').forEach(it => {
      on(it, 'click', e => {
        e.stopPropagation();
        menu.classList.remove('active');
        runExport(mode, it.getAttribute('data-export-fmt'), btn);
      }, false, sig);
    });
  };
  bindMenu('#export-more-btn', '#export-more-menu', 'editor');
  bindMenu('#notepad-export-btn', '#notepad-export-menu', 'notepad');

  on(document, 'click', () => {
    document.querySelectorAll('.export-menu.active').forEach(m => m.classList.remove('active'));
  }, false, sig);
}