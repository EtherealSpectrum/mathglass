// Tab / Shift+Tab — άλμα σε επόμενο/προηγούμενο {…}.

export function computeTabJumpTarget(rawMath, localPos, dir = 1) {
  const n = rawMath.length;
  const pos = Math.max(0, Math.min(n, localPos));
  if (dir > 0) {
    let depth = 0;
    for (let i = pos; i < n; i++) {
      if (rawMath[i] === '\\') { i++; continue; }
      if (rawMath[i] === '{') {
        if (depth === 0) return i + 1;
        depth++;
      } else if (rawMath[i] === '}') {
        if (depth === 0) {
          let j = i + 1;
          while (j < n && (rawMath[j] === ' ' || rawMath[j] === '\t')) j++;
          if (j < n && rawMath[j] === '{') return j + 1;
          return i + 1;
        }
        depth--;
      }
    }
    return pos < n ? n : null;
  }
  let depth = 0;
  for (let i = pos - 1; i >= 0; i--) {
    if (i > 0 && rawMath[i - 1] === '\\') { i--; continue; }
    if (rawMath[i] === '}') {
      if (depth === 0) return i;
      depth++;
    } else if (rawMath[i] === '{') {
      if (depth === 0) {
        let k = i - 1;
        while (k >= 0 && (rawMath[k] === ' ' || rawMath[k] === '\t')) k--;
        if (k >= 0 && rawMath[k] === '}') return k;
        return i > 0 ? i : 0;
      }
      depth--;
    }
  }
  return pos > 0 ? 0 : null;
}