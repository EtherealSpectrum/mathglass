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
  '\\frac', '\\dfrac', '\\tfrac', '\\binom', '\\sqrt',
  '\\vec', '\\hat', '\\bar', '\\tilde', '\\dot', '\\ddot',
  '\\overline', '\\underline', '\\widehat', '\\widetilde',
  '\\overrightarrow', '\\overleftarrow', '\\overbrace', '\\underbrace',
  '\\overset', '\\underset', '\\stackrel',
  '\\text', '\\textbf', '\\textit', '\\textrm', '\\texttt', '\\mbox',
  '\\mathrm', '\\mathbf', '\\mathbb', '\\mathcal', '\\mathit', '\\mathsf',
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
    for (let k = 0; k < absStops.length; k++) {
      if (absStops[k] > pos) return absStops[k];
    }
    if (!isStandaloneMath) {
      return pos < range.end ? range.end : null;
    }
    return pos < value.length ? value.length : null;
  }

  for (let k = absStops.length - 1; k >= 0; k--) {
    if (absStops[k] < pos) return absStops[k];
  }
  if (!isStandaloneMath) {
    return pos > range.start ? range.start : null;
  }
  return pos > 0 ? 0 : null;
}

