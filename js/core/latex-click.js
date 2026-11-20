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
  return `\\rlap{\\color{#${hex}}{\\rule[-0.18em]{0.01em}{1.08em}}}`;
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
 * Συλλέγει ασφαλείς θέσεις εισαγωγής probe (και τυλίγει μονοσύμβολους εκθέτες/δείκτες π.χ. e^x -> e^{...x})
 * ώστε το batch render να παράγει όλες τις συντεταγμένες σε ένα πέρασμα KaTeX.
 */
function buildProbePass(trimmed) {
  const n = trimmed.length;
  const ops = []; // { at, wrapEnd?, offset }

  const addOp = (at, offset, wrapEnd = null) => {
    if (ops.length && ops[ops.length - 1].at === at && !wrapEnd) return;
    ops.push({ at, offset, wrapEnd });
  };

  let i = 0;
  let lastWasSpace = false;

  const maybeAddBefore = pos => {
    if (pos < 0 || pos > n) return;
    if (isFollowedByScript(trimmed, pos)) return;
    addOp(pos, pos);
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
          addOp(j, j, tokEnd);
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
          i = after;
          continue;
        }
      }

      if (trimmed.startsWith('\\end{', i)) {
        maybeAddBefore(i);
        const endE = trimmed.indexOf('}', i + 5);
        if (endE !== -1) {
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
            // Επιτρέπουμε probes εντός του [opt] αν θέλουμε, ή προχωράμε στο {arg}
            i = j + 1;
            continue;
          }
        }
        if (j < n && trimmed[j] === '{') {
          i = j + 1;
          continue;
        }
        // Unbraced argument (π.χ. \sqrt x, \frac12): μην σπας το όρισμα με \rlap
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

    if (ch === '{' || ch === '}') {
      if (ch === '}') {
        maybeAddBefore(i);
        const next = skipHorizWs(trimmed, i + 1);
        if (next < n && trimmed[next] === '{') {
          // Μεταξύ {arg1} και {arg2} (π.χ. \frac{a}{b}): μην εισάγεις \rlap
          i = next + 1;
          continue;
        }
      }
      i++;
      continue;
    }

    if (ch === '&') {
      maybeAddBefore(i);
      i++;
      continue;
    }

    maybeAddBefore(i);
    i++;
  }

  maybeAddBefore(n);

  if (!ops.length) {
    ops.push({ at: 0, offset: 0, wrapEnd: null });
  }

  // Κράτα έως 450 probes για σταθερή ταχύτητα σε πολύ μεγάλες εξισώσεις
  let chosen = ops;
  if (ops.length > 450) {
    chosen = [];
    const step = ops.length / 450;
    for (let k = 0; k < 450; k++) {
      chosen.push(ops[Math.min(ops.length - 1, Math.floor(k * step))]);
    }
    if (chosen[chosen.length - 1] !== ops[ops.length - 1]) {
      chosen.push(ops[ops.length - 1]);
    }
  }

  let probedTex = '';
  let cursor = 0;
  for (let k = 0; k < chosen.length; k++) {
    const op = chosen[k];
    const id = k + 1;
    if (op.at > cursor) {
      probedTex += trimmed.slice(cursor, op.at);
    }
    if (op.wrapEnd && op.wrapEnd > op.at) {
      probedTex += '{' + makeProbeTex(id) + trimmed.slice(op.at, op.wrapEnd) + '}';
      cursor = op.wrapEnd;
    } else {
      probedTex += makeProbeTex(id);
      cursor = op.at;
    }
  }
  if (cursor < n) {
    probedTex += trimmed.slice(cursor);
  }

  return { chosen, probedTex };
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

function measureBatchInDom(probedTex, chosen, liveRoot, liveKatexEl, { displayMode, alignLeft }) {
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
      if (id < 1 || id > chosen.length) continue;

      const r = ruleEl.getBoundingClientRect();
      if (r.height <= 0 && r.top === 0 && r.bottom === 0) continue;

      probes.push({
        offset: chosen[id - 1].offset,
        left: r.left - cloneKRect.left,
        right: r.right - cloneKRect.left,
        top: r.top - cloneKRect.top,
        bottom: r.bottom - cloneKRect.top,
      });
    }

    return { probes, liveKRect };
  } finally {
    clone.remove();
  }
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
    const { chosen, probedTex } = buildProbePass(texSource);
    const { probes, liveKRect } = measureBatchInDom(probedTex, chosen, liveRoot, liveKatexEl, { displayMode, alignLeft });
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
