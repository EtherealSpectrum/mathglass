// Balanced candidate builder — γεμίζει ανοιχτές δομές για partial render.
//
// Όταν ο χρήστης γράφει `\frac{x}{` (χωρίς κλείσιμο), το KaTeX πετάει σφάλμα.
// Αυτή η συνάρτηση προσθέτει ghost tokens `{\color{red}{\square}}` για να κλείσει
// τις ανοιχτές δομές ώστε να φανεί ό,τι έχει γραφτεί μέχρι τώρα.

export function buildBalancedCandidate(trimmed, errorColor) {
  let s = trimmed;
  const ghost = `{\\color{${errorColor}}{\\square}}`;

  let trailingSlashes = 0;
  for (let k = s.length - 1; k >= 0 && s[k] === '\\'; k--) trailingSlashes++;
  if (trailingSlashes % 2 === 1) {
    s = s.slice(0, -1) + ghost;
  }

  const braceStack = [];
  const envStack = [];
  let leftCount = 0;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];
    if (ch === '%') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (ch === '\\') {
      if (s.startsWith('\\begin{', i)) {
        const endB = s.indexOf('}', i + 7);
        if (endB !== -1) {
          const envName = s.slice(i + 7, endB).trim();
          if (envName) envStack.push(envName);
          if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
          i = endB + 1;
          continue;
        }
      }
      if (s.startsWith('\\end{', i)) {
        const endE = s.indexOf('}', i + 5);
        if (endE !== -1) {
          const envName = s.slice(i + 5, endE).trim();
          const idx = envStack.lastIndexOf(envName);
          if (idx !== -1) envStack.splice(idx, 1);
          if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
          i = endE + 1;
          continue;
        }
      }
      if (s.startsWith('\\left', i) && !/[a-zA-Z]/.test(s[i + 5] || '')) {
        leftCount++;
        if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
        i += 5;
        continue;
      }
      if (s.startsWith('\\right', i) && !/[a-zA-Z]/.test(s[i + 6] || '')) {
        if (leftCount > 0) leftCount--;
        if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
        i += 6;
        continue;
      }
      if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
      if (i + 1 < s.length && /[a-zA-Z]/.test(s[i + 1])) {
        i += 2;
        while (i < s.length && /[a-zA-Z]/.test(s[i])) i++;
      } else {
        i += 2;
      }
      continue;
    }
    if (ch === '{') {
      braceStack.push({ hadContent: false });
      i++;
      continue;
    }
    if (ch === '}') {
      if (braceStack.length > 0) {
        braceStack.pop();
        if (braceStack.length > 0) braceStack[braceStack.length - 1].hadContent = true;
      }
      i++;
      continue;
    }
    if (!/\s/.test(ch) && braceStack.length > 0) {
      braceStack[braceStack.length - 1].hadContent = true;
    }
    i++;
  }

  if (/[_^]\s*$/.test(s)) {
    s += ghost;
  }

  for (let b = braceStack.length - 1; b >= 0; b--) {
    if (!braceStack[b].hadContent) {
      s += `\\color{${errorColor}}{\\square}`;
    }
    s += '}';
    if (b > 0) braceStack[b - 1].hadContent = true;
  }

  while (leftCount > 0) {
    s += '\\right.';
    leftCount--;
  }

  for (let e = envStack.length - 1; e >= 0; e--) {
    s += `\\end{${envStack[e]}}`;
  }

  return s;
}