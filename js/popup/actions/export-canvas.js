// Canvas-based exports — PNG / PDF / SVG. Χρησιμοποιεί html2canvas + jsPDF.
import { state } from '../settings.js';
import { translateLatexErrorToGreek } from '../../core/errors.js';
import { renderPhpbbHtml } from '../notepad.js';
import { blobToDataUrl } from './shared.js';
import { PHPBB_EXPORT_CSS, mountExportStyleTag } from './export-css.js';

export async function fetchExternalImageAsDataUrl(url) {
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

export async function waitForImgElement(img, timeoutMs = 5000) {
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

export async function prepareExportImages(rootEl) {
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
      img.dataset.mgUntrustedExternal = '1';
      await waitForImgElement(img, 3000);
    }
  }));
}

export function getAvailableBlockWidth(el, rootEl) {
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

export function fitOverflowingExportBlocks(rootEl) {
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

export function buildExportContainer(mode, content, bgMode = 'white') {
  const isTransparent = bgMode === 'transparent';
  const bgCss = isTransparent ? 'transparent' : '#ffffff';

  const temp = document.createElement('div');
  temp.style.cssText = `position:fixed;left:-10000px;top:0;z-index:-1;pointer-events:none;background-color:${bgCss};color:#111827;text-shadow:none;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;`;
  if (mode === 'editor') {
    temp.style.display = 'inline-block';
    temp.style.padding = '24px 28px';
    temp.style.fontSize = '24px';
    try {
      katex.render(content.trim(), temp, { throwOnError: true, displayMode: true, fleqn: state.alignLeft });
    } catch (e) {
      throw new Error(translateLatexErrorToGreek(e));
    }
  } else {
    temp.className = 'phpbb-preview-body phpbb-export-root';
    temp.setAttribute('data-export-transparent', isTransparent ? 'true' : 'false');
    temp.style.width = '720px';
    temp.style.padding = '28px 32px';
    temp.style.fontSize = '15px';
    temp.style.lineHeight = '1.7';
    temp.style.whiteSpace = 'pre-wrap';
    temp.style.wordBreak = 'break-word';
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

export async function exportCanvas(mode, content, scale, bgMode = 'white') {
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
      x: 0,
      y: 0,
      width: w,
      height: h,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(w + 40, 1024),
      windowHeight: Math.max(h + 40, 768),
      logging: false,
      useCORS: true,
      onclone: (_doc, cloned) => {
        const docEl = _doc.documentElement;
        docEl.removeAttribute('data-transparent');
        docEl.removeAttribute('data-full-transparent');
        docEl.removeAttribute('data-blur');
        docEl.removeAttribute('data-desktop');
        docEl.removeAttribute('data-maximized');
        docEl.style.cssText = `margin:0!important;padding:0!important;width:${w}px!important;height:${h}px!important;min-width:0!important;min-height:0!important;overflow:visible!important;background:transparent!important;`;
        _doc.body.className = '';
        _doc.body.style.cssText = `margin:0!important;padding:0!important;display:block!important;width:${w}px!important;height:${h}px!important;min-width:0!important;min-height:0!important;overflow:visible!important;background:transparent!important;`;
        Array.from(_doc.body.children).forEach(ch => {
          if (ch !== cloned && ch.tagName !== 'STYLE' && ch.tagName !== 'LINK') {
            ch.style.setProperty('display', 'none', 'important');
          }
        });
        cloned.style.position = 'relative';
        cloned.style.left = '0';
        cloned.style.top = '0';
        cloned.style.right = 'auto';
        cloned.style.bottom = 'auto';
        cloned.style.zIndex = '1';
        cloned.style.margin = '0';
        cloned.style.visibility = 'visible';
        cloned.style.opacity = '1';
        cloned.style.setProperty('--ink', inkColor);
        if (mode === 'editor') {
          cloned.style.display = 'inline-block';
          cloned.style.minWidth = `${w}px`;
          cloned.style.minHeight = `${h}px`;
        }
        cloned.style.textShadow = 'none';
        cloned.querySelectorAll('*').forEach(el => { el.style.textShadow = 'none'; });
        cloned.querySelectorAll('.katex-mathml').forEach(el => { el.style.display = 'none'; });
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
          svg.style.color = inkColor;
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