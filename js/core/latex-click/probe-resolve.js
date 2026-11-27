// Public click→offset resolver.
//
// Στρατηγική:
//   1. Αν κλικ στην ουρά σφάλματος (.katex-error-tail) — μέτρησε τοπικά.
//   2. Αν κλικ στο έγκυρο τμήμα combo (.katex-partial-valid) — περιόρισε το target.
//   3. Batch probe render (γρήγορο).
//   4. Fallback: coarse→fine (αργό αλλά ακριβές).
import { buildProbePass } from './probe-builder.js';
import { getCachedProbes, resolveCoarseToFine, scoreProbe } from './probe-measure.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function caretPointFromXY(x, y) {
  if (typeof document.caretPositionFromPoint === 'function') {
    try {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos && pos.offsetNode) return { node: pos.offsetNode, offset: pos.offset };
    } catch { }
  }
  if (typeof document.caretRangeFromPoint === 'function') {
    try {
      const range = document.caretRangeFromPoint(x, y);
      if (range && range.startContainer) return { node: range.startContainer, offset: range.startOffset };
    } catch { }
  }
  return null;
}

export function getTextOffsetInElement(container, targetNode, targetOffset) {
  if (!container || !targetNode) return 0;
  if (targetNode === container) {
    let total = 0;
    const lim = Math.min(targetOffset, container.childNodes.length);
    for (let i = 0; i < lim; i++) total += (container.childNodes[i].textContent || '').length;
    return total;
  }
  let count = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let cur;
  while ((cur = walker.nextNode())) {
    if (cur === targetNode) return count + Math.min(targetOffset, cur.nodeValue.length);
    count += cur.nodeValue.length;
  }
  return count;
}

export function resolveLatexOffsetAtPoint(rawMath, clickX, clickY, liveRoot, options = {}) {
  if (typeof rawMath !== 'string' || !rawMath.length || !liveRoot) return 0;
  const leadLen = rawMath.length - rawMath.trimStart().length;
  const trimmed = rawMath.trim();
  if (!trimmed) return rawMath.length;

  const {
    displayMode = true,
    alignLeft = false,
    clickTarget = null,
    buildBalancedCandidate = null,
    injectLatexCaret = null,
    findCaretElement = null,
  } = options;

  // 1. Αν έγινε κλικ στην κόκκινη ουρά σφάλματος (.katex-error-tail)
  const tailEl = clickTarget?.closest?.('.katex-error-tail');
  if (tailEl && liveRoot.contains(tailEl)) {
    const tailText = tailEl.textContent || '';
    const cp = caretPointFromXY(clickX, clickY);
    const localInTail = cp && tailEl.contains(cp.node)
      ? getTextOffsetInElement(tailEl, cp.node, cp.offset)
      : tailText.length;
    const tailStart = trimmed.endsWith(tailText)
      ? (trimmed.length - tailText.length)
      : Math.max(0, trimmed.lastIndexOf(tailText));
    return clamp(leadLen + (tailStart >= 0 ? tailStart : 0) + localInTail, 0, rawMath.length);
  }

  // 2. Αν έγινε κλικ στο έγκυρο τμήμα combo μερικής απόδοσης (.katex-partial-valid)
  let targetTrimmed = trimmed;
  const validWrap = clickTarget?.closest?.('.katex-partial-valid');
  if (validWrap && liveRoot.contains(validWrap)) {
    const combo = validWrap.closest('.katex-partial-combo');
    const siblingTail = combo?.querySelector?.('.katex-error-tail');
    if (siblingTail) {
      const tailLen = (siblingTail.textContent || '').length;
      if (tailLen > 0 && tailLen < trimmed.length) {
        targetTrimmed = trimmed.slice(0, trimmed.length - tailLen);
      }
    }
  }

  const liveKatexEl =
    clickTarget?.closest?.('.katex-display > .katex, .katex') ||
    liveRoot.querySelector('.katex-display > .katex, .katex') ||
    liveRoot;

  if (typeof katex === 'undefined' || !katex?.renderToString) {
    return rawMath.length;
  }

  const measureRoot = (validWrap && liveRoot.contains(validWrap)) ? validWrap : liveRoot;

  const resolveWithBatch = texSource => {
    const { probes, liveKRect } = getCachedProbes(texSource, measureRoot, liveKatexEl, { displayMode, alignLeft });
    if (!probes.length) return null;
    const targetX = clickX - liveKRect.left;
    const targetY = clickY - liveKRect.top;
    let bestOffset = probes[0].offset;
    let bestScore = Infinity;
    for (const p of probes) {
      const s = scoreProbe(p, targetX, targetY);
      if (s < bestScore) {
        bestScore = s;
        bestOffset = p.offset;
      }
    }
    return clamp(bestOffset, 0, texSource.length);
  };

  try {
    const off = resolveWithBatch(targetTrimmed);
    if (typeof off === 'number') return clamp(leadLen + off, 0, rawMath.length);
  } catch {
    if (typeof buildBalancedCandidate === 'function') {
      try {
        const balanced = buildBalancedCandidate(targetTrimmed, '#888');
        const off = resolveWithBatch(balanced);
        if (typeof off === 'number') {
          return clamp(leadLen + clamp(off, 0, targetTrimmed.length), 0, rawMath.length);
        }
      } catch { }
    }
  }

  const fallbackOff = resolveCoarseToFine(targetTrimmed, clickX, clickY, measureRoot, liveKatexEl, {
    displayMode,
    alignLeft,
    injectLatexCaret,
    findCaretElement,
  });
  if (typeof fallbackOff === 'number') {
    return clamp(leadLen + fallbackOff, 0, rawMath.length);
  }

  return rawMath.length;
}