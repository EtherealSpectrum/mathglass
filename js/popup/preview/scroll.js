// Scrolling + min-height measurement + textarea scroll sync.
import { clamp } from '../../core/dom.js';
import { state } from '../settings.js';
import { previewState } from './state.js';
import { findCaretElement, getActiveCursorPos } from './caret.js';
import { buildBalancedCandidate } from './balanced.js';

let prefixMeasureEl = null;
let textareaMirrorEl = null;
let textareaMirrorKey = '';

function measurePrefixWidth(beforeRow) {
  const cleaned = beforeRow
    .replace(/\\(?:begin|end)\{[^}]*\}/g, '')
    .replace(/&/g, ' ')
    .trim();
  if (!cleaned) return 0;

  const candidate = buildBalancedCandidate(cleaned, '#888');
  if (!prefixMeasureEl) {
    prefixMeasureEl = document.createElement('div');
    prefixMeasureEl.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;pointer-events:none;contain:layout style;';
  }
  if (!prefixMeasureEl.isConnected) document.body.appendChild(prefixMeasureEl);
  const pvCs = getComputedStyle(state.preview);
  prefixMeasureEl.style.fontSize = pvCs.fontSize;
  prefixMeasureEl.style.fontFamily = pvCs.fontFamily;

  let w = 0;
  try {
    katex.render(candidate, prefixMeasureEl, { throwOnError: false, displayMode: true });
    w = prefixMeasureEl.getBoundingClientRect().width;
  } catch { }
  prefixMeasureEl.textContent = '';
  return w;
}

export function scrollToCursor() {
  if (!state.ta || !state.previewWrap || !state.preview) return;
  const raw = state.ta.value;
  const pos = clamp(getActiveCursorPos(state.ta), 0, raw.length);
  previewState.lastCursorPos = pos;

  const wrap = state.previewWrap;
  const maxX = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
  const maxY = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
  if (maxX <= 0 && maxY <= 0) {
    previewState.lastProg = { left: wrap.scrollLeft, top: wrap.scrollTop };
    return;
  }

  previewState.progScrolling = true;
  try {
    const caretEl = findCaretElement(state.preview);
    if (caretEl) {
      const wRect = wrap.getBoundingClientRect();
      const cRect = caretEl.getBoundingClientRect();
      const padY = 20;
      const padX = 36;

      if (maxY > 0 && (cRect.height > 0 || cRect.top !== 0)) {
        if (cRect.bottom > wRect.bottom - padY) {
          wrap.scrollTop = clamp(wrap.scrollTop + (cRect.bottom - wRect.bottom) + padY, 0, maxY);
        } else if (cRect.top < wRect.top + padY) {
          wrap.scrollTop = clamp(wrap.scrollTop - (wRect.top - cRect.top) - padY, 0, maxY);
        }
      }
      if (maxX > 0) {
        if (cRect.right > wRect.right - padX) {
          wrap.scrollLeft = clamp(wrap.scrollLeft + (cRect.right - wRect.right) + padX, 0, maxX);
        } else if (cRect.left < wRect.left + padX) {
          wrap.scrollLeft = clamp(wrap.scrollLeft - (wRect.left - cRect.left) - padX, 0, maxX);
        }
      }
      return;
    }

    const before = raw.slice(0, pos);
    const linesBefore = before.split('\\\\');
    const allLines = raw.split('\\\\');
    const rowIdx = linesBefore.length - 1;
    const totalRows = Math.max(1, allLines.length);

    if (maxY > 0) {
      if (pos >= raw.length) wrap.scrollTop = maxY;
      else if (pos <= 0) wrap.scrollTop = 0;
      else if (totalRows > 1) {
        const pvTop = state.preview.offsetTop;
        const pvH = Math.max(24, state.preview.offsetHeight);
        const targetY = pvTop + (rowIdx / Math.max(1, totalRows - 1)) * Math.max(0, pvH - 28);
        if (targetY < wrap.scrollTop + 20) wrap.scrollTop = clamp(targetY - 20, 0, maxY);
        else if (targetY + 28 > wrap.scrollTop + wrap.clientHeight - 20) {
          wrap.scrollTop = clamp(targetY + 28 - wrap.clientHeight + 20, 0, maxY);
        }
      }
    }

    if (maxX > 0) {
      if (pos <= 0) wrap.scrollLeft = 0;
      else if (pos >= raw.length) wrap.scrollLeft = maxX;
      else {
        const katexEl = state.preview.querySelector('.katex-display > .katex, .katex');
        const katexLeft = katexEl ? katexEl.offsetLeft : 0;
        const katexWidth = katexEl ? katexEl.offsetWidth : state.preview.scrollWidth;
        const w = measurePrefixWidth(linesBefore[linesBefore.length - 1] || '');
        const cursorX = katexLeft + clamp(w, 0, katexWidth);
        if (cursorX < wrap.scrollLeft + 32) wrap.scrollLeft = clamp(cursorX - 32, 0, maxX);
        else if (cursorX > wrap.scrollLeft + wrap.clientWidth - 48) {
          wrap.scrollLeft = clamp(cursorX - wrap.clientWidth + 48, 0, maxX);
        }
      }
    }
  } finally {
    previewState.lastProg = { left: wrap.scrollLeft, top: wrap.scrollTop };
    requestAnimationFrame(() => { previewState.progScrolling = false; });
  }
}

export function measureMinHeight() {
  requestAnimationFrame(() => {
    if (!state.preview) return;
    const h = state.preview.getBoundingClientRect().height;
    const main = document.querySelector('main');
    const cap = Math.max(150, Math.round((main?.clientHeight || innerHeight) * 0.65));
    const hasScrollbar = state.previewWrap && state.previewWrap.scrollWidth > state.previewWrap.clientWidth ? 12 : 0;
    const v = Math.max(50, Math.min(cap, Math.ceil(h + 28 + hasScrollbar)));
    if (Math.abs(previewState.minH - v) > 1) {
      previewState.minH = v;
      document.documentElement.style.setProperty('--preview-min-height', v + 'px');
      window.__reportNaturalSize?.(80);
    }
  });
}

export function ensureTextareaOffsetVisible(ta, pos) {
  if (!ta) return;
  const cs = getComputedStyle(ta);
  if (!textareaMirrorEl) {
    textareaMirrorEl = document.createElement('div');
    textareaMirrorEl.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;box-sizing:border-box;overflow:hidden;contain:layout style;';
  }
  if (!textareaMirrorEl.isConnected) document.body.appendChild(textareaMirrorEl);

  const styleKey = `${ta.clientWidth}|${cs.fontFamily}|${cs.fontSize}|${cs.fontWeight}|${cs.lineHeight}|${cs.letterSpacing}|${cs.padding}|${cs.border}`;
  if (textareaMirrorKey !== styleKey) {
    textareaMirrorKey = styleKey;
    textareaMirrorEl.style.width = ta.clientWidth + 'px';
    textareaMirrorEl.style.fontFamily = cs.fontFamily;
    textareaMirrorEl.style.fontSize = cs.fontSize;
    textareaMirrorEl.style.fontWeight = cs.fontWeight;
    textareaMirrorEl.style.lineHeight = cs.lineHeight;
    textareaMirrorEl.style.letterSpacing = cs.letterSpacing;
    textareaMirrorEl.style.padding = cs.padding;
    textareaMirrorEl.style.border = cs.border;
  }

  const val = (ta.value || '').replace(/\r\n?/g, '\n');
  const p = clamp(pos, 0, val.length);
  const before = document.createTextNode(val.slice(0, p));
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  const after = document.createTextNode(val.slice(p) || ' ');
  textareaMirrorEl.replaceChildren(before, marker, after);
  try {
    const mRect = textareaMirrorEl.getBoundingClientRect();
    const r = marker.getBoundingClientRect();
    const relTop = r.top - mRect.top;
    const padTop = parseFloat(cs.paddingTop) || 8;
    const padBottom = parseFloat(cs.paddingBottom) || 8;
    const h = Math.max(14, r.height || parseFloat(cs.fontSize) || 16);
    const maxTop = Math.max(0, ta.scrollHeight - ta.clientHeight);
    if (relTop < ta.scrollTop + padTop) {
      ta.scrollTop = clamp(relTop - padTop - 4, 0, maxTop);
    } else if (relTop + h > ta.scrollTop + ta.clientHeight - padBottom) {
      ta.scrollTop = clamp(relTop + h - ta.clientHeight + padBottom + 4, 0, maxTop);
    }
    const hl = document.querySelector('#latex-highlight');
    if (hl) {
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
    }
  } finally {
    textareaMirrorEl.textContent = '';
  }
}

export function getMinH() {
  return previewState.minH;
}