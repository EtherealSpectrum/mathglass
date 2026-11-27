// Εύρεση math ranges (για Ctrl+arrows, ανοιχτά tokens).

export function findMathRangeForPos(mathRanges, pos, direction) {
  if (!Array.isArray(mathRanges) || !mathRanges.length) return null;
  for (const r of mathRanges) {
    if (direction > 0) {
      if (pos >= r.start && pos < r.end) return r;
    } else {
      if (pos > r.start && pos <= r.end) return r;
    }
  }
  return null;
}

export function extractAllMathRangesForNav(tokens) {
  const ranges = [];
  if (!Array.isArray(tokens)) return ranges;
  for (const tok of tokens) {
    if (tok.type === 'math') {
      ranges.push(tok);
      continue;
    }
    if (tok.type !== 'text' || !tok.content) continue;
    const chunk = tok.content;
    const n = chunk.length;
    let i = 0;
    while (i < n) {
      if (chunk[i] === '\\' && chunk[i + 1] === '$') { i += 2; continue; }
      let dLen = 0;
      if (chunk[i] === '[' && chunk.slice(i, i + 5).toLowerCase() === '[tex]') dLen = 5;
      else if (chunk[i] === '[' && chunk.slice(i, i + 7).toLowerCase() === '[latex]') dLen = 7;
      else if (chunk[i] === '$' && chunk[i + 1] === '$') dLen = 2;
      else if (chunk[i] === '\\' && (chunk[i + 1] === '[' || chunk[i + 1] === '(')) dLen = 2;
      else if (chunk[i] === '$' && chunk[i + 1] !== '$') dLen = 1;

      if (dLen > 0) {
        let endIdx = n;
        if (dLen === 1) {
          const blankLine = chunk.indexOf('\n\n', i + 1);
          if (blankLine !== -1) endIdx = blankLine;
        }
        ranges.push({
          type: 'math',
          start: tok.start + i,
          end: tok.start + endIdx,
          contentStart: tok.start + i + dLen,
          contentEnd: tok.start + endIdx,
          unclosed: true,
        });
        i = endIdx;
        continue;
      }
      i++;
    }
  }
  return ranges;
}