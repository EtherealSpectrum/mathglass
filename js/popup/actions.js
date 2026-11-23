import { $, on } from '../core/dom.js';
import { state, recordEquationHistory } from './settings.js';
import { MSG } from '../core/constants.js';
import { translateLatexErrorToGreek, translateAppErrorToGreek } from '../core/errors.js';
import { tokenizeHybridLatex, renderPhpbbHtml } from './notepad.js';

const isFirefox = typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';
const api = isFirefox ? browser : (typeof chrome !== 'undefined' ? chrome : null);

let cachedKatexCssPromise = null;

const PHPBB_EXPORT_CSS = `
.phpbb-export-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #111827;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}
.phpbb-export-root ul { list-style: disc; padding-left: 22px; margin: 4px 0; }
.phpbb-export-root ol { list-style: decimal; padding-left: 22px; margin: 4px 0; }
.phpbb-export-root blockquote.phpbb-quote {
  margin: 6px 0; padding: 6px 12px;
  border-left: 3px solid #4338ca;
  background: rgba(67, 56, 202, 0.06);
  border-radius: 0 6px 6px 0;
  color: #111827;
}
.phpbb-export-root pre.phpbb-code,
.phpbb-export-root .bb-code-block {
  margin: 6px 0; padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f1f5f9;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: visible;
}
.phpbb-export-root[data-export-transparent="true"] pre.phpbb-code,
.phpbb-export-root[data-export-transparent="true"] .bb-code-block {
  background: rgba(15, 23, 42, 0.06) !important;
  border-color: rgba(15, 23, 42, 0.25) !important;
}
.phpbb-export-root table.phpbb-table { border-collapse: collapse; margin: 6px 0; width: 100%; max-width: 100%; }
.phpbb-export-root table.phpbb-table th,
.phpbb-export-root table.phpbb-table td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; word-break: break-word; overflow-wrap: anywhere; }
.phpbb-export-root table.phpbb-table th { background: rgba(67, 56, 202, 0.10); font-weight: 700; }
.phpbb-export-root .phpbb-hide { margin: 6px 0; border: 1px dashed #cbd5e1 !important; border-radius: 6px; overflow: hidden; color: #111827; background: transparent !important; }
.phpbb-export-root .phpbb-hide > summary,
.phpbb-export-root .phpbb-hide > .phpbb-hide-summary {
  padding: 6px 12px; font-weight: 600; font-size: 0.9em;
  background: #f1f5f9 !important; color: #111827 !important;
  cursor: pointer; list-style: none;
  display: flex; align-items: center; gap: 6px;
}
.phpbb-export-root .phpbb-hide > summary::-webkit-details-marker { display: none; }
.phpbb-export-root .phpbb-hide-body { padding: 8px 12px; border-top: 1px dashed #cbd5e1 !important; background: transparent !important; }
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide {
  border-color: rgba(15, 23, 42, 0.28) !important;
  background: transparent !important;
}
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide > summary,
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide > .phpbb-hide-summary {
  background: rgba(15, 23, 42, 0.06) !important;
  color: #111827 !important;
}
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide-body {
  border-top-color: rgba(15, 23, 42, 0.25) !important;
  background: transparent !important;
}
.phpbb-export-root .phpbb-ggb {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 6px;
  border: 1px solid #4338ca; background: rgba(67, 56, 202, 0.08);
  color: #111827; font-size: 0.88em; margin: 4px 0;
}
.phpbb-export-root .phpbb-center { text-align: center; margin: 4px 0; }
.phpbb-export-root a { color: #4338ca; text-decoration: underline; }
.phpbb-export-root img { max-width: 100%; height: auto; border-radius: 6px; margin: 4px 0; }
.phpbb-export-root .katex { white-space: normal !important; max-width: 100%; }
.phpbb-export-root .np-math-inline {
  display: inline-block !important;
  vertical-align: middle !important;
  margin: 0 2px !important;
  max-width: calc(100% - 4px) !important;
}
.phpbb-export-root .np-math-inline > .katex,
.phpbb-export-root .np-math-inline .katex-partial-valid > .katex {
  display: block !important;
  max-width: 100% !important;
  white-space: normal !important;
}
.phpbb-export-root .np-math-display {
  display: block !important;
  margin: 10px 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.phpbb-export-root .np-math-display .katex-display {
  margin: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.phpbb-export-root .np-math-display .katex-display > .katex {
  white-space: normal !important;
  max-width: 100% !important;
}
`;

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
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(reader.error || new Error('read-failed'));
    reader.readAsDataURL(blob);
  });
}

async function fetchExternalImageAsDataUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  if (window.mathglassDesktop?.fetchImageDataUrl) {
    try {
      const viaDesktop = await window.mathglassDesktop.fetchImageDataUrl(url);
      if (viaDesktop) return viaDesktop;
    } catch { }
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, { signal: controller.signal, referrerPolicy: 'no-referrer' }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0 || blob.size > 15 * 1024 * 1024) return null;
    if (blob.type && !blob.type.startsWith('image/')) return null;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function waitForImgElement(img, timeoutMs = 5000) {
  if (!img) return;
  if (!img.complete) {
    await new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        img.removeEventListener('load', finish);
        img.removeEventListener('error', finish);
        resolve();
      };
      const t = setTimeout(finish, timeoutMs);
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
    });
  }
  if (typeof img.decode === 'function' && img.naturalWidth > 0) {
    try { await img.decode(); } catch { }
  }
}

async function prepareExportImages(rootEl) {
  const imgs = Array.from(rootEl.querySelectorAll('img'));
  if (!imgs.length) return;
  await Promise.all(imgs.map(async img => {
    const rawSrc = img.getAttribute('src') || img.src || '';
    if (!rawSrc || rawSrc.startsWith('data:')) {
      await waitForImgElement(img);
      return;
    }
    const dataUrl = await fetchExternalImageAsDataUrl(rawSrc);
    if (dataUrl) {
      img.setAttribute('src', dataUrl);
      await waitForImgElement(img);
    } else {
      // Αποφυγή σφάλματος tainted canvas από εξωτερικές εικόνες χωρίς CORS
      img.dataset.mgUntrustedExternal = '1';
      await waitForImgElement(img, 3000);
    }
  }));
}

async function getInlineKatexCss(embedFonts = false) {
  if (!cachedKatexCssPromise) {
    cachedKatexCssPromise = (async () => {
      try {
        const cssUrl = new URL('lib/katex/katex.min.css', location.href).href;
        const res = await fetch(cssUrl);
        if (!res.ok) return '';
        let cssText = await res.text();
        if (!embedFonts) {
          cssText = cssText.replace(/@font-face\{[^}]*\}/g, '');
          return cssText;
        }
        const fontUrls = new Set();
        cssText.replace(/url\((fonts\/[^)]+?\.woff2)\)/g, (_, rel) => {
          fontUrls.add(rel);
          return _;
        });
        const fontMap = new Map();
        await Promise.all(Array.from(fontUrls).map(async rel => {
          try {
            const abs = new URL(`lib/katex/${rel}`, location.href).href;
            const r = await fetch(abs);
            if (!r.ok) return;
            const b = await r.blob();
            const du = await blobToDataUrl(b);
            if (du) fontMap.set(rel, du);
          } catch { }
        }));
        cssText = cssText.replace(/@font-face\{([^}]*)\}/g, (block, inner) => {
          const m = inner.match(/url\((fonts\/[^)]+?\.woff2)\)/);
          if (m && fontMap.has(m[1])) {
            const cleanedInner = inner.replace(/src:[^;]+;/, `src:url("${fontMap.get(m[1])}") format("woff2");`);
            return `@font-face{${cleanedInner}}`;
          }
          return '';
        });
        return cssText;
      } catch {
        return '';
      }
    })();
  }
  return await cachedKatexCssPromise;
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
      const r = await api?.runtime?.sendMessage({ action: MSG.INSERT_INTO_PAGE, code });
      r?.success ? feedback(btn, 'Εισήχθη!', '#4caf50') : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
    } catch { feedback(btn, "Αντιγράφηκε αντ' αυτού", '#b78103'); copyText(code); }
    return;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting) {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('no-eligible-tab');
      const fn = window.__insertIntoPageFn;
      if (!fn) throw new Error('insert function not available');
      const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn, args: [code] });
      res?.[0]?.result?.success ? feedback(btn, 'Εισήχθη!', '#4caf50') : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
      return;
    } catch { }
  }
  try {
    if (!api?.runtime?.sendMessage) throw new Error('no-runtime');
    const r = await api.runtime.sendMessage({ action: MSG.INSERT_INTO_PAGE, code });
    r?.success ? feedback(btn, 'Εισήχθη!', '#4caf50') : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
  } catch {
    feedback(btn, "Αντιγράφηκε αντ' αυτού", '#b78103');
    copyText(code);
  }
}

function mountExportStyleTag() {
  const existing = document.getElementById('mg-export-temp-style');
  if (existing) existing.remove();
  const st = document.createElement('style');
  st.id = 'mg-export-temp-style';
  st.textContent = PHPBB_EXPORT_CSS;
  document.head.appendChild(st);
  return st;
}

function getAvailableBlockWidth(el, rootEl) {
  let p = el.parentElement;
  while (p && p !== rootEl) {
    const cs = getComputedStyle(p);
    if (cs.display === 'block' || cs.display === 'flex' || cs.display === 'list-item' || p.tagName === 'TD' || p.tagName === 'TH') {
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const bw = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
      const avail = p.clientWidth - pad - bw;
      if (avail > 40) return avail;
    }
    p = p.parentElement;
  }
  const rcs = getComputedStyle(rootEl);
  const rpad = (parseFloat(rcs.paddingLeft) || 0) + (parseFloat(rcs.paddingRight) || 0);
  return Math.max(120, rootEl.clientWidth - rpad);
}

function fitOverflowingExportBlocks(rootEl) {
  for (let pass = 0; pass < 2; pass++) {
    for (const block of rootEl.querySelectorAll('.np-math-display, .np-math-inline')) {
      const katexEl = block.querySelector('.katex');
      if (!katexEl) continue;
      const avail = getAvailableBlockWidth(block, rootEl);
      const katexHtml = katexEl.querySelector('.katex-html') || katexEl;
      const innerMax = Array.from(katexEl.querySelectorAll('.mtable, .base')).reduce(
        (mx, node) => Math.max(mx, node.getBoundingClientRect().width, node.scrollWidth),
        0
      );
      const needed = Math.max(katexEl.scrollWidth, katexHtml.scrollWidth, innerMax);
      if (needed > avail + 1) {
        const curFs = parseFloat(getComputedStyle(katexEl).fontSize) || 16;
        const ratio = avail / needed;
        const nextFs = Math.max(8, Math.floor(curFs * ratio * 0.96 * 10) / 10);
        if (nextFs < curFs - 0.05) {
          katexEl.style.setProperty('font-size', `${nextFs}px`, 'important');
        }
      }
    }
    for (const tbl of rootEl.querySelectorAll('table.phpbb-table')) {
      const avail = getAvailableBlockWidth(tbl, rootEl);
      if (tbl.scrollWidth > avail + 1) {
        const curFs = parseFloat(getComputedStyle(tbl).fontSize) || 15;
        const ratio = avail / tbl.scrollWidth;
        const nextFs = Math.max(8.5, Math.floor(curFs * ratio * 0.96 * 10) / 10);
        tbl.style.setProperty('font-size', `${nextFs}px`, 'important');
        tbl.style.setProperty('table-layout', 'fixed', 'important');
      }
    }
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
    // Μετατροπή <details class="phpbb-hide"> σε καθαρό ανοιχτό <div> για αξιόπιστη απόδοση σε PNG/PDF/SVG
    Array.from(temp.querySelectorAll('details.phpbb-hide')).reverse().forEach(det => {
      const box = document.createElement('div');
      box.className = det.className;
      const sum = det.querySelector(':scope > summary');
      if (sum) {
        const header = document.createElement('div');
        header.className = 'phpbb-hide-summary';
        const arrow = document.createElement('span');
        arrow.textContent = '▾';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.style.cssText = 'font-size:0.85em;opacity:0.75;line-height:1;';
        header.appendChild(arrow);
        while (sum.firstChild) header.appendChild(sum.firstChild);
        box.appendChild(header);
      }
      const body = det.querySelector(':scope > .phpbb-hide-body');
      if (body) box.appendChild(body);
      det.replaceWith(box);
    });
  }
  return temp;
}

async function exportCanvas(mode, content, scale, bgMode = 'white') {
  const isTransparent = bgMode === 'transparent';
  const styleTag = mountExportStyleTag();
  const temp = buildExportContainer(mode, content, bgMode);
  document.body.appendChild(temp);
  try {
    await prepareExportImages(temp);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await document.fonts?.ready; } catch {}
    if (mode === 'notepad') {
      fitOverflowingExportBlocks(temp);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    const rect = temp.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const h = Math.max(1, Math.ceil(rect.height));
    const safeScale = Math.max(1, Math.min(scale, Math.floor(Math.min(12000 / h, 12000 / w) * 10) / 10));
    const inkColor = '#111827';
    const canvas = await html2canvas(temp, {
      backgroundColor: isTransparent ? null : '#ffffff',
      scale: safeScale,
      width: w,
      height: h,
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
        // Αφαίρεση τυχόν εξωτερικών εικόνων που απέτυχε το data-URL fetch ώστε να μην γίνει taint ο καμβάς
        cloned.querySelectorAll('img[data-mg-untrusted-external="1"]').forEach(img => {
          const placeholder = _doc.createElement('span');
          placeholder.textContent = `[Εικόνα: ${img.getAttribute('src') || ''}]`;
          placeholder.style.cssText = 'display:inline-block;padding:4px 8px;border:1px dashed #94a3b8;border-radius:4px;color:#475569;font-size:12px;';
          img.replaceWith(placeholder);
        });
        cloned.querySelectorAll('pre.phpbb-code, .bb-code-block').forEach(el => {
          el.style.setProperty('background-color', isTransparent ? 'rgba(15, 23, 42, 0.06)' : '#f1f5f9', 'important');
          el.style.setProperty('color', '#0f172a', 'important');
          el.style.setProperty('border-color', isTransparent ? 'rgba(15, 23, 42, 0.25)' : '#cbd5e1', 'important');
          el.style.whiteSpace = 'pre-wrap';
          el.style.wordBreak = 'break-word';
          el.style.overflow = 'visible';
        });
        cloned.querySelectorAll('.phpbb-hide').forEach(el => {
          el.style.setProperty('border-color', isTransparent ? 'rgba(15, 23, 42, 0.28)' : '#cbd5e1', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
        });
        cloned.querySelectorAll('.phpbb-hide > summary, .phpbb-hide > .phpbb-hide-summary').forEach(el => {
          el.style.setProperty('background-color', isTransparent ? 'rgba(15, 23, 42, 0.06)' : '#f1f5f9', 'important');
          el.style.setProperty('color', inkColor, 'important');
        });
        cloned.querySelectorAll('.phpbb-hide-body').forEach(el => {
          el.style.setProperty('border-top-color', isTransparent ? 'rgba(15, 23, 42, 0.25)' : '#cbd5e1', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
        });
        cloned.querySelectorAll('.phpbb-ggb').forEach(el => {
          el.style.setProperty('background-color', 'rgba(67, 56, 202, 0.08)', 'important');
          el.style.setProperty('border-color', '#4338ca', 'important');
          el.style.setProperty('color', inkColor, 'important');
        });
        cloned.querySelectorAll('svg').forEach(svg => {
          if (svg.getAttribute('stroke') === 'currentColor') svg.setAttribute('stroke', inkColor);
          const f = svg.getAttribute('fill');
          if (!f || f === 'currentColor') svg.setAttribute('fill', inkColor);
          svg.querySelectorAll('path, line, rect, polygon, circle, ellipse, polyline').forEach(s => {
            if (s.getAttribute('stroke') === 'currentColor') s.setAttribute('stroke', inkColor);
            if (s.getAttribute('fill') === 'currentColor') s.setAttribute('fill', inkColor);
          });
        });
      },
    });
    canvas._mgScale = safeScale;
    return canvas;
  } finally {
    temp.remove();
    styleTag.remove();
  }
}

function convertBbcodeChunkToMarkdown(chunk) {
  let out = chunk;
  for (let pass = 0; pass < 4; pass++) {
    out = out
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '**$1**')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '*$1*')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
      .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '~~$1~~')
      .replace(/\[size=\d+\]([\s\S]*?)\[\/size\]/gi, '$1')
      .replace(/\[color=[^\]]+\]([\s\S]*?)\[\/color\]/gi, '$1')
      .replace(/\[center\]([\s\S]*?)\[\/center\]/gi, (_, inner) => `\n<div align="center">\n\n${inner.trim()}\n\n</div>\n`);
  }
  out = out
    .replace(/\[img(?:=[^\]]*)?\]([\s\S]*?)\[\/img\]/gi, (_, src) => `![Εικόνα](${src.trim()})`)
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) => `[${label}](${href.trim()})`)
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => `<${href.trim()}>`)
    .replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => `> 📐 **GeoGebra:** \`${id.trim()}\``)
    .replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, inner) => {
      const rows = [];
      const trRe = /\[tr\]([\s\S]*?)\[\/tr\]/gi;
      let trM;
      while ((trM = trRe.exec(inner)) !== null) {
        const cells = [];
        const cellRe = /\[(th|td)\]([\s\S]*?)\[\/\1\]/gi;
        let cM;
        while ((cM = cellRe.exec(trM[1])) !== null) {
          cells.push(cM[2].trim().replace(/\|/g, '\\|').replace(/\r?\n+/g, ' '));
        }
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) return inner;
      const cols = Math.max(...rows.map(r => r.length));
      const pad = r => Array.from({ length: cols }, (_, i) => r[i] ?? '');
      const header = `| ${pad(rows[0]).join(' | ')} |`;
      const sep = `| ${Array(cols).fill('---').join(' | ')} |`;
      const body = rows.slice(1).map(r => `| ${pad(r).join(' | ')} |`);
      return `\n${[header, sep, ...body].join('\n')}\n`;
    })
    .replace(/\[list(=1|=a|=i)?\]([\s\S]*?)\[\/list\]/gi, (_, listType, inner) => {
      const items = inner.split(/\[\*\]/i).slice(1).map(x => x.trim()).filter(Boolean);
      if (!items.length) return inner.trim();
      return '\n' + items.map((item, idx) => (listType ? `${idx + 1}. ${item}` : `- ${item}`)).join('\n') + '\n';
    })
    .replace(/\[quote(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi, (_, q1, q2, inner) => {
      const author = (q1 || q2 || '').trim();
      const head = author ? `> **${author} έγραψε:**\n>\n` : '';
      return '\n' + head + inner.trim().split(/\r?\n/).map(l => `> ${l}`).join('\n') + '\n';
    })
    .replace(/\[hide(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/hide\]/gi, (_, q1, q2, inner) => {
      const title = (q1 || q2 || 'Κρυφό περιεχόμενο').trim();
      return `\n<details>\n<summary>${title}</summary>\n\n${inner.trim()}\n\n</details>\n`;
    });
  return out;
}

function convertNotepadToMarkdown(raw) {
  const tokens = tokenizeHybridLatex(raw);
  const placeholders = [];
  let assembled = '';
  for (const tok of tokens) {
    if (tok.type === 'code') {
      const idx = placeholders.length;
      placeholders.push(`\n\`\`\`\n${tok.content.trim()}\n\`\`\`\n`);
      assembled += `@@MG_MD_SLOT_${idx}@@`;
    } else if (tok.type === 'math') {
      const idx = placeholders.length;
      const body = tok.content.trim();
      placeholders.push(tok.display ? `\n$$\n${body}\n$$\n` : `$${body}$`);
      assembled += `@@MG_MD_SLOT_${idx}@@`;
    } else {
      assembled += tok.content;
    }
  }
  const md = convertBbcodeChunkToMarkdown(assembled);
  return md.replace(/@@MG_MD_SLOT_(\d+)@@/g, (_, idx) => placeholders[Number(idx)] ?? '');
}

function escapeLatexText(str) {
  return String(str)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function convertNotepadToLatex(raw) {
  const tokens = tokenizeHybridLatex(raw);
  const slots = [];
  const urlSlots = [];
  let assembled = '';
  for (const tok of tokens) {
    if (tok.type === 'code') {
      const idx = slots.length;
      slots.push(`\n\\begin{verbatim}\n${tok.content.trim()}\n\\end{verbatim}\n`);
      assembled += `@@MGTEXSLOT${idx}@@`;
    } else if (tok.type === 'math') {
      const idx = slots.length;
      const body = tok.content.trim();
      slots.push(tok.display ? `\n\\[\n${body}\n\\]\n` : `$${body}$`);
      assembled += `@@MGTEXSLOT${idx}@@`;
    } else {
      assembled += tok.content.replace(/\\\$/g, '$');
    }
  }

  // Προστασία URL/IDs πριν το LaTeX escaping ώστε _, &, ~, ^ στα links να μην αλλοιώνονται
  const pushUrlSlot = val => {
    const idx = urlSlots.length;
    urlSlots.push(String(val || '').trim().replace(/[\r\n]+/g, ' '));
    return `@@MGURLSLOT${idx}@@`;
  };
  assembled = assembled
    .replace(/\[url=([^\]]+)\]/gi, (_, href) => `[url=${pushUrlSlot(href)}]`)
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => `[url]${pushUrlSlot(href)}[/url]`)
    .replace(/\[img(?:=([^\]]*))?\]([\s\S]*?)\[\/img\]/gi, (_, sizeAttr, src) => `[img${sizeAttr ? `=${sizeAttr}` : ''}]${pushUrlSlot(src)}[/img]`)
    .replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => `[ggb]${pushUrlSlot(id)}[/ggb]`);

  let texBody = escapeLatexText(assembled);
  for (let pass = 0; pass < 4; pass++) {
    texBody = texBody
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '\\textbf{$1}')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '\\textit{$1}')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '\\underline{$1}')
      .replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '$1')
      .replace(/\[size=\d+\]([\s\S]*?)\[\/size\]/gi, '$1')
      .replace(/\[color=[^\]]+\]([\s\S]*?)\[\/color\]/gi, '$1')
      .replace(/\[center\]([\s\S]*?)\[\/center\]/gi, (_, inner) => `\n\\begin{center}\n${inner.trim()}\n\\end{center}\n`);
  }
  texBody = texBody
    .replace(/\[img(?:=[^\]]*)?\]([\s\S]*?)\[\/img\]/gi, (_, src) => `% Εικόνα: ${src.trim()}`)
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) => `\\href{${href.trim()}}{${label}}`)
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) => `\\url{${href.trim()}}`)
    .replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => `% GeoGebra: ${id.trim()}`)
    .replace(/\[list(=1|=a|=i)?\]([\s\S]*?)\[\/list\]/gi, (_, listType, inner) => {
      const env = listType ? 'enumerate' : 'itemize';
      const items = inner.split(/\[\*\]/i).slice(1).map(x => x.trim()).filter(Boolean);
      if (!items.length) return inner;
      return `\n\\begin{${env}}\n${items.map(it => `  \\item ${it}`).join('\n')}\n\\end{${env}}\n`;
    })
    .replace(/\[quote(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi, (_, q1, q2, inner) => {
      const author = (q1 || q2 || '').trim();
      const head = author ? `\\textbf{${author}:} ` : '';
      return `\n\\begin{quote}\n${head}${inner.trim()}\n\\end{quote}\n`;
    })
    .replace(/\[hide(?:="([^"]*)"|=([^\]]*))?\]([\s\S]*?)\[\/hide\]/gi, (_, q1, q2, inner) => {
      const title = (q1 || q2 || 'Λύση').trim();
      return `\n\\paragraph{${title}}\n${inner.trim()}\n`;
    })
    .replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, inner) => {
      const rows = [];
      const trRe = /\[tr\]([\s\S]*?)\[\/tr\]/gi;
      let trM;
      while ((trM = trRe.exec(inner)) !== null) {
        const cells = [];
        const cellRe = /\[(th|td)\]([\s\S]*?)\[\/\1\]/gi;
        let cM;
        while ((cM = cellRe.exec(trM[1])) !== null) {
          cells.push(cM[2].trim());
        }
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) return inner;
      const cols = Math.max(...rows.map(r => r.length));
      const spec = Array(cols).fill('l').join(' | ');
      const lines = rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' & ') + ' \\\\ \\hline');
      return `\n\\begin{tabular}{| ${spec} |}\n\\hline\n${lines.join('\n')}\n\\end{tabular}\n`;
    });

  texBody = texBody
    .replace(/@@MGURLSLOT(\d+)@@/g, (_, idx) => urlSlots[Number(idx)] ?? '')
    .replace(/@@MGTEXSLOT(\d+)@@/g, (_, idx) => slots[Number(idx)] ?? '');

  return `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[greek,english]{babel}
\\usepackage{amsmath,amssymb,hyperref}

\\begin{document}
${texBody.trim()}
\\end{document}
`;
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
      if (!blob) throw new Error('Αποτυχία δημιουργίας PNG.');
      triggerDownload(blob, `${baseName}.png`);
      if (btn) feedback(btn, 'Έτοιμο!', '#4caf50');
    } else if (format === 'pdf') {
      const canvas = await exportCanvas(mode, raw, 3, 'white');
      const pxToPt = 72 / 96;
      const rectScale = canvas._mgScale || 3;
      const cw = (canvas.width / rectScale) * pxToPt;
      const ch = (canvas.height / rectScale) * pxToPt;
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
        width = Math.max(180, Math.ceil(rect.width) + 12);
        height = Math.max(80, Math.ceil(rect.height) + 12);

        const clone = temp.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        clone.style.position = 'static';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.zIndex = 'auto';
        clone.style.margin = '0';
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
