// Διάκριση ορατών (εντός \text{}, \ ) και αόρατων κενών σε math mode.
import { readLatexTokenEnd, TEXT_ARG_CMDS } from './parsing.js';

export function isEscapedBackslashAt(str, idx) {
  let b = 0;
  for (let k = idx - 1; k >= 0 && str[k] === '\\'; k--) b++;
  return (b % 2) === 1;
}

export function isVisibleMathSpaceAt(val, segStart, segEnd, spaceIdx) {
  if (typeof val !== 'string' || spaceIdx < segStart || spaceIdx >= segEnd) return false;
  const ch = val[spaceIdx];
  if (!/\s/.test(ch)) return false;

  // Escaped space ("\ ") είναι ορατό διάστημα στο KaTeX
  if (ch !== '\n' && ch !== '\r' && spaceIdx > segStart && val[spaceIdx - 1] === '\\' && !isEscapedBackslashAt(val, spaceIdx - 1)) {
    return true;
  }
  if (ch === '\n' || ch === '\r') return false;

  const braceTextStack = [];
  let pendingTextCmd = false;
  let i = segStart;

  while (i < spaceIdx) {
    const c = val[i];
    if (c === '%') {
      const nl = val.indexOf('\n', i);
      if (nl === -1 || nl >= spaceIdx) return false;
      i = nl + 1;
      pendingTextCmd = false;
      continue;
    }
    if (c === '\\') {
      if (val.startsWith('\\begin{', i)) {
        const endB = val.indexOf('}', i + 7);
        i = endB !== -1 ? endB + 1 : i + 7;
        pendingTextCmd = false;
        continue;
      }
      if (val.startsWith('\\end{', i)) {
        const endE = val.indexOf('}', i + 5);
        i = endE !== -1 ? endE + 1 : i + 5;
        pendingTextCmd = false;
        continue;
      }
      const cmdEnd = Math.min(segEnd, readLatexTokenEnd(val, i));
      const cmd = val.slice(i, cmdEnd);
      pendingTextCmd = TEXT_ARG_CMDS.has(cmd);
      i = cmdEnd;
      continue;
    }
    if (c === '{') {
      const parentText = braceTextStack.length > 0 && braceTextStack[braceTextStack.length - 1];
      braceTextStack.push(pendingTextCmd || parentText);
      pendingTextCmd = false;
      i++;
      continue;
    }
    if (c === '}') {
      if (braceTextStack.length > 0) braceTextStack.pop();
      pendingTextCmd = false;
      i++;
      continue;
    }
    if (!/\s/.test(c)) {
      pendingTextCmd = false;
    }
    i++;
  }
  return braceTextStack.length > 0 && braceTextStack[braceTextStack.length - 1];
}

export function skipInvisibleMathWhitespaceBack(val, segStart, pos, segEnd = val.length) {
  let p = Math.max(segStart, Math.min(segEnd, pos));
  while (p > segStart && /\s/.test(val[p - 1])) {
    if (isVisibleMathSpaceAt(val, segStart, segEnd, p - 1)) break;
    p--;
  }
  return p;
}

export function skipInvisibleMathWhitespaceForward(val, pos, segEnd, segStart = 0) {
  let p = Math.max(segStart, Math.min(segEnd, pos));
  while (p < segEnd && /\s/.test(val[p])) {
    if (isVisibleMathSpaceAt(val, segStart, segEnd, p)) break;
    p++;
  }
  return p;
}