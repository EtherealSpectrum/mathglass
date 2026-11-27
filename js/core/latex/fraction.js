// / shortcut — εύρεση του προηγούμενου τελεστέου για \dfrac{όρος}{}.

export function findPrecedingFractionOperandStart(src, rangeStart, cursorPos) {
  let i = cursorPos;
  if (i <= rangeStart) return { opStart: cursorPos, stripParens: false };

  const findOpenBrace = closeIdx => {
    let d = 1;
    for (let k = closeIdx - 1; k >= rangeStart; k--) {
      if (k > rangeStart && src[k - 1] === '\\') { k--; continue; }
      if (src[k] === '}') d++;
      else if (src[k] === '{') { d--; if (d === 0) return k; }
    }
    return -1;
  };
  const findOpenParen = closeIdx => {
    let d = 1;
    for (let k = closeIdx - 1; k >= rangeStart; k--) {
      if (k > rangeStart && src[k - 1] === '\\') { k--; continue; }
      if (src[k] === ')') d++;
      else if (src[k] === '(') { d--; if (d === 0) return k; }
    }
    return -1;
  };
  const findOpenBracket = closeIdx => {
    let d = 1;
    for (let k = closeIdx - 1; k >= rangeStart; k--) {
      if (k > rangeStart && src[k - 1] === '\\') { k--; continue; }
      if (src[k] === ']') d++;
      else if (src[k] === '[') { d--; if (d === 0) return k; }
    }
    return -1;
  };

  if (src[i - 1] === ')') {
    const openP = findOpenParen(i - 1);
    if (openP !== -1) {
      if (openP >= rangeStart + 5 && src.slice(openP - 5, openP) === '\\left') {
        const beforeLeft = openP - 5;
        if (beforeLeft > rangeStart && /[A-Za-z0-9}]/.test(src[beforeLeft - 1])) {
          let p = beforeLeft;
          while (p > rangeStart && /[A-Za-z0-9_]/.test(src[p - 1])) p--;
          if (p > rangeStart && src[p - 1] === '\\') p--;
          return { opStart: p, stripParens: false };
        }
        return { opStart: beforeLeft, stripParens: true };
      }
      if (openP > rangeStart && /[A-Za-z0-9}]/.test(src[openP - 1])) {
        let p = openP;
        while (p > rangeStart && /[A-Za-z0-9_]/.test(src[p - 1])) p--;
        if (p > rangeStart && src[p - 1] === '\\') p--;
        return { opStart: p, stripParens: false };
      }
      return { opStart: openP, stripParens: true };
    }
  }

  const consumeUnitBack = endIdx => {
    let k = endIdx;
    if (k <= rangeStart) return k;
    if (src[k - 1] === '}') {
      const ob = findOpenBrace(k - 1);
      if (ob === -1) return endIdx;
      k = ob;
      while (k > rangeStart && (src[k - 1] === ' ' || src[k - 1] === '\t')) k--;
      if (k > rangeStart && (src[k - 1] === '^' || src[k - 1] === '_')) {
        k--;
        return consumeUnitBack(k);
      }
      if (k > rangeStart && src[k - 1] === '}') {
        const prevOb = findOpenBrace(k - 1);
        if (prevOb !== -1) {
          let m = prevOb;
          while (m > rangeStart && (src[m - 1] === ' ' || src[m - 1] === '\t')) m--;
          if (m > rangeStart && src[m - 1] === ']') {
            const br = findOpenBracket(m - 1);
            if (br !== -1) {
              m = br;
              while (m > rangeStart && (src[m - 1] === ' ' || src[m - 1] === '\t')) m--;
            }
          }
          if (m > rangeStart && /[A-Za-z]/.test(src[m - 1])) {
            let c = m;
            while (c > rangeStart && /[A-Za-z]/.test(src[c - 1])) c--;
            if (c > rangeStart && src[c - 1] === '\\') return c - 1;
          }
        }
      }
      if (k > rangeStart && src[k - 1] === ']') {
        const br = findOpenBracket(k - 1);
        if (br !== -1) {
          k = br;
          while (k > rangeStart && (src[k - 1] === ' ' || src[k - 1] === '\t')) k--;
        }
      }
      if (k > rangeStart && /[A-Za-z]/.test(src[k - 1])) {
        let c = k;
        while (c > rangeStart && /[A-Za-z]/.test(src[c - 1])) c--;
        if (c > rangeStart && src[c - 1] === '\\') return c - 1;
      }
      return k;
    }
    if (/[A-Za-z0-9.]/.test(src[k - 1])) {
      while (k > rangeStart && /[A-Za-z0-9.]/.test(src[k - 1])) k--;
      if (k > rangeStart && src[k - 1] === '\\') k--;
      if (k > rangeStart && (src[k - 1] === '^' || src[k - 1] === '_')) {
        return consumeUnitBack(k - 1);
      }
      return k;
    }
    return endIdx;
  };

  const opStart = consumeUnitBack(i);
  return { opStart, stripParens: false };
}