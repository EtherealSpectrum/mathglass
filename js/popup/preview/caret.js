// Caret injection στο LaTeX + εύρεση του caret στο DOM + cursor helpers.
//
// Το caret αναπαρίσταται ως \rlap{\color{#8b7bfe}{\rule[-0.18em]{0.11em}{1.08em}}}
// που render-άρεται ως ένα λεπτό μοβ ορθογώνιο. Μετά το render το βρίσκουμε με
// findCaretElement() και του προσθέτουμε class .mg-katex-caret για styling/animation.

export const CARET_COLOR_HEX = '#8b7bfe';
export const CARET_TEX = `\\rlap{\\color{${CARET_COLOR_HEX}}{\\rule[-0.18em]{0.11em}{1.08em}}}`;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── Low-level token parsing (private) ──────────────────────────────────────
function readTokenEnd(s, idx) {
  if (idx >= s.length) return idx;
  if (s[idx] === '\\') {
    if (idx + 1 < s.length && /[a-zA-Z@]/.test(s[idx + 1])) {
      let j = idx + 2;
      while (j < s.length && /[a-zA-Z@]/.test(s[j])) j++;
      return j;
    }
    return Math.min(s.length, idx + 2);
  }
  return idx + 1;
}

function findMatchingBrace(s, openIdx) {
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

// ─── Cursor helpers (exported — χρησιμοποιούνται από render/sync/init) ──────
export function getActiveCursorPos(ta) {
  if (!ta) return 0;
  return (ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd) ?? ta.value.length;
}

export function getSelectionBounds(ta) {
  if (!ta) return { start: 0, end: 0, active: false };
  const s = ta.selectionStart ?? 0;
  const e = ta.selectionEnd ?? 0;
  const start = Math.min(s, e);
  const end = Math.max(s, e);
  return { start, end, active: end > start };
}

// ─── Caret injection ────────────────────────────────────────────────────────
export function injectLatexCaret(rawMath, cursorOffset) {
  const n = rawMath.length;
  let pos = clamp(cursorOffset, 0, n);

  let i = 0;
  while (i < n) {
    const ch = rawMath[i];
    if (ch === '%') {
      const nl = rawMath.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      if (pos > i && pos <= end) pos = i;
      i = end + 1;
      continue;
    }
    if (ch === '\\') {
      if (rawMath.startsWith('\\begin{', i)) {
        const endB = rawMath.indexOf('}', i + 7);
        if (endB !== -1) {
          const envName = rawMath.slice(i + 7, endB).trim();
          let afterEnv = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && rawMath[afterEnv] === '{') {
            const specEnd = findMatchingBrace(rawMath, afterEnv);
            if (specEnd !== -1) afterEnv = specEnd + 1;
          }
          if (pos > i && pos < afterEnv) pos = afterEnv;
          i = afterEnv;
          continue;
        }
      }
      if (rawMath.startsWith('\\end{', i)) {
        const endE = rawMath.indexOf('}', i + 5);
        if (endE !== -1) {
          if (pos > i && pos <= endE + 1) pos = i;
          i = endE + 1;
          continue;
        }
      }
      if (rawMath.startsWith('\\left', i) && !/[a-zA-Z]/.test(rawMath[i + 5] || '')) {
        let j = i + 5;
        while (j < n && rawMath[j] === ' ') j++;
        const delEnd = readTokenEnd(rawMath, j);
        if (pos > i && pos < delEnd) pos = delEnd;
        i = delEnd;
        continue;
      }
      if (rawMath.startsWith('\\right', i) && !/[a-zA-Z]/.test(rawMath[i + 6] || '')) {
        let j = i + 6;
        while (j < n && rawMath[j] === ' ') j++;
        const delEnd = readTokenEnd(rawMath, j);
        if (pos > i && pos < delEnd) pos = pos <= i + 6 ? i : delEnd;
        i = delEnd;
        continue;
      }
      const cmdEnd = readTokenEnd(rawMath, i);
      const cmd = rawMath.slice(i, cmdEnd);
      if (pos > i && pos < cmdEnd) pos = cmdEnd;

      if (/^\\(?:color|textcolor|hspace|vspace|rule)$/.test(cmd)) {
        let j = cmdEnd;
        while (j < n && rawMath[j] === ' ') j++;
        if (rawMath[j] === '{') {
          const bEnd = findMatchingBrace(rawMath, j);
          if (bEnd !== -1 && pos > i && pos <= bEnd + 1) {
            pos = bEnd + 1;
          }
        }
      }
      i = cmdEnd;
      continue;
    }
    i++;
  }

  let nextNonWs = pos;
  while (nextNonWs < n && (rawMath[nextNonWs] === ' ' || rawMath[nextNonWs] === '\t')) nextNonWs++;
  let prevNonWs = pos - 1;
  while (prevNonWs >= 0 && (rawMath[prevNonWs] === ' ' || rawMath[prevNonWs] === '\t')) prevNonWs--;

  if (rawMath[nextNonWs] === '{' && prevNonWs >= 0 && (rawMath[prevNonWs] === '^' || rawMath[prevNonWs] === '_' || rawMath[prevNonWs] === '}' || rawMath[prevNonWs] === ']' || /[a-zA-Z]/.test(rawMath[prevNonWs]))) {
    const beforePrev = rawMath.slice(0, prevNonWs + 1);
    if (/(?:\\(?:frac|dfrac|tfrac|binom|sqrt|vec|hat|bar|tilde|dot|ddot|overline|underline|overset|underset|stackrel|text|textbf|mathrm|mathbf|mathbb|mathcal|operatorname|textcolor|colorbox|fcolorbox|xrightarrow|xleftarrow)\s*(?:\[[^\]]*\])?(?:\{[^}]*\})*|[_^]|\})$/.test(beforePrev)) {
      pos = nextNonWs + 1;
      prevNonWs = nextNonWs;
    }
  }

  if (prevNonWs >= 0 && (rawMath[prevNonWs] === '^' || rawMath[prevNonWs] === '_')) {
    let afterScript = pos;
    while (afterScript < n && (rawMath[afterScript] === ' ' || rawMath[afterScript] === '\t')) afterScript++;
    if (afterScript >= n || rawMath[afterScript] === '}' || (rawMath[afterScript] === '\\' && rawMath.startsWith('\\end{', afterScript))) {
      return rawMath.slice(0, pos) + '{' + CARET_TEX + '}' + rawMath.slice(pos);
    }
    if (rawMath[afterScript] !== '{') {
      const tokEnd = readTokenEnd(rawMath, afterScript);
      return rawMath.slice(0, pos) + '{' + CARET_TEX + rawMath.slice(afterScript, tokEnd) + '}' + rawMath.slice(tokEnd);
    }
  }

  return rawMath.slice(0, pos) + CARET_TEX + rawMath.slice(pos);
}

export function findCaretElement(root) {
  if (!root) return null;
  return root.querySelector(
    '.katex-rule[style*="#8b7bfe"], .katex-rule[style*="139, 123, 254"], ' +
    '.rule[style*="#8b7bfe"], .rule[style*="139, 123, 254"]'
  );
}

export function markCaretElement(root) {
  const el = findCaretElement(root);
  if (el) el.classList.add('mg-katex-caret');
  return el;
}