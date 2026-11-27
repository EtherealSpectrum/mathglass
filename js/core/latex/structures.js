// Parser δομικών LaTeX οντοτήτων (\frac, \sqrt, \left…\right, ^{}, _{}, {...}, \begin…\end).
import {
  readLatexTokenEnd, findMatchingBraceEnd,
  findMatchingBracketInSeg, readDelimTokenEnd,
  CMD_CHAR_RE,
} from './parsing.js';

const WYSIWYG_TWO_ARG_CMDS = new Set([
  '\\frac', '\\dfrac', '\\tfrac', '\\cfrac',
  '\\binom', '\\dbinom', '\\tbinom',
  '\\overset', '\\underset', '\\stackrel',
]);
const WYSIWYG_ONE_ARG_CMDS = new Set([
  '\\sqrt', '\\vec', '\\hat', '\\bar', '\\tilde', '\\dot', '\\ddot',
  '\\overline', '\\underline', '\\widehat', '\\widetilde',
  '\\overrightarrow', '\\overleftarrow', '\\overbrace', '\\underbrace',
  '\\boxed', '\\fbox',
  '\\text', '\\textbf', '\\textit', '\\textrm', '\\texttt', '\\mbox',
  '\\mathrm', '\\mathbf', '\\mathbb', '\\mathcal', '\\mathit', '\\mathsf', '\\mathtt',
  '\\boldsymbol', '\\operatorname', '\\xrightarrow', '\\xleftarrow',
]);
const WYSIWYG_OPT_ARG_CMDS = new Set(['\\sqrt', '\\xrightarrow', '\\xleftarrow']);

export function parseMathStructures(seg) {
  const n = seg.length;
  const nodes = [];
  const ownedBraces = new Set();

  const skipWs = idx => {
    let j = idx;
    while (j < n && (seg[j] === ' ' || seg[j] === '\t' || seg[j] === '\n' || seg[j] === '\r')) j++;
    return j;
  };
  const readArg = idx => {
    const j = skipWs(idx);
    if (j >= n) return null;
    if (seg[j] === '{') {
      const close = findMatchingBraceEnd(seg, j);
      if (close === -1) return null;
      ownedBraces.add(j);
      return { open: j, close, contentStart: j + 1, contentEnd: close, braced: true, nextPos: close + 1 };
    }
    if (seg[j] === '}' || seg[j] === '&') return null;
    const tokEnd = readLatexTokenEnd(seg, j);
    if (tokEnd <= j) return null;
    return { open: j, close: tokEnd, contentStart: j, contentEnd: tokEnd, braced: false, nextPos: tokEnd };
  };

  // 1. \left ... \right
  const leftStack = [];
  let i = 0;
  while (i < n) {
    if (seg[i] === '%') { const nl = seg.indexOf('\n', i); i = nl === -1 ? n : nl + 1; continue; }
    if (seg[i] === '\\') {
      if (seg.startsWith('\\left', i) && !CMD_CHAR_RE.test(seg[i + 5] || '')) {
        const dStart = skipWs(i + 5);
        const dEnd = readDelimTokenEnd(seg, dStart);
        leftStack.push({ start: i, innerStart: dEnd });
        i = dEnd;
        continue;
      }
      if (seg.startsWith('\\right', i) && !CMD_CHAR_RE.test(seg[i + 6] || '')) {
        const dStart = skipWs(i + 6);
        const dEnd = readDelimTokenEnd(seg, dStart);
        if (leftStack.length) {
          const top = leftStack.pop();
          nodes.push({ type: 'delim', start: top.start, end: dEnd, innerStart: top.innerStart, innerEnd: i });
        }
        i = dEnd;
        continue;
      }
      i = readLatexTokenEnd(seg, i);
      continue;
    }
    i++;
  }

  // 2. \begin{env} ... \end{env}
  const envStack = [];
  i = 0;
  while (i < n) {
    if (seg[i] === '%') { const nl = seg.indexOf('\n', i); i = nl === -1 ? n : nl + 1; continue; }
    if (seg[i] === '\\') {
      if (seg.startsWith('\\begin{', i)) {
        const endB = seg.indexOf('}', i + 7);
        if (endB !== -1) {
          ownedBraces.add(i + 6);
          const envName = seg.slice(i + 7, endB).trim();
          let afterEnv = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && seg[afterEnv] === '{') {
            const specEnd = findMatchingBraceEnd(seg, afterEnv);
            if (specEnd !== -1) { ownedBraces.add(afterEnv); afterEnv = specEnd + 1; }
          }
          envStack.push({ env: envName, start: i, innerStart: afterEnv });
          i = afterEnv;
          continue;
        }
      }
      if (seg.startsWith('\\end{', i)) {
        const endE = seg.indexOf('}', i + 5);
        if (endE !== -1) {
          ownedBraces.add(i + 4);
          if (envStack.length) {
            const top = envStack.pop();
            nodes.push({ type: 'env', env: top.env, start: top.start, end: endE + 1, innerStart: top.innerStart, innerEnd: i });
          }
          i = endE + 1;
          continue;
        }
      }
      i = readLatexTokenEnd(seg, i);
      continue;
    }
    i++;
  }

  // 3. Εντολές 1/2 args & scripts (^, _)
  for (let k = 0; k < n; k++) {
    const ch = seg[k];
    if (ch === '%') { const nl = seg.indexOf('\n', k); k = nl === -1 ? n : nl; continue; }
    if (ch === '\\') {
      const cmdEnd = readLatexTokenEnd(seg, k);
      const cmd = seg.slice(k, cmdEnd);
      if (WYSIWYG_TWO_ARG_CMDS.has(cmd)) {
        const a1 = readArg(cmdEnd);
        if (a1 && a1.braced) {
          const a2 = readArg(a1.nextPos);
          if (a2 && a2.braced) {
            nodes.push({ type: 'two-arg', cmd, start: k, end: a2.nextPos, slots: [a1, a2] });
          }
        }
        k = cmdEnd - 1;
        continue;
      }
      if (WYSIWYG_ONE_ARG_CMDS.has(cmd)) {
        let cur = cmdEnd;
        let optSlot = null;
        if (WYSIWYG_OPT_ARG_CMDS.has(cmd)) {
          const j = skipWs(cur);
          if (j < n && seg[j] === '[') {
            const brEnd = findMatchingBracketInSeg(seg, j);
            if (brEnd !== -1) {
              optSlot = { open: j, close: brEnd, contentStart: j + 1, contentEnd: brEnd, braced: true, nextPos: brEnd + 1 };
              cur = brEnd + 1;
            }
          }
        }
        const a1 = readArg(cur);
        if (a1 && a1.braced) {
          nodes.push({ type: 'one-arg', cmd, start: k, end: a1.nextPos, optSlot, slots: [a1] });
        }
        k = cmdEnd - 1;
        continue;
      }
      k = cmdEnd - 1;
      continue;
    }
    if ((ch === '^' || ch === '_') && !isEscapedBackslashAt(seg, k)) {
      const a1 = readArg(k + 1);
      if (a1) {
        nodes.push({ type: 'script', op: ch, start: k, end: a1.nextPos, slots: [a1] });
      } else {
        nodes.push({ type: 'script', op: ch, start: k, end: k + 1, bare: true, slots: [] });
      }
    }
  }

  // 4. Ανεξάρτητα {...}
  for (let k = 0; k < n; k++) {
    if (seg[k] === '\\') { k++; continue; }
    if (seg[k] === '{' && !ownedBraces.has(k)) {
      const close = findMatchingBraceEnd(seg, k);
      if (close !== -1) {
        nodes.push({ type: 'brace', start: k, end: close + 1, innerStart: k + 1, innerEnd: close });
      }
    }
  }

  nodes.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  return nodes;
}

function isEscapedBackslashAt(str, idx) {
  let b = 0;
  for (let k = idx - 1; k >= 0 && str[k] === '\\'; k--) b++;
  return (b % 2) === 1;
}