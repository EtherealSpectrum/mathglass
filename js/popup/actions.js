import { $, on } from '../core/dom.js';
import { state, recordEquationHistory } from './settings.js';
import { MSG } from '../core/constants.js';
import { translateLatexErrorToGreek, translateAppErrorToGreek } from '../core/errors.js';
import { tokenizeHybridLatex, renderPhpbbHtml } from './notepad.js';

const isFirefox = typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';
const api = isFirefox ? browser : (typeof chrome !== 'undefined' ? chrome : null);

export function wrappedCode() {
  let code = state.ta.value;
  const d = $('#displaystyle-toggle')?.checked, t = $('#inline-toggle')?.checked;
  const $w = $('#tex-toggle')?.checked;
  if (t && d) code = `\\textstyle { \\displaystyle { ${code} } }`;
  else if (d) code = `\\displaystyle { ${code} }`;
  else if (t) code = `\\textstyle { ${code} }`;
  if ($w) code = `$${code}$`;
  return code;
}

function feedback(btn, text, bg) {
  if (!btn) return;
  clearTimeout(btn.__fb);
  if (btn.__orig === undefined) btn.__orig = btn.textContent;
  btn.textContent = text; btn.style.background = bg; btn.style.color = '#fff';
  btn.__fb = setTimeout(() => { btn.textContent = btn.__orig; btn.style.background = ''; btn.style.color = ''; }, 2400);
}

function showErrorToast(msg) {
  const el = $('#error-toast'); if (!el) return;
  el.textContent = msg; el.classList.add('active');
  clearTimeout(el.__t);
  el.__t = setTimeout(() => el.classList.remove('active'), 4800);
}

function triggerDownload(blob, filename) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}

export async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); if (btn) feedback(btn, 'Αντιγράφηκε!', '#4caf50'); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    if (ok) { if (btn) feedback(btn, 'Αντιγράφηκε!', '#4caf50'); }
    else showErrorToast('Δεν ήταν δυνατή η αντιγραφή.');
  }
}

export async function insertTextToPage(code, btn) {
  if (isFirefox) {
    try {
      const r = await api.runtime.sendMessage({ action: MSG.INSERT_INTO_PAGE, code });
      r?.success ? feedback(btn, 'Εισήχθη!', '#4caf50') : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
    } catch { feedback(btn, "Αντιγράφηκε αντ' αυτού", '#b78103'); copyText(code); }
    return;
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('no-eligible-tab');
    const fn = window.__insertIntoPageFn;
    if (!fn) throw new Error('insert function not available');
    const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn, args: [code] });
    res?.[0]?.result?.success ? feedback(btn, 'Εισήχθη!', '#4caf50') : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
  } catch {
    try {
      const r = await chrome.runtime.sendMessage({ action: MSG.INSERT_INTO_PAGE, code });
      r?.success ? feedback(btn, 'Εισήχθη!', '#4caf50') : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
    } catch { feedback(btn, "Αντιγράφηκε αντ' αυτού", '#b78103'); copyText(code); }
  }
}

function buildExportContainer(mode, content, bgMode = 'white') {
  const isTransparent = bgMode === 'transparent';
  const bgCss = isTransparent ? 'transparent' : '#ffffff';

  const temp = document.createElement('div');
  temp.style.cssText = `position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;background-color:${bgCss};color:#111827;text-shadow:none;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;`;
  if (mode === 'editor') {
    temp.style.display = 'inline-block'; temp.style.padding = '24px 28px'; temp.style.fontSize = '24px';
    try { katex.render(content.trim(), temp, { throwOnError: true, displayMode: true, fleqn: state.alignLeft }); }
    catch (e) { throw new Error(translateLatexErrorToGreek(e)); }
  } else {
    temp.className = 'phpbb-preview-body phpbb-export-root';
    temp.setAttribute('data-export-transparent', isTransparent ? 'true' : 'false');
    temp.style.width = '720px'; temp.style.padding = '28px 32px'; temp.style.fontSize = '15px'; temp.style.lineHeight = '1.7'; temp.style.whiteSpace = 'pre-wrap'; temp.style.wordBreak = 'break-word';
    temp.innerHTML = renderPhpbbHtml(content, true);
  }
  return temp;
}

async function exportCanvas(mode, content, scale, bgMode = 'white') {
  const isTransparent = bgMode === 'transparent';
  const temp = buildExportContainer(mode, content, bgMode);
  document.body.appendChild(temp);
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await document.fonts?.ready; } catch {}
    const rect = temp.getBoundingClientRect();
    const inkColor = '#111827';
    return await html2canvas(temp, {
      backgroundColor: isTransparent ? null : '#ffffff',
      scale,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      scrollX: 0,
      scrollY: 0,
      logging: false,
      useCORS: true,
      onclone: (_doc, cloned) => {
        cloned.style.left = '0';
        cloned.style.top = '0';
        cloned.style.position = 'static';
        cloned.style.textShadow = 'none';
        cloned.querySelectorAll('*').forEach(el => { el.style.textShadow = 'none'; });
        cloned.querySelectorAll('.katex-mathml').forEach(el => { el.style.display = 'none'; });
        cloned.querySelectorAll('pre.phpbb-code, .bb-code-block').forEach(el => {
          el.style.backgroundColor = isTransparent ? 'rgba(15, 23, 42, 0.06)' : '#f1f5f9';
          el.style.color = '#0f172a';
          el.style.borderColor = isTransparent ? 'rgba(15, 23, 42, 0.25)' : '#cbd5e1';
          el.style.whiteSpace = 'pre-wrap';
          el.style.wordBreak = 'break-word';
          el.style.overflow = 'visible';
        });
        cloned.querySelectorAll('.phpbb-hide > summary').forEach(el => {
          el.style.backgroundColor = '#f1f5f9';
          el.style.color = inkColor;
        });
        cloned.querySelectorAll('.phpbb-ggb').forEach(el => {
          el.style.backgroundColor = 'rgba(67, 56, 202, 0.08)';
          el.style.borderColor = '#4338ca';
          el.style.color = inkColor;
        });
        cloned.querySelectorAll('svg').forEach(svg => {
          if (svg.getAttribute('stroke') === 'currentColor') svg.setAttribute('stroke', inkColor);
          const f = svg.getAttribute('fill');
          if (!f || f === 'currentColor') svg.setAttribute('fill', inkColor);
          svg.querySelectorAll('path, line, rect, polygon').forEach(s => {
            if (s.getAttribute('stroke') === 'currentColor') s.setAttribute('stroke', inkColor);
            if (s.getAttribute('fill') === 'currentColor') s.setAttribute('fill', inkColor);
          });
        });
      },
    });
  } finally { temp.remove(); }
}

export async function runExport(mode, format, btn) {
  const raw = mode === 'editor' ? state.ta.value : ($('#notepad-input')?.value || '');
  const trimmed = raw.trim();
  if (!trimmed) { showErrorToast('Το περιεχόμενο είναι κενό.'); return; }
  const baseName = mode === 'editor' ? 'latex-equation' : 'latex-notepad';
  try {
    if (format === 'png' || format === 'png-transparent') {
      const bgMode = format === 'png-transparent' ? 'transparent' : 'white';
      const canvas = await exportCanvas(mode, raw, 3, bgMode);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      triggerDownload(blob, `${baseName}.png`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'pdf') {
      const canvas = await exportCanvas(mode, raw, 3, 'white');
      const pxToPt = 72 / 96;
      const cw = (canvas.width / 3) * pxToPt, ch = (canvas.height / 3) * pxToPt;
      const doc = new window.jspdf.jsPDF({ orientation: cw > ch ? 'landscape' : 'portrait', unit: 'pt', format: [Math.max(120, cw + 48), Math.max(80, ch + 48)] });
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 24, 24, cw, ch);
      doc.save(`${baseName}.pdf`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'bbcode-tex' || format === 'bbcode') {
      const tag = format === 'bbcode-tex' ? 'tex' : 'latex';
      const bb = mode === 'editor' ? `[${tag}]${trimmed}[/${tag}]`
        : tokenizeHybridLatex(raw).map(tok => tok.type === 'math' ? `[${tag}]${tok.content.trim()}[/${tag}]` : (tok.raw ?? tok.content)).join('');
      await copyText(bb, btn);
    } else if (format === 'mathml' && mode === 'editor') {
      const mml = katex.renderToString(trimmed, { throwOnError: true, displayMode: true, output: 'mathml' });
      const m = mml.match(/<math[\s\S]*?<\/math>/);
      await copyText(m ? m[0] : mml, btn);
    } else if (format === 'raw-tex') {
      await copyText(trimmed, btn);
    } else if (format === 'tex') {
      triggerDownload(new Blob([trimmed], { type: 'text/x-tex;charset=utf-8' }), `${baseName}.tex`);
    } else if (format === 'md') {
      triggerDownload(new Blob([mode === 'editor' ? `$$\n${trimmed}\n$$\n` : raw], { type: 'text/markdown;charset=utf-8' }), `${baseName}.md`);
    } else if (format === 'svg') {
      const temp = buildExportContainer(mode, raw, 'white');
      document.body.appendChild(temp);
      let width = mode === 'notepad' ? 760 : 880;
      let height = mode === 'notepad' ? 520 : 260;
      let body = '';
      try {
        const rect = temp.getBoundingClientRect();
        width = Math.max(180, Math.ceil(rect.width) + 12);
        height = Math.max(80, Math.ceil(rect.height) + 12);
        body = temp.innerHTML;
      } finally {
        temp.remove();
      }
      const wrapStyle = mode === 'notepad'
        ? 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.7;color:#111827;background:#ffffff;padding:28px 32px;white-space:pre-wrap;word-break:break-word;width:720px;box-sizing:border-box;'
        : 'font-size:24px;color:#111827;background:#ffffff;padding:24px 28px;display:inline-block;';
      const svgDoc = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <foreignObject width="100%" height="100%">\n    <div xmlns="http://www.w3.org/1999/xhtml" style="${wrapStyle}">\n      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />\n      ${body}\n    </div>\n  </foreignObject>\n</svg>\n`;
      triggerDownload(new Blob([svgDoc], { type: 'image/svg+xml;charset=utf-8' }), `${baseName}.svg`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'html') {
      const body = mode === 'editor' ? katex.renderToString(trimmed, { throwOnError: true, displayMode: true }) : renderPhpbbHtml(raw, true);
      triggerDownload(new Blob([`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>body{font-family:sans-serif;max-width:780px;margin:40px auto;padding:0 24px;color:#111827;background:#fff;line-height:1.7;white-space:${mode === 'notepad' ? 'pre-wrap' : 'normal'};}pre.phpbb-code{background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;padding:10px 12px;border-radius:6px;white-space:pre-wrap;word-break:break-word;}blockquote.phpbb-quote{border-left:3px solid #4338ca;margin:8px 0;padding:8px 14px;background:#f8fafc;}</style></head><body>${body}</body></html>`], { type: 'text/html;charset=utf-8' }), `${baseName}.html`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    }
  } catch (e) {
    showErrorToast(translateAppErrorToGreek(e, 'Αποτυχία εξαγωγής.'));
  }
}

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
      on(it, 'click', e => { e.stopPropagation(); menu.classList.remove('active'); runExport(mode, it.getAttribute('data-export-fmt'), btn); }, false, sig);
    });
  };
  bindMenu('#export-more-btn', '#export-more-menu', 'editor');
  bindMenu('#notepad-export-btn', '#notepad-export-menu', 'notepad');
  on(document, 'click', () => document.querySelectorAll('.export-menu.active').forEach(m => m.classList.remove('active')), false, sig);
}
