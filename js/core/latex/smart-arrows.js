// Smart ←/→ μέσα σε math — κίνηση μεταξύ «οπτικών» stops (τύπου Wolfram).
import {
  readLatexTokenEnd, findMatchingBraceEnd, CMD_CHAR_RE,
} from './parsing.js';
import { skipInvisibleMathWhitespaceBack, skipInvisibleMathWhitespaceForward } from './whitespace.js';
import { findMathRangeForPos } from './ranges.js';

const STRUCTURAL_PREFIX_CMDS = new Set([
  '\\frac', '\\dfrac', '\\tfrac', '\\cfrac', '\\binom', '\\dbinom', '\\tbinom', '\\sqrt',
  '\\vec', '\\hat', '\\bar', '\\tilde', '\\dot', '\\ddot',
  '\\overline', '\\underline', '\\widehat', '\\widetilde',
  '\\overrightarrow', '\\overleftarrow', '\\overbrace', '\\underbrace',
  '\\overset', '\\underset', '\\stackrel',
  '\\text', '\\textbf', '\\textit', '\\textrm', '\\texttt', '\\mbox',
  '\\mathrm', '\\mathbf', '\\mathbb', '\\mathcal', '\\mathit', '\\mathsf', '\\mathtt',
  '\\boldsymbol', '\\boxed', '\\fbox',
  '\\operatorname', '\\xrightarrow', '\\xleftarrow',
  '\\colorbox', '\\fcolorbox',
]);
const NON_VISUAL_ARG_CMDS = new Set(['\\color', '\\textcolor', '\\hspace', '\\vspace', '\\rule']);
const TEXT_ARG_CMDS = new Set(['\\text', '\\textbf', '\\textit', '\\textrm', '\\texttt', '\\mbox']);

function readLatexTokenEnd_local(s, idx) { return readLatexTokenEnd(s, idx); } // alias για ευκολία

export function collectLatexCaretStops(rawMath) {
  const n = rawMath.length;
  if (!n) return [0];

  const rawStops = [];
  const braceTextStack = [];
  let pendingTextCmd = false;
  let pendingOptCmd = false;
  let inOptBracketDepth = 0;
  let i = 0;

  const pushStop = (pos, isContent = false, keepSpace = false) => {
    if (rawStops.length && rawStops[rawStops.length - 1].pos === pos) {
      if (isContent) rawStops[rawStops.length - 1].isContent = true;
      if (keepSpace) rawStops[rawStops.length - 1].keepSpace = true;
      return;
    }
    rawStops.push({ pos, isContent, keepSpace });
  };

  while (i < n) {
    const ch = rawMath[i];
    if (ch === '%') { const nl = rawMath.indexOf('\n', i); i = nl === -1 ? n : nl + 1; continue; }
    if (/\s/.test(ch)) {
      const inText = braceTextStack.length > 0 && braceTextStack[braceTextStack.length - 1];
      if (inText && ch !== '\n' && ch !== '\r') {
        pushStop(i, true, true);
        i++;
        pushStop(i, true, true);
      } else i++;
      continue;
    }
    if (ch === '\\') {
      if (rawMath.startsWith('\\begin{', i)) {
        const endB = rawMath.indexOf('}', i + 7);
        if (endB !== -1) {
          pushStop(i, false);
          const envName = rawMath.slice(i + 7, endB).trim();
          let afterEnv = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && rawMath[afterEnv] === '{') {
            const specEnd = findMatchingBraceEnd(rawMath, afterEnv);
            if (specEnd !== -1) afterEnv = specEnd + 1;
          }
          i = afterEnv;
          pushStop(i, false);
          pendingTextCmd = false;
          pendingOptCmd = false;
          continue;
        }
      }
      if (rawMath.startsWith('\\end{', i)) {
        const endE = rawMath.indexOf('}', i + 5);
        if (endE !== -1) {
          pushStop(i, false);
          i = endE + 1;
          pushStop(i, false);
          pendingTextCmd = false;
          pendingOptCmd = false;
          continue;
        }
      }
      if (rawMath.startsWith('\\left', i) && !/[a-zA-Z]/.test(rawMath[i + 5] || '')) {
        pushStop(i, true);
        let j = i + 5;
        while (j < n && rawMath[j] === ' ') j++;
        i = readLatexTokenEnd_local(rawMath, j);
        pushStop(i, true);
        pendingTextCmd = false;
        pendingOptCmd = false;
        continue;
      }
      if (rawMath.startsWith('\\right', i) && !/[a-zA-Z]/.test(rawMath[i + 6] || '')) {
        pushStop(i, true);
        let j = i + 6;
        while (j < n && rawMath[j] === ' ') j++;
        i = readLatexTokenEnd_local(rawMath, j);
        pushStop(i, true);
        pendingTextCmd = false;
        pendingOptCmd = false;
        continue;
      }
      const cmdEnd = readLatexTokenEnd_local(rawMath, i);
      const cmd = rawMath.slice(i, cmdEnd);

      if (NON_VISUAL_ARG_CMDS.has(cmd)) {
        let j = cmdEnd;
        while (j < n && rawMath[j] === ' ') j++;
        if (rawMath[j] === '{') {
          const bEnd = findMatchingBraceEnd(rawMath, j);
          if (bEnd !== -1) { i = bEnd + 1; continue; }
        }
      }
      if (cmd === '\\\\') {
        pushStop(i, false);
        i = cmdEnd;
        pushStop(i, false);
        pendingTextCmd = false;
        pendingOptCmd = false;
        continue;
      }
      if (STRUCTURAL_PREFIX_CMDS.has(cmd)) {
        pushStop(i, true);
        i = cmdEnd;
        pendingTextCmd = TEXT_ARG_CMDS.has(cmd);
        pendingOptCmd = cmd === '\\sqrt' || cmd === '\\xrightarrow' || cmd === '\\xleftarrow';
        continue;
      }
      pushStop(i, true);
      i = cmdEnd;
      pushStop(i, true);
      pendingTextCmd = false;
      pendingOptCmd = false;
      continue;
    }
    if (ch === '^' || ch === '_') {
      pushStop(i, true);
      let j = i + 1;
      while (j < n && (rawMath[j] === ' ' || rawMath[j] === '\t')) j++;
      if (j < n && rawMath[j] === '{') {
        braceTextStack.push(false);
        i = j + 1;
        pushStop(i, true);
      } else {
        i = j;
        pushStop(i, true);
      }
      pendingTextCmd = false;
      pendingOptCmd = false;
      continue;
    }
    if (ch === '{') {
      const parentText = braceTextStack.length > 0 && braceTextStack[braceTextStack.length - 1];
      braceTextStack.push(pendingTextCmd || parentText);
      pendingTextCmd = false;
      pendingOptCmd = false;
      i++;
      pushStop(i, true);
      continue;
    }
    if (ch === '}') {
      if (braceTextStack.length > 0) braceTextStack.pop();
      pushStop(i, true);
      i++;
      let j = i;
      while (j < n && (rawMath[j] === ' ' || rawMath[j] === '\t')) j++;
      if (j < n && rawMath[j] === '{') i = j;
      else pushStop(i, true);
      pendingTextCmd = false;
      pendingOptCmd = false;
      continue;
    }
    if (ch === '[' && pendingOptCmd) {
      pendingOptCmd = false;
      inOptBracketDepth++;
      i++;
      pushStop(i, true);
      continue;
    }
    if (ch === ']' && inOptBracketDepth > 0) {
      inOptBracketDepth--;
      pushStop(i, true);
      i++;
      let j = i;
      while (j < n && (rawMath[j] === ' ' || rawMath[j] === '\t')) j++;
      if (j < n && rawMath[j] === '{') i = j;
      else pushStop(i, true);
      pendingTextCmd = false;
      pendingOptCmd = false;
      continue;
    }
    if (ch === '&') {
      pushStop(i, false);
      i++;
      pushStop(i, false);
      pendingTextCmd = false;
      pendingOptCmd = false;
      continue;
    }
    pushStop(i, true);
    i++;
    pushStop(i, true);
    pendingTextCmd = false;
    pendingOptCmd = false;
  }

  const deduped = [];
  for (const st of rawStops) {
    if (!deduped.length) { deduped.push(st); continue; }
    const prev = deduped[deduped.length - 1];
    const between = rawMath.slice(prev.pos, st.pos);
    if (/^[ \t\r\n]*$/.test(between)) {
      if (st.keepSpace && prev.keepSpace && between === ' ') { deduped.push(st); continue; }
      if (!prev.isContent && st.isContent) deduped[deduped.length - 1] = st;
      continue;
    }
    if (/^[ \t\r\n]*&[ \t\r\n]*$/.test(between)) {
      if (!prev.isContent && st.isContent) { deduped[deduped.length - 1] = st; continue; }
      if (prev.isContent && !st.isContent) continue;
    }
    deduped.push(st);
  }
  return deduped.length ? deduped.map(s => s.pos) : [0];
}

export function computeSmartLatexArrowTarget(value, caretPos, direction, mathRanges, isStandaloneMath = false) {
  if (typeof value !== 'string') return null;
  const dir = direction >= 0 ? 1 : -1;
  const pos = Math.max(0, Math.min(value.length, caretPos));
  const range = isStandaloneMath
    ? { type: 'math', start: 0, end: value.length, contentStart: 0, contentEnd: value.length }
    : findMathRangeForPos(mathRanges, pos, dir);
  if (!range) return null;

  const rawMath = value.slice(range.contentStart, range.contentEnd);
  const absStops = collectLatexCaretStops(rawMath).map(off => range.contentStart + off);

  if (dir > 0) {
    const effPos = pos < range.contentStart
      ? range.contentStart
      : Math.min(range.contentEnd, skipInvisibleMathWhitespaceForward(value, pos, range.contentEnd, range.contentStart));
    for (let k = 0; k < absStops.length; k++) {
      if (absStops[k] > effPos) return absStops[k];
    }
    if (!isStandaloneMath) return pos < range.end ? range.end : null;
    return pos < value.length ? value.length : null;
  }

  const effPos = pos > range.contentEnd
    ? pos
    : Math.max(range.contentStart, skipInvisibleMathWhitespaceBack(value, range.contentStart, pos, range.contentEnd));
  for (let k = absStops.length - 1; k >= 0; k--) {
    if (absStops[k] < effPos) return absStops[k];
  }
  if (!isStandaloneMath) return pos > range.start ? range.start : null;
  return pos > 0 ? 0 : null;
}