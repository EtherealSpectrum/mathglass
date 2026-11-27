// Selection highlighting πάνω σε KaTeX.
//
// Σχεδιάζει overlay rects πάνω από τους επιλεγμένους χαρακτήρες χρησιμοποιώντας
// τις probe θέσεις. Δεν αλλάζει το DOM του KaTeX.
import { readLatexTokenEnd, findMatchingBraceEnd } from '../latex/parsing.js';
import { getCachedProbes } from './probe-measure.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function skipHorizWs(s, i) {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  return i;
}

const DELIM_COMMANDS = new Set([
  '\\left', '\\right', '\\middle',
  '\\bigl', '\\bigr', '\\Bigl', '\\Bigr',
  '\\biggl', '\\biggr', '\\Biggl', '\\Biggr',
  '\\big', '\\Big', '\\bigg', '\\Bigg',
]);

function snapSelectionBounds(s, rawStart, rawEnd) {
  let tStart = rawStart;
  let tEnd = rawEnd;
  const n = s.length;
  let i = 0;

  while (i < n) {
    const ch = s[i];
    if (ch === '%') {
      const nl = s.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (ch === '\\') {
      if (s.startsWith('\\begin{', i)) {
        const endB = s.indexOf('}', i + 7);
        if (endB !== -1) {
          let spanEnd = endB + 1;
          const envName = s.slice(i + 7, endB).trim();
          if ((envName === 'array' || envName === 'tabular') && s[spanEnd] === '{') {
            const specEnd = findMatchingBraceEnd(s, spanEnd);
            if (specEnd !== -1) spanEnd = specEnd + 1;
          }
          if (tStart > i && tStart < spanEnd) tStart = i;
          if (tEnd > i && tEnd < spanEnd) tEnd = spanEnd;
          i = spanEnd;
          continue;
        }
      }
      if (s.startsWith('\\end{', i)) {
        const endE = s.indexOf('}', i + 5);
        if (endE !== -1) {
          const spanEnd = endE + 1;
          if (tStart > i && tStart < spanEnd) tStart = i;
          if (tEnd > i && tEnd < spanEnd) tEnd = spanEnd;
          i = spanEnd;
          continue;
        }
      }
      const cmdEnd = readLatexTokenEnd(s, i);
      const cmd = s.slice(i, cmdEnd);
      let spanEnd = cmdEnd;
      if (DELIM_COMMANDS.has(cmd)) {
        const j = skipHorizWs(s, cmdEnd);
        spanEnd = readLatexTokenEnd(s, j);
      }
      if (tStart > i && tStart < spanEnd) tStart = i;
      if (tEnd > i && tEnd < spanEnd) tEnd = spanEnd;
      i = spanEnd;
      continue;
    }
    i++;
  }
  return [tStart, tEnd];
}

function buildSelectionRects(probes, texSource, tStart, tEnd) {
  const byScope = new Map();
  for (const p of probes) {
    if (!byScope.has(p.scopeId)) byScope.set(p.scopeId, []);
    byScope.get(p.scopeId).push(p);
  }

  const rawRects = [];
  for (const list of byScope.values()) {
    list.sort((a, b) => a.offset - b.offset);
    for (let i = 0; i + 1 < list.length; i++) {
      const pA = list[i];
      const pB = list[i + 1];
      if (pA.offset >= tStart && pB.offset <= tEnd) {
        if (pB.offset <= pA.offset) continue;
        const maxH = Math.max(pA.bottom - pA.top, pB.bottom - pB.top, 10);
        if (pB.left < pA.left - 3) continue;
        if (Math.abs(pB.top - pA.top) > maxH * 1.4) continue;
        const left = Math.min(pA.left, pB.left);
        const right = Math.max(pA.right, pB.right);
        const top = Math.min(pA.top, pB.top);
        const bottom = Math.max(pA.bottom, pB.bottom);
        rawRects.push({
          left,
          top,
          width: Math.max(3, right - left),
          height: Math.max(4, bottom - top),
        });
      } else if (pA.offset >= tStart && pA.offset < tEnd && pB.offset > tEnd) {
        // Ειδική περίπτωση: επιλογή βάσης πριν από ^ ή _ (π.χ. το "b" στο b^2)
        const afterEnd = skipHorizWs(texSource, tEnd);
        if (afterEnd < texSource.length && (texSource[afterEnd] === '^' || texSource[afterEnd] === '_')) {
          let nextEdge = null;
          for (const cand of probes) {
            if (cand.offset > tEnd && cand.left > pA.left + 1) {
              if (!nextEdge || cand.offset < nextEdge.offset) nextEdge = cand;
            }
          }
          if (nextEdge && nextEdge.left > pA.left + 1) {
            rawRects.push({
              left: pA.left,
              top: pA.top,
              width: Math.max(3, nextEdge.left - pA.left),
              height: Math.max(4, pA.bottom - pA.top),
            });
          }
        }
      }
    }
  }

  if (!rawRects.length) return [];

  rawRects.sort((a, b) => (Math.abs(a.top - b.top) < 2 ? a.left - b.left : a.top - b.top));
  const merged = [rawRects[0]];
  for (let i = 1; i < rawRects.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = rawRects[i];
    const sameRow = Math.abs(prev.top - cur.top) <= 2.5 && Math.abs((prev.top + prev.height) - (cur.top + cur.height)) <= 2.5;
    if (sameRow && cur.left <= prev.left + prev.width + 3.5) {
      const newRight = Math.max(prev.left + prev.width, cur.left + cur.width);
      const newTop = Math.min(prev.top, cur.top);
      const newBottom = Math.max(prev.top + prev.height, cur.top + cur.height);
      prev.left = Math.min(prev.left, cur.left);
      prev.top = newTop;
      prev.width = newRight - prev.left;
      prev.height = newBottom - newTop;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function wrapErrorTailSelection(tailEl, localStart, localEnd) {
  if (!tailEl || localEnd <= localStart) return;
  const text = tailEl.textContent || '';
  const s = clamp(localStart, 0, text.length);
  const e = clamp(localEnd, 0, text.length);
  if (e <= s) return;
  tailEl.textContent = '';
  if (s > 0) tailEl.appendChild(document.createTextNode(text.slice(0, s)));
  const mark = document.createElement('mark');
  mark.className = 'mg-np-sel';
  mark.textContent = text.slice(s, e);
  tailEl.appendChild(mark);
  if (e < text.length) tailEl.appendChild(document.createTextNode(text.slice(e)));
}

export function clearLatexSelectionHighlight(liveRoot) {
  if (!liveRoot) return;
  liveRoot.querySelectorAll('.mg-sel-overlay').forEach(el => el.remove());
  liveRoot.querySelectorAll('.mg-katex-sel-host').forEach(el => el.classList.remove('mg-katex-sel-host'));
  liveRoot.querySelectorAll('.katex-error-tail mark.mg-np-sel').forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize();
  });
}

function highlightSingleKatex(texSource, tStart, tEnd, liveRoot, liveKatexEl, { displayMode, alignLeft, buildBalancedCandidate }) {
  if (typeof katex === 'undefined' || !katex?.renderToString) return false;

  const computeAndRender = source => {
    const [snappedStart, snappedEnd] = snapSelectionBounds(source, tStart, tEnd);
    if (snappedEnd <= snappedStart) return false;
    const { probes } = getCachedProbes(source, liveRoot, liveKatexEl, { displayMode, alignLeft });
    if (!probes.length) return false;
    const rects = buildSelectionRects(probes, source, snappedStart, snappedEnd);
    if (!rects.length) return false;

    liveKatexEl.classList.add('mg-katex-sel-host');
    const overlay = document.createElement('span');
    overlay.className = 'mg-sel-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    for (const r of rects) {
      const box = document.createElement('span');
      box.className = 'mg-sel-rect';
      box.style.left = r.left.toFixed(1) + 'px';
      box.style.top = r.top.toFixed(1) + 'px';
      box.style.width = r.width.toFixed(1) + 'px';
      box.style.height = r.height.toFixed(1) + 'px';
      overlay.appendChild(box);
    }
    liveKatexEl.prepend(overlay);
    return true;
  };

  try {
    return computeAndRender(texSource);
  } catch {
    if (typeof buildBalancedCandidate === 'function') {
      try {
        const balanced = buildBalancedCandidate(texSource, '#888');
        return computeAndRender(balanced);
      } catch { }
    }
    return false;
  }
}

export function applyLatexSelectionHighlight(rawMath, selStart, selEnd, liveRoot, options = {}) {
  if (!liveRoot) return false;
  clearLatexSelectionHighlight(liveRoot);
  if (typeof rawMath !== 'string' || !rawMath.length) return false;
  if (typeof selStart !== 'number' || typeof selEnd !== 'number' || selEnd <= selStart) return false;

  const leadLen = rawMath.length - rawMath.trimStart().length;
  const trimmed = rawMath.trim();
  if (!trimmed) return false;

  let tStart = clamp(selStart - leadLen, 0, trimmed.length);
  let tEnd = clamp(selEnd - leadLen, 0, trimmed.length);
  if (tEnd <= tStart) return false;

  const {
    displayMode = true,
    alignLeft = false,
    buildBalancedCandidate = null,
  } = options;

  const combo = liveRoot.querySelector('.katex-partial-combo');
  if (combo) {
    const validWrap = combo.querySelector('.katex-partial-valid');
    const tailEl = combo.querySelector('.katex-error-tail');
    const tailText = tailEl?.textContent || '';
    const validLen = Math.max(0, trimmed.length - tailText.length);
    if (tailEl && tEnd > validLen) {
      wrapErrorTailSelection(tailEl, Math.max(0, tStart - validLen), Math.min(tailText.length, tEnd - validLen));
    }
    if (validWrap && tStart < validLen && validLen > 0) {
      const validTex = trimmed.slice(0, validLen);
      const validKatex = validWrap.querySelector('.katex-display > .katex, .katex');
      if (validKatex) {
        return highlightSingleKatex(validTex, tStart, Math.min(tEnd, validLen), validWrap, validKatex, {
          displayMode,
          alignLeft,
          buildBalancedCandidate,
        });
      }
    }
    return Boolean(tailEl && tEnd > validLen);
  }

  const standaloneTail = liveRoot.querySelector('.katex-error-tail');
  if (standaloneTail && !liveRoot.querySelector('.katex')) {
    wrapErrorTailSelection(standaloneTail, tStart, tEnd);
    return true;
  }

  const liveKatexEl = liveRoot.querySelector('.katex-display > .katex, .katex');
  if (!liveKatexEl) return false;

  return highlightSingleKatex(trimmed, tStart, tEnd, liveRoot, liveKatexEl, {
    displayMode,
    alignLeft,
    buildBalancedCandidate,
  });
}