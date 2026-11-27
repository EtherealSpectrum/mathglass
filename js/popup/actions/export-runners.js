// runExport — ο κεντρικός dispatcher για όλες τις μορφές εξαγωγής.
import { $ } from '../../core/dom.js';
import { MSG } from '../../core/constants.js';
import { state } from '../settings.js';
import { translateAppErrorToGreek } from '../../core/errors.js';
import { tokenizeHybridLatex, renderPhpbbHtml } from '../notepad.js';
import { feedback, showErrorToast, triggerDownload } from './shared.js';
import { copyText } from './clipboard.js';
import { PHPBB_EXPORT_CSS, mountExportStyleTag, getInlineKatexCss } from './export-css.js';
import {
  convertNotepadToMarkdown,
  convertNotepadToLatex,
} from './export-text.js';
import {
  exportCanvas,
  buildExportContainer,
  prepareExportImages,
  fitOverflowingExportBlocks,
} from './export-canvas.js';

export async function runExport(mode, format, btn) {
  const raw = mode === 'editor' ? state.ta.value : ($('#notepad-input')?.value || '');
  const trimmed = raw.trim();
  if (!trimmed) {
    showErrorToast('Το περιεχόμενο είναι κενό.');
    return;
  }
  const baseName = mode === 'editor' ? 'latex-equation' : 'latex-notepad';
  try {
    if (format === 'png' || format === 'png-transparent') {
      const bgMode = format === 'png-transparent' ? 'transparent' : 'white';
      const canvas = await exportCanvas(mode, raw, 3, bgMode);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('Αποτυχία δημιουργίας PNG.');
      triggerDownload(blob, `${baseName}.png`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'pdf') {
      const canvas = await exportCanvas(mode, raw, 3, 'white');
      const pxToPt = 72 / 96;
      const rectScale = canvas._mgScale || 3;
      const cw = (canvas.width / rectScale) * pxToPt;
      const ch = (canvas.height / rectScale) * pxToPt;
      const doc = new window.jspdf.jsPDF({
        orientation: cw > ch ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [Math.max(120, cw + 48), Math.max(80, ch + 48)],
      });
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 24, 24, cw, ch);
      doc.save(`${baseName}.pdf`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'bbcode-tex' || format === 'bbcode') {
      const tag = format === 'bbcode-tex' ? 'tex' : 'latex';
      const bb = mode === 'editor'
        ? `[${tag}]${trimmed}[/${tag}]`
        : tokenizeHybridLatex(raw).map(tok =>
            tok.type === 'math' ? `[${tag}]${tok.content.trim()}[/${tag}]` : (tok.raw ?? tok.content)
          ).join('');
      await copyText(bb, btn);
    } else if (format === 'mathml' && mode === 'editor') {
      const mml = katex.renderToString(trimmed, { throwOnError: true, displayMode: true, output: 'mathml' });
      const m = mml.match(/<math[\s\S]*?<\/math>/);
      await copyText(m ? m[0] : mml, btn);
    } else if (format === 'raw-tex') {
      await copyText(trimmed, btn);
    } else if (format === 'tex') {
      const texOut = mode === 'editor' ? trimmed : convertNotepadToLatex(raw);
      triggerDownload(new Blob([texOut], { type: 'text/x-tex;charset=utf-8' }), `${baseName}.tex`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'md') {
      const mdOut = mode === 'editor' ? `$$\n${trimmed}\n$$\n` : convertNotepadToMarkdown(raw);
      triggerDownload(new Blob([mdOut], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'svg') {
      const styleTag = mountExportStyleTag();
      const temp = buildExportContainer(mode, raw, 'white');
      document.body.appendChild(temp);
      let width = mode === 'notepad' ? 760 : 880;
      let height = mode === 'notepad' ? 520 : 260;
      let serializedBody = '';
      try {
        await prepareExportImages(temp);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        try { await document.fonts?.ready; } catch {}
        if (mode === 'notepad') {
          fitOverflowingExportBlocks(temp);
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
        const rect = temp.getBoundingClientRect();
        const innerW = Math.max(40, Math.ceil(rect.width));
        const innerH = Math.max(40, Math.ceil(rect.height));
        width = Math.max(mode === 'notepad' ? 180 : 60, innerW + 12);
        height = Math.max(mode === 'notepad' ? 80 : 60, innerH + 12);

        const clone = temp.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        clone.style.position = 'static';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.zIndex = 'auto';
        clone.style.margin = '0';
        if (mode === 'editor') clone.style.width = `${innerW}px`;
        serializedBody = new XMLSerializer().serializeToString(clone);
      } finally {
        temp.remove();
        styleTag.remove();
      }
      const katexCss = await getInlineKatexCss(true);
      const safeCss = `${katexCss}\n${PHPBB_EXPORT_CSS}\n.katex-mathml{display:none!important;}`.replace(/\]\]>/g, ']]&gt;');
      const svgDoc = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <defs>\n    <style type="text/css"><![CDATA[\n${safeCss}\n    ]]></style>\n  </defs>\n  <rect width="100%" height="100%" fill="#ffffff" />\n  <foreignObject x="6" y="6" width="${width - 12}" height="${height - 12}">\n    ${serializedBody}\n  </foreignObject>\n</svg>\n`;
      triggerDownload(new Blob([svgDoc], { type: 'image/svg+xml;charset=utf-8' }), `${baseName}.svg`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'html') {
      const body = mode === 'editor'
        ? katex.renderToString(trimmed, { throwOnError: true, displayMode: true, fleqn: state.alignLeft })
        : `<div class="phpbb-export-root">${renderPhpbbHtml(raw, true)}</div>`;
      const offlineKatexCss = await getInlineKatexCss(false);
      const htmlDoc = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<title>${mode === 'editor' ? 'MathGlass — Εξίσωση LaTeX' : 'MathGlass — Σημειωματάριο phpBB'}</title>
<style>${offlineKatexCss}</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:780px;margin:40px auto;padding:0 24px;color:#111827;background:#ffffff;line-height:1.7;}
${PHPBB_EXPORT_CSS}
</style>
</head>
<body>${body}</body>
</html>`;
      triggerDownload(new Blob([htmlDoc], { type: 'text/html;charset=utf-8' }), `${baseName}.html`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    }
  } catch (e) {
    showErrorToast(translateAppErrorToGreek(e, 'Αποτυχία εξαγωγής.'));
  }
}