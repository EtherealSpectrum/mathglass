const WORD_CHAR_RE = /[A-Za-z0-9\u0370-\u03FF\u1F00-\u1FFF]/;
const CMD_CHAR_RE = /[A-Za-z@]/;

function findMathRangeForPos(mathRanges, pos, direction) {
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

function stepRightInRange(value, pos, range) {
  const limit = range.end;
  const contentEnd = range.contentEnd;

  let i = pos < range.contentStart ? range.contentStart : pos;

  if (i >= contentEnd) {
    return limit;
  }

  // Εάν είμαστε ήδη μέσα σε όνομα εντολής (\frac) ή λέξη/αριθμό, ολοκλήρωσε το token
  if (value[i] === '\\' && i + 1 < contentEnd) {
    i++;
    if (CMD_CHAR_RE.test(value[i])) {
      while (i < contentEnd && CMD_CHAR_RE.test(value[i])) i++;
    } else {
      i++;
    }
    return i;
  }
  if (WORD_CHAR_RE.test(value[i])) {
    while (i < contentEnd && WORD_CHAR_RE.test(value[i])) i++;
    return i;
  }

  // Προσπέρασε κενά, αλλαγές γραμμής και διαχωριστικά ({ } ^ _ + - = κ.λπ.) μέχρι το επόμενο token
  let j = i;
  while (j < contentEnd && value[j] !== '\\' && !WORD_CHAR_RE.test(value[j])) {
    j++;
  }

  if (j < contentEnd) {
    if (value[j] === '\\' && j + 1 < contentEnd) {
      j++;
      if (CMD_CHAR_RE.test(value[j])) {
        while (j < contentEnd && CMD_CHAR_RE.test(value[j])) j++;
      } else {
        j++;
      }
      return j;
    }
    if (WORD_CHAR_RE.test(value[j])) {
      while (j < contentEnd && WORD_CHAR_RE.test(value[j])) j++;
      return j;
    }
  }

  // Δεν απομένει άλλο token πριν το τέλος της εξίσωσης: πήδα όλο το υπόλοιπο μαζί με το κλείσιμο ($)
  return limit;
}

function stepLeftInRange(value, pos, range) {
  const start = range.start;
  const contentStart = range.contentStart;

  let i = pos > range.contentEnd ? range.contentEnd : pos;

  if (i <= contentStart) {
    return start;
  }

  // Προσπέρασε προς τα πίσω κενά και διαχωριστικά μέχρι το προηγούμενο token
  let j = i;
  while (j > contentStart && !WORD_CHAR_RE.test(value[j - 1])) {
    // Εάν βρεθούμε αμέσως μετά από εντολή τύπου \, ή \\ ή \{ (όχι πριν από αλλαγή γραμμής)
    if (
      j - 2 >= contentStart &&
      value[j - 2] === '\\' &&
      !CMD_CHAR_RE.test(value[j - 1]) &&
      value[j - 1] !== '\n' &&
      value[j - 1] !== '\r'
    ) {
      return j - 2;
    }
    j--;
  }

  if (j > contentStart) {
    // Κατανάλωσε τη λέξη/όνομα εντολής προς τα πίσω
    let k = j;
    while (k > contentStart && WORD_CHAR_RE.test(value[k - 1])) {
      k--;
    }
    // Εάν προηγείται '\' και τα γράμματα είναι εντολή LaTeX, συμπερίλαβε και το '\'
    if (k > contentStart && value[k - 1] === '\\') {
      const token = value.slice(k, j);
      if (/^[A-Za-z@]+$/.test(token)) {
        k--;
      }
    }
    if (k < pos) return k;
  }

  // Δεν υπάρχει άλλο token πριν το contentStart: πήδα έξω από το άνοιγμα ($)
  return start;
}

/**
 * Συμπληρώνει τα κλειστά math tokens με τυχόν ανοιχτό (μη κλεισμένο ακόμα) math delimiter
 * ώστε το Ctrl+Left/Right να λειτουργεί και ενόσω γράφεται μια νέα εξίσωση.
 */
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

function stepLeftPlain(value, pos, mathRanges) {
  if (pos <= 0) return null;
  let j = pos;
  while (j > 0 && !WORD_CHAR_RE.test(value[j - 1])) {
    const prevMath = findMathRangeForPos(mathRanges, j, -1);
    if (prevMath) {
      return stepLeftInRange(value, j, prevMath);
    }
    j--;
  }
  if (j > 0) {
    const prevMath = findMathRangeForPos(mathRanges, j, -1);
    if (prevMath) {
      return stepLeftInRange(value, j, prevMath);
    }
    let k = j;
    while (k > 0 && WORD_CHAR_RE.test(value[k - 1])) {
      if (findMathRangeForPos(mathRanges, k, -1)) break;
      k--;
    }
    if (k < pos) return k;
  }
  return 0;
}

/**
 * Υπολογίζει τη νέα θέση κέρσορα για Ctrl + Left/Right εντός εξισώσεων ($...$, $$...$$, [tex]...[/tex] κ.λπ.),
 * καθώς και τη διάσχιση αλλαγών γραμμής προς τα αριστερά σε πεζό κείμενο ώστε το Ctrl+Left να ανεβαίνει πάντα γραμμή.
 */
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

function readLatexTokenEnd(s, idx) {
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

function findMatchingBraceEnd(s, openIdx) {
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

/**
 * Υπολογίζει τις οπτικά έγκυρες και διαισθητικές θέσεις κέρσορα εντός κώδικα LaTeX
 * (αποφεύγει παγίδες σε {, }, ^, _, ονόματα εντολών, & και \\ ώστε κάθε βελάκι
 * να μετακινεί ομαλά τον κέρσορα στην προεπισκόπηση).
 */
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

    if (ch === '%') {
      const nl = rawMath.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }

    if (/\s/.test(ch)) {
      const inText = braceTextStack.length > 0 && braceTextStack[braceTextStack.length - 1];
      if (inText && ch !== '\n' && ch !== '\r') {
        pushStop(i, true, true);
        i++;
        pushStop(i, true, true);
      } else {
        i++;
      }
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
        i = readLatexTokenEnd(rawMath, j);
        pushStop(i, true);
        pendingTextCmd = false;
        pendingOptCmd = false;
        continue;
      }
      if (rawMath.startsWith('\\right', i) && !/[a-zA-Z]/.test(rawMath[i + 6] || '')) {
        pushStop(i, true);
        let j = i + 6;
        while (j < n && rawMath[j] === ' ') j++;
        i = readLatexTokenEnd(rawMath, j);
        pushStop(i, true);
        pendingTextCmd = false;
        pendingOptCmd = false;
        continue;
      }

      const cmdEnd = readLatexTokenEnd(rawMath, i);
      const cmd = rawMath.slice(i, cmdEnd);

      if (NON_VISUAL_ARG_CMDS.has(cmd)) {
        let j = cmdEnd;
        while (j < n && rawMath[j] === ' ') j++;
        if (rawMath[j] === '{') {
          const bEnd = findMatchingBraceEnd(rawMath, j);
          if (bEnd !== -1) {
            i = bEnd + 1;
            continue;
          }
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
      if (j < n && rawMath[j] === '{') {
        i = j;
      } else {
        pushStop(i, true);
      }
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
      if (j < n && rawMath[j] === '{') {
        i = j;
      } else {
        pushStop(i, true);
      }
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
    if (!deduped.length) {
      deduped.push(st);
      continue;
    }
    const prev = deduped[deduped.length - 1];
    const between = rawMath.slice(prev.pos, st.pos);
    if (/^[ \t\r\n]*$/.test(between)) {
      if (st.keepSpace && prev.keepSpace && between === ' ') {
        deduped.push(st);
        continue;
      }
      if (!prev.isContent && st.isContent) {
        deduped[deduped.length - 1] = st;
      }
      continue;
    }
    if (/^[ \t\r\n]*&[ \t\r\n]*$/.test(between)) {
      if (!prev.isContent && st.isContent) {
        deduped[deduped.length - 1] = st;
        continue;
      }
      if (prev.isContent && !st.isContent) {
        continue;
      }
    }
    deduped.push(st);
  }

  return deduped.length ? deduped.map(s => s.pos) : [0];
}

/**
 * Διαισθητική πλοήγηση με απλό βελάκι (ArrowLeft / ArrowRight) ΜΟΝΟ εντός LaTeX.
 * Επιστρέφει null εκτός μαθηματικών ώστε το πεζό κείμενο να διατηρεί την κλασική κίνηση χαρακτήρα-χαρακτήρα.
 */
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
      : Math.min(
          range.contentEnd,
          skipInvisibleMathWhitespaceForward(value, pos, range.contentEnd, range.contentStart),
        );
    for (let k = 0; k < absStops.length; k++) {
      if (absStops[k] > effPos) return absStops[k];
    }
    if (!isStandaloneMath) {
      return pos < range.end ? range.end : null;
    }
    return pos < value.length ? value.length : null;
  }

  const effPos = pos > range.contentEnd
    ? pos
    : Math.max(
        range.contentStart,
        skipInvisibleMathWhitespaceBack(value, range.contentStart, pos, range.contentEnd),
      );
  for (let k = absStops.length - 1; k >= 0; k--) {
    if (absStops[k] < effPos) return absStops[k];
  }
  if (!isStandaloneMath) {
    return pos > range.start ? range.start : null;
  }
  return pos > 0 ? 0 : null;
}

export function replaceRangePreservingUndo(ta, start, end, text, newSelStart, newSelEnd) {
  if (!ta) return;
  ta.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { }
  if (!ok) {
    ta.setRangeText(text, start, end, 'preserve');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const s = typeof newSelStart === 'number' ? newSelStart : start + text.length;
  const e = typeof newSelEnd === 'number' ? newSelEnd : s;
  ta.setSelectionRange(s, e);
}

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
      // Προσπέρασε τυχόν πρώτο όρισμα {...} (π.χ. \dfrac{a}{b}) ή προαιρετικό [...] (π.χ. \sqrt[n]{x})
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

function isEscapedBackslashAt(str, idx) {
  let b = 0;
  for (let k = idx - 1; k >= 0 && str[k] === '\\'; k--) b++;
  return (b % 2) === 1;
}

/**
 * Ελέγχει εάν ένα κενό στη θέση spaceIdx εντός math segment [segStart, segEnd)
 * είναι ορατό στο KaTeX (π.χ. εντός \text{...}/\mbox{...} ή escaped "\ ").
 */
export function isVisibleMathSpaceAt(val, segStart, segEnd, spaceIdx) {
  if (typeof val !== 'string' || spaceIdx < segStart || spaceIdx >= segEnd) return false;
  const ch = val[spaceIdx];
  if (!/\s/.test(ch)) return false;

  // Escaped space ("\ ") είναι ορατό διάστημα στο KaTeX
  if (ch !== '\n' && ch !== '\r' && spaceIdx > segStart && val[spaceIdx - 1] === '\\' && !isEscapedBackslashAt(val, spaceIdx - 1)) {
    return true;
  }

  // Αλλαγές γραμμής εκτός ρητής αλλαγής δεν είναι ορατά κενά κειμένου
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

function findMatchingBracketInSeg(seg, openIdx) {
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

function readDelimTokenEnd(seg, idx) {
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

/**
 * Αναλύει όλες τις δομικές οντότητες LaTeX (\dfrac{}{}, \sqrt[n]{x}, ^{}, _{}, \left...\right, \begin...\end, {...})
 * μέσα σε ένα τμήμα math seg.
 */
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

  // 1. \left ... \right ζεύγη
  const leftStack = [];
  let i = 0;
  while (i < n) {
    if (seg[i] === '%') {
      const nl = seg.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
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
          nodes.push({
            type: 'delim',
            start: top.start,
            end: dEnd,
            innerStart: top.innerStart,
            innerEnd: i,
          });
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
    if (seg[i] === '%') {
      const nl = seg.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (seg[i] === '\\') {
      if (seg.startsWith('\\begin{', i)) {
        const endB = seg.indexOf('}', i + 7);
        if (endB !== -1) {
          ownedBraces.add(i + 6);
          const envName = seg.slice(i + 7, endB).trim();
          let afterEnv = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && seg[afterEnv] === '{') {
            const specEnd = findMatchingBraceEnd(seg, afterEnv);
            if (specEnd !== -1) {
              ownedBraces.add(afterEnv);
              afterEnv = specEnd + 1;
            }
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
            nodes.push({
              type: 'env',
              env: top.env,
              start: top.start,
              end: endE + 1,
              innerStart: top.innerStart,
              innerEnd: i,
            });
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

  // 3. Εντολές 1/2 ορισμάτων & εκθέτες/δείκτες (^, _)
  for (let k = 0; k < n; k++) {
    const ch = seg[k];
    if (ch === '%') {
      const nl = seg.indexOf('\n', k);
      k = nl === -1 ? n : nl;
      continue;
    }
    if (ch === '\\') {
      const cmdEnd = readLatexTokenEnd(seg, k);
      const cmd = seg.slice(k, cmdEnd);

      if (WYSIWYG_TWO_ARG_CMDS.has(cmd)) {
        const a1 = readArg(cmdEnd);
        if (a1 && a1.braced) {
          const a2 = readArg(a1.nextPos);
          if (a2 && a2.braced) {
            nodes.push({
              type: 'two-arg',
              cmd,
              start: k,
              end: a2.nextPos,
              slots: [a1, a2],
            });
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
          nodes.push({
            type: 'one-arg',
            cmd,
            start: k,
            end: a1.nextPos,
            optSlot,
            slots: [a1],
          });
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
        nodes.push({
          type: 'script',
          op: ch,
          start: k,
          end: a1.nextPos,
          slots: [a1],
        });
      } else {
        nodes.push({
          type: 'script',
          op: ch,
          start: k,
          end: k + 1,
          bare: true,
          slots: [],
        });
      }
    }
  }

  // 4. Απλές ανεξάρτητες ομάδες {...} που δεν ανήκουν σε εντολή/^/_
  for (let k = 0; k < n; k++) {
    if (seg[k] === '\\') { k++; continue; }
    if (seg[k] === '{' && !ownedBraces.has(k)) {
      const close = findMatchingBraceEnd(seg, k);
      if (close !== -1) {
        nodes.push({
          type: 'brace',
          start: k,
          end: close + 1,
          innerStart: k + 1,
          innerEnd: close,
        });
      }
    }
  }

  nodes.sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start));
  return nodes;
}

/**
 * Υπολογίζει την ενέργεια Backspace / Delete σε λειτουργία WYSIWYG (τύπου Wolfram Alpha Math Input):
 * - Δεν σπάει ποτέ άγκιστρα `{}` ή `\left...\right` / `\begin...\end`
 * - Από δεξιά άκρη (`\dfrac{x}{y}|`) μπαίνει μέσα στο τελευταίο πλαίσιο (`\dfrac{x}{y|}`)
 * - Από την αρχή πλαισίου (`\dfrac{x}{|}` ή `\dfrac{|}{y}`) διαλύει το κλάσμα διατηρώντας το περιεχόμενο (`x|` ή `|y`)
 * - Παρακάμπτει τα αόρατα κενά μαθηματικών διατηρώντας τα ορατά εντός `\text{...}` και `\ `.
 */
export function computeWysiwygMathEdit(val, pos, key, segStart = 0, segEnd = val.length) {
  const sStart = Math.max(0, segStart);
  const sEnd = Math.min(val.length, segEnd);
  const seg = val.slice(sStart, sEnd);
  const n = seg.length;
  const p = Math.max(0, Math.min(n, pos - sStart));
  const nodes = parseMathStructures(seg);

  const visualEnd = (lo, hi) => skipInvisibleMathWhitespaceBack(val, sStart + lo, sStart + hi, sStart + hi) - sStart;
  const visualStart = (lo, hi) => skipInvisibleMathWhitespaceForward(val, sStart + lo, sStart + hi, sStart + lo) - sStart;
  const cleanPart = (lo, hi) => {
    const raw = seg.slice(lo, hi);
    return raw.trim() ? raw : '';
  };

  let scopeLo = 0;
  let scopeHi = n;
  let scopeSpan = n;
  const considerScope = (lo, hi) => {
    if (typeof lo !== 'number' || typeof hi !== 'number' || hi < lo) return;
    if (p >= lo && p <= hi && (hi - lo) < scopeSpan) {
      scopeLo = lo;
      scopeHi = hi;
      scopeSpan = hi - lo;
    }
  };
  for (const node of nodes) {
    if (node.optSlot) considerScope(node.optSlot.contentStart, node.optSlot.contentEnd);
    if (node.slots) {
      for (const sl of node.slots) considerScope(sl.contentStart, sl.contentEnd);
    }
    if (typeof node.innerStart === 'number' && typeof node.innerEnd === 'number') {
      considerScope(node.innerStart, node.innerEnd);
    }
  }

  const absorbOuterWhitespace = (relStart, relEnd, text = '', useScope = false) => {
    if (text) return { relStart, relEnd };
    let nextStart = relStart;
    let nextEnd = relEnd;
    const lo = useScope ? scopeLo : 0;
    const hi = useScope ? scopeHi : n;
    if (nextStart >= lo && visualEnd(lo, nextStart) === lo) nextStart = lo;
    if (nextEnd <= hi && visualStart(nextEnd, hi) === hi) nextEnd = hi;
    return { relStart: nextStart, relEnd: nextEnd };
  };

  if (key === 'Backspace') {
    const eff = skipInvisibleMathWhitespaceBack(val, sStart, sStart + p, sEnd) - sStart;
    if (eff <= 0) return null;
    const effFwdAtCaret = skipInvisibleMathWhitespaceForward(val, sStart + p, sStart + scopeHi, sStart + scopeLo) - sStart;
    const trailEnd = effFwdAtCaret === scopeHi ? scopeHi : p;

    // 1. Αν ο κέρσορας (μετά τα αόρατα κενά) βρίσκεται στην αρχή ενός slot / delim / env: διάλυση δομής!
    //    Προσοχή: επιλέγουμε τον εσωτερικότερο κόμβο που ταιριάζει.
    const startCandidates = [];
    for (const node of nodes) {
      if (node.type === 'two-arg') {
        if (eff === node.slots[0].contentStart) startCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
        else if (eff === node.slots[1].contentStart) startCandidates.push({ node, slotIdx: 1, span: node.end - node.start });
      } else if (node.type === 'one-arg') {
        if (node.optSlot && eff === node.optSlot.contentStart) startCandidates.push({ node, opt: true, span: node.end - node.start });
        else if (eff === node.slots[0].contentStart) startCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'script' && node.slots[0]?.braced) {
        if (eff === node.slots[0].contentStart) startCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (eff === node.innerStart) startCandidates.push({ node, span: node.end - node.start });
      }
    }

    if (startCandidates.length) {
      startCandidates.sort((a, b) => a.span - b.span);
      const hit = startCandidates[0];
      const { node } = hit;

      if (node.type === 'two-arg') {
        const a = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const b = cleanPart(node.slots[1].contentStart, node.slots[1].contentEnd);
        if (hit.slotIdx === 0) {
          // \dfrac{|}{y} -> |y, \dfrac{|x}{y} -> |xy, \dfrac{|}{} -> ''
          const rep = a + b;
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, rep);
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: rep, caret: sStart + relStart };
        }
        // \dfrac{x}{|} -> x|, \dfrac{x}{|y} -> x|y, \dfrac{}{|y} -> |y
        const rep = a + b;
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, rep);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: rep, caret: sStart + relStart + a.length };
      }

      if (node.type === 'one-arg') {
        if (hit.opt) {
          // \sqrt[|n]{x} -> \sqrt{|x} (αφαιρεί το [n])
          const body = seg.slice(node.slots[0].open, node.slots[0].close + 1);
          const rep = `${node.cmd}${body}`;
          return {
            kind: 'replace',
            start: sStart + node.start,
            end: sStart + node.end,
            text: rep,
            caret: sStart + node.start + node.cmd.length + 1,
          };
        }
        if (node.optSlot && seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim()) {
          // \sqrt[3]{|x} -> μετακίνηση κέρσορα στο \sqrt[3|]{x}
          const target = visualEnd(node.optSlot.contentStart, node.optSlot.contentEnd);
          return { kind: 'move', caret: sStart + target };
        }
        const inner = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, inner);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: inner, caret: sStart + relStart };
      }

      if (node.type === 'script') {
        const inner = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, inner);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: inner, caret: sStart + relStart };
      }

      if (node.type === 'delim' || node.type === 'brace') {
        const inner = cleanPart(node.innerStart, node.innerEnd);
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, inner);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: inner, caret: sStart + relStart };
      }

      if (node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.start };
      }
    }

    // 2. Αν ο κέρσορας βρίσκεται αμέσως ΜΕΤΑ το τέλος μιας δομής (\dfrac{x}{y}|, \sqrt{x}|, \left(x\right)|, x^{2}|)
    const endCandidates = nodes.filter(nd => nd.end === eff);
    if (endCandidates.length) {
      endCandidates.sort((a, b) => (a.end - a.start) - (b.end - b.start));
      const node = endCandidates[0];

      if (node.type === 'two-arg') {
        const aEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        const bEmpty = !seg.slice(node.slots[1].contentStart, node.slots[1].contentEnd).trim();
        if (aEmpty && bEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const target = visualEnd(node.slots[1].contentStart, node.slots[1].contentEnd);
        return { kind: 'move', caret: sStart + target };
      }

      if (node.type === 'one-arg') {
        const optEmpty = !node.optSlot || !seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim();
        const bodyEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        if (optEmpty && bodyEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const target = visualEnd(node.slots[0].contentStart, node.slots[0].contentEnd);
        return { kind: 'move', caret: sStart + target };
      }

      if (node.type === 'script') {
        if (node.bare) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        if (node.slots[0].braced) {
          const empty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
          if (empty) {
            const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
            return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
          }
          const target = visualEnd(node.slots[0].contentStart, node.slots[0].contentEnd);
          return { kind: 'move', caret: sStart + target };
        }
        // Unbraced script e.g. x^2| -> x^| (διαγράφει μόνο το 2, όχι το x^)
        return { kind: 'replace', start: sStart + node.slots[0].contentStart, end: sStart + trailEnd, text: '', caret: sStart + node.slots[0].contentStart };
      }

      if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const target = visualEnd(node.innerStart, node.innerEnd);
        return { kind: 'move', caret: sStart + target };
      }
    }

    // 3. Ατομική διαγραφή εντολής LaTeX (\alpha, \cdot, \\, \,)
    const before = seg.slice(0, eff);
    const cmdMatch = before.match(/\\([A-Za-z@]+|[,;:!%&$#_{}\\]) ?$/);
    if (cmdMatch) {
      const cmdStart = eff - cmdMatch[0].length;
      if (!isEscapedBackslashAt(seg, cmdStart)) {
        const { relStart, relEnd } = absorbOuterWhitespace(cmdStart, trailEnd, '', true);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
      }
    }

    // 4. Απλός χαρακτήρας πριν/ανάμεσα σε αόρατα κενά (διαγράφει τον χαρακτήρα και τα αόρατα κενά)
    if (eff > 0 && (eff < p || effFwdAtCaret === scopeHi || visualEnd(scopeLo, eff - 1) === scopeLo)) {
      let charStart = eff - 1;
      if (charStart > 0 && seg.charCodeAt(charStart) >= 0xDC00 && seg.charCodeAt(charStart) <= 0xDFFF) {
        charStart--;
      }
      const { relStart, relEnd } = absorbOuterWhitespace(charStart, trailEnd, '', true);
      return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
    }
    return null;
  }

  if (key === 'Delete') {
    const effFwd = skipInvisibleMathWhitespaceForward(val, sStart + p, sEnd, sStart) - sStart;
    if (effFwd >= n) return null;
    const effBackAtCaret = skipInvisibleMathWhitespaceBack(val, sStart + scopeLo, sStart + p, sStart + scopeHi) - sStart;
    const leadStart = effBackAtCaret === scopeLo ? scopeLo : p;

    // 1. Αν ο κέρσορας είναι στο ΤΕΛΟΣ ενός εσωτερικού slot/delim/env πριν το `}` / `\right` / `\end`:
    const endSlotCandidates = [];
    for (const node of nodes) {
      if (node.type === 'two-arg') {
        if (effFwd === node.slots[0].contentEnd) endSlotCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
        else if (effFwd === node.slots[1].contentEnd) endSlotCandidates.push({ node, slotIdx: 1, span: node.end - node.start });
      } else if (node.type === 'one-arg') {
        if (node.optSlot && effFwd === node.optSlot.contentEnd) endSlotCandidates.push({ node, opt: true, span: node.end - node.start });
        else if (effFwd === node.slots[0].contentEnd) endSlotCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'script' && node.slots[0]?.braced) {
        if (effFwd === node.slots[0].contentEnd) endSlotCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (effFwd === node.innerEnd) endSlotCandidates.push({ node, span: node.end - node.start });
      }
    }

    if (endSlotCandidates.length) {
      endSlotCandidates.sort((a, b) => a.span - b.span);
      const hit = endSlotCandidates[0];
      const { node } = hit;

      if (node.type === 'two-arg' && hit.slotIdx === 0) {
        // \dfrac{x|}{y} + Delete -> x|y (ή x| / |y)
        const a = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const b = cleanPart(node.slots[1].contentStart, node.slots[1].contentEnd);
        const rep = a + b;
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, rep);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: rep, caret: sStart + relStart + a.length };
      }
      if (node.type === 'two-arg' && hit.slotIdx === 1) {
        const aEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        const bEmpty = !seg.slice(node.slots[1].contentStart, node.slots[1].contentEnd).trim();
        if (aEmpty && bEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
      if (node.type === 'one-arg') {
        if (hit.opt) {
          return { kind: 'move', caret: sStart + visualStart(node.slots[0].contentStart, node.slots[0].contentEnd) };
        }
        const optEmpty = !node.optSlot || !seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim();
        const bodyEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        if (optEmpty && bodyEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
      if (node.type === 'script') {
        if (!seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
      if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
    }

    // 2. Αν ο κέρσορας είναι αμέσως ΠΡΙΝ από μια δομή (|\dfrac{x}{y}, |\sqrt{x}, |^{2}, |\left(x\right))
    const startNodes = nodes.filter(nd => nd.start === effFwd);
    if (startNodes.length) {
      startNodes.sort((a, b) => (b.end - b.start) - (a.end - a.start));
      const node = startNodes[0];
      if (node.type === 'two-arg') {
        const aEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        const bEmpty = !seg.slice(node.slots[1].contentStart, node.slots[1].contentEnd).trim();
        if (aEmpty && bEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + visualStart(node.slots[0].contentStart, node.slots[0].contentEnd) };
      }
      if (node.type === 'one-arg') {
        const optEmpty = !node.optSlot || !seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim();
        const bodyEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        if (optEmpty && bodyEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const firstSlot = node.optSlot && seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim()
          ? node.optSlot
          : node.slots[0];
        return { kind: 'move', caret: sStart + visualStart(firstSlot.contentStart, firstSlot.contentEnd) };
      }
      if (node.type === 'script') {
        if (node.bare) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        if (node.slots[0].braced && !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + visualStart(node.slots[0].contentStart, node.slots[0].contentEnd) };
      }
      if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + visualStart(node.innerStart, node.innerEnd) };
      }
    }

    // 3. Ατομική διαγραφή επόμενης εντολής LaTeX
    const after = seg.slice(effFwd);
    const cmdMatch = after.match(/^\\([A-Za-z@]+|[,;:!%&$#_{}\\]) ?/);
    if (cmdMatch && !isEscapedBackslashAt(seg, effFwd)) {
      const { relStart, relEnd } = absorbOuterWhitespace(leadStart, effFwd + cmdMatch[0].length, '', true);
      return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
    }

    // 4. Απλός χαρακτήρας μετά/ανάμεσα σε αόρατα κενά
    if (effFwd < n && (effFwd > p || effBackAtCaret === scopeLo || visualStart(effFwd + 1, scopeHi) === scopeHi)) {
      let charEnd = effFwd + 1;
      if (charEnd < n && seg.charCodeAt(effFwd) >= 0xD800 && seg.charCodeAt(effFwd) <= 0xDBFF) {
        charEnd++;
      }
      const { relStart, relEnd } = absorbOuterWhitespace(leadStart, charEnd, '', true);
      return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
    }
    return null;
  }

  return null;
}

/**
 * Κατακόρυφη πλοήγηση τύπου Wolfram Alpha Math Input (ArrowUp / ArrowDown)
 * μεταξύ αριθμητή-παρονομαστή (\frac, \dfrac, \binom, \overset, \underset),
 * εκθέτη-δείκτη (^{}/_{}), και γραμμών πίνακα (`\\`).
 */
export function computeWysiwygVerticalArrowTarget(val, pos, direction, segStart = 0, segEnd = val.length) {
  const dir = direction >= 0 ? 1 : -1;
  const sStart = Math.max(0, segStart);
  const sEnd = Math.min(val.length, segEnd);
  const seg = val.slice(sStart, sEnd);
  const p = Math.max(0, Math.min(seg.length, pos - sStart));
  const nodes = parseMathStructures(seg);

  const clampSlot = (slot, relOffset) => {
    const lo = slot.contentStart;
    const hi = slot.contentEnd;
    const target = Math.max(lo, Math.min(hi, lo + relOffset));
    return sStart + (skipInvisibleMathWhitespaceBack(val, sStart + lo, sStart + target, sStart + hi) - sStart);
  };

  // Βρες όλους τους κατακόρυφους περιέκτες από τον εσωτερικότερο στον εξωτερικότερο
  const containing = nodes
    .filter(nd => p >= nd.start && p <= nd.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));

  for (const node of containing) {
    if (node.type === 'two-arg') {
      const top = node.cmd === '\\underset' ? node.slots[1] : node.slots[0];
      const bot = node.cmd === '\\underset' ? node.slots[0] : node.slots[1];
      if (dir > 0 && p >= top.contentStart && p <= top.contentEnd) {
        return clampSlot(bot, p - top.contentStart);
      }
      if (dir < 0 && p >= bot.contentStart && p <= bot.contentEnd) {
        return clampSlot(top, p - bot.contentStart);
      }
    }

    if (node.type === 'script' && node.slots[0]?.braced) {
      const slot = node.slots[0];
      if (p >= slot.contentStart && p <= slot.contentEnd) {
        if (node.op === '^' && dir > 0) {
          // Ψάξε αδελφό _{...} αμέσως πριν ή μετά
          const subAfter = nodes.find(x => x.type === 'script' && x.op === '_' && x.slots[0]?.braced && Math.abs(x.start - node.end) <= 1);
          const subBefore = nodes.find(x => x.type === 'script' && x.op === '_' && x.slots[0]?.braced && Math.abs(node.start - x.end) <= 1);
          const sib = subAfter || subBefore;
          if (sib) return clampSlot(sib.slots[0], p - slot.contentStart);
          return sStart + node.end;
        }
        if (node.op === '_' && dir < 0) {
          const supAfter = nodes.find(x => x.type === 'script' && x.op === '^' && x.slots[0]?.braced && Math.abs(x.start - node.end) <= 1);
          const supBefore = nodes.find(x => x.type === 'script' && x.op === '^' && x.slots[0]?.braced && Math.abs(node.start - x.end) <= 1);
          const sib = supAfter || supBefore;
          if (sib) return clampSlot(sib.slots[0], p - slot.contentStart);
          return sStart + node.end;
        }
      }
    }

    if (node.type === 'env' && p >= node.innerStart && p <= node.innerEnd) {
      const body = seg.slice(node.innerStart, node.innerEnd);
      const localP = p - node.innerStart;
      // Χωρισμός σε γραμμές (top-level \\) και στήλες (top-level &)
      const rows = [];
      let depth = 0;
      let rowStart = 0;
      const splitCols = (rStart, rEnd) => {
        const cols = [];
        let d = 0;
        let cStart = rStart;
        for (let i = rStart; i < rEnd; i++) {
          if (body[i] === '\\') { i++; continue; }
          if (body[i] === '{') d++;
          else if (body[i] === '}') d = Math.max(0, d - 1);
          else if (d === 0 && body[i] === '&') {
            cols.push({ start: cStart, end: i });
            cStart = i + 1;
          }
        }
        cols.push({ start: cStart, end: rEnd });
        return cols;
      };
      for (let i = 0; i < body.length; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth = Math.max(0, depth - 1);
        else if (depth === 0 && body[i] === '\\' && body[i + 1] === '\\') {
          rows.push(splitCols(rowStart, i));
          i += 1;
          rowStart = i + 1;
        }
      }
      rows.push(splitCols(rowStart, body.length));

      if (rows.length > 1) {
        let curR = -1;
        let curC = 0;
        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < rows[r].length; c++) {
            if (localP >= rows[r][c].start && localP <= rows[r][c].end) {
              curR = r;
              curC = c;
              break;
            }
          }
          if (curR !== -1) break;
        }
        if (curR !== -1) {
          const nextR = curR + dir;
          if (nextR >= 0 && nextR < rows.length) {
            const targetCol = rows[nextR][Math.min(curC, rows[nextR].length - 1)];
            const rel = localP - rows[curR][curC].start;
            const targetLocal = Math.max(targetCol.start, Math.min(targetCol.end, targetCol.start + rel));
            return sStart + node.innerStart + targetLocal;
          }
        }
      }
    }
  }

  return null;
}

