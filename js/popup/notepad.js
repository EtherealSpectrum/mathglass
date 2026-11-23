import { KEYS, MSG } from '../core/constants.js';
import { $, on, clamp, rafThrottle } from '../core/dom.js';
import { get, set, mirrorGet, mirrorSet } from '../core/storage.js';
import { translateLatexErrorToGreek } from '../core/errors.js';
import {
  computeCtrlArrowTarget,
  computeSmartLatexArrowTarget,
  computeTabJumpTarget,
  extractAllMathRangesForNav,
  findPrecedingFractionOperandStart,
  replaceRangePreservingUndo,
} from '../core/latex-nav.js';
import {
  resolveLatexOffsetAtPoint,
  caretPointFromXY,
  getTextOffsetInElement,
  applyLatexSelectionHighlight,
  clearLatexSelectionHighlight,
  applyActiveSlotHighlight,
  clearActiveSlotHighlight,
  findActiveStructuralSlot,
} from '../core/latex-click.js';
import { state } from './settings.js';
import {
  renderPartialLatexHtml,
  renderLatexWithCaret,
  findCaretElement,
  markCaretElement,
  injectLatexCaret,
  buildBalancedCandidate,
} from './preview.js';
import { wrappedCode, copyText, insertTextToPage } from './actions.js';

let notepadOpen = false;
let autoDollarWrap = true;
let notepadPreviewNavActive = false;
let pendingReaderNavScroll = false;
let lastProgWrap = { left: -1, top: -1 };
let lastProgMath = { el: null, left: -1 };
let progScrolling = false;
let lastCursorPos = -1;
let lastSelStart = -1;
let lastSelEnd = -1;
let lastRenderedSrc = null;
let lastRenderedTheme = null;
let activeMathEl = null;
const cleanMathHtmlMap = new WeakMap();
const mathHtmlCache = new Map();
const hybridTokenCache = new Map();

const POS_MARK_RE = /\uFFF0POS:(\d+)\uFFF1/g;
const CARET_MARK = '\uFFF2CARET\uFFF3';
const CARET_MARK_RE = /\uFFF2CARET\uFFF3/g;
const SEL_START_MARK = '\uFFF4SEL_S\uFFF5';
const SEL_END_MARK = '\uFFF4SEL_E\uFFF5';
const SEL_MARK_RE = /\uFFF4SEL_[SE]\uFFF5/g;

export function isNotepadOpen() { return notepadOpen; }
export function isAutoDollarWrapEnabled() { return autoDollarWrap; }

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

function isEscapedAt(str, idx) {
  let b = 0;
  for (let k = idx - 1; k >= 0 && str[k] === '\\'; k--) b++;
  return (b % 2) === 1;
}

function findMathTokenAt(src, pos) {
  const ranges = extractAllMathRangesForNav(tokenizeHybridLatex(src));
  for (const r of ranges) {
    if (pos >= r.contentStart && pos <= r.contentEnd) return r;
  }
  return null;
}

function getActiveCursorPos(ta) {
  if (!ta) return 0;
  return (ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd) ?? ta.value.length;
}

function getSelectionBounds(ta) {
  if (!ta) return { start: 0, end: 0, active: false };
  const s = ta.selectionStart ?? 0;
  const e = ta.selectionEnd ?? 0;
  const start = Math.min(s, e);
  const end = Math.max(s, e);
  return { start, end, active: end > start };
}

function notifyState() {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({
      type: MSG.PANEL_POPUP_STATE,
      settingsOpen: Boolean($('#settings-popup')?.classList.contains('active')),
      recentOpen: Boolean($('#recent-popup')?.classList.contains('active')),
      notepadOpen,
    }, '*');
  } catch { }
}

export function setNotepadOpen(open) {
  notepadOpen = Boolean(open);
  document.body.classList.toggle('notepad-open', notepadOpen);
  const btn = $('#notepad-toggle');
  if (btn) btn.classList.toggle('active', notepadOpen);
  if (notepadOpen) {
    $('#settings-popup')?.classList.remove('active');
    $('#recent-popup')?.classList.remove('active');
    renderHybridPreview(true, false);
    requestAnimationFrame(() => {
      const np = $('#notepad-input');
      try { np?.focus({ preventScroll: true }); } catch { np?.focus(); }
      window.__refreshNotepadCaret?.();
    });
  } else {
    window.__refreshNotepadCaret?.();
    requestAnimationFrame(() => { const lx = $('#latex-input'); try { lx?.focus({ preventScroll: true }); } catch { lx?.focus(); } });
  }
  notifyState();
}

export function toggleNotepad() { setNotepadOpen(!notepadOpen); }

function scanLatexChunk(chunk, baseOffset, tokens) {
  let textBuf = '';
  let textStart = baseOffset;
  let i = 0;
  const n = chunk.length;

  const flushText = endIdx => {
    if (textBuf) {
      tokens.push({ type: 'text', content: textBuf, start: textStart, end: baseOffset + endIdx });
      textBuf = '';
    }
  };

  const pushTextChar = (ch, idx) => {
    if (!textBuf) textStart = baseOffset + idx;
    textBuf += ch;
  };

  const findClosing = (start, delim) => {
    let idx = start;
    while (idx < n) {
      if (chunk[idx] === '\\' && delim !== '\\)' && delim !== '\\]' && delim !== '[/tex]' && delim !== '[/latex]') {
        idx += 2; continue;
      }
      if (delim === '[/tex]' || delim === '[/latex]') {
        if (chunk.slice(idx, idx + delim.length).toLowerCase() === delim) return idx;
      } else if (chunk.startsWith(delim, idx)) return idx;
      idx++;
    }
    return -1;
  };

  const findSingleDollarEnd = start => {
    let idx = start;
    while (idx < n) {
      if (chunk[idx] === '\\') { idx += 2; continue; }
      if (chunk[idx] === '\n' && chunk[idx + 1] === '\n') return -1;
      if (chunk[idx] === '$' && chunk[idx + 1] !== '$') return idx;
      if (chunk[idx] === '$' && chunk[idx + 1] === '$') return -1;
      idx++;
    }
    return -1;
  };

  const isOwnLine = (startIdx, endIdx) => {
    let l = startIdx - 1;
    while (l >= 0 && (chunk[l] === ' ' || chunk[l] === '\t')) l--;
    const atStart = l < 0 || chunk[l] === '\n';
    let r = endIdx;
    while (r < n && (chunk[r] === ' ' || chunk[r] === '\t')) r++;
    const atEnd = r >= n || chunk[r] === '\n' || chunk[r] === '\r';
    return atStart && atEnd;
  };

  while (i < n) {
    if (chunk[i] === '\\' && chunk[i + 1] === '$') { pushTextChar('\\$', i); i += 2; continue; }

    if (chunk[i] === '[' && chunk.slice(i, i + 5).toLowerCase() === '[tex]') {
      const end = findClosing(i + 5, '[/tex]');
      if (end !== -1) {
        flushText(i);
        const inner = chunk.slice(i + 5, end);
        const disp = isOwnLine(i, end + 6) ||
          inner.includes('\n') ||
          inner.includes('\\displaystyle') ||
          /\\begin\{(?:cases|aligned|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|matrix|array|gather|split)\}/.test(inner);
        tokens.push({
          type: 'math', display: disp, content: inner,
          openDelim: chunk.slice(i, i + 5), closeDelim: chunk.slice(end, end + 6),
          start: baseOffset + i, end: baseOffset + end + 6,
          contentStart: baseOffset + i + 5, contentEnd: baseOffset + end,
        });
        i = end + 6; continue;
      }
    }

    if (chunk[i] === '[' && chunk.slice(i, i + 7).toLowerCase() === '[latex]') {
      const end = findClosing(i + 7, '[/latex]');
      if (end !== -1) {
        flushText(i);
        tokens.push({
          type: 'math', display: true, content: chunk.slice(i + 7, end),
          openDelim: chunk.slice(i, i + 7), closeDelim: chunk.slice(end, end + 8),
          start: baseOffset + i, end: baseOffset + end + 8,
          contentStart: baseOffset + i + 7, contentEnd: baseOffset + end,
        });
        i = end + 8; continue;
      }
    }

    if (chunk[i] === '$' && chunk[i + 1] === '$') {
      const end = findClosing(i + 2, '$$');
      if (end !== -1) {
        flushText(i);
        tokens.push({
          type: 'math', display: true, content: chunk.slice(i + 2, end),
          openDelim: '$$', closeDelim: '$$',
          start: baseOffset + i, end: baseOffset + end + 2,
          contentStart: baseOffset + i + 2, contentEnd: baseOffset + end,
        });
        i = end + 2; continue;
      }
    }

    if (chunk[i] === '\\' && chunk[i + 1] === '[') {
      const end = findClosing(i + 2, '\\]');
      if (end !== -1) {
        flushText(i);
        tokens.push({
          type: 'math', display: true, content: chunk.slice(i + 2, end),
          openDelim: '\\[', closeDelim: '\\]',
          start: baseOffset + i, end: baseOffset + end + 2,
          contentStart: baseOffset + i + 2, contentEnd: baseOffset + end,
        });
        i = end + 2; continue;
      }
    }

    if (chunk[i] === '\\' && chunk[i + 1] === '(') {
      const end = findClosing(i + 2, '\\)');
      if (end !== -1) {
        flushText(i);
        tokens.push({
          type: 'math', display: false, content: chunk.slice(i + 2, end),
          openDelim: '\\(', closeDelim: '\\)',
          start: baseOffset + i, end: baseOffset + end + 2,
          contentStart: baseOffset + i + 2, contentEnd: baseOffset + end,
        });
        i = end + 2; continue;
      }
    }

    if (chunk[i] === '$' && chunk[i + 1] !== '$') {
      const end = findSingleDollarEnd(i + 1);
      if (end !== -1 && end > i + 1) {
        flushText(i);
        tokens.push({
          type: 'math', display: false, content: chunk.slice(i + 1, end),
          openDelim: '$', closeDelim: '$',
          start: baseOffset + i, end: baseOffset + end + 1,
          contentStart: baseOffset + i + 1, contentEnd: baseOffset + end,
        });
        i = end + 1; continue;
      }
    }

    pushTextChar(chunk[i], i);
    i++;
  }

  flushText(i);
}

export function tokenizeHybridLatex(input) {
  if (typeof input !== 'string') return [];
  if (hybridTokenCache.has(input)) {
    const cached = hybridTokenCache.get(input);
    hybridTokenCache.delete(input);
    hybridTokenCache.set(input, cached);
    return cached;
  }
  const tokens = [];
  const codeRe = /\[code\]([\s\S]*?)\[\/code\]/gi;
  let lastIdx = 0;
  let m;

  while ((m = codeRe.exec(input)) !== null) {
    if (m.index > lastIdx) {
      scanLatexChunk(input.slice(lastIdx, m.index), lastIdx, tokens);
    }
    tokens.push({
      type: 'code',
      content: m[1],
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
    lastIdx = m.index + m[0].length;
  }

  if (lastIdx < input.length) {
    scanLatexChunk(input.slice(lastIdx), lastIdx, tokens);
  }
  if (hybridTokenCache.size >= 16) {
    hybridTokenCache.delete(hybridTokenCache.keys().next().value);
  }
  hybridTokenCache.set(input, tokens);
  return tokens;
}

export function isCursorInsideKaTeX(input, cursorPos) {
  const pos = Math.max(0, Math.min(input.length, cursorPos));
  const tokens = tokenizeHybridLatex(input);

  for (const tok of tokens) {
    if (tok.type === 'code') {
      if (pos >= tok.start && pos <= tok.end) return false;
    } else if (tok.type === 'math') {
      if (pos >= tok.contentStart && pos <= tok.contentEnd) return true;
    }
  }

  const activeText = tokens.find(t => t.type === 'text' && pos >= t.start && pos <= t.end);
  if (!activeText) return false;

  const chunk = activeText.content;
  const localPos = pos - activeText.start;
  let i = 0;
  while (i < localPos) {
    if (chunk[i] === '\\' && chunk[i + 1] === '$') { i += 2; continue; }
    if (chunk[i] === '[' && chunk.slice(i, i + 5).toLowerCase() === '[tex]' && localPos >= i + 5) return true;
    if (chunk[i] === '[' && chunk.slice(i, i + 7).toLowerCase() === '[latex]' && localPos >= i + 7) return true;
    if (chunk[i] === '$' && chunk[i + 1] === '$' && localPos >= i + 2) return true;
    if (chunk[i] === '\\' && chunk[i + 1] === '[' && localPos >= i + 2) return true;
    if (chunk[i] === '\\' && chunk[i + 1] === '(' && localPos >= i + 2) return true;
    if (chunk[i] === '$' && chunk[i + 1] !== '$' && localPos >= i + 1 && !chunk.slice(i + 1, localPos).includes('\n\n')) return true;
    i++;
  }
  return false;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripPosMarkers(str) {
  return String(str).replace(POS_MARK_RE, '').replace(CARET_MARK_RE, '').replace(SEL_MARK_RE, '');
}

const BBCODE_SPAN_RE = /\[(?:\/?(?:b|i|u|s|quote|code|list|img|url|size|color|center|ggb|hide|table|tr|th|td)|\*)(?:=[^\]]*)?\]/gi;

function safePlainCaretOffset(rawText, localPos) {
  let pos = Math.max(0, Math.min(rawText.length, localPos));
  BBCODE_SPAN_RE.lastIndex = 0;
  let m;
  while ((m = BBCODE_SPAN_RE.exec(rawText)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (pos > start && pos < end) {
      pos = m[0].startsWith('[/') ? start : end;
      break;
    }
  }
  if (pos > 0 && pos < rawText.length && rawText[pos - 1] === '\\' && rawText[pos] === '$') {
    pos++;
  }
  return pos;
}

function annotateTextOffsets(rawText, baseOffset, localCaretOffset = null, localSel = null) {
  const safeCaret = typeof localCaretOffset === 'number' ? safePlainCaretOffset(rawText, localCaretOffset) : null;
  let safeSelStart = null;
  let safeSelEnd = null;
  if (localSel && localSel.end > localSel.start) {
    const ss = safePlainCaretOffset(rawText, localSel.start);
    const se = safePlainCaretOffset(rawText, localSel.end);
    if (se > ss) {
      safeSelStart = ss;
      safeSelEnd = se;
    }
  }
  const markBefore = new Set([0]);
  for (let i = 0; i < rawText.length; i++) {
    if (rawText[i] === '\n') markBefore.add(i + 1);
    else if (rawText[i] === '\\' && rawText[i + 1] === '$') markBefore.add(i + 2);
  }
  BBCODE_SPAN_RE.lastIndex = 0;
  let m;
  while ((m = BBCODE_SPAN_RE.exec(rawText)) !== null) {
    markBefore.add(m.index + m[0].length);
  }

  let out = '';
  for (let i = 0; i <= rawText.length; i++) {
    if (safeSelEnd === i) out += SEL_END_MARK;
    if (markBefore.has(i)) out += `\uFFF0POS:${baseOffset + i}\uFFF1`;
    if (safeCaret === i) out += CARET_MARK;
    if (safeSelStart === i) out += SEL_START_MARK;
    if (i < rawText.length) out += rawText[i];
  }
  return out;
}

function safeColorValue(raw) {
  const clean = stripPosMarkers(raw).trim();
  if (/^(?:#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i.test(clean)) {
    return clean;
  }
  return '';
}

function replaceNestedTag(html, openRe, renderFn) {
  let out = html;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    out = out.replace(openRe, (...args) => {
      changed = true;
      return renderFn(...args);
    });
    if (!changed) break;
  }
  return out;
}

function renderSingleMathInner(rawMath, displayMode, isLight, cursorOffset = null) {
  const inner = rawMath.trim();
  if (!inner) return '';

  if (typeof cursorOffset === 'number') {
    const res = renderLatexWithCaret(rawMath, cursorOffset, false, displayMode, isLight);
    if (res.ok) return res.html;
    const errTitle = escHtml(translateLatexErrorToGreek(res.error));
    return `<span class="np-math-error" title="${errTitle}">${res.html}</span>`;
  }

  const cacheKey = `${displayMode ? '1' : '0'}:${isLight ? 'L' : 'D'}:${inner}`;
  const cached = mathHtmlCache.get(cacheKey);
  if (typeof cached === 'string') return cached;

  let html;
  try {
    html = katex.renderToString(inner, {
      throwOnError: true,
      displayMode,
    });
  } catch (err) {
    const errTitle = escHtml(translateLatexErrorToGreek(err));
    const partial = renderPartialLatexHtml(inner, err, false, displayMode, isLight);
    html = `<span class="np-math-error" title="${errTitle}">${partial}</span>`;
  }
  if (mathHtmlCache.size > 250) {
    const oldest = mathHtmlCache.keys().next().value;
    mathHtmlCache.delete(oldest);
  }
  mathHtmlCache.set(cacheKey, html);
  return html;
}

export function renderPhpbbHtml(input, isLight, options = {}) {
  const { trackCursor = false, caretOffset = null, selection = null } = options;
  const hasSelection = Boolean(selection && selection.end > selection.start);
  const tokens = tokenizeHybridLatex(input);
  const slots = [];
  let combined = '';

  for (const tok of tokens) {
    if (tok.type === 'code') {
      const idx = slots.length;
      const trimmed = tok.content.trim();
      let codeInnerHtml = escHtml(trimmed);
      if (hasSelection && selection.start < tok.end && selection.end > tok.start) {
        const leadWs = tok.content.length - tok.content.trimStart().length;
        const cs = clamp(selection.start - (tok.start + 6) - leadWs, 0, trimmed.length);
        const ce = clamp(selection.end - (tok.start + 6) - leadWs, 0, trimmed.length);
        if (ce > cs) {
          codeInnerHtml = escHtml(trimmed.slice(0, cs)) + SEL_START_MARK + escHtml(trimmed.slice(cs, ce)) + SEL_END_MARK + escHtml(trimmed.slice(ce));
        }
      } else if (trackCursor && typeof caretOffset === 'number' && caretOffset >= tok.start && caretOffset <= tok.end) {
        const leadWs = tok.content.length - tok.content.trimStart().length;
        const innerCaret = clamp(caretOffset - (tok.start + 6) - leadWs, 0, trimmed.length);
        codeInnerHtml = escHtml(trimmed.slice(0, innerCaret)) + CARET_MARK + escHtml(trimmed.slice(innerCaret));
      }
      slots.push(`<pre class="phpbb-code" data-np-start="${tok.start}" data-np-end="${tok.end}">${codeInnerHtml}</pre>`);
      combined += `@@NP_SLOT_${idx}@@`;
    } else if (tok.type === 'text') {
      const localCaret = (!hasSelection && trackCursor && typeof caretOffset === 'number' && caretOffset >= tok.start && caretOffset <= tok.end)
        ? (caretOffset - tok.start)
        : null;
      const localSel = (hasSelection && selection.start < tok.end && selection.end > tok.start)
        ? {
          start: clamp(selection.start - tok.start, 0, tok.content.length),
          end: clamp(selection.end - tok.start, 0, tok.content.length),
        }
        : null;
      const textWithMarkers = (trackCursor || localSel)
        ? annotateTextOffsets(tok.content, tok.start, localCaret, localSel)
        : tok.content;
      combined += escHtml(textWithMarkers.replace(/\\\$/g, '$'));
    } else {
      const idx = slots.length;
      const inner = tok.content.trim();
      const rendered = inner
        ? renderSingleMathInner(tok.content, tok.display, isLight, null)
        : escHtml((tok.openDelim || '$') + (tok.closeDelim || '$'));

      const attrs = `data-np-start="${tok.start}" data-np-end="${tok.end}" data-np-cstart="${tok.contentStart}" data-np-cend="${tok.contentEnd}" data-np-display="${tok.display ? '1' : '0'}"`;
      slots.push(
        tok.display
          ? `<div class="np-math-display" ${attrs}>${rendered}</div>`
          : `<span class="np-math-inline" ${attrs}>${rendered}</span>`
      );
      combined += `@@NP_SLOT_${idx}@@`;
    }
  }

  let html = combined;

  html = replaceNestedTag(html, /\[b\]((?:(?!\[b\])[\s\S])*?)\[\/b\]/gi, (_, inner) => `<strong>${inner}</strong>`);
  html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
  html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
  html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
  html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>');
  html = html.replace(/\[center\]([\s\S]*?)\[\/center\]/gi, (_, inner) => `<div class="phpbb-center" style="text-align:center;">${inner.trim()}</div>`);

  for (let pass = 0; pass < 4; pass++) {
    html = html.replace(/\[size=(\d{2,3})\]([\s\S]*?)\[\/size\]/gi, (_, sz, inner) => {
      const pct = Math.max(60, Math.min(250, parseInt(sz, 10) || 100));
      return `<span style="font-size:${pct}%;line-height:1.35;">${inner}</span>`;
    });
    html = html.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, (_, col, inner) => {
      const safe = safeColorValue(col);
      return safe ? `<span style="color:${safe};">${inner}</span>` : inner;
    });
  }

  html = html.replace(/\[url=((?:https?:\/\/|mailto:)[^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) => {
    const cleanHref = stripPosMarkers(href).trim();
    return `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  html = html.replace(/\[url\]((?:https?:\/\/|mailto:)[^\[]+)\[\/url\]/gi, (_, href) => {
    const hadCaret = CARET_MARK_RE.test(href);
    CARET_MARK_RE.lastIndex = 0;
    const hadSelStart = href.includes(SEL_START_MARK);
    const hadSelEnd = href.includes(SEL_END_MARK);
    const cleanHref = stripPosMarkers(href).trim();
    return `${hadSelStart ? SEL_START_MARK : ''}<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${cleanHref}</a>${hadSelEnd ? SEL_END_MARK : ''}${hadCaret ? CARET_MARK : ''}`;
  });
  html = html.replace(/\[img\](https?:\/\/[^\[]+)\[\/img\]/gi, (_, src) => {
    const hadCaret = CARET_MARK_RE.test(src);
    CARET_MARK_RE.lastIndex = 0;
    const hadSelStart = src.includes(SEL_START_MARK);
    const hadSelEnd = src.includes(SEL_END_MARK);
    const cleanSrc = stripPosMarkers(src).trim();
    return `${hadSelStart ? SEL_START_MARK : ''}<img src="${cleanSrc}" alt="Εικόνα phpBB" loading="lazy">${hadSelEnd ? SEL_END_MARK : ''}${hadCaret ? CARET_MARK : ''}`;
  });
  html = html.replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => {
    const hadCaret = CARET_MARK_RE.test(id);
    CARET_MARK_RE.lastIndex = 0;
    const hadSelStart = id.includes(SEL_START_MARK);
    const hadSelEnd = id.includes(SEL_END_MARK);
    return `${hadSelStart ? SEL_START_MARK : ''}<div class="phpbb-ggb">📐 GeoGebra: <b>${stripPosMarkers(id).trim()}</b></div>${hadSelEnd ? SEL_END_MARK : ''}${hadCaret ? CARET_MARK : ''}`;
  });

  html = replaceNestedTag(
    html,
    /\[hide(?:=&quot;([^&]*)&quot;|=([^\]]*))?\]((?:(?!\[hide(?:\b|=|\]))[\s\S])*?)\[\/hide\]/gi,
    (_m, q1, q2, inner) => {
      const title = stripPosMarkers(q1 || q2 || 'Κρυφό περιεχόμενο (κλικ)');
      return `<details class="phpbb-hide"><summary>${title}</summary><div class="phpbb-hide-body">${inner.trim()}</div></details>`;
    }
  );
  html = html.replace(/\[hide(?:=&quot;([^&]*)&quot;|=([^\]]*))?\]([\s\S]*?)\[\/hide\]/gi, (_, q1, q2, inner) => {
    const title = stripPosMarkers(q1 || q2 || 'Κρυφό περιεχόμενο (κλικ)');
    return `<details class="phpbb-hide"><summary>${title}</summary><div class="phpbb-hide-body">${inner.trim()}</div></details>`;
  });

  html = replaceNestedTag(
    html,
    /\[quote(?:=&quot;([^&]*)&quot;|=([^\]]*))?\]((?:(?!\[quote(?:\b|=|\]))[\s\S])*?)\[\/quote\]/gi,
    (_m, q1, q2, inner) => {
      const author = stripPosMarkers(q1 || q2 || '');
      const head = author ? `<div style="font-size:0.85em;font-weight:700;margin-bottom:3px;">${author} έγραψε:</div>` : '';
      return `<blockquote class="phpbb-quote">${head}${inner.trim()}</blockquote>`;
    }
  );
  html = html.replace(/\[quote(?:=&quot;([^&]*)&quot;|=([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi, (_, q1, q2, inner) => {
    const author = stripPosMarkers(q1 || q2 || '');
    const head = author ? `<div style="font-size:0.85em;font-weight:700;margin-bottom:3px;">${author} έγραψε:</div>` : '';
    return `<blockquote class="phpbb-quote">${head}${inner.trim()}</blockquote>`;
  });

  html = html.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, inner) => {
    let clean = inner
      .replace(/\[tr\]/gi, '<tr>').replace(/\[\/tr\]/gi, '</tr>')
      .replace(/\[th\]/gi, '<th>').replace(/\[\/th\]/gi, '</th>')
      .replace(/\[td\]/gi, '<td>').replace(/\[\/td\]/gi, '</td>');
    let leadSel = '';
    clean = clean.replace(/^(?:\uFFF0POS:\d+\uFFF1|\uFFF2CARET\uFFF3|\uFFF4SEL_[SE]\uFFF5|\s)+(?=<tr)/i, m => {
      const selMarks = m.match(SEL_MARK_RE);
      if (selMarks) leadSel += selMarks.join('');
      return '';
    });
    clean = clean.replace(/(<\/?(?:tr|table)[^>]*>)(\s*(?:\uFFF0POS:\d+\uFFF1|\uFFF2CARET\uFFF3|\uFFF4SEL_[SE]\uFFF5|\s)+)(?=<\/?(?:tr|th|td|table))/gi, (_m, tag, between) => {
      const selMarks = between.match(SEL_MARK_RE);
      return tag + (selMarks ? selMarks.join('') : '');
    });
    clean = clean.replace(/(<\/tr>)((?:\uFFF4SEL_[SE]\uFFF5)+)(<tr>)/gi, '$1$3$2');
    clean = clean.replace(/(<tr>)((?:\uFFF4SEL_[SE]\uFFF5)+)(<(?:td|th)>)/gi, '$1$3$2');
    let trailSel = '';
    clean = clean.replace(/(<\/tr>)((?:\uFFF4SEL_[SE]\uFFF5)+)$/i, (_m, tag, marks) => {
      trailSel = marks;
      return tag;
    });
    return `${leadSel}<table class="phpbb-table">${clean}</table>${trailSel}`;
  });

  html = html.replace(/\[list(=1|=a|=i)?\]([\s\S]*?)\[\/list\]/gi, (_, listType, inner) => {
    const tag = listType ? 'ol' : 'ul';
    const typeAttr = listType === '=a' ? ' type="a"' : listType === '=i' ? ' type="i"' : '';
    const chunks = inner.split(/\[\*\]/i);
    let itemsHtml = '';
    let leadSel = '';
    let trailSel = '';
    if (chunks.length > 1) {
      const preMarks = chunks[0].match(SEL_MARK_RE);
      if (preMarks) leadSel = preMarks.join('');
      const validChunks = [];
      for (const rawC of chunks.slice(1)) {
        const c = rawC.trim();
        if (stripPosMarkers(c).length > 0 || c.includes('\uFFF0POS:') || c.includes(CARET_MARK)) {
          validChunks.push(c);
        } else {
          const stray = c.match(SEL_MARK_RE);
          if (stray) trailSel += stray.join('');
        }
      }
      itemsHtml = validChunks.map(p => `<li>${p}</li>`).join('');
    } else {
      itemsHtml = `<li>${inner.trim()}</li>`;
    }
    return `${leadSel}<${tag}${typeAttr}>${itemsHtml}</${tag}>${trailSel}`;
  });

  html = html.replace(/@@NP_SLOT_(\d+)@@/g, (_, idx) => slots[Number(idx)] || '');

  html = html.replace(/\r?\n(?=(?:\uFFF0POS:\d+\uFFF1|\uFFF2CARET\uFFF3|\uFFF4SEL_[SE]\uFFF5)*<(?:div class="(?:np-math-display|phpbb-ggb|phpbb-center)"|blockquote\b|pre class="phpbb-code"|details class="phpbb-hide"|ul\b|ol\b|table class="phpbb-table"))/g, '');
  html = html.replace(/(<\/(?:div|blockquote|pre|details|ul|ol|table)>(?:\uFFF0POS:\d+\uFFF1|\uFFF2CARET\uFFF3|\uFFF4SEL_[SE]\uFFF5)*)(?:\r?\n)/g, '$1');

  if (trackCursor) {
    html = html.replace(POS_MARK_RE, '<span class="np-pos" data-pos="$1" aria-hidden="true"></span>');
    html = html.replace(CARET_MARK_RE, !hasSelection && typeof caretOffset === 'number' ? '<span class="mg-np-text-caret" aria-hidden="true"></span>' : '');
  } else {
    html = html.replace(POS_MARK_RE, '');
    html = html.replace(CARET_MARK_RE, '');
  }

  if (hasSelection) {
    html = html
      .replace(/\uFFF4SEL_S\uFFF5/g, '<span class="np-sel-start" aria-hidden="true"></span>')
      .replace(/\uFFF4SEL_E\uFFF5/g, '<span class="np-sel-end" aria-hidden="true"></span>');
  } else {
    html = html.replace(SEL_MARK_RE, '');
  }

  return html;
}

function applyPlainSelectionHighlight(previewEl) {
  if (!previewEl) return;
  const starts = previewEl.querySelectorAll('.np-sel-start');
  const ends = previewEl.querySelectorAll('.np-sel-end');
  if (!starts.length && !ends.length) return;

  let inSel = false;
  const textNodesToWrap = [];

  const walk = node => {
    if (!node) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      if (el.classList.contains('np-sel-start')) { inSel = true; return; }
      if (el.classList.contains('np-sel-end')) { inSel = false; return; }
      if (
        el.classList.contains('np-math-display') ||
        el.classList.contains('np-math-inline') ||
        el.classList.contains('katex-mathml') ||
        el.classList.contains('mg-sel-overlay') ||
        el.classList.contains('mg-np-text-caret') ||
        el.classList.contains('np-pos')
      ) {
        return;
      }
      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i]);
      }
      return;
    }
    if (node.nodeType === Node.TEXT_NODE && inSel && node.nodeValue.length > 0) {
      textNodesToWrap.push(node);
    }
  };

  walk(previewEl);

  for (const tn of textNodesToWrap) {
    const mark = document.createElement('mark');
    mark.className = 'mg-np-sel';
    tn.parentNode?.replaceChild(mark, tn);
    mark.appendChild(tn);
  }
  starts.forEach(el => el.remove());
  ends.forEach(el => el.remove());
}

function findBestPosAnchor(previewEl, cursorPos) {
  const anchors = previewEl.querySelectorAll('.np-pos[data-pos]');
  if (!anchors.length) return null;
  let best = anchors[0];
  let bestVal = -1;
  for (const el of anchors) {
    const val = Number(el.getAttribute('data-pos'));
    if (Number.isNaN(val)) continue;
    if (val <= cursorPos && val >= bestVal) {
      best = el;
      bestVal = val;
    } else if (val > cursorPos) {
      break;
    }
  }
  return best;
}

function resolvePlainClickOffset(previewEl, src, clickX, clickY, clickTarget) {
  if (!previewEl || !src) return 0;

  const preEl = clickTarget?.closest?.('pre.phpbb-code[data-np-start][data-np-end]');
  if (preEl && previewEl.contains(preEl)) {
    const tokStart = Number(preEl.getAttribute('data-np-start'));
    const tokEnd = Number(preEl.getAttribute('data-np-end'));
    const rawInner = src.slice(tokStart + 6, tokEnd - 7);
    const leadWs = rawInner.length - rawInner.trimStart().length;
    const cp = caretPointFromXY(clickX, clickY);
    const charOff = (cp && preEl.contains(cp.node))
      ? getTextOffsetInElement(preEl, cp.node, cp.offset)
      : rawInner.trim().length;
    return clamp(tokStart + 6 + leadWs + charOff, tokStart, tokEnd);
  }

  let cp = caretPointFromXY(clickX, clickY);
  if (!cp || !previewEl.contains(cp.node)) {
    const pRect = previewEl.getBoundingClientRect();
    if (pRect.width > 4 && clickY >= pRect.top && clickY <= pRect.bottom) {
      const clampedX = clamp(clickX, pRect.left + 2, pRect.right - 2);
      const retry = caretPointFromXY(clampedX, clickY);
      if (retry && previewEl.contains(retry.node)) cp = retry;
    }
  }
  if (!cp || !previewEl.contains(cp.node)) {
    const lastEl = previewEl.lastElementChild;
    if (lastEl && clickY > lastEl.getBoundingClientRect().bottom) return src.length;
    return src.length;
  }

  let basePos = 0;
  let delta = '';
  let done = false;
  let fixedResult = null;

  const walk = node => {
    if (done || !node) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      if (el.classList.contains('mg-np-text-caret')) return;
      if (el.classList.contains('np-pos')) {
        const p = Number(el.getAttribute('data-pos'));
        if (!Number.isNaN(p)) {
          basePos = p;
          delta = '';
        }
        if (el === cp.node) done = true;
        return;
      }
      if (
        el.classList.contains('np-math-display') ||
        el.classList.contains('np-math-inline') ||
        el.classList.contains('phpbb-code')
      ) {
        const endAttr = Number(el.getAttribute('data-np-end'));
        if (el === cp.node || el.contains(cp.node)) {
          if (!Number.isNaN(endAttr)) fixedResult = endAttr;
          done = true;
          return;
        }
        if (!Number.isNaN(endAttr)) {
          basePos = endAttr;
          delta = '';
        }
        return;
      }

      if (el === cp.node) {
        const lim = Math.min(cp.offset, el.childNodes.length);
        for (let i = 0; i < lim && !done; i++) {
          walk(el.childNodes[i]);
        }
        done = true;
        return;
      }

      for (let i = 0; i < el.childNodes.length && !done; i++) {
        walk(el.childNodes[i]);
      }
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      if (node === cp.node) {
        delta += node.nodeValue.slice(0, cp.offset);
        done = true;
      } else {
        delta += node.nodeValue;
      }
    }
  };

  walk(previewEl);
  if (typeof fixedResult === 'number') {
    return clamp(fixedResult, 0, src.length);
  }

  let si = clamp(basePos, 0, src.length);
  for (let ri = 0; ri < delta.length && si < src.length; ri++) {
    const ch = delta[ri];
    if (src.slice(si, si + 2) === '\\$' && ch === '$') {
      si += 2;
    } else if (src[si] === ch) {
      si += 1;
    } else if (/\s/.test(src[si])) {
      let k = si;
      while (k < src.length && k - si < 12 && /\s/.test(src[k]) && src[k] !== ch) k++;
      if (src[k] === ch) si = k + 1;
      else si += 1;
    } else {
      si += 1;
    }
  }
  return clamp(si, 0, src.length);
}

function scrollRectIntoWrap(previewWrap, rect, padX = 28, padY = 18) {
  if (!rect || (rect.height === 0 && rect.top === 0 && rect.bottom === 0)) return;
  const wRect = previewWrap.getBoundingClientRect();
  const maxY = Math.max(0, previewWrap.scrollHeight - previewWrap.clientHeight);
  const maxX = Math.max(0, previewWrap.scrollWidth - previewWrap.clientWidth);

  if (maxY > 0) {
    if (rect.bottom > wRect.bottom - padY) {
      previewWrap.scrollTop = clamp(previewWrap.scrollTop + (rect.bottom - wRect.bottom) + padY, 0, maxY);
    } else if (rect.top < wRect.top + padY) {
      previewWrap.scrollTop = clamp(previewWrap.scrollTop - (wRect.top - rect.top) - padY, 0, maxY);
    }
  }
  if (maxX > 0) {
    if (rect.right > wRect.right - padX) {
      previewWrap.scrollLeft = clamp(previewWrap.scrollLeft + (rect.right - wRect.right) + padX, 0, maxX);
    } else if (rect.left < wRect.left + padX) {
      previewWrap.scrollLeft = clamp(previewWrap.scrollLeft - (wRect.left - rect.left) - padX, 0, maxX);
    }
  }
}

function restoreActiveMathBlock() {
  if (activeMathEl && activeMathEl.isConnected) {
    activeMathEl.classList.remove('np-math-active');
    clearActiveSlotHighlight(activeMathEl);
    delete activeMathEl.dataset.npSrc;
    delete activeMathEl.dataset.npTheme;
    const clean = cleanMathHtmlMap.get(activeMathEl);
    if (typeof clean === 'string') {
      activeMathEl.innerHTML = clean;
    }
  }
  activeMathEl = null;
}

function findMatchedMathBlock(previewEl, cursorPos) {
  const blocks = previewEl.querySelectorAll('[data-np-cstart][data-np-cend]');
  for (const b of blocks) {
    if (b.classList.contains('phpbb-code')) continue;
    const cs = Number(b.getAttribute('data-np-cstart'));
    const ce = Number(b.getAttribute('data-np-cend'));
    if (cursorPos >= cs && cursorPos <= ce) return b;
  }
  return null;
}

function updateNotepadCursorTracking(shouldScroll = false) {
  const inputEl = $('#notepad-input');
  const previewWrap = $('#notepad-preview-wrap');
  const previewEl = $('#notepad-preview');
  if (!inputEl || !previewWrap || !previewEl) return;

  const src = inputEl.value;
  const cursorPos = getActiveCursorPos(inputEl);
  const sel = getSelectionBounds(inputEl);
  lastCursorPos = cursorPos;
  lastSelStart = sel.start;
  lastSelEnd = sel.end;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const prevWrapLeft = previewWrap.scrollLeft;
  const prevWrapTop = previewWrap.scrollTop;

  if (!src.trim()) {
    restoreActiveMathBlock();
    previewEl.querySelectorAll('.mg-np-math-selected').forEach(el => el.classList.remove('mg-np-math-selected'));
    clearLatexSelectionHighlight(previewEl);
    clearActiveSlotHighlight(previewEl);
    lastProgWrap = { left: prevWrapLeft, top: prevWrapTop };
    return;
  }

  previewEl.querySelectorAll('.mg-np-math-selected').forEach(el => el.classList.remove('mg-np-math-selected'));

  if (sel.active) {
    restoreActiveMathBlock();
    clearActiveSlotHighlight(previewEl);
    previewEl.querySelectorAll('.mg-np-text-caret').forEach(el => el.remove());

    const mathBlocks = previewEl.querySelectorAll('.np-math-display[data-np-start][data-np-end], .np-math-inline[data-np-start][data-np-end]');
    for (const b of mathBlocks) {
      const tokStart = Number(b.getAttribute('data-np-start'));
      const tokEnd = Number(b.getAttribute('data-np-end'));
      const cs = Number(b.getAttribute('data-np-cstart'));
      const ce = Number(b.getAttribute('data-np-cend'));
      const disp = b.getAttribute('data-np-display') === '1';

      if (sel.start <= tokStart && sel.end >= tokEnd) {
        clearLatexSelectionHighlight(b);
        b.classList.add('mg-np-math-selected');
      } else if (sel.start <= cs && sel.end >= ce && ce > cs) {
        clearLatexSelectionHighlight(b);
        b.classList.add('mg-np-math-selected');
      } else if (sel.start < ce && sel.end > cs) {
        const rawMath = src.slice(cs, ce);
        if (rawMath.trim()) {
          applyLatexSelectionHighlight(
            rawMath,
            Math.max(0, sel.start - cs),
            Math.min(ce - cs, sel.end - cs),
            b,
            { displayMode: disp, alignLeft: false, buildBalancedCandidate }
          );
        }
      } else {
        clearLatexSelectionHighlight(b);
      }
    }

    const inReaderOnly = document.body.classList.contains('notepad-reader-mode') && !document.body.classList.contains('notepad-reader-edit');
    if (!shouldScroll || state.notepadUserScrolled || inReaderOnly) {
      progScrolling = true;
      previewWrap.scrollLeft = prevWrapLeft;
      previewWrap.scrollTop = prevWrapTop;
      lastProgWrap = { left: previewWrap.scrollLeft, top: previewWrap.scrollTop };
      requestAnimationFrame(() => { progScrolling = false; });
    }
    return;
  }

  clearLatexSelectionHighlight(previewEl);

  let matchedMath = null;
  let matchedCode = null;
  const blocks = previewEl.querySelectorAll('[data-np-start][data-np-end]');
  for (const b of blocks) {
    if (b.classList.contains('phpbb-code')) {
      const s = Number(b.getAttribute('data-np-start'));
      const e = Number(b.getAttribute('data-np-end'));
      if (cursorPos >= s && cursorPos <= e) { matchedCode = b; break; }
    } else {
      const cs = Number(b.getAttribute('data-np-cstart'));
      const ce = Number(b.getAttribute('data-np-cend'));
      if (cursorPos >= cs && cursorPos <= ce) { matchedMath = b; break; }
    }
  }

  if (activeMathEl && activeMathEl !== matchedMath) {
    restoreActiveMathBlock();
  }

  let caretEl = null;
  if (matchedMath) {
    previewEl.querySelectorAll('.mg-np-text-caret').forEach(el => el.remove());
    const cs = Number(matchedMath.getAttribute('data-np-cstart'));
    const ce = Number(matchedMath.getAttribute('data-np-cend'));
    const rawMath = src.slice(cs, ce);
    const prevMathLeft = matchedMath.scrollLeft;
    if (rawMath.trim()) {
      if (!cleanMathHtmlMap.has(matchedMath)) {
        cleanMathHtmlMap.set(matchedMath, matchedMath.innerHTML);
      }
      const disp = matchedMath.getAttribute('data-np-display') === '1';
      const showPreviewCaret = state.previewCaretEnabled !== false;
      const themeTag = isLight ? 'L' : 'D';
      const canSkipInnerRender = !showPreviewCaret
        && matchedMath === activeMathEl
        && matchedMath.dataset.npSrc === rawMath
        && matchedMath.dataset.npTheme === themeTag;
      if (!canSkipInnerRender) {
        matchedMath.innerHTML = renderSingleMathInner(rawMath, disp, isLight, showPreviewCaret ? (cursorPos - cs) : null);
        matchedMath.dataset.npSrc = rawMath;
        matchedMath.dataset.npTheme = themeTag;
      }
      caretEl = showPreviewCaret ? markCaretElement(matchedMath) : null;
      if (state.slotHintsEnabled !== false) {
        applyActiveSlotHighlight(rawMath, cursorPos - cs, matchedMath, {
          displayMode: disp,
          alignLeft: false,
          buildBalancedCandidate,
          injectLatexCaret,
        });
      } else {
        clearActiveSlotHighlight(matchedMath);
      }
    } else {
      clearActiveSlotHighlight(matchedMath);
    }
    matchedMath.classList.add('np-math-active');
    activeMathEl = matchedMath;
    if (!shouldScroll) {
      progScrolling = true;
      matchedMath.scrollLeft = prevMathLeft;
      lastProgMath = { el: matchedMath, left: matchedMath.scrollLeft };
      requestAnimationFrame(() => { progScrolling = false; });
    }
  }

  const inReaderOnly = document.body.classList.contains('notepad-reader-mode') && !document.body.classList.contains('notepad-reader-edit');
  if (!shouldScroll || !state.previewFollowEnabled || state.notepadUserScrolled || inReaderOnly) {
    progScrolling = true;
    previewWrap.scrollLeft = prevWrapLeft;
    previewWrap.scrollTop = prevWrapTop;
    lastProgWrap = { left: previewWrap.scrollLeft, top: previewWrap.scrollTop };
    requestAnimationFrame(() => { progScrolling = false; });
    return;
  }

  progScrolling = true;
  try {
    if (matchedMath) {
      let det = matchedMath.closest('details.phpbb-hide');
      while (det) {
        det.open = true;
        det = det.parentElement?.closest('details.phpbb-hide');
      }

      if (caretEl) {
        if (matchedMath.classList.contains('np-math-display') && matchedMath.scrollWidth > matchedMath.clientWidth) {
          const bRect = matchedMath.getBoundingClientRect();
          const cRect = caretEl.getBoundingClientRect();
          const maxMathX = Math.max(0, matchedMath.scrollWidth - matchedMath.clientWidth);
          if (cRect.right > bRect.right - 32) {
            matchedMath.scrollLeft = clamp(matchedMath.scrollLeft + (cRect.right - bRect.right) + 48, 0, maxMathX);
          } else if (cRect.left < bRect.left + 32) {
            matchedMath.scrollLeft = clamp(matchedMath.scrollLeft - (bRect.left - cRect.left) - 48, 0, maxMathX);
          }
          lastProgMath = { el: matchedMath, left: matchedMath.scrollLeft };
        }
        scrollRectIntoWrap(previewWrap, caretEl.getBoundingClientRect(), 32, 20);
      } else {
        scrollRectIntoWrap(previewWrap, matchedMath.getBoundingClientRect(), 24, 18);
      }
      return;
    }

    if (matchedCode) {
      let det = matchedCode.closest('details.phpbb-hide');
      while (det) {
        det.open = true;
        det = det.parentElement?.closest('details.phpbb-hide');
      }
      const textCaret = matchedCode.querySelector('.mg-np-text-caret');
      scrollRectIntoWrap(previewWrap, (textCaret || matchedCode).getBoundingClientRect(), 24, 18);
      return;
    }

    const textCaret = previewEl.querySelector('.mg-np-text-caret');
    if (textCaret) {
      let det = textCaret.closest('.phpbb-hide-body')?.closest('details.phpbb-hide');
      while (det) {
        det.open = true;
        det = det.parentElement?.closest('details.phpbb-hide');
      }
      if (!src.slice(cursorPos).trim() && previewWrap.scrollHeight > previewWrap.clientHeight) {
        previewWrap.scrollTop = previewWrap.scrollHeight;
      } else {
        scrollRectIntoWrap(previewWrap, textCaret.getBoundingClientRect(), 24, 18);
      }
      return;
    }

    const posAnchor = findBestPosAnchor(previewEl, cursorPos);
    if (posAnchor) {
      let det = posAnchor.closest('.phpbb-hide-body')?.closest('details.phpbb-hide');
      while (det) {
        det.open = true;
        det = det.parentElement?.closest('details.phpbb-hide');
      }

      if (!src.slice(cursorPos).trim() && previewWrap.scrollHeight > previewWrap.clientHeight) {
        previewWrap.scrollTop = previewWrap.scrollHeight;
      } else {
        scrollRectIntoWrap(previewWrap, posAnchor.getBoundingClientRect(), 24, 18);
      }
    }
  } finally {
    lastProgWrap = { left: previewWrap.scrollLeft, top: previewWrap.scrollTop };
    requestAnimationFrame(() => { progScrolling = false; });
  }
}

export function renderHybridPreview(force = false, shouldScroll = false) {
  const inputEl = $('#notepad-input');
  const previewEl = $('#notepad-preview');
  const previewWrap = $('#notepad-preview-wrap');
  if (!inputEl || !previewEl) return;

  const src = inputEl.value;
  const cursorPos = getActiveCursorPos(inputEl);
  const sel = getSelectionBounds(inputEl);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const follow = Boolean(shouldScroll) && Boolean(state.previewFollowEnabled) && !state.notepadUserScrolled;
  const prevWrapLeft = previewWrap ? previewWrap.scrollLeft : 0;
  const prevWrapTop = previewWrap ? previewWrap.scrollTop : 0;

  if (!force && src === lastRenderedSrc && isLight === lastRenderedTheme && sel.start === lastSelStart && sel.end === lastSelEnd) {
    updateNotepadCursorTracking(follow);
    return;
  }

  lastRenderedSrc = src;
  lastRenderedTheme = isLight;
  lastSelStart = sel.start;
  lastSelEnd = sel.end;
  activeMathEl = null;

  const openSummaries = new Set();
  previewEl.querySelectorAll('details.phpbb-hide[open] > summary').forEach((sum, idx) => {
    openSummaries.add(`${idx}:${sum.textContent}`);
  });

  progScrolling = true;
  try {
    const showPreviewCaret = state.previewCaretEnabled !== false;
    if (!src.trim()) {
      const inReaderEdit = document.body.classList.contains('notepad-reader-mode') && document.body.classList.contains('notepad-reader-edit');
      previewEl.innerHTML = (inReaderEdit && showPreviewCaret ? '<span class="mg-np-text-caret" aria-hidden="true"></span>' : '') +
        '<span class="np-placeholder">Η υβριδική προεπισκόπηση (phpBB + KaTeX) θα εμφανιστεί εδώ…</span>';
    } else {
      previewEl.innerHTML = renderPhpbbHtml(src, isLight, {
        trackCursor: !sel.active,
        caretOffset: (!sel.active && showPreviewCaret) ? cursorPos : null,
        selection: sel.active ? { start: sel.start, end: sel.end } : null,
      });
      if (sel.active) {
        applyPlainSelectionHighlight(previewEl);
      }
      if (openSummaries.size) {
        previewEl.querySelectorAll('details.phpbb-hide > summary').forEach((sum, idx) => {
          if (openSummaries.has(`${idx}:${sum.textContent}`)) {
            sum.parentElement.open = true;
          }
        });
      }
    }
    if (previewWrap && !follow) {
      previewWrap.scrollLeft = prevWrapLeft;
      previewWrap.scrollTop = prevWrapTop;
    }
  } finally {
    if (previewWrap) lastProgWrap = { left: previewWrap.scrollLeft, top: previewWrap.scrollTop };
    requestAnimationFrame(() => { progScrolling = false; });
  }

  window.__refreshNotepadCounter?.();

  requestAnimationFrame(() => updateNotepadCursorTracking(follow));
}

function wrapInNotepad(before, after, fallback = '') {
  const ta = $('#notepad-input');
  if (!ta) return;
  try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd ?? ta.value.length;
  const sel = ta.value.slice(s, e);
  const inner = sel || fallback;
  const text = before + inner + after;
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { }
  if (!ok) ta.setRangeText(text, s, e, 'preserve');
  if (!sel && after) {
    ta.setSelectionRange(s + before.length, s + before.length + fallback.length);
  } else {
    ta.setSelectionRange(s + text.length, s + text.length);
  }
  const follow = Boolean(state.previewFollowEnabled);
  if (follow) state.notepadUserScrolled = false;
  renderHybridPreview(true, follow);
  window.__refreshSyntaxHighlight?.();
  window.__refreshNotepadCaret?.();
  set(KEYS.notepadText, ta.value);
}

function clearBbcode(input) {
  return input
    .replace(/\[\/?(?:b|i|u|s|quote|code|list|img|url|size|color|center|ggb|hide|table|tr|th|td)(?:=[^\]]*)?\]/gi, '')
    .replace(/\[\*\]\s*/g, '• ')
    .replace(/^#{1,6}\s+/gm, '');
}

export function init(ac) {
  const sig = ac.signal;
  const ta = $('#notepad-input');
  const pvOuter = $('#notepad-preview-outer');
  const previewWrap = $('#notepad-preview-wrap');
  const previewEl = $('#notepad-preview');
  const rz = $('#notepad-resizer');
  if (!ta || !pvOuter) return;

  window.__renderHybridPreview = (force = false, shouldScroll = false) => renderHybridPreview(force, shouldScroll);
  window.__setNotepadPreviewNav = active => {
    notepadPreviewNavActive = Boolean(active && state.intuitiveNavEnabled);
    window.__syncNavIndicators?.();
  };
  window.__isNotepadPreviewNavActive = () => Boolean(state.intuitiveNavEnabled && notepadPreviewNavActive);
  let pendingScroll = false;
  const flushRender = rafThrottle(() => {
    const shouldScroll = pendingScroll && Boolean(state.previewFollowEnabled);
    pendingScroll = false;
    renderHybridPreview(false, shouldScroll);
  });
  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => set(KEYS.notepadText, ta.value), 200);
  };

  const autoDollarBtn = $('#notepad-auto-dollar-btn');
  const syncAutoDollarBtn = () => {
    if (!autoDollarBtn) return;
    autoDollarBtn.classList.toggle('active', autoDollarWrap);
    autoDollarBtn.setAttribute('aria-pressed', String(autoDollarWrap));
    autoDollarBtn.title = autoDollarWrap
      ? 'Αυτόματο $...$: ΕΝΕΡΓΟ — Όταν ο κέρσορας είναι εκτός εξίσωσης ($...$, $$...$$, [tex]...[/tex]), τα σύμβολα της εργαλειοθήκης KaTeX περιβάλλονται αυτόματα με $...$ (Alt+4)'
      : 'Αυτόματο $...$: ΑΝΕΝΕΡΓΟ — Κλικ για αυτόματο περιτύλιγμα με $...$ στα σύμβολα της εργαλειοθήκης KaTeX όταν γράφετε εκτός εξίσωσης (Alt+4)';
  };
  const cachedAd = mirrorGet(KEYS.notepadAutoDollar, 'bool');
  if (typeof cachedAd === 'boolean') autoDollarWrap = cachedAd;
  syncAutoDollarBtn();

  const applySavedNotepadWidth = w => {
    if (!(typeof w === 'number' && w >= 120)) return;
    const bodyEl = $('.notepad-body');
    const maxW = Math.max(160, (bodyEl?.clientWidth || innerWidth) - 120);
    const clamped = clamp(Math.round(w), 140, maxW);
    document.documentElement.style.setProperty('--notepad-preview-width', clamped + 'px');
  };

  get([KEYS.notepadText, KEYS.notepadWidth, KEYS.notepadAutoDollar]).then(r => {
    if (typeof r[KEYS.notepadAutoDollar] === 'boolean') {
      autoDollarWrap = r[KEYS.notepadAutoDollar];
      syncAutoDollarBtn();
    }
    if (typeof r[KEYS.notepadText] === 'string' && !ta.value) {
      ta.value = r[KEYS.notepadText];
      renderHybridPreview(true, false);
      window.__refreshSyntaxHighlight?.();
      window.__refreshNotepadCaret?.();
    }
    if (typeof r[KEYS.notepadWidth] === 'number') {
      applySavedNotepadWidth(r[KEYS.notepadWidth]);
    }
  });

  if (autoDollarBtn) {
    on(autoDollarBtn, 'click', () => {
      autoDollarWrap = !autoDollarWrap;
      syncAutoDollarBtn();
      set(KEYS.notepadAutoDollar, autoDollarWrap);
    }, false, sig);
  }

  let skipAutoWrapOnce = false;
  let suppressAutoWrapInputScroll = false;

  const maybeAutoWrapUnbracedSlot = () => {
    const inReaderEdit = document.body.classList.contains('notepad-reader-mode') && document.body.classList.contains('notepad-reader-edit');
    if (!inReaderEdit) return false;
    if (skipAutoWrapOnce) {
      skipAutoWrapOnce = false;
      return false;
    }
    const sel = getSelectionBounds(ta);
    if (sel.active) return false;
    const pos = getActiveCursorPos(ta);
    const tok = findMathTokenAt(ta.value || '', pos);
    if (!tok) return false;

    const rawMath = ta.value.slice(tok.contentStart, tok.contentEnd);
    const leadLen = rawMath.length - rawMath.trimStart().length;
    const trimmed = rawMath.trim();
    if (!trimmed) return false;

    const localPos = clamp(pos - tok.contentStart - leadLen, 0, trimmed.length);
    const slot = findActiveStructuralSlot(trimmed, localPos);
    if (!slot || !slot.needsBraces || slot.isEmpty) return false;

    const rStart = slot.replaceStart ?? slot.contentStart;
    const rEnd = slot.replaceEnd ?? slot.contentEnd;
    const absStart = tok.contentStart + leadLen + rStart;
    const absEnd = tok.contentStart + leadLen + rEnd;
    const inner = ta.value.slice(absStart, absEnd);
    if (!inner || inner.startsWith('{')) return false;

    const rel = clamp(pos - absStart, 0, inner.length);
    suppressAutoWrapInputScroll = true;
    replaceRangePreservingUndo(ta, absStart, absEnd, `{${inner}}`, absStart + 1 + rel, absStart + 1 + rel);
    suppressAutoWrapInputScroll = false;
    pendingScroll = false;
    scheduleSave();
    window.__refreshSyntaxHighlight?.();
    window.__refreshNotepadCaret?.();
    return true;
  };

  on(ta, 'input', () => {
    if (suppressAutoWrapInputScroll) return;
    const follow = Boolean(state.previewFollowEnabled);
    if (follow) state.notepadUserScrolled = false;
    pendingScroll = follow;
    flushRender();
    scheduleSave();
  }, false, sig);

  const syncCursorMove = rafThrottle(() => {
    if (pendingScroll) return;
    const shouldScrollReader = pendingReaderNavScroll && Boolean(state.previewFollowEnabled);
    pendingReaderNavScroll = false;
    const autoWrapped = maybeAutoWrapUnbracedSlot();
    const pos = getActiveCursorPos(ta);
    const sel = getSelectionBounds(ta);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const srcSame = !autoWrapped && ta.value === lastRenderedSrc && isLight === lastRenderedTheme;
    const selSame = sel.start === lastSelStart && sel.end === lastSelEnd;
    if (srcSame && selSame && pos === lastCursorPos) return;

    if (srcSame && sel.active) {
      const blocks = previewEl ? previewEl.querySelectorAll('.np-math-display[data-np-cstart][data-np-cend], .np-math-inline[data-np-cstart][data-np-cend]') : [];
      let prevMathBlock = null;
      let nextMathBlock = null;
      for (const b of blocks) {
        const cs = Number(b.getAttribute('data-np-cstart'));
        const ce = Number(b.getAttribute('data-np-cend'));
        if (lastSelEnd > lastSelStart && lastSelStart >= cs && lastSelEnd <= ce) prevMathBlock = b;
        if (sel.start >= cs && sel.end <= ce) nextMathBlock = b;
      }
      const hadPlainSel = lastSelEnd > lastSelStart && !prevMathBlock;
      if (nextMathBlock && !hadPlainSel && (prevMathBlock === nextMathBlock || lastSelStart === lastSelEnd)) {
        updateNotepadCursorTracking(shouldScrollReader);
        return;
      }
    }

    if (srcSame && !sel.active) {
      const hadPlainSel = lastSelEnd > lastSelStart;
      if (!hadPlainSel) {
        const matchedMath = previewEl ? findMatchedMathBlock(previewEl, pos) : null;
        const prevWasMath = Boolean(activeMathEl && activeMathEl.isConnected);
        if (matchedMath) {
          updateNotepadCursorTracking(shouldScrollReader);
          return;
        }
        if (prevWasMath) {
          renderHybridPreview(true, shouldScrollReader);
          return;
        }
      }
    }

    renderHybridPreview(true, shouldScrollReader);
  });

  on(ta, 'pointerdown', () => {
    notepadPreviewNavActive = false;
    window.__syncNavIndicators?.();
  }, false, sig);

  on(ta, 'keydown', e => {
    const inReaderEdit = document.body.classList.contains('notepad-reader-mode') && document.body.classList.contains('notepad-reader-edit');
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      skipAutoWrapOnce = true;
    }
    if (NAV_KEYS.has(e.key) && state.previewFollowEnabled) {
      state.notepadUserScrolled = false;
      pendingReaderNavScroll = true;
    }

    const val = ta.value || '';
    const caretPos = getActiveCursorPos(ta);
    const inMath = isCursorInsideKaTeX(val, caretPos);
    const mathTok = inMath ? findMathTokenAt(val, caretPos) : null;
    const isAltGr = e.ctrlKey && e.altKey && !e.metaKey;
    const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;

    if (inReaderEdit && mathTok && (noMod || isAltGr)) {
      const s = ta.selectionStart ?? val.length;
      const en = ta.selectionEnd ?? s;
      const sel = val.slice(s, en);
      if (e.key === '/' && !isEscapedAt(val, s)) {
        e.preventDefault();
        if (en > s) {
          const ins = `\\frac{${sel}}{}`;
          replaceRangePreservingUndo(ta, s, en, ins, s + 6 + sel.length + 2, s + 6 + sel.length + 2);
        } else {
          const { opStart, stripParens } = findPrecedingFractionOperandStart(val, mathTok.contentStart, s);
          if (opStart < s) {
            let num = val.slice(opStart, s);
            if (stripParens && num.startsWith('(') && num.endsWith(')')) num = num.slice(1, -1);
            const ins = `\\frac{${num}}{}`;
            replaceRangePreservingUndo(ta, opStart, s, ins, opStart + 6 + num.length + 2, opStart + 6 + num.length + 2);
          } else {
            replaceRangePreservingUndo(ta, s, s, '\\frac{}{}', s + 6, s + 6);
          }
        }
        const follow = Boolean(state.previewFollowEnabled);
        if (follow) state.notepadUserScrolled = false;
        pendingScroll = follow;
        flushRender();
        scheduleSave();
        return;
      }
      if (e.key === '*' && !isEscapedAt(val, s)) {
        e.preventDefault();
        replaceRangePreservingUndo(ta, s, en, '\\cdot ', s + 6, s + 6);
        const follow = Boolean(state.previewFollowEnabled);
        if (follow) state.notepadUserScrolled = false;
        pendingScroll = follow;
        flushRender();
        scheduleSave();
        return;
      }
    }

    if ((state.autoBracesEnabled || inReaderEdit) && inMath && (noMod || isAltGr)) {
      const s = ta.selectionStart ?? val.length;
      const en = ta.selectionEnd ?? s;
      const sel = val.slice(s, en);

      if ((e.key === '^' || e.key === '_') && !isEscapedAt(val, s) && (sel.length > 0 || val[s] !== '{')) {
        e.preventDefault();
        const ins = `${e.key}{${sel}}`;
        replaceRangePreservingUndo(ta, s, en, ins, s + 2, s + 2 + sel.length);
        const follow = Boolean(state.previewFollowEnabled);
        if (follow) state.notepadUserScrolled = false;
        pendingScroll = follow;
        flushRender();
        scheduleSave();
        return;
      }
    }

    if (state.autoBracesEnabled && inMath && (noMod || isAltGr)) {
      const s = ta.selectionStart ?? val.length;
      const en = ta.selectionEnd ?? s;
      const sel = val.slice(s, en);

      if (e.key === '{' && !isEscapedAt(val, s)) {
        e.preventDefault();
        replaceRangePreservingUndo(ta, s, en, `{${sel}}`, s + 1, s + 1 + sel.length);
        const follow = Boolean(state.previewFollowEnabled);
        if (follow) state.notepadUserScrolled = false;
        pendingScroll = follow;
        flushRender();
        scheduleSave();
        return;
      }
      if (e.key === '}' && s === en && val[s] === '}' && !isEscapedAt(val, s)) {
        e.preventDefault();
        ta.setSelectionRange(s + 1, s + 1);
        if (state.previewFollowEnabled) {
          state.notepadUserScrolled = false;
          pendingReaderNavScroll = true;
        }
        lastCursorPos = -1;
        syncCursorMove();
        window.__refreshNotepadCaret?.();
        return;
      }
      if (noMod && e.key === 'Backspace' && s === en && s > 0 && val[s - 1] === '{' && val[s] === '}' && !isEscapedAt(val, s - 1)) {
        e.preventDefault();
        replaceRangePreservingUndo(ta, s - 1, s + 1, '', s - 1, s - 1);
        const follow = Boolean(state.previewFollowEnabled);
        if (follow) state.notepadUserScrolled = false;
        pendingScroll = follow;
        flushRender();
        scheduleSave();
        return;
      }
      if (noMod && e.key === 'Tab' && mathTok) {
        const rawMath = val.slice(mathTok.contentStart, mathTok.contentEnd);
        const relPos = clamp(caretPos - mathTok.contentStart, 0, rawMath.length);
        const relTarget = computeTabJumpTarget(rawMath, relPos, e.shiftKey ? -1 : 1);
        if (relTarget !== null) {
          const target = mathTok.contentStart + relTarget;
          if (target !== caretPos) {
            e.preventDefault();
            ta.setSelectionRange(target, target);
            if (state.previewFollowEnabled) {
              state.notepadUserScrolled = false;
              pendingReaderNavScroll = true;
            }
            lastCursorPos = -1;
            syncCursorMove();
            window.__ensureNotepadCaretVisible?.();
            window.__refreshNotepadCaret?.();
            return;
          }
        }
      }
    }

    if (state.intuitiveNavEnabled && notepadPreviewNavActive && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const s = ta.selectionStart ?? 0;
      const en = ta.selectionEnd ?? s;
      if (e.shiftKey || s === en) {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const curPos = getActiveCursorPos(ta);
        const mathRanges = extractAllMathRangesForNav(tokenizeHybridLatex(ta.value));
        const target = computeSmartLatexArrowTarget(ta.value, curPos, dir, mathRanges, false);
        if (target !== null && target !== curPos) {
          e.preventDefault();
          if (e.shiftKey) {
            const anchor = ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart;
            const start = Math.min(anchor, target);
            const end = Math.max(anchor, target);
            const selDir = target < anchor ? 'backward' : 'forward';
            ta.setSelectionRange(start, end, selDir);
          } else {
            ta.setSelectionRange(target, target);
          }
          lastCursorPos = -1;
          syncCursorMove();
          window.__ensureNotepadCaretVisible?.();
          window.__refreshNotepadCaret?.();
        }
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const curPos = getActiveCursorPos(ta);
      const mathRanges = extractAllMathRangesForNav(tokenizeHybridLatex(ta.value));
      const target = computeCtrlArrowTarget(ta.value, curPos, dir, mathRanges);
      if (target !== null && target !== curPos) {
        e.preventDefault();
        if (e.shiftKey) {
          const anchor = ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart;
          const start = Math.min(anchor, target);
          const end = Math.max(anchor, target);
          const selDir = target < anchor ? 'backward' : 'forward';
          ta.setSelectionRange(start, end, selDir);
        } else {
          ta.setSelectionRange(target, target);
        }
        lastCursorPos = -1;
        syncCursorMove();
        window.__ensureNotepadCaretVisible?.();
        window.__refreshNotepadCaret?.();
      }
    }
  }, false, sig);

  on(ta, 'keyup', syncCursorMove, false, sig);
  on(ta, 'mouseup', syncCursorMove, false, sig);
  on(ta, 'click', syncCursorMove, false, sig);
  on(ta, 'select', syncCursorMove, false, sig);
  on(ta, 'focus', syncCursorMove, false, sig);
  on(document, 'selectionchange', () => {
    if (document.activeElement === ta) syncCursorMove();
  }, false, sig);

  on(window, 'pagehide', () => set(KEYS.notepadText, ta.value), false, sig);

  if (previewWrap && previewEl) {
    const resolvePreviewPoint = (clientX, clientY, target, isLight) => {
      const src = ta.value || '';
      const mathEl = target?.closest?.('.np-math-display[data-np-cstart][data-np-cend], .np-math-inline[data-np-cstart][data-np-cend]');
      if (mathEl && previewEl.contains(mathEl)) {
        const cs = Number(mathEl.getAttribute('data-np-cstart'));
        const ce = Number(mathEl.getAttribute('data-np-cend'));
        const disp = mathEl.getAttribute('data-np-display') === '1';
        const rawMath = src.slice(cs, ce);
        const localOff = resolveLatexOffsetAtPoint(rawMath, clientX, clientY, mathEl, {
          displayMode: disp,
          alignLeft: false,
          isLight,
          clickTarget: target,
          buildBalancedCandidate,
          injectLatexCaret,
          findCaretElement,
        });
        return { pos: clamp(cs + localOff, 0, src.length), mathEl };
      }
      return { pos: resolvePlainClickOffset(previewEl, src, clientX, clientY, target), mathEl: null };
    };

    let dragStart = null;
    let suppressNextClick = false;

    on(previewWrap, 'mousedown', e => {
      if (e.button !== 0) return;
      if (!(document.body.classList.contains('notepad-reader-mode') && document.body.classList.contains('notepad-reader-edit'))) {
        dragStart = null;
        return;
      }
      if (e.target.closest('a, summary, button, input, select, textarea, .notepad-preview-controls, .notepad-preview-header, .mg-nav-led')) {
        dragStart = null;
        return;
      }
      dragStart = { x: e.clientX, y: e.clientY, target: e.target };
    }, false, sig);

    on(previewWrap, 'mouseup', e => {
      if (!dragStart || e.button !== 0) return;
      const startInfo = dragStart;
      dragStart = null;
      if (!(document.body.classList.contains('notepad-reader-mode') && document.body.classList.contains('notepad-reader-edit'))) return;
      const dist = Math.hypot(e.clientX - startInfo.x, e.clientY - startInfo.y);
      const sel = window.getSelection();
      const hasDomSel = Boolean(sel && !sel.isCollapsed && sel.toString().length > 0);
      if (dist < 5 && !hasDomSel) return;

      const src = ta.value || '';
      if (!src.trim()) return;
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const p1 = resolvePreviewPoint(startInfo.x, startInfo.y, startInfo.target, isLight).pos;
      const p2 = resolvePreviewPoint(e.clientX, e.clientY, e.target, isLight).pos;
      if (p1 === p2) return;

      try { sel?.removeAllRanges(); } catch { }
      const s = Math.min(p1, p2);
      const en = Math.max(p1, p2);
      const dir = p2 < p1 ? 'backward' : 'forward';
      notepadPreviewNavActive = Boolean(state.intuitiveNavEnabled);
      window.__syncNavIndicators?.();
      try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
      ta.setSelectionRange(s, en, dir);
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 0);
      syncCursorMove();
    }, false, sig);

    on(previewWrap, 'click', e => {
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (document.body.classList.contains('notepad-reader-mode') && !document.body.classList.contains('notepad-reader-edit')) return;
      if (e.target.closest('a, summary, button, input, select, textarea, .notepad-preview-controls, .notepad-preview-header, .mg-nav-led')) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().length > 0) return;

      const src = ta.value || '';
      if (!src.trim()) {
        notepadPreviewNavActive = Boolean(state.intuitiveNavEnabled);
        window.__syncNavIndicators?.();
        try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
        renderHybridPreview(true, false);
        return;
      }

      const prevWrapTop = previewWrap.scrollTop;
      const prevWrapLeft = previewWrap.scrollLeft;
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const { pos: targetPos, mathEl } = resolvePreviewPoint(e.clientX, e.clientY, e.target, isLight);
      const prevMathLeft = mathEl ? mathEl.scrollLeft : 0;

      notepadPreviewNavActive = Boolean(state.intuitiveNavEnabled);
      window.__syncNavIndicators?.();
      const hadSel = lastSelEnd > lastSelStart;
      try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
      ta.setSelectionRange(targetPos, targetPos);
      const autoWrapped = maybeAutoWrapUnbracedSlot();
      lastCursorPos = -1;
      lastSelStart = -1;
      lastSelEnd = -1;
      renderHybridPreview(!mathEl || hadSel || autoWrapped, false);
      if (mathEl && mathEl.isConnected) {
        progScrolling = true;
        mathEl.scrollLeft = prevMathLeft;
        lastProgMath = { el: mathEl, left: mathEl.scrollLeft };
      }
      progScrolling = true;
      previewWrap.scrollTop = prevWrapTop;
      previewWrap.scrollLeft = prevWrapLeft;
      lastProgWrap = { left: previewWrap.scrollLeft, top: previewWrap.scrollTop };
      requestAnimationFrame(() => { progScrolling = false; });

      window.__ensureNotepadCaretVisible?.();
      window.__refreshNotepadCaret?.(true);
    }, false, sig);

    on(previewWrap, 'wheel', e => {
      if (e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;

      const maxY = previewWrap.scrollHeight - previewWrap.clientHeight;
      if (maxY > 1) {
        const down = e.deltaY > 0;
        const atEnd = down ? previewWrap.scrollTop >= maxY - 1 : previewWrap.scrollTop <= 1;
        if (!atEnd) return;
      }

      let hTarget = e.target?.closest?.('.np-math-display, pre.phpbb-code, table.phpbb-table');
      while (hTarget && hTarget !== previewWrap && hTarget.scrollWidth <= hTarget.clientWidth + 1) {
        hTarget = hTarget.parentElement?.closest?.('.np-math-display, pre.phpbb-code, table.phpbb-table');
      }
      if (!hTarget || hTarget.scrollWidth <= hTarget.clientWidth + 1) {
        hTarget = previewWrap.scrollWidth > previewWrap.clientWidth + 1 ? previewWrap : null;
      }
      if (!hTarget) return;

      const before = hTarget.scrollLeft;
      hTarget.scrollLeft += e.deltaY;
      if (hTarget.scrollLeft !== before) e.preventDefault();
    }, { passive: false }, sig);

    on(previewWrap, 'scroll', () => {
      if (progScrolling) return;
      const same = Math.abs(previewWrap.scrollLeft - lastProgWrap.left) < 2 &&
                   Math.abs(previewWrap.scrollTop - lastProgWrap.top) < 2;
      if (!same) state.notepadUserScrolled = true;
    }, { passive: true }, sig);
  }

  if (previewEl) {
    on(previewEl, 'scroll', e => {
      if (progScrolling) return;
      const target = e.target;
      if (!target || target === previewEl) return;
      if (target === lastProgMath.el && Math.abs(target.scrollLeft - lastProgMath.left) < 2) return;
      state.notepadUserScrolled = true;
    }, { passive: true, capture: true }, sig);

    if (typeof ResizeObserver !== 'undefined') {
      let lastPreviewW = Math.round(previewEl.clientWidth);
      const refreshOnResize = rafThrottle(() => {
        if (!notepadOpen || !previewEl.isConnected) return;
        const w = Math.round(previewEl.clientWidth);
        if (w <= 0 || w === lastPreviewW) return;
        lastPreviewW = w;
        updateNotepadCursorTracking(false);
      });
      const previewRo = new ResizeObserver(refreshOnResize);
      previewRo.observe(previewEl);
      sig.addEventListener('abort', () => previewRo.disconnect(), { once: true });
    }
  }

  const toggleBtn = $('#notepad-toggle');
  if (toggleBtn) on(toggleBtn, 'click', e => { e.stopPropagation(); toggleNotepad(); }, false, sig);

  on($('#notepad-pull-btn'), 'click', () => {
    const code = wrappedCode();
    if (code) wrapInNotepad('', '', code);
  }, false, sig);

  const phpbbToolbar = $('#phpbb-toolbar');
  if (phpbbToolbar) {
    on(phpbbToolbar, 'mousedown', e => {
      if (e.target.closest('button')) e.preventDefault();
    }, false, sig);
  }
  const hBtn = $('#phpbb-headings-btn'), hMenu = $('#phpbb-headings-menu');
  const sBtn = $('#phpbb-size-btn'), sMenu = $('#phpbb-size-menu');
  const cBtn = $('#phpbb-color-btn'), cMenu = $('#phpbb-color-menu');
  const tBtn = $('#phpbb-table-btn'), tMenu = $('#phpbb-table-menu');
  const closeAllPhpbbMenus = (except = null) => {
    for (const m of [hMenu, sMenu, cMenu, tMenu]) {
      if (m && m !== except) m.classList.remove('active');
    }
  };
  if (hBtn && hMenu) {
    on(hBtn, 'click', e => { e.stopPropagation(); closeAllPhpbbMenus(hMenu); hMenu.classList.toggle('active'); }, false, sig);
    hMenu.querySelectorAll('[data-phpbb-h]').forEach(b => {
      on(b, 'click', e => {
        e.stopPropagation();
        const pct = b.getAttribute('data-phpbb-h');
        wrapInNotepad(`[size=${pct}][b]`, '[/b][/size]', 'Επικεφαλίδα');
        hMenu.classList.remove('active');
      }, false, sig);
    });
  }
  if (sBtn && sMenu) {
    on(sBtn, 'click', e => { e.stopPropagation(); closeAllPhpbbMenus(sMenu); sMenu.classList.toggle('active'); }, false, sig);
    sMenu.querySelectorAll('[data-phpbb-size]').forEach(b => {
      on(b, 'click', e => {
        e.stopPropagation();
        const sz = b.getAttribute('data-phpbb-size');
        wrapInNotepad(`[size=${sz}]`, '[/size]', 'κείμενο');
        sMenu.classList.remove('active');
      }, false, sig);
    });
  }
  if (cBtn && cMenu) {
    on(cBtn, 'click', e => { e.stopPropagation(); closeAllPhpbbMenus(cMenu); cMenu.classList.toggle('active'); }, false, sig);
    on(cMenu, 'click', e => e.stopPropagation(), false, sig);
    cMenu.querySelectorAll('[data-phpbb-color]').forEach(b => {
      on(b, 'click', e => {
        e.stopPropagation();
        const col = b.getAttribute('data-phpbb-color');
        if (col) wrapInNotepad(`[color=${col}]`, '[/color]', 'κείμενο');
        cMenu.classList.remove('active');
      }, false, sig);
    });
    const customColInput = $('#phpbb-color-custom-input');
    const customColApply = $('#phpbb-color-custom-apply');
    if (customColApply && customColInput) {
      on(customColApply, 'click', e => {
        e.stopPropagation();
        wrapInNotepad(`[color=${customColInput.value || '#8b7bff'}]`, '[/color]', 'κείμενο');
        cMenu.classList.remove('active');
      }, false, sig);
    }
  }
  if (tBtn && tMenu) {
    on(tBtn, 'click', e => { e.stopPropagation(); closeAllPhpbbMenus(tMenu); tMenu.classList.toggle('active'); }, false, sig);
    tMenu.querySelectorAll('[data-phpbb-table]').forEach(b => {
      on(b, 'click', e => {
        e.stopPropagation();
        const [rRaw, cRaw] = (b.getAttribute('data-phpbb-table') || '3x3').split('x');
        const rows = Math.max(2, Math.min(8, parseInt(rRaw, 10) || 3));
        const cols = Math.max(1, Math.min(8, parseInt(cRaw, 10) || 3));
        const head = '[tr]' + Array.from({ length: cols }, (_, ci) => `[th]Στήλη ${ci + 1}[/th]`).join('') + '[/tr]';
        const bodyRows = Array.from({ length: rows - 1 }, (_, ri) =>
          '[tr]' + Array.from({ length: cols }, (_, ci) => `[td]${ri === 0 && ci === 0 ? 'Τιμή' : '...'}[/td]`).join('') + '[/tr]'
        ).join('\n');
        wrapInNotepad('', '', `[table]\n${head}\n${bodyRows}\n[/table]`);
        tMenu.classList.remove('active');
      }, false, sig);
    });
  }
  on(document, 'click', () => closeAllPhpbbMenus(), false, sig);

  document.querySelectorAll('[data-bb-wrap]').forEach(b => {
    on(b, 'click', () => {
      const [before, after, fb] = (b.getAttribute('data-bb-wrap') || '||').split('|');
      wrapInNotepad(before || '', after || '', fb || '');
    }, false, sig);
  });

  const insertList = ordered => {
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? ta.value.length;
    const sel = ta.value.slice(s, e).trim();
    const tag = ordered ? '[list=1]' : '[list]';
    if (sel) {
      const lines = sel.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.startsWith('[*]') ? l : `[*] ${l}`).join('\n');
      wrapInNotepad('', '', `${tag}\n${lines}\n[/list]`);
    } else {
      wrapInNotepad('', '', `${tag}\n[*] Στοιχείο 1\n[*] Στοιχείο 2\n[/list]`);
    }
  };
  on($('#phpbb-list-ul'), 'click', () => insertList(false), false, sig);
  on($('#phpbb-list-ol'), 'click', () => insertList(true), false, sig);

  on($('#phpbb-clear-fmt-btn'), 'click', () => {
    try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
    const s = ta.selectionStart ?? 0, e = ta.selectionEnd ?? 0;
    if (e > s) {
      const cleaned = clearBbcode(ta.value.slice(s, e));
      wrapInNotepad('', '', cleaned);
    } else {
      const cleanedAll = clearBbcode(ta.value);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('insertText', false, cleanedAll); } catch { }
      if (!ok) ta.value = cleanedAll;
      const follow = Boolean(state.previewFollowEnabled);
      if (follow) state.notepadUserScrolled = false;
      renderHybridPreview(true, follow);
      window.__refreshSyntaxHighlight?.();
      window.__refreshNotepadCaret?.();
      set(KEYS.notepadText, ta.value);
    }
  }, false, sig);

  const mModal = $('#phpbb-media-modal');
  let mediaMode = 'url';
  if (mModal) {
    const closeM = () => mModal.classList.remove('active');
    const openM = mode => {
      mediaMode = mode;
      const sel = ta.value.slice(ta.selectionStart ?? 0, ta.selectionEnd ?? 0);
      $('#phpbb-media-title').textContent = mode === 'url' ? 'Σύνδεσμος ([url])' : mode === 'img' ? 'Εικόνα ([img])' : 'GeoGebra ([ggb])';
      $('#phpbb-media-url-label').textContent = mode === 'ggb' ? 'ID υλικού ή URL GeoGebra:' : 'Διεύθυνση URL:';
      $('#phpbb-media-text-wrap').style.display = mode === 'url' ? 'block' : 'none';
      $('#phpbb-media-url').value = sel.startsWith('http') ? sel : '';
      $('#phpbb-media-text').value = !sel.startsWith('http') ? sel : '';
      mModal.classList.add('active');
    };
    on($('#phpbb-url-btn'), 'click', () => openM('url'), false, sig);
    on($('#phpbb-img-btn'), 'click', () => openM('img'), false, sig);
    on($('#phpbb-ggb-btn'), 'click', () => openM('ggb'), false, sig);
    on($('#close-phpbb-media'), 'click', closeM, false, sig);
    on($('#cancel-phpbb-media'), 'click', closeM, false, sig);
    on($('#apply-phpbb-media'), 'click', () => {
      const u = ($('#phpbb-media-url')?.value || '').trim();
      const tx = ($('#phpbb-media-text')?.value || '').trim();
      if (!u) return;
      const bb = mediaMode === 'url' ? (tx ? `[url=${u}]${tx}[/url]` : `[url]${u}[/url]`)
        : mediaMode === 'img' ? `[img]${u}[/img]` : `[ggb]${u}[/ggb]`;
      wrapInNotepad('', '', bb);
      closeM();
    }, false, sig);
  }

  const clearBtn = $('#notepad-clear-btn');
  if (clearBtn) {
    let clearTimer = null;
    const resetClear = () => {
      clearTimeout(clearTimer);
      clearBtn.dataset.confirm = '';
      clearBtn.classList.remove('confirming');
      clearBtn.textContent = 'Εκκαθάριση';
    };
    on(clearBtn, 'click', () => {
      if (!ta.value) return;
      if (clearBtn.dataset.confirm !== '1') {
        clearBtn.dataset.confirm = '1';
        clearBtn.classList.add('confirming');
        clearBtn.textContent = 'Σίγουρα;';
        clearTimer = setTimeout(resetClear, 3000);
        return;
      }
      resetClear();
      try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
      ta.select();
      try { document.execCommand('insertText', false, ''); } catch { ta.value = ''; }
      const follow = Boolean(state.previewFollowEnabled);
      if (follow) state.notepadUserScrolled = false;
      renderHybridPreview(true, follow);
      window.__refreshSyntaxHighlight?.();
      window.__refreshNotepadCaret?.();
      set(KEYS.notepadText, '');
    }, false, sig);
  }

  on($('#notepad-copy-btn'), 'click', function () { copyText(ta.value, this); }, false, sig);
  on($('#notepad-insert-btn'), 'click', function () { insertTextToPage(ta.value, this); }, false, sig);

  if (rz) {
    let start = null;
    on(rz, 'pointerdown', e => {
      e.preventDefault();
      const bodyEl = $('.notepad-body');
      start = {
        x: e.clientX,
        w: pvOuter.offsetWidth,
        max: Math.max(160, (bodyEl?.clientWidth || innerWidth) - 120),
        val: pvOuter.offsetWidth,
      };
      rz.classList.add('active');
      document.body.classList.add('is-resizing');
      rz.setPointerCapture(e.pointerId);
    }, false, sig);

    on(rz, 'pointermove', e => {
      if (!start) return;
      const v = Math.round(clamp(start.w + (start.x - e.clientX), 140, start.max));
      start.val = v;
      document.documentElement.style.setProperty('--notepad-preview-width', v + 'px');
      mirrorSet(KEYS.notepadWidth, v);
    }, false, sig);

    const endRz = e => {
      if (!start) return;
      const finalV = start.val;
      start = null;
      try { rz.releasePointerCapture(e.pointerId); } catch { }
      rz.classList.remove('active');
      document.body.classList.remove('is-resizing');
      set(KEYS.notepadWidth, finalV);
    };
    on(rz, 'pointerup', endRz, false, sig);
    on(rz, 'pointercancel', endRz, false, sig);
  }
}
