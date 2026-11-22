const TWO_ARG_COMMANDS = new Set([
  '\\frac', '\\dfrac', '\\tfrac', '\\cfrac',
  '\\binom', '\\dbinom', '\\tbinom', '\\genfrac',
  '\\overset', '\\underset', '\\stackrel',
  '\\xrightarrow', '\\xleftarrow',
]);

const SKIP_FIRST_BRACE_2ARG = new Set([
  '\\textcolor', '\\colorbox',
]);

const SKIP_TWO_BRACES_3ARG = new Set([
  '\\fcolorbox',
]);

const ONE_ARG_COMMANDS = new Set([
  '\\sqrt', '\\vec', '\\hat', '\\bar', '\\tilde', '\\dot', '\\ddot',
  '\\overline', '\\underline', '\\overbrace', '\\underbrace',
  '\\mathbb', '\\mathcal', '\\mathbf', '\\mathrm', '\\mathit', '\\mathsf', '\\mathtt',
  '\\boldsymbol', '\\pmb', '\\text', '\\textbf', '\\textit', '\\textrm', '\\operatorname',
  '\\not', '\\cancel', '\\bcancel', '\\xcancel',
  '\\phantom', '\\hphantom', '\\vphantom', '\\boxed', '\\fbox',
  '\\mathbin', '\\mathrel', '\\mathop', '\\mathord', '\\mathopen', '\\mathclose',
]);

const SKIP_ARG_COMMANDS = new Set([
  '\\color', '\\hspace', '\\vspace', '\\rule',
]);

const DELIM_COMMANDS = new Set([
  '\\left', '\\right', '\\middle',
  '\\bigl', '\\bigr', '\\Bigl', '\\Bigr',
  '\\biggl', '\\biggr', '\\Biggl', '\\Biggr',
  '\\big', '\\Big', '\\bigg', '\\Bigg',
]);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function readCmdTokenEnd(s, idx) {
  if (idx >= s.length) return idx;
  if (s[idx] === '\\') {
    if (idx + 1 < s.length && /[A-Za-z@]/.test(s[idx + 1])) {
      let j = idx + 2;
      while (j < s.length && /[A-Za-z@]/.test(s[j])) j++;
      return j;
    }
    return Math.min(s.length, idx + 2);
  }
  return idx + 1;
}

function findBraceClose(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findBracketClose(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '[') depth++;
    else if (s[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipHorizWs(s, i) {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  return i;
}

function isFollowedByScript(s, pos) {
  const k = skipHorizWs(s, pos);
  return k < s.length && (s[k] === '^' || s[k] === '_');
}

function makeProbeTex(id) {
  const hex = (0x020000 + id).toString(16).padStart(6, '0');
  return `\\rlap{\\color{#${hex}}{\\rule{0.01em}{0.25em}}}`;
}

function parseColorRgb(str) {
  if (!str) return null;
  const mRgb = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (mRgb) {
    return { r: Number(mRgb[1]), g: Number(mRgb[2]), b: Number(mRgb[3]) };
  }
  const mHex = str.match(/#([0-9a-f]{6})/i);
  if (mHex) {
    const n = parseInt(mHex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

/**
 * Συλλέγει ασφαλείς θέσεις εισαγωγής probe (και τυλίγει μονοσύμβολους εκθέτες/δείκτες π.χ. e^x -> e^{...x...})
 * ώστε το batch render να παράγει όλες τις συντεταγμένες και το συντακτικό scope σε ένα πέρασμα KaTeX.
 */
function buildProbePass(trimmed) {
  const n = trimmed.length;
  const ops = []; // { at, offset, wrapEnd?, scopeId, endScopeId? }
  let scopeCounter = 0;
  const scopeStack = [0];
  const curScope = () => scopeStack[scopeStack.length - 1];

  const addOp = (at, offset, wrapEnd = null, scopeId = curScope(), endScopeId = null) => {
    if (ops.length && ops[ops.length - 1].at === at && !wrapEnd && ops[ops.length - 1].scopeId === scopeId) return;
    ops.push({ at, offset, wrapEnd, scopeId, endScopeId });
  };

  let i = 0;
  let lastWasSpace = false;

  const maybeAddBefore = (pos, scopeId = curScope()) => {
    if (pos < 0 || pos > n) return;
    if (isFollowedByScript(trimmed, pos)) return;
    addOp(pos, pos, null, scopeId);
  };

  while (i < n) {
    const ch = trimmed[i];

    if (ch === '%') {
      const nl = trimmed.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      lastWasSpace = false;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (!lastWasSpace) {
        maybeAddBefore(i);
        lastWasSpace = true;
      }
      i++;
      continue;
    }
    lastWasSpace = false;

    if (ch === '^' || ch === '_') {
      let j = skipHorizWs(trimmed, i + 1);
      if (j < n && trimmed[j] !== '{') {
        const tokEnd = readCmdTokenEnd(trimmed, j);
        if (tokEnd > j) {
          const scriptScope = ++scopeCounter;
          addOp(j, j, tokEnd, scriptScope, scriptScope);
          i = tokEnd;
          continue;
        }
      }
      i = j;
      continue;
    }

    if (ch === '\\') {
      if (trimmed.startsWith('\\begin{', i)) {
        maybeAddBefore(i);
        const endB = trimmed.indexOf('}', i + 7);
        if (endB !== -1) {
          const envName = trimmed.slice(i + 7, endB).trim();
          let after = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && trimmed[after] === '{') {
            const specEnd = findBraceClose(trimmed, after);
            if (specEnd !== -1) after = specEnd + 1;
          }
          scopeStack.push(++scopeCounter);
          i = after;
          continue;
        }
      }

      if (trimmed.startsWith('\\end{', i)) {
        maybeAddBefore(i);
        const endE = trimmed.indexOf('}', i + 5);
        if (endE !== -1) {
          if (scopeStack.length > 1) scopeStack.pop();
          i = endE + 1;
          continue;
        }
      }

      const cmdEnd = readCmdTokenEnd(trimmed, i);
      const cmd = trimmed.slice(i, cmdEnd);

      if (DELIM_COMMANDS.has(cmd)) {
        maybeAddBefore(i);
        const j = skipHorizWs(trimmed, cmdEnd);
        const delEnd = readCmdTokenEnd(trimmed, j);
        i = delEnd;
        continue;
      }

      if (SKIP_ARG_COMMANDS.has(cmd)) {
        maybeAddBefore(i);
        let j = skipHorizWs(trimmed, cmdEnd);
        while (j < n && trimmed[j] === '[') {
          const bEnd = findBracketClose(trimmed, j);
          if (bEnd === -1) break;
          j = skipHorizWs(trimmed, bEnd + 1);
        }
        const maxBraces = cmd === '\\rule' ? 2 : 1;
        for (let b = 0; b < maxBraces && j < n && trimmed[j] === '{'; b++) {
          const bEnd = findBraceClose(trimmed, j);
          if (bEnd === -1) break;
          j = skipHorizWs(trimmed, bEnd + 1);
        }
        i = j;
        continue;
      }

      if (SKIP_FIRST_BRACE_2ARG.has(cmd) || SKIP_TWO_BRACES_3ARG.has(cmd)) {
        maybeAddBefore(i);
        let j = skipHorizWs(trimmed, cmdEnd);
        const skipCount = SKIP_TWO_BRACES_3ARG.has(cmd) ? 2 : 1;
        for (let b = 0; b < skipCount && j < n && trimmed[j] === '{'; b++) {
          const bEnd = findBraceClose(trimmed, j);
          if (bEnd === -1) break;
          j = skipHorizWs(trimmed, bEnd + 1);
        }
        i = j;
        continue;
      }

      if (TWO_ARG_COMMANDS.has(cmd) || ONE_ARG_COMMANDS.has(cmd)) {
        maybeAddBefore(i);
        let j = skipHorizWs(trimmed, cmdEnd);
        if (j < n && trimmed[j] === '[') {
          const brEnd = findBracketClose(trimmed, j);
          if (brEnd !== -1) {
            i = j + 1;
            continue;
          }
        }
        if (j < n && trimmed[j] === '{') {
          scopeStack.push(++scopeCounter);
          i = j + 1;
          continue;
        }
        const argCount = TWO_ARG_COMMANDS.has(cmd) ? 2 : 1;
        for (let a = 0; a < argCount && j < n; a++) {
          if (trimmed[j] === '{') {
            const bEnd = findBraceClose(trimmed, j);
            j = bEnd === -1 ? n : bEnd + 1;
          } else {
            j = readCmdTokenEnd(trimmed, j);
          }
          if (a + 1 < argCount) j = skipHorizWs(trimmed, j);
        }
        i = j;
        continue;
      }

      if (cmd === '\\\\') {
        maybeAddBefore(i);
        scopeStack[scopeStack.length - 1] = ++scopeCounter;
        const j = skipHorizWs(trimmed, cmdEnd);
        if (j < n && trimmed[j] === '[') {
          const brEnd = findBracketClose(trimmed, j);
          if (brEnd !== -1) {
            i = brEnd + 1;
            continue;
          }
        }
        i = cmdEnd;
        continue;
      }

      maybeAddBefore(i);
      i = cmdEnd;
      continue;
    }

    if (ch === '{') {
      scopeStack.push(++scopeCounter);
      i++;
      continue;
    }

    if (ch === '}') {
      maybeAddBefore(i);
      if (scopeStack.length > 1) scopeStack.pop();
      const next = skipHorizWs(trimmed, i + 1);
      if (next < n && trimmed[next] === '{') {
        // Μεταξύ {arg1} και {arg2} (π.χ. \frac{a}{b}): μην εισάγεις \rlap
        scopeStack.push(++scopeCounter);
        i = next + 1;
        continue;
      }
      i++;
      continue;
    }

    if (ch === '&') {
      maybeAddBefore(i);
      scopeStack[scopeStack.length - 1] = ++scopeCounter;
      i++;
      continue;
    }

    maybeAddBefore(i);
    i++;
  }

  maybeAddBefore(n);

  if (!ops.length) {
    ops.push({ at: 0, offset: 0, wrapEnd: null, scopeId: 0, endScopeId: null });
  }

  // Κράτα έως 380 ops (ώστε μαζί με τα wrapEnd probes να μην ξεπερνούν ~450 probes)
  let chosen = ops;
  if (ops.length > 380) {
    chosen = [];
    const step = ops.length / 380;
    for (let k = 0; k < 380; k++) {
      chosen.push(ops[Math.min(ops.length - 1, Math.floor(k * step))]);
    }
    if (chosen[chosen.length - 1] !== ops[ops.length - 1]) {
      chosen.push(ops[ops.length - 1]);
    }
  }

  const probeMeta = []; // id (1-based) -> { offset, scopeId }
  let probedTex = '';
  let cursor = 0;
  for (let k = 0; k < chosen.length; k++) {
    const op = chosen[k];
    if (op.at > cursor) {
      probedTex += trimmed.slice(cursor, op.at);
    }
    if (op.wrapEnd && op.wrapEnd > op.at) {
      const startId = probeMeta.length + 1;
      probeMeta.push({ offset: op.offset, scopeId: op.scopeId });
      const endId = probeMeta.length + 1;
      probeMeta.push({ offset: op.wrapEnd, scopeId: op.endScopeId ?? op.scopeId });
      probedTex += '{' + makeProbeTex(startId) + trimmed.slice(op.at, op.wrapEnd) + makeProbeTex(endId) + '}';
      cursor = op.wrapEnd;
    } else {
      const id = probeMeta.length + 1;
      probeMeta.push({ offset: op.offset, scopeId: op.scopeId });
      probedTex += makeProbeTex(id);
      cursor = op.at;
    }
  }
  if (cursor < n) {
    probedTex += trimmed.slice(cursor);
  }

  return { chosen, probeMeta, probedTex };
}

function createProbeClone(liveRoot, displayMode) {
  const cs = getComputedStyle(liveRoot);
  const clone = document.createElement(displayMode ? 'div' : 'span');
  clone.style.position = 'fixed';
  clone.style.left = '-99999px';
  clone.style.top = '0';
  clone.style.visibility = 'hidden';
  clone.style.pointerEvents = 'none';
  clone.style.margin = '0';
  clone.style.fontSize = cs.fontSize;
  clone.style.fontFamily = cs.fontFamily;
  clone.style.lineHeight = cs.lineHeight;
  clone.style.letterSpacing = cs.letterSpacing;
  clone.style.textAlign = cs.textAlign;
  clone.style.boxSizing = 'border-box';
  if (displayMode) {
    clone.style.width = Math.max(40, liveRoot.clientWidth) + 'px';
    clone.style.paddingLeft = cs.paddingLeft;
    clone.style.paddingRight = cs.paddingRight;
  } else {
    clone.style.display = 'inline-block';
    clone.style.width = 'auto';
    clone.style.whiteSpace = 'nowrap';
  }
  return clone;
}

function scoreProbe(p, targetX, targetY) {
  const dyOutside = targetY < p.top ? (p.top - targetY) : (targetY > p.bottom ? (targetY - p.bottom) : 0);
  const dyCenter = Math.abs(targetY - (p.top + p.bottom) * 0.5);
  const dx = Math.abs(targetX - (p.left + p.right) * 0.5);
  return (dyOutside * 6) * (dyOutside * 6) + (dyCenter * 1.4) * (dyCenter * 1.4) + dx * dx;
}

const probeMeasureCache = new Map();

function measureBatchInDom(probedTex, probeMeta, liveRoot, liveKatexEl, { displayMode, alignLeft }) {
  const html = katex.renderToString(probedTex, {
    throwOnError: true,
    displayMode,
    fleqn: alignLeft,
  });

  const liveKRect = liveKatexEl.getBoundingClientRect();
  const clone = createProbeClone(liveRoot, displayMode);
  clone.innerHTML = html;
  document.body.appendChild(clone);

  try {
    const cloneK = clone.querySelector('.katex-display > .katex, .katex') || clone;
    const cloneKRect = cloneK.getBoundingClientRect();
    const probes = [];
    const rules = clone.querySelectorAll('.katex-rule, .rule');

    for (const ruleEl of rules) {
      const rawStyle =
        ruleEl.style.borderColor ||
        ruleEl.style.borderTopColor ||
        ruleEl.style.backgroundColor ||
        ruleEl.style.color ||
        ruleEl.getAttribute('style') ||
        '';
      const rgb =
        parseColorRgb(rawStyle) ||
        parseColorRgb(getComputedStyle(ruleEl).borderTopColor) ||
        parseColorRgb(getComputedStyle(ruleEl).color);
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
    clone.remove();
  }
}

function getCachedProbes(texSource, liveRoot, liveKatexEl, { displayMode, alignLeft }) {
  const cs = getComputedStyle(liveRoot);
  const widthKey = displayMode ? Math.max(40, liveRoot.clientWidth) : 0;
  const cacheKey = `${displayMode ? '1' : '0'}:${alignLeft ? '1' : '0'}:${cs.fontSize}:${widthKey}:${texSource}`;
  const cached = probeMeasureCache.get(cacheKey);
  if (cached) {
    return { probes: cached, liveKRect: liveKatexEl.getBoundingClientRect() };
  }
  const { probeMeta, probedTex } = buildProbePass(texSource);
  const { probes, liveKRect } = measureBatchInDom(probedTex, probeMeta, liveRoot, liveKatexEl, { displayMode, alignLeft });
  if (probeMeasureCache.size > 80) {
    const oldest = probeMeasureCache.keys().next().value;
    probeMeasureCache.delete(oldest);
  }
  probeMeasureCache.set(cacheKey, probes);
  return { probes, liveKRect };
}

function resolveCoarseToFine(trimmed, clickX, clickY, liveRoot, liveKatexEl, { displayMode, alignLeft, injectLatexCaret, findCaretElement }) {
  if (typeof injectLatexCaret !== 'function' || typeof findCaretElement !== 'function') return null;
  const { chosen } = buildProbePass(trimmed);
  if (!chosen.length) return 0;

  const liveKRect = liveKatexEl.getBoundingClientRect();
  const targetX = clickX - liveKRect.left;
  const targetY = clickY - liveKRect.top;

  const clone = createProbeClone(liveRoot, displayMode);
  document.body.appendChild(clone);

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
    clone.remove();
  }
}

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
    if (cur === targetNode) {
      return count + Math.min(targetOffset, cur.nodeValue.length);
    }
    count += cur.nodeValue.length;
  }
  return count;
}

/**
 * Αντιστοιχίζει ένα κλικ (clickX, clickY) πάνω σε αποδοθέν KaTeX στοιχείο
 * στη θέση χαρακτήρα μέσα στο rawMath.
 */
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

  const resolveWithBatch = texSource => {
    const { probes, liveKRect } = getCachedProbes(texSource, liveRoot, liveKatexEl, { displayMode, alignLeft });
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
    if (typeof off === 'number') {
      return clamp(leadLen + off, 0, rawMath.length);
    }
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

  const fallbackOff = resolveCoarseToFine(targetTrimmed, clickX, clickY, liveRoot, liveKatexEl, {
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
            const specEnd = findBraceClose(s, spanEnd);
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
      const cmdEnd = readCmdTokenEnd(s, i);
      const cmd = s.slice(i, cmdEnd);
      let spanEnd = cmdEnd;
      if (DELIM_COMMANDS.has(cmd)) {
        const j = skipHorizWs(s, cmdEnd);
        spanEnd = readCmdTokenEnd(s, j);
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

const SLOT_CARET_TEX = '\\rlap{\\color{#8b7bfe}{\\rule[-0.18em]{0.11em}{1.08em}}}';
const SLOT_FRAC_CMDS = new Set(['\\frac', '\\dfrac', '\\tfrac', '\\cfrac', '\\genfrac']);
const SLOT_TWO_ARG_CMDS = new Set([
  '\\frac', '\\dfrac', '\\tfrac', '\\cfrac', '\\genfrac',
  '\\binom', '\\dbinom', '\\tbinom',
  '\\overset', '\\underset', '\\stackrel',
  '\\xrightarrow', '\\xleftarrow',
]);
const SLOT_ONE_ARG_CMDS = new Set([
  '\\sqrt', '\\vec', '\\hat', '\\bar', '\\tilde', '\\dot', '\\ddot',
  '\\overline', '\\underline', '\\widehat', '\\widetilde',
  '\\overrightarrow', '\\overleftarrow', '\\overbrace', '\\underbrace',
  '\\boxed', '\\fbox', '\\text', '\\textbf', '\\textit', '\\textrm', '\\texttt', '\\mbox',
  '\\mathrm', '\\mathbf', '\\mathbb', '\\mathcal', '\\mathit', '\\mathsf', '\\operatorname',
]);
const SLOT_SKIP_1_OF_2 = new Set(['\\textcolor', '\\colorbox']);
const SLOT_SKIP_2_OF_3 = new Set(['\\fcolorbox']);

export function findActiveStructuralSlot(rawMath, cursorOffset) {
  const n = rawMath.length;
  const pos = clamp(cursorOffset, 0, n);
  let best = null;

  const consider = slot => {
    if (pos < slot.contentStart || pos > slot.contentEnd) return;
    if (!best || (slot.contentEnd - slot.contentStart) <= (best.contentEnd - best.contentStart)) {
      best = slot;
    }
  };

  const braceStack = [];
  let pending = null;
  let i = 0;

  while (i < n) {
    const ch = rawMath[i];

    if (ch === '%') {
      const nl = rawMath.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (pending && ch !== '{' && !(ch === '[' && pending.allowOpt) && ch !== '^' && ch !== '_') {
      if (ch === '}' || (ch === '\\' && rawMath.startsWith('\\end{', i))) {
        consider({ kind: pending.kind, contentStart: i, contentEnd: i, isEmpty: true, needsBraces: true, replaceStart: i, replaceEnd: i });
        pending = null;
        if (ch === '}') {
          const top = braceStack.pop();
          if (top && top.structural) {
            consider({
              kind: top.kind,
              contentStart: top.openIdx + 1,
              contentEnd: i,
              isEmpty: top.openIdx + 1 === i,
              needsBraces: false,
            });
            pending = top.nextPending;
          }
          i++;
          continue;
        }
      } else {
        const tokEnd = readCmdTokenEnd(rawMath, i);
        if (pos >= i && pos <= tokEnd) {
          consider({ kind: pending.kind, contentStart: i, contentEnd: tokEnd, isEmpty: false, needsBraces: true, replaceStart: i, replaceEnd: tokEnd });
        }
        pending = pending.remainingArgs > 1
          ? { kind: pending.nextKind || 'arg', remainingArgs: pending.remainingArgs - 1, allowOpt: false }
          : null;
        i = tokEnd;
        continue;
      }
    }

    if (ch === '^' || ch === '_') {
      const kind = ch === '^' ? 'sup' : 'sub';
      let j = skipHorizWs(rawMath, i + 1);
      if (j < n && rawMath[j] === '{') {
        pending = { kind, remainingArgs: 1, allowOpt: false };
        i = j;
        continue;
      }
      if (j >= n || rawMath[j] === '}' || (rawMath[j] === '\\' && rawMath.startsWith('\\end{', j))) {
        consider({ kind, contentStart: j, contentEnd: j, isEmpty: true, needsBraces: true, replaceStart: j, replaceEnd: j });
        i = j;
        pending = null;
        continue;
      }
      const tokEnd = readCmdTokenEnd(rawMath, j);
      if (pos >= j && pos <= tokEnd) {
        consider({ kind, contentStart: j, contentEnd: tokEnd, isEmpty: false, needsBraces: true, replaceStart: j, replaceEnd: tokEnd });
      }
      i = tokEnd;
      pending = null;
      continue;
    }

    if (ch === '\\') {
      if (rawMath.startsWith('\\begin{', i)) {
        const endB = rawMath.indexOf('}', i + 7);
        if (endB !== -1) {
          const envName = rawMath.slice(i + 7, endB).trim();
          let afterEnv = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && rawMath[afterEnv] === '{') {
            const specEnd = findBraceClose(rawMath, afterEnv);
            if (specEnd !== -1) afterEnv = specEnd + 1;
          }
          i = afterEnv;
          pending = null;
          continue;
        }
      }
      if (rawMath.startsWith('\\end{', i)) {
        const endE = rawMath.indexOf('}', i + 5);
        if (endE !== -1) {
          i = endE + 1;
          pending = null;
          continue;
        }
      }

      const cmdEnd = readCmdTokenEnd(rawMath, i);
      const cmd = rawMath.slice(i, cmdEnd);

      if (SKIP_ARG_COMMANDS.has(cmd)) {
        let j = skipHorizWs(rawMath, cmdEnd);
        while (j < n && rawMath[j] === '[') {
          const brEnd = findBracketClose(rawMath, j);
          if (brEnd === -1) break;
          j = skipHorizWs(rawMath, brEnd + 1);
        }
        const maxBraces = cmd === '\\rule' ? 2 : 1;
        for (let b = 0; b < maxBraces && j < n && rawMath[j] === '{'; b++) {
          const bEnd = findBraceClose(rawMath, j);
          if (bEnd === -1) break;
          j = skipHorizWs(rawMath, bEnd + 1);
        }
        i = j;
        pending = null;
        continue;
      }

      if (SLOT_SKIP_1_OF_2.has(cmd) || SLOT_SKIP_2_OF_3.has(cmd)) {
        let j = cmdEnd;
        const skipCnt = SLOT_SKIP_2_OF_3.has(cmd) ? 2 : 1;
        for (let b = 0; b < skipCnt; b++) {
          j = skipHorizWs(rawMath, j);
          if (rawMath[j] === '{') {
            const bEnd = findBraceClose(rawMath, j);
            if (bEnd !== -1) j = bEnd + 1;
          }
        }
        pending = { kind: 'arg', remainingArgs: 1, allowOpt: false };
        i = j;
        continue;
      }

      if (SLOT_TWO_ARG_CMDS.has(cmd)) {
        pending = {
          kind: SLOT_FRAC_CMDS.has(cmd) ? 'frac-num' : 'arg1',
          nextKind: SLOT_FRAC_CMDS.has(cmd) ? 'frac-den' : 'arg2',
          remainingArgs: 2,
          allowOpt: cmd === '\\xrightarrow' || cmd === '\\xleftarrow',
          optKind: 'sub',
        };
        i = cmdEnd;
        continue;
      }

      if (SLOT_ONE_ARG_CMDS.has(cmd)) {
        pending = {
          kind: cmd === '\\sqrt' ? 'sqrt' : 'arg',
          remainingArgs: 1,
          allowOpt: cmd === '\\sqrt',
          optKind: 'sqrt-deg',
        };
        i = cmdEnd;
        continue;
      }

      pending = null;
      i = cmdEnd;
      continue;
    }

    if (ch === '[' && pending && pending.allowOpt) {
      let brDepth = 1;
      let j = i + 1;
      while (j < n && brDepth > 0) {
        if (rawMath[j] === '\\') { j += 2; continue; }
        if (rawMath[j] === '[') brDepth++;
        else if (rawMath[j] === ']') brDepth--;
        j++;
      }
      const closeBr = brDepth === 0 ? j - 1 : n;
      consider({
        kind: pending.optKind || 'opt',
        contentStart: i + 1,
        contentEnd: closeBr,
        isEmpty: i + 1 === closeBr,
        needsBraces: false,
      });
      pending = { ...pending, allowOpt: false };
      i++;
      continue;
    }

    if (ch === '{') {
      const info = pending
        ? {
            structural: true,
            kind: pending.kind,
            nextPending: pending.remainingArgs > 1
              ? { kind: pending.nextKind || 'arg', remainingArgs: pending.remainingArgs - 1, allowOpt: false }
              : null,
          }
        : { structural: false, kind: null, nextPending: null };
      braceStack.push({ openIdx: i, ...info });
      pending = null;
      i++;
      continue;
    }

    if (ch === '}') {
      const top = braceStack.pop();
      if (top && top.structural) {
        consider({
          kind: top.kind,
          contentStart: top.openIdx + 1,
          contentEnd: i,
          isEmpty: top.openIdx + 1 === i,
          needsBraces: false,
        });
        pending = top.nextPending;
      } else {
        pending = null;
      }
      i++;
      continue;
    }

    pending = null;
    i++;
  }

  for (const top of braceStack) {
    if (top.structural) {
      consider({
        kind: top.kind,
        contentStart: top.openIdx + 1,
        contentEnd: n,
        isEmpty: top.openIdx + 1 === n,
        needsBraces: false,
      });
    }
  }

  return best;
}

export function clearActiveSlotHighlight(liveRoot) {
  if (!liveRoot) return;
  liveRoot.querySelectorAll('.mg-slot-overlay').forEach(el => el.remove());
}

export function applyActiveSlotHighlight(rawMath, cursorOffset, liveRoot, options = {}) {
  if (!liveRoot) return false;
  clearActiveSlotHighlight(liveRoot);
  if (typeof katex === 'undefined' || !katex?.renderToString) return false;
  if (typeof rawMath !== 'string' || !rawMath.length || typeof cursorOffset !== 'number') return false;

  const leadLen = rawMath.length - rawMath.trimStart().length;
  const trimmed = rawMath.trim();
  if (!trimmed) return false;

  const localPos = clamp(cursorOffset - leadLen, 0, trimmed.length);
  const slot = findActiveStructuralSlot(trimmed, localPos);
  if (!slot) return false;

  const {
    displayMode = true,
    alignLeft = false,
    buildBalancedCandidate = null,
    injectLatexCaret = null,
  } = options;

  const liveKatexEl = liveRoot.querySelector('.katex-display > .katex, .katex');
  if (!liveKatexEl) return false;

  const rStart = slot.needsBraces ? slot.replaceStart : slot.contentStart;
  const rEnd = slot.needsBraces ? slot.replaceEnd : slot.contentEnd;
  const innerRaw = trimmed.slice(slot.contentStart, slot.contentEnd);
  const localInSlot = clamp(localPos - slot.contentStart, 0, innerRaw.length);

  let innerWithCaret;
  if (!innerRaw.trim()) {
    innerWithCaret = SLOT_CARET_TEX;
  } else if (typeof injectLatexCaret === 'function') {
    innerWithCaret = injectLatexCaret(innerRaw, localInSlot);
  } else {
    innerWithCaret = innerRaw.slice(0, localInSlot) + SLOT_CARET_TEX + innerRaw.slice(localInSlot);
  }

  const wrapped = slot.needsBraces
    ? `{\\htmlClass{mg-slot-probe}{${innerWithCaret}}}`
    : `\\htmlClass{mg-slot-probe}{${innerWithCaret}}`;
  const slotTex = trimmed.slice(0, rStart) + wrapped + trimmed.slice(rEnd);

  const renderCloneHtml = src => katex.renderToString(src, {
    throwOnError: true,
    displayMode,
    fleqn: alignLeft,
    trust: ctx => ctx.command === '\\htmlClass',
  });

  let html = '';
  try {
    html = renderCloneHtml(slotTex);
  } catch {
    if (typeof buildBalancedCandidate === 'function') {
      try {
        html = katex.renderToString(buildBalancedCandidate(slotTex, '#888'), {
          throwOnError: false,
          displayMode,
          fleqn: alignLeft,
          trust: ctx => ctx.command === '\\htmlClass',
        });
      } catch {
        return false;
      }
    } else {
      return false;
    }
  }

  if (!html || !html.includes('mg-slot-probe')) return false;

  const liveKRect = liveKatexEl.getBoundingClientRect();
  if (liveKRect.width <= 0 && liveKRect.height <= 0) return false;

  const clone = createProbeClone(liveRoot, displayMode);
  clone.innerHTML = html;
  document.body.appendChild(clone);

  try {
    const cloneK = clone.querySelector('.katex-display > .katex, .katex') || clone;
    const probeEl = cloneK.querySelector('.mg-slot-probe');
    if (!probeEl) return false;

    const cloneKRect = cloneK.getBoundingClientRect();
    const pRect = probeEl.getBoundingClientRect();
    if (pRect.width <= 0 && pRect.height <= 0) return false;

    const scaleX = cloneKRect.width > 0 ? liveKRect.width / cloneKRect.width : 1;
    const scaleY = cloneKRect.height > 0 ? liveKRect.height / cloneKRect.height : 1;

    const relLeft = (pRect.left - cloneKRect.left) * scaleX;
    const relTop = (pRect.top - cloneKRect.top) * scaleY;
    const relW = pRect.width * scaleX;
    const relH = pRect.height * scaleY;

    const padX = slot.isEmpty ? 5 : 3;
    const padY = 2;
    const boxW = Math.max(slot.isEmpty ? 14 : 11, relW + padX * 2);
    const boxH = Math.max(12, relH + padY * 2);
    const boxLeft = slot.isEmpty
      ? (relLeft + relW * 0.5 - boxW * 0.5)
      : (relLeft - padX);
    const boxTop = relTop - padY;

    liveKatexEl.classList.add('mg-katex-sel-host');
    const overlay = document.createElement('span');
    overlay.className = 'mg-slot-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.slotKind = slot.kind;

    const box = document.createElement('span');
    box.className = 'mg-slot-box';
    box.style.left = boxLeft.toFixed(1) + 'px';
    box.style.top = boxTop.toFixed(1) + 'px';
    box.style.width = boxW.toFixed(1) + 'px';
    box.style.height = boxH.toFixed(1) + 'px';
    overlay.appendChild(box);
    liveKatexEl.prepend(overlay);
    return true;
  } finally {
    clone.remove();
  }
}

