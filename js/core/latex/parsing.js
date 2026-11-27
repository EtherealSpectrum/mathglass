// Low-level LaTeX token parsing helpers
// Δεν εξαρτάται από τίποτα — μπορεί να χρησιμοποιηθεί παντού.

export const WORD_CHAR_RE = /[A-Za-z0-9\u0370-\u03FF\u1F00-\u1FFF]/;
export const CMD_CHAR_RE  = /[A-Za-z@]/;

/** Εντολές που το όρισμά τους είναι «κείμενο» (τα κενά είναι ορατά). */
export const TEXT_ARG_CMDS = new Set([
  '\\text', '\\textbf', '\\textit', '\\textrm', '\\texttt', '\\mbox',
]);

export function readLatexTokenEnd(s, idx) {
  if (idx >= s.length) return idx;
  if (s[idx] === '\\') {
    if (idx + 1 < s.length && CMD_CHAR_RE.test(s[idx + 1])) {
      let j = idx + 2;
      while (j < s.length && CMD_CHAR_RE.test(s[j])) j++;
      return j;
    }
    return Math.min(s.length, idx + 2);
  }
  return idx + 1;
}

export function findMatchingBraceEnd(s, openIdx) {
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

export function findMatchingBracketInSeg(seg, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < seg.length; i++) {
    if (seg[i] === '\\') { i++; continue; }
    if (seg[i] === '[') depth++;
    else if (seg[i] === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function readDelimTokenEnd(seg, idx) {
  if (idx >= seg.length) return idx;
  if (seg[idx] === '\\') {
    if (idx + 1 < seg.length && CMD_CHAR_RE.test(seg[idx + 1])) {
      let j = idx + 2;
      while (j < seg.length && CMD_CHAR_RE.test(seg[j])) j++;
      return j;
    }
    return Math.min(seg.length, idx + 2);
  }
  return idx + 1;
}