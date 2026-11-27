// Ctrl + ←/→ — άλμα ανά word/εντολή LaTeX.
import { WORD_CHAR_RE, CMD_CHAR_RE } from './parsing.js';
import { findMathRangeForPos } from './ranges.js';

function stepRightInRange(value, pos, range) {
  const limit = range.end;
  const contentEnd = range.contentEnd;
  let i = pos < range.contentStart ? range.contentStart : pos;
  if (i >= contentEnd) return limit;

  if (value[i] === '\\' && i + 1 < contentEnd) {
    i++;
    if (CMD_CHAR_RE.test(value[i])) {
      while (i < contentEnd && CMD_CHAR_RE.test(value[i])) i++;
    } else i++;
    return i;
  }
  if (WORD_CHAR_RE.test(value[i])) {
    while (i < contentEnd && WORD_CHAR_RE.test(value[i])) i++;
    return i;
  }

  let j = i;
  while (j < contentEnd && value[j] !== '\\' && !WORD_CHAR_RE.test(value[j])) j++;
  if (j < contentEnd) {
    if (value[j] === '\\' && j + 1 < contentEnd) {
      j++;
      if (CMD_CHAR_RE.test(value[j])) {
        while (j < contentEnd && CMD_CHAR_RE.test(value[j])) j++;
      } else j++;
      return j;
    }
    if (WORD_CHAR_RE.test(value[j])) {
      while (j < contentEnd && WORD_CHAR_RE.test(value[j])) j++;
      return j;
    }
  }
  return limit;
}

function stepLeftInRange(value, pos, range) {
  const start = range.start;
  const contentStart = range.contentStart;
  let i = pos > range.contentEnd ? range.contentEnd : pos;
  if (i <= contentStart) return start;

  let j = i;
  while (j > contentStart && !WORD_CHAR_RE.test(value[j - 1])) {
    if (
      j - 2 >= contentStart &&
      value[j - 2] === '\\' &&
      !CMD_CHAR_RE.test(value[j - 1]) &&
      value[j - 1] !== '\n' &&
      value[j - 1] !== '\r'
    ) return j - 2;
    j--;
  }
  if (j > contentStart) {
    let k = j;
    while (k > contentStart && WORD_CHAR_RE.test(value[k - 1])) k--;
    if (k > contentStart && value[k - 1] === '\\') {
      const token = value.slice(k, j);
      if (/^[A-Za-z@]+$/.test(token)) k--;
    }
    if (k < pos) return k;
  }
  return start;
}

function stepLeftPlain(value, pos, mathRanges) {
  if (pos <= 0) return null;
  let j = pos;
  while (j > 0 && !WORD_CHAR_RE.test(value[j - 1])) {
    const prevMath = findMathRangeForPos(mathRanges, j, -1);
    if (prevMath) return stepLeftInRange(value, j, prevMath);
    j--;
  }
  if (j > 0) {
    const prevMath = findMathRangeForPos(mathRanges, j, -1);
    if (prevMath) return stepLeftInRange(value, j, prevMath);
    let k = j;
    while (k > 0 && WORD_CHAR_RE.test(value[k - 1])) {
      if (findMathRangeForPos(mathRanges, k, -1)) break;
      k--;
    }
    if (k < pos) return k;
  }
  return 0;
}

export function computeCtrlArrowTarget(value, caretPos, direction, mathRanges) {
  if (typeof value !== 'string') return null;
  const dir = direction >= 0 ? 1 : -1;
  const pos = Math.max(0, Math.min(value.length, caretPos));
  const range = findMathRangeForPos(mathRanges, pos, dir);
  if (!range) {
    if (dir < 0 && pos > 0) {
      return Math.max(0, Math.min(pos - 1, stepLeftPlain(value, pos, mathRanges)));
    }
    return null;
  }
  const target = dir > 0
    ? stepRightInRange(value, pos, range)
    : stepLeftInRange(value, pos, range);
  if (dir > 0) return Math.min(value.length, Math.max(pos + 1, target));
  return Math.max(0, Math.min(pos - 1, target));
}