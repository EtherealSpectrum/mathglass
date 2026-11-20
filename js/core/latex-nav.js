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
