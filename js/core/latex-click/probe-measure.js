// Probe measurement — render + LRU cache + DOM measurement.
//
// Χρησιμοποιεί ένα hidden clone element (reusable) για να μην σπάει το layout.
import { buildProbePass, parseColorRgb } from './probe-builder.js';

const probeClones = { display: null, inline: null };

export function getInlineAvailableWidth(liveRoot) {
  if (!liveRoot) return 300;
  const liveRect = liveRoot.getBoundingClientRect();
  const cs = getComputedStyle(liveRoot);
  const marginH = (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
  let p = liveRoot.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const pcs = getComputedStyle(p);
    if (pcs.display !== 'inline' && pcs.display !== 'contents') {
      const pRect = p.getBoundingClientRect();
      const padH = (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.paddingRight) || 0);
      const bdrH = (parseFloat(pcs.borderLeftWidth) || 0) + (parseFloat(pcs.borderRightWidth) || 0);
      const rawInner = pRect.width - bdrH - padH;
      const clientInner = p.clientWidth > 0 ? (p.clientWidth - padH) : rawInner;
      const innerW = (rawInner - clientInner > 2) ? clientInner : rawInner;
      const avail = innerW - marginH;
      if (avail > 20) return Math.max(40, avail, liveRect.width || 0);
      break;
    }
    p = p.parentElement;
  }
  return Math.max(40, liveRect.width || 300);
}

export function getReusableProbeClone(liveRoot, displayMode, inlineMaxWidth = null) {
  const cs = getComputedStyle(liveRoot);
  const slotKey = displayMode ? 'display' : 'inline';
  let clone = probeClones[slotKey];
  if (!clone || !clone.isConnected) {
    clone = document.createElement(displayMode ? 'div' : 'span');
    clone.className = displayMode ? 'mg-probe-display' : 'mg-probe-inline';
    clone.setAttribute('aria-hidden', 'true');
    clone.style.position = 'fixed';
    clone.style.left = '-99999px';
    clone.style.top = '0';
    clone.style.visibility = 'hidden';
    clone.style.pointerEvents = 'none';
    clone.style.margin = '0';
    clone.style.boxSizing = 'border-box';
    clone.style.contain = 'layout style';
    if (!displayMode) {
      clone.style.display = 'inline-block';
      clone.style.width = 'auto';
    }
    document.body.appendChild(clone);
    probeClones[slotKey] = clone;
  }

  const nextWidth = displayMode
    ? `${Math.max(40, liveRoot.getBoundingClientRect().width || liveRoot.clientWidth)}px`
    : 'auto';
  const nextMaxWidth = displayMode
    ? 'none'
    : `${Math.max(40, inlineMaxWidth ?? getInlineAvailableWidth(liveRoot))}px`;
  const nextWhiteSpace = displayMode ? (cs.whiteSpace || 'normal') : (cs.whiteSpace || 'pre-wrap');
  const nextWordBreak = cs.wordBreak || 'normal';
  const nextOverflowWrap = cs.overflowWrap || 'normal';

  if (
    clone.__mgFontSize !== cs.fontSize ||
    clone.__mgFontFamily !== cs.fontFamily ||
    clone.__mgLineHeight !== cs.lineHeight ||
    clone.__mgLetterSpacing !== cs.letterSpacing ||
    clone.__mgTextAlign !== cs.textAlign ||
    clone.__mgWhiteSpace !== nextWhiteSpace ||
    clone.__mgWordBreak !== nextWordBreak ||
    clone.__mgOverflowWrap !== nextOverflowWrap ||
    clone.__mgWidth !== nextWidth ||
    clone.__mgMaxWidth !== nextMaxWidth ||
    clone.__mgPadLeft !== cs.paddingLeft ||
    clone.__mgPadRight !== cs.paddingRight
  ) {
    clone.__mgFontSize = cs.fontSize;
    clone.__mgFontFamily = cs.fontFamily;
    clone.__mgLineHeight = cs.lineHeight;
    clone.__mgLetterSpacing = cs.letterSpacing;
    clone.__mgTextAlign = cs.textAlign;
    clone.__mgWhiteSpace = nextWhiteSpace;
    clone.__mgWordBreak = nextWordBreak;
    clone.__mgOverflowWrap = nextOverflowWrap;
    clone.__mgWidth = nextWidth;
    clone.__mgMaxWidth = nextMaxWidth;
    clone.__mgPadLeft = cs.paddingLeft;
    clone.__mgPadRight = cs.paddingRight;

    clone.style.fontSize = cs.fontSize;
    clone.style.fontFamily = cs.fontFamily;
    clone.style.lineHeight = cs.lineHeight;
    clone.style.letterSpacing = cs.letterSpacing;
    clone.style.textAlign = cs.textAlign;
    clone.style.whiteSpace = nextWhiteSpace;
    clone.style.wordBreak = nextWordBreak;
    clone.style.overflowWrap = nextOverflowWrap;
    clone.style.width = nextWidth;
    clone.style.maxWidth = nextMaxWidth;
    clone.style.paddingLeft = cs.paddingLeft;
    clone.style.paddingRight = cs.paddingRight;
  }
  return clone;
}

export function scoreProbe(p, targetX, targetY) {
  const dyOutside = targetY < p.top ? (p.top - targetY) : (targetY > p.bottom ? (targetY - p.bottom) : 0);
  const dyCenter = Math.abs(targetY - (p.top + p.bottom) * 0.5);
  const dx = Math.abs(targetX - (p.left + p.right) * 0.5);
  return (dyOutside * 24) * (dyOutside * 24) + (dyCenter * 1.4) * (dyCenter * 1.4) + dx * dx;
}

const probeMeasureCache = new Map();
const PROBE_CACHE_MAX = 200;

export function measureBatchInDom(probedTex, probeMeta, liveRoot, liveKatexEl, { displayMode, alignLeft, inlineMaxWidth = null }) {
  const html = katex.renderToString(probedTex, {
    throwOnError: true,
    displayMode,
    fleqn: alignLeft,
  });

  const liveKRect = liveKatexEl.getBoundingClientRect();
  const clone = getReusableProbeClone(liveRoot, displayMode, inlineMaxWidth);
  clone.innerHTML = html;

  try {
    const cloneK = clone.querySelector('.katex-display > .katex, .katex') || clone;
    const cloneKRect = cloneK.getBoundingClientRect();
    const probes = [];
    const rules = clone.querySelectorAll('.katex-rule, .rule');

    for (const ruleEl of rules) {
      const styleAttr = ruleEl.getAttribute('style') || '';
      const rawStyle =
        ruleEl.style.borderTopColor ||
        ruleEl.style.borderColor ||
        ruleEl.style.color ||
        styleAttr;
      let rgb = parseColorRgb(rawStyle);
      if (!rgb) {
        const ruleCs = getComputedStyle(ruleEl);
        rgb = parseColorRgb(ruleCs.borderTopColor) || parseColorRgb(ruleCs.color);
      }
      if (!rgb || rgb.r !== 2) continue;
      const id = ((rgb.g & 0xff) << 8) | (rgb.b & 0xff);
      if (id < 1 || id > probeMeta.length) continue;

      const r = ruleEl.getBoundingClientRect();
      if (r.height <= 0 && r.top === 0 && r.bottom === 0) continue;

      const h = Math.max(2, r.bottom - r.top);
      const meta = probeMeta[id - 1];
      probes.push({
        offset: meta.offset,
        scopeId: meta.scopeId,
        left: r.left - cloneKRect.left,
        right: r.right - cloneKRect.left,
        top: (r.top - cloneKRect.top) - h * 2.6,
        bottom: (r.bottom - cloneKRect.top) + h * 0.8,
      });
    }

    return { probes, liveKRect };
  } finally {
    clone.textContent = '';
  }
}

export function getCachedProbes(texSource, liveRoot, liveKatexEl, { displayMode, alignLeft }) {
  const cs = getComputedStyle(liveRoot);
  const inlineMaxWidth = displayMode ? null : getInlineAvailableWidth(liveRoot);
  const widthKey = displayMode
    ? Math.round(Math.max(40, liveRoot.getBoundingClientRect().width || liveRoot.clientWidth))
    : Math.round(inlineMaxWidth);
  const cacheKey = `${displayMode ? '1' : '0'}:${alignLeft ? '1' : '0'}:${cs.fontSize}:${cs.lineHeight}:${widthKey}:${texSource}`;
  const cached = probeMeasureCache.get(cacheKey);
  if (cached) {
    probeMeasureCache.delete(cacheKey);
    probeMeasureCache.set(cacheKey, cached);
    return { probes: cached, liveKRect: liveKatexEl.getBoundingClientRect() };
  }
  const { probeMeta, probedTex } = buildProbePass(texSource);
  const { probes, liveKRect } = measureBatchInDom(probedTex, probeMeta, liveRoot, liveKatexEl, { displayMode, alignLeft, inlineMaxWidth });
  if (probeMeasureCache.size >= PROBE_CACHE_MAX) {
    const oldest = probeMeasureCache.keys().next().value;
    probeMeasureCache.delete(oldest);
  }
  probeMeasureCache.set(cacheKey, probes);
  return { probes, liveKRect };
}

export function resolveCoarseToFine(trimmed, clickX, clickY, liveRoot, liveKatexEl, { displayMode, alignLeft, injectLatexCaret, findCaretElement }) {
  if (typeof injectLatexCaret !== 'function' || typeof findCaretElement !== 'function') return null;
  const { chosen } = buildProbePass(trimmed);
  if (!chosen.length) return 0;

  const liveKRect = liveKatexEl.getBoundingClientRect();
  const targetX = clickX - liveKRect.left;
  const targetY = clickY - liveKRect.top;

  const inlineMaxWidth = displayMode ? null : getInlineAvailableWidth(liveRoot);
  const clone = getReusableProbeClone(liveRoot, displayMode, inlineMaxWidth);

  const testOffset = offset => {
    try {
      const tex = injectLatexCaret(trimmed, offset);
      clone.innerHTML = katex.renderToString(tex, {
        throwOnError: false,
        displayMode,
        fleqn: alignLeft,
      });
      const caretEl = findCaretElement(clone);
      if (!caretEl) return null;
      const cloneK = clone.querySelector('.katex-display > .katex, .katex') || clone;
      const cloneKRect = cloneK.getBoundingClientRect();
      const r = caretEl.getBoundingClientRect();
      const probe = {
        offset,
        left: r.left - cloneKRect.left,
        right: r.right - cloneKRect.left,
        top: r.top - cloneKRect.top,
        bottom: r.bottom - cloneKRect.top,
      };
      return { offset, score: scoreProbe(probe, targetX, targetY) };
    } catch {
      return null;
    }
  };

  try {
    const step = Math.max(1, Math.floor(chosen.length / 14));
    let bestIdx = 0;
    let bestScore = Infinity;

    for (let idx = 0; idx < chosen.length; idx += step) {
      const res = testOffset(chosen[idx].offset);
      if (res && res.score < bestScore) {
        bestScore = res.score;
        bestIdx = idx;
      }
    }
    if ((chosen.length - 1) % step !== 0) {
      const lastIdx = chosen.length - 1;
      const res = testOffset(chosen[lastIdx].offset);
      if (res && res.score < bestScore) {
        bestScore = res.score;
        bestIdx = lastIdx;
      }
    }

    const lo = Math.max(0, bestIdx - step);
    const hi = Math.min(chosen.length - 1, bestIdx + step);
    let bestOffset = chosen[bestIdx].offset;

    for (let idx = lo; idx <= hi; idx++) {
      const res = testOffset(chosen[idx].offset);
      if (res && res.score < bestScore) {
        bestScore = res.score;
        bestOffset = res.offset;
      }
    }
    return bestOffset;
  } finally {
    clone.textContent = '';
  }
}