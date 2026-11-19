export function translateLatexErrorToGreek(err) {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  let msg = raw.trim();
  if (!msg) return 'Άγνωστο σφάλμα σύνταξης LaTeX.';

  msg = msg.replace(/^ParseError:\s*/i, '').replace(/^KaTeX parse error:\s*/i, '');

  // Εξαγωγή του τμήματος τοποθεσίας ("at position N: ..." ή "at end of input: ...")
  let locSuffix = '';
  const locPosMatch = msg.match(/\s+at position\s+(\d+)(?::\s*([\s\S]*))?$/i);
  const locEndMatch = !locPosMatch
    ? msg.match(/\s+at end of input(?::\s*([\s\S]*))?$/i)
    : null;

  if (locPosMatch && typeof locPosMatch.index === 'number') {
    msg = msg.slice(0, locPosMatch.index).trim();
    const pos = locPosMatch[1];
    const snippet = (locPosMatch[2] || '').trim();
    locSuffix = ` στη θέση ${pos}${snippet ? `: ${snippet}` : ''}`;
  } else if (locEndMatch && typeof locEndMatch.index === 'number') {
    msg = msg.slice(0, locEndMatch.index).trim();
    const snippet = (locEndMatch[1] || '').trim();
    locSuffix = ` στο τέλος της εισόδου${snippet ? `: ${snippet}` : ''}`;
  }

  const formatExpected = tok => (tok === 'EOF' ? 'τέλος εξίσωσης' : `«${tok}»`);

  const rules = [
    [/^Undefined control sequence:\s*(.+)$/i, (_m, cmd) => `Άγνωστη εντολή LaTeX: ${cmd}`],
    [/^Unexpected end of input in a macro argument,\s*expected '([^']+)'$/i, (_m, exp) => `Απρόσμενο τέλος εισόδου μέσα σε όρισμα εντολής — αναμενόταν «${exp}»`],
    [/^Expected 'EOF',\s*got '([^']+)'$/i, (_m, tok) => `Μη αναμενόμενο «${tok}» (πιθανό περιττό κλείσιμο ή σύμβολο)`],
    [/^Expected '([^']+)',\s*got 'EOF'$/i, (_m, exp) => `Αναμενόταν ${formatExpected(exp)} πριν το τέλος της εξίσωσης (ανοιχτό τμήμα που δεν έκλεισε)`],
    [/^Expected '([^']+)',\s*got '([^']+)'$/i, (_m, exp, got) => `Αναμενόταν ${formatExpected(exp)}, αλλά βρέθηκε «${got}»`],
    [/^Expected group after '([^']+)'$/i, (_m, tok) => `Αναμενόταν ομάδα ({...}) ή στοιχείο μετά από «${tok}»`],
    [/^Expected '([^']+)' after (.+)$/i, (_m, exp, after) => `Λείπει «${exp}» μετά από ${after}`],
    [/^Double superscript$/i, 'Διπλός εκθέτης (^). Χρησιμοποιήστε αγκύλες, π.χ. x^{a^b}.'],
    [/^Double subscript$/i, 'Διπλός δείκτης (_). Χρησιμοποιήστε αγκύλες, π.χ. x_{i_1}.'],
    [/^Can't use function '([^']+)' in math mode$/i, (_m, fn) => `Η εντολή «${fn}» δεν επιτρέπεται σε μαθηματική λειτουργία.`],
    [/^([^{}]+?) can be used only in preamble$/i, (_m, fn) => `Η εντολή «${fn}» χρησιμοποιείται μόνο στο προοίμιο εγγράφου LaTeX.`],
    [/^No such environment:\s*([^\s]+)$/i, (_m, env) => `Άγνωστο περιβάλλον LaTeX: «${env}»`],
    [/^Mismatch(?:ed)?:\s*\\begin\{([^}]+)\} matched by \\end\{([^}]+)\}$/i, (_m, b, e) => `Αναντιστοιχία περιβάλλοντος: \\begin{${b}} έκλεισε με \\end{${e}}`],
    [/^Mismatched \\begin\{([^}]+)\} matched by \\end\{([^}]+)\}$/i, (_m, b, e) => `Αναντιστοιχία περιβάλλοντος: \\begin{${b}} έκλεισε με \\end{${e}}`],
    [/^Missing \\right\.$/i, 'Λείπει το αντίστοιχο \\right (π.χ. \\right) ή \\right.)'],
    [/^Extra \\right$/i, 'Περιττό \\right χωρίς αντίστοιχο \\left'],
    [/^Extra close brace$/i, 'Περιττό κλείσιμο αγκίστρου «}»'],
    [/^Too many tab characters: expected (\d+), but got (\d+)$/i, (_m, exp, got) => `Πάρα πολλοί χαρακτήρες στοίχισης (&): έως ${exp}, βρέθηκαν ${got}`],
    [/^Unicode text character "([^"]+)" used in math mode$/i, (_m, ch) => `Ο χαρακτήρας κειμένου «${ch}» δεν επιτρέπεται σε math mode. Τυλίξτε με \\text{...}.`],
    [/^Invalid size:\s*'([^']+)'$/i, (_m, sz) => `Μη έγκυρο μέγεθος: «${sz}»`],
    [/^Invalid color:\s*'([^']+)'$/i, (_m, col) => `Μη έγκυρο χρώμα: «${col}»`],
  ];

  for (const [re, rep] of rules) {
    if (re.test(msg)) {
      return `Σφάλμα σύνταξης LaTeX: ${msg.replace(re, rep)}${locSuffix}`;
    }
  }

  msg = msg
    .replace(/\bat position\s+(\d+)/gi, 'στη θέση $1')
    .replace(/\bat end of input/gi, 'στο τέλος της εισόδου')
    .replace(/\bUnexpected end of input in a macro argument\b/gi, 'Απρόσμενο τέλος εισόδου σε όρισμα εντολής')
    .replace(/\bExpected group after\b/gi, 'Αναμενόταν ομάδα μετά από')
    .replace(/\bExpected\b/gi, 'Αναμενόταν')
    .replace(/\bgot\b/gi, 'βρέθηκε')
    .replace(/\bMissing\b/gi, 'Λείπει')
    .replace(/\bIllegal\b/gi, 'Μη έγκυρο')
    .replace(/'EOF'/g, '«τέλος εξίσωσης»');

  return `Σφάλμα σύνταξης LaTeX: ${msg}${locSuffix}`;
}

export function translateAppErrorToGreek(err, fallback = 'Προέκυψε απρόσμενο σφάλμα.') {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (!raw.trim()) return fallback;
  if (/[\u0370-\u03FF\u1F00-\u1FFF]/.test(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.includes('parseerror') || lower.includes('katex')) return translateLatexErrorToGreek(raw);
  if (lower.includes('jspdf') || lower.includes('pdf')) return 'Αποτυχία δημιουργίας αρχείου PDF.';
  if (lower.includes('canvas') || lower.includes('toblob') || lower.includes('html2canvas')) return 'Αποτυχία δημιουργίας εικόνας PNG.';
  if (lower.includes('clipboard')) return 'Δεν ήταν δυνατή η πρόσβαση στο πρόχειρο.';
  return `${fallback} (${raw})`;
}
