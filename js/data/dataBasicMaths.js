// ============================================================
//  CodeCogs-style toolbars — 2 rows
//  LEVEL 1: Βασικά Μαθηματικά (Γυμνάσιο · Άλγεβρα & Γεωμετρία)
// ============================================================
const TOOLBARS_BASIC = [
  // ============================================================
  //  ROW 1 - Τα Απολύτως Απαραίτητα (Επίπεδο 1)
  // ============================================================
  {
    row: 1,
    groups: [
      {
        id: 'operators', title: 'Βασικοί Τελεστές', previewCols: 3, previewRows: 2,
        items: [
          { render: 'x^{n}', title: 'Εκθέτης', before: '^{', after: '}' },
          { render: 'x_{n}', title: 'Δείκτης', before: '_{', after: '}' },
          { render: '\\frac{a}{b}', title: 'Κλάσμα', before: '\\frac{', after: '}{}' },
          { render: '\\sqrt{x}', title: 'Τετραγωνική Ρίζα', before: '\\sqrt{', after: '}' },
          { render: '\\sqrt[n]{x}', title: 'Νιοστή Ρίζα', before: '\\sqrt[', after: ']{}' },
          { render: '{}^{a}\\!/_{b}', title: 'Πλάγιο Κλάσμα', before: '{}^{', after: '}\\!/_{}' },
        ]
      },
      {
        id: 'relations', title: 'Σχέσεις', previewCols: 3, previewRows: 2,
        items: [
          { render: '=', title: 'Ίσο', before: '=', after: '' },
          { render: '\\neq', title: 'Διάφορο', before: '\\neq', after: '' },
          { render: '\\approx', title: 'Περίπου ίσο', before: '\\approx', after: '' },
          { render: '<', title: 'Μικρότερο', before: '<', after: '' },
          { render: '>', title: 'Μεγαλύτερο', before: '>', after: '' },
          { render: '\\le', title: 'Μικρότερο ή ίσο', before: '\\le', after: '' },
          { render: '\\ge', title: 'Μεγαλύτερο ή ίσο', before: '\\ge', after: '' },
          { render: '\\equiv', title: 'Ταυτόσημο', before: '\\equiv', after: '' },
          { render: '\\sim', title: 'Όμοιο', before: '\\sim', after: '' },
          { render: '\\cong', title: 'Ίσο (γεωμ.)', before: '\\cong', after: '' },
        ]
      },
      {
        id: 'functions', title: 'Συναρτήσεις', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\sin(x)', title: 'Ημίτονο', before: '\\sin(', after: ')' },
          { render: '\\cos(x)', title: 'Συνημίτονο', before: '\\cos(', after: ')' },
          { render: '\\tan(x)', title: 'Εφαπτομένη', before: '\\tan(', after: ')' },
          { render: '\\cot(x)', title: 'Συνεφαπτομένη', before: '\\cot(', after: ')' },
          { render: '\\log_{a}(x)', title: 'Λογάριθμος', before: '\\log_{', after: '}(x)' },
          { render: '\\ln(x)', title: 'Φυσικός Λογάριθμος', before: '\\ln(', after: ')' },
          { render: '\\max(a,b)', title: 'Μέγιστο', before: '\\max(', after: ')' },
          { render: '\\min(a,b)', title: 'Ελάχιστο', before: '\\min(', after: ')' },
          { render: '|x|', title: 'Απόλυτη τιμή', before: '|', after: '|' },
        ]
      },
      {
        id: 'greeklower', title: 'Πεζά Ελληνικά', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\alpha', title: 'α', before: '\\alpha', after: '' },
          { render: '\\beta', title: 'β', before: '\\beta', after: '' },
          { render: '\\gamma', title: 'γ', before: '\\gamma', after: '' },
          { render: '\\delta', title: 'δ', before: '\\delta', after: '' },
          { render: '\\epsilon', title: 'ε', before: '\\epsilon', after: '' },
          { render: '\\zeta', title: 'ζ', before: '\\zeta', after: '' },
          { render: '\\eta', title: 'η', before: '\\eta', after: '' },
          { render: '\\theta', title: 'θ', before: '\\theta', after: '' },
          { render: '\\iota', title: 'ι', before: '\\iota', after: '' },
          { render: '\\kappa', title: 'κ', before: '\\kappa', after: '' },
          { render: '\\lambda', title: 'λ', before: '\\lambda', after: '' },
          { render: '\\mu', title: 'μ', before: '\\mu', after: '' },
          { render: '\\nu', title: 'ν', before: '\\nu', after: '' },
          { render: '\\xi', title: 'ξ', before: '\\xi', after: '' },
          { render: '\\pi', title: 'π', before: '\\pi', after: '' },
          { render: '\\rho', title: 'ρ', before: '\\rho', after: '' },
          { render: '\\sigma', title: 'σ', before: '\\sigma', after: '' },
          { render: '\\tau', title: 'τ', before: '\\tau', after: '' },
          { render: '\\upsilon', title: 'υ', before: '\\upsilon', after: '' },
          { render: '\\phi', title: 'ϕ', before: '\\phi', after: '' },
          { render: '\\chi', title: 'χ', before: '\\chi', after: '' },
          { render: '\\psi', title: 'ψ', before: '\\psi', after: '' },
          { render: '\\omega', title: 'ω', before: '\\omega', after: '' },
        ]
      },
      {
        id: 'greekupper', title: 'Κεφαλαία Ελληνικά', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\Gamma', title: 'Γ', before: '\\Gamma', after: '' },
          { render: '\\Delta', title: 'Δ', before: '\\Delta', after: '' },
          { render: '\\Theta', title: 'Θ', before: '\\Theta', after: '' },
          { render: '\\Lambda', title: 'Λ', before: '\\Lambda', after: '' },
          { render: '\\Pi', title: 'Π', before: '\\Pi', after: '' },
          { render: '\\Sigma', title: 'Σ', before: '\\Sigma', after: '' },
          { render: '\\Phi', title: 'Φ', before: '\\Phi', after: '' },
          { render: '\\Psi', title: 'Ψ', before: '\\Psi', after: '' },
          { render: '\\Omega', title: 'Ω', before: '\\Omega', after: '' },
        ]
      },
      {
        id: 'brackets', title: 'Παρενθέσεις', previewCols: 2, previewRows: 2,
        items: [
          { render: '\\left( x \\right)', title: 'Παρενθέσεις', before: '\\left(', after: '\\right)' },
          { render: '\\left[ x \\right]', title: 'Αγκύλες', before: '\\left[', after: '\\right]' },
          { render: '\\left\\{ x \\right\\}', title: 'Άγκιστρα', before: '\\left\\{', after: '\\right\\}' },
          { render: '\\left| x \\right|', title: 'Απόλυτη Τιμή', before: '\\left|', after: '\\right|' },
        ]
      },
      {
        id: 'binary', title: 'Πράξεις', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\pm', title: 'Συν/πλην', before: '\\pm', after: '' },
          { render: '\\mp', title: 'Πλην/συν', before: '\\mp', after: '' },
          { render: '\\times', title: 'Επί', before: '\\times', after: '' },
          { render: '\\div', title: 'Διά', before: '\\div', after: '' },
          { render: '\\cdot', title: 'Επί (κουκκίδα)', before: '\\cdot', after: '' },
          { render: '\\%', title: 'Ποσοστό (%)', before: '\\%', after: '' },
        ]
      },
    ]
  },

  // ============================================================
  //  ROW 2 - Σύνολα, Γεωμετρία & Μορφοποίηση (Επίπεδο 1)
  // ============================================================
  {
    row: 2,
    groups: [
      {
        id: 'sets_basic', title: 'Σύνολα', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\in', title: 'Ανήκει', before: '\\in', after: '' },
          { render: '\\notin', title: 'Δεν ανήκει', before: '\\notin', after: '' },
          { render: '\\subset', title: 'Υποσύνολο', before: '\\subset', after: '' },
          { render: '\\subseteq', title: 'Υποσύνολο ή ίσο', before: '\\subseteq', after: '' },
          { render: '\\cup', title: 'Ένωση', before: '\\cup', after: '' },
          { render: '\\cap', title: 'Τομή', before: '\\cap', after: '' },
          { render: '\\setminus', title: 'Διαφορά', before: '\\setminus', after: '' },
          { render: '\\emptyset', title: 'Κενό σύνολο', before: '\\emptyset', after: '' },
          { render: '\\mathbb{N}', title: 'Φυσικοί', before: '\\mathbb{N}', after: '' },
          { render: '\\mathbb{Z}', title: 'Ακέραιοι', before: '\\mathbb{Z}', after: '' },
          { render: '\\mathbb{Q}', title: 'Ρητοί', before: '\\mathbb{Q}', after: '' },
          { render: '\\mathbb{R}', title: 'Πραγματικοί', before: '\\mathbb{R}', after: '' },
        ]
      },
      {
        id: 'geometry', title: 'Γεωμετρία', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\angle', title: 'Γωνία', before: '\\angle', after: '' },
          { render: '\\widehat{AB\\Gamma}', title: 'Γωνία (τόξο)', before: '\\widehat{', after: '}' },
          { render: '^{\\circ}', title: 'Μοίρες', before: '^{\\circ}', after: '' },
          { render: '\\perp', title: 'Κάθετο', before: '\\perp', after: '' },
          { render: '\\parallel', title: 'Παράλληλο', before: '\\parallel', after: '' },
          { render: '\\triangle', title: 'Τρίγωνο', before: '\\triangle', after: '' },
          { render: '\\square', title: 'Τετράγωνο', before: '\\square', after: '' },
          { render: '\\bigcirc', title: 'Κύκλος', before: '\\bigcirc', after: '' },
          { render: '\\overline{AB}', title: 'Ευθύγραμμο τμήμα', before: '\\overline{', after: '}' },
        ]
      },
      {
        id: 'arrows_symbols', title: 'Βέλη & Σύμβολα', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\Rightarrow', title: 'Συνεπάγεται (⇒)', before: '\\Rightarrow', after: '' },
          { render: '\\Leftrightarrow', title: 'Ισοδυναμεί (⇔)', before: '\\Leftrightarrow', after: '' },
          { render: '\\rightarrow', title: 'Δεξί βέλος', before: '\\rightarrow', after: '' },
          { render: '\\leftarrow', title: 'Αριστερό βέλος', before: '\\leftarrow', after: '' },
          { render: '\\therefore', title: 'Άρα', before: '\\therefore', after: '' },
          { render: '\\because', title: 'Διότι', before: '\\because', after: '' },
          { render: '\\infty', title: 'Άπειρο', before: '\\infty', after: '' },
          { render: '\\ldots', title: 'Τελείες', before: '\\ldots', after: '' },
          { render: '\\cdots', title: 'Κεντρικές τελείες', before: '\\cdots', after: '' },
        ]
      },
      {
        id: 'accents', title: 'Τόνοι & Γραμμές', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\vec{a}', title: 'Διάνυσμα', before: '\\vec{', after: '}' },
          { render: '\\bar{x}', title: 'Μέσος / Μπάρα', before: '\\bar{', after: '}' },
          { render: '\\hat{x}', title: 'Καπέλο', before: '\\hat{', after: '}' },
          { render: '\\underline{x}', title: 'Υπογράμμιση', before: '\\underline{', after: '}' },
          { render: '\\overbrace{a+b}', title: 'Άνω αγκύλη', before: '\\overbrace{', after: '}' },
          { render: '\\underbrace{a+b}', title: 'Κάτω αγκύλη', before: '\\underbrace{', after: '}' },
        ]
      },
      {
        id: 'matrix', title: 'Συστήματα', previewCols: 2, previewRows: 1,
        items: [
          { render: '\\begin{cases}\\cdots\\\\ \\cdots\\end{cases}', title: 'Σύστημα / Περιπτώσεις', action: 'matrix-builder', matrixType: 'cases' },
          { render: '\\begin{aligned}y&=a\\\\ &=b\\end{aligned}', title: 'Στοίχιση εξισώσεων', action: 'matrix-builder', matrixType: 'aligned' }
        ]
      },
      {
        id: 'style', title: 'Κείμενο & Στυλ', previewCols: 2, previewRows: 2,
        items: [
          { render: '\\text{abc}', title: 'Κανονικό κείμενο', before: '\\text{', after: '}' },
          { render: '\\textbf{abc}', title: 'Έντονο κείμενο', before: '\\textbf{', after: '}' },
          { render: '\\mathbf{B}', title: 'Έντονα γράμματα', before: '\\mathbf{', after: '}' },
          { render: '\\mathbb{R}', title: 'Blackboard', before: '\\mathbb{', after: '}' },
          { render: '\\,', title: 'Μικρό κενό', before: '\\,', after: '' },
          { render: '\\quad', title: 'Μεγάλο κενό', before: '\\quad', after: '' },
        ]
      },
      {
        id: 'colors', title: 'Χρώματα', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\textcolor{red}{\\blacksquare}', title: 'Κόκκινο', before: '\\textcolor{red}{', after: '}' },
          { render: '\\textcolor{blue}{\\blacksquare}', title: 'Μπλε', before: '\\textcolor{blue}{', after: '}' },
          { render: '\\textcolor{green}{\\blacksquare}', title: 'Πράσινο', before: '\\textcolor{green}{', after: '}' },
          { render: '\\textcolor{orange}{\\blacksquare}', title: 'Πορτοκαλί', before: '\\textcolor{orange}{', after: '}' },
          { render: '\\textcolor{purple}{\\blacksquare}', title: 'Μωβ', before: '\\textcolor{purple}{', after: '}' },
          { render: '\\textcolor{teal}{\\blacksquare}', title: 'Πετρόλ', before: '\\textcolor{teal}{', after: '}' },
          { render: '\\textcolor{brown}{\\blacksquare}', title: 'Καφέ', before: '\\textcolor{brown}{', after: '}' },
          { render: '\\textcolor{gray}{\\blacksquare}', title: 'Γκρι', before: '\\textcolor{gray}{', after: '}' },
          { render: '\\textcolor{black}{\\blacksquare}', title: 'Μαύρο', before: '\\textcolor{black}{', after: '}' },
        ]
      },
    ]
  }
];

if (typeof window !== 'undefined') window.TOOLBARS_BASIC = TOOLBARS_BASIC;
