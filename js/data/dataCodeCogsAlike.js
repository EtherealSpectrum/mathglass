// ============================================================
//  CodeCogs-style toolbars — 2 rows
//  LEVEL 2: Προχωρημένα Μαθηματικά (Λύκειο & Ανάλυση)
// ============================================================
const TOOLBARS_CODECOGS_ALIKE = [
  // ============================================================
  //  ROW 1 - Βασικά Εργαλεία & Δομές (Επίπεδο 2)
  // ============================================================
  {
    row: 1,
    groups: [
      {
        id: 'operators', title: 'Βασικοί Τελεστές', previewCols: 4, previewRows: 2,
        items: [
          { render: 'x^{n}', title: 'Εκθέτης', before: '^{', after: '}' },
          { render: 'x_{n}', title: 'Δείκτης', before: '_{', after: '}' },
          { render: 'x_{i}^{n}', title: 'Δείκτης & Εκθέτης', before: '_{', after: '}^{}' },
          { render: '\\frac{a}{b}', title: 'Κλάσμα', before: '\\frac{', after: '}{}' },
          { render: '\\sqrt{x}', title: 'Τετραγωνική Ρίζα', before: '\\sqrt{', after: '}' },
          { render: '\\sqrt[n]{x}', title: 'Νιοστή Ρίζα', before: '\\sqrt[', after: ']{}' },
          { render: '\\binom{n}{k}', title: 'Διωνυμικός Συντελεστής', before: '\\binom{', after: '}{}' },
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
          { render: '\\leqslant', title: 'Μικρ. ή ίσο (slant)', before: '\\leqslant', after: '' },
          { render: '\\geqslant', title: 'Μεγ. ή ίσο (slant)', before: '\\geqslant', after: '' },
          { render: '\\ll', title: 'Πολύ μικρότερο', before: '\\ll', after: '' },
          { render: '\\gg', title: 'Πολύ μεγαλύτερο', before: '\\gg', after: '' },
          { render: '\\equiv', title: 'Ταυτόσημο', before: '\\equiv', after: '' },
          { render: '\\sim', title: 'Όμοιο', before: '\\sim', after: '' },
          { render: '\\simeq', title: 'Όμοιο ή ίσο', before: '\\simeq', after: '' },
          { render: '\\cong', title: 'Ίσο (γεωμ.)', before: '\\cong', after: '' },
          { render: '\\propto', title: 'Ανάλογο', before: '\\propto', after: '' },
          { render: '\\doteq', title: 'Ορίζεται ως', before: '\\doteq', after: '' },
          { render: '\\overset{\\mathrm{def}}{=}', title: 'Εξ ορισμού', before: '\\overset{\\mathrm{def}}{=}', after: '' },
        ]
      },
      {
        id: 'functions', title: 'Συναρτήσεις', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\sin(x)', title: 'Ημίτονο', before: '\\sin(', after: ')' },
          { render: '\\cos(x)', title: 'Συνημίτονο', before: '\\cos(', after: ')' },
          { render: '\\tan(x)', title: 'Εφαπτομένη', before: '\\tan(', after: ')' },
          { render: '\\cot(x)', title: 'Συνεφαπτομένη', before: '\\cot(', after: ')' },
          { render: '\\sec(x)', title: 'Τέμνουσα', before: '\\sec(', after: ')' },
          { render: '\\csc(x)', title: 'Συντέμνουσα', before: '\\csc(', after: ')' },
          { render: '\\arcsin(x)', title: 'Τόξο Ημιτόνου', before: '\\arcsin(', after: ')' },
          { render: '\\arccos(x)', title: 'Τόξο Συνημιτόνου', before: '\\arccos(', after: ')' },
          { render: '\\arctan(x)', title: 'Τόξο Εφαπτομένης', before: '\\arctan(', after: ')' },
          { render: '\\sinh(x)', title: 'Υπερβολικό Ημίτονο', before: '\\sinh(', after: ')' },
          { render: '\\cosh(x)', title: 'Υπερβολικό Συνημίτονο', before: '\\cosh(', after: ')' },
          { render: '\\tanh(x)', title: 'Υπερβολική Εφαπτομένη', before: '\\tanh(', after: ')' },
          { render: '\\log_{a}(x)', title: 'Λογάριθμος', before: '\\log_{', after: '}(x)' },
          { render: '\\ln(x)', title: 'Φυσικός Λογάριθμος', before: '\\ln(', after: ')' },
          { render: '\\exp(x)', title: 'Εκθετική', before: '\\exp(', after: ')' },
          { render: '\\max_{x}', title: 'Μέγιστο', before: '\\max_{', after: '}' },
          { render: '\\min_{x}', title: 'Ελάχιστο', before: '\\min_{', after: '}' },
          { render: '\\operatorname{sgn}(x)', title: 'Πρόσημο', before: '\\operatorname{sgn}(', after: ')' },
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
          { render: '\\varepsilon', title: 'ε (alt)', before: '\\varepsilon', after: '' },
          { render: '\\zeta', title: 'ζ', before: '\\zeta', after: '' },
          { render: '\\eta', title: 'η', before: '\\eta', after: '' },
          { render: '\\theta', title: 'θ', before: '\\theta', after: '' },
          { render: '\\vartheta', title: 'ϑ', before: '\\vartheta', after: '' },
          { render: '\\iota', title: 'ι', before: '\\iota', after: '' },
          { render: '\\kappa', title: 'κ', before: '\\kappa', after: '' },
          { render: '\\lambda', title: 'λ', before: '\\lambda', after: '' },
          { render: '\\mu', title: 'μ', before: '\\mu', after: '' },
          { render: '\\nu', title: 'ν', before: '\\nu', after: '' },
          { render: '\\xi', title: 'ξ', before: '\\xi', after: '' },
          { render: '\\pi', title: 'π', before: '\\pi', after: '' },
          { render: '\\rho', title: 'ρ', before: '\\rho', after: '' },
          { render: '\\sigma', title: 'σ', before: '\\sigma', after: '' },
          { render: '\\varsigma', title: 'ς', before: '\\varsigma', after: '' },
          { render: '\\tau', title: 'τ', before: '\\tau', after: '' },
          { render: '\\upsilon', title: 'υ', before: '\\upsilon', after: '' },
          { render: '\\phi', title: 'ϕ', before: '\\phi', after: '' },
          { render: '\\varphi', title: 'φ', before: '\\varphi', after: '' },
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
          { render: '\\Xi', title: 'Ξ', before: '\\Xi', after: '' },
          { render: '\\Pi', title: 'Π', before: '\\Pi', after: '' },
          { render: '\\Sigma', title: 'Σ', before: '\\Sigma', after: '' },
          { render: '\\Upsilon', title: 'Υ', before: '\\Upsilon', after: '' },
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
          { render: '\\left\\| x \\right\\|', title: 'Νόρμα', before: '\\left\\|', after: '\\right\\|' },
          { render: '\\left\\lfloor x \\right\\rfloor', title: 'Κάτω ακέραιο μέρος', before: '\\left\\lfloor', after: '\\right\\rfloor' },
          { render: '\\left\\lceil x \\right\\rceil', title: 'Άνω ακέραιο μέρος', before: '\\left\\lceil', after: '\\right\\rceil' },
          { render: '\\left. x \\right|', title: 'Εκτίμηση σε σημείο', before: '\\left. ', after: ' \\right|' },
        ]
      },
      {
        id: 'matrix', title: 'Πίνακες', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\begin{matrix}\\cdots\\\\ \\cdots\\end{matrix}', title: 'Απλός πίνακας', action: 'matrix-builder', matrixType: 'matrix' },
          { render: '\\begin{bmatrix}\\cdots\\\\ \\cdots\\end{bmatrix}', title: 'Αγκύλες', action: 'matrix-builder', matrixType: 'bmatrix' },
          { render: '\\begin{pmatrix}\\cdots\\\\ \\cdots\\end{pmatrix}', title: 'Παρενθέσεις', action: 'matrix-builder', matrixType: 'pmatrix' },
          { render: '\\begin{vmatrix}\\cdots\\\\ \\cdots\\end{vmatrix}', title: 'Ορίζουσα', action: 'matrix-builder', matrixType: 'vmatrix' },
          { render: '\\begin{cases}\\cdots\\\\ \\cdots\\end{cases}', title: 'Περιπτώσεις', action: 'matrix-builder', matrixType: 'cases' },
          { render: '\\begin{aligned}y&=a\\\\ &=b\\end{aligned}', title: 'Στοιχισμένες', action: 'matrix-builder', matrixType: 'aligned' },
          { render: '\\begin{array}{c|c}\\cdots\\\\ \\cdots\\end{array}', title: 'Πίνακας Array', action: 'matrix-builder', matrixType: 'array' },
        ]
      },
      {
        id: 'style', title: 'Στυλ', previewCols: 2, previewRows: 2,
        items: [
          { render: '\\boldsymbol{x}', title: 'Έντονο σύμβολο', before: '\\boldsymbol{', after: '}' },
          { render: '\\mathbb{R}', title: 'Blackboard', before: '\\mathbb{', after: '}' },
          { render: '\\mathcal{L}', title: 'Καλλιγραφικά', before: '\\mathcal{', after: '}' },
          { render: '\\mathbf{B}', title: 'Έντονα', before: '\\mathbf{', after: '}' },
          { render: '\\mathrm{R}', title: 'Όρθια', before: '\\mathrm{', after: '}' },
          { render: '\\mathit{I}', title: 'Πλάγια', before: '\\mathit{', after: '}' },
          { render: '\\text{abc}', title: 'Κανονικό κείμενο', before: '\\text{', after: '}' },
          { render: '\\textbf{abc}', title: 'Έντονο κείμενο', before: '\\textbf{', after: '}' },
          { render: '\\textit{abc}', title: 'Πλάγιο κείμενο', before: '\\textit{', after: '}' },
          { render: '\\operatorname{op}', title: 'Τελεστής', before: '\\operatorname{', after: '}' },
        ]
      },
      {
        id: 'binary', title: 'Δυαδικοί Τελεστές', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\pm', title: 'Συν/πλην', before: '\\pm', after: '' },
          { render: '\\mp', title: 'Πλην/συν', before: '\\mp', after: '' },
          { render: '\\times', title: 'Επί', before: '\\times', after: '' },
          { render: '\\div', title: 'Διά', before: '\\div', after: '' },
          { render: '\\cdot', title: 'Επί (κουκκίδα)', before: '\\cdot', after: '' },
          { render: '\\ast', title: 'Αστερίσκος', before: '\\ast', after: '' },
          { render: '\\star', title: 'Αστέρι', before: '\\star', after: '' },
          { render: '\\circ', title: 'Σύνθεση', before: '\\circ', after: '' },
          { render: '\\bullet', title: 'Κουκκίδα', before: '\\bullet', after: '' },
          { render: '\\oplus', title: 'Ευθύ άθροισμα', before: '\\oplus', after: '' },
          { render: '\\otimes', title: 'Τανυστικό γινόμενο', before: '\\otimes', after: '' },
          { render: '\\odot', title: 'Κύκλος με τελεία', before: '\\odot', after: '' },
          { render: '\\diamond', title: 'Ρόμβος', before: '\\diamond', after: '' },
          { render: '\\dagger', title: 'Dagger', before: '\\dagger', after: '' },
          { render: '\\setminus', title: 'Διαφορά συνόλων', before: '\\setminus', after: '' },
          { render: '\\triangleleft', title: 'Αριστ. τρίγωνο', before: '\\triangleleft', after: '' },
          { render: '\\triangleright', title: 'Δεξί τρίγωνο', before: '\\triangleright', after: '' },
        ]
      },
    ]
  },

  // ============================================================
  //  ROW 2 - Ανάλυση, Μιγαδικοί, Λογική & Πιθανότητες (Επίπεδο 2)
  // ============================================================
  {
    row: 2,
    groups: [
      {
        id: 'calculus', title: 'Απειροστικός Λογισμός', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\int', title: 'Ολοκλήρωμα', before: '\\int ', after: '' },
          { render: '\\int_{a}^{b}', title: 'Ορισμένο ολοκλήρωμα', before: '\\int_{', after: '}^{}' },
          { render: '\\iint', title: 'Διπλό ολοκλήρωμα', before: '\\iint ', after: '' },
          { render: '\\sum_{i=1}^{n}', title: 'Άθροισμα', before: '\\sum_{', after: '}^{}' },
          { render: '\\prod_{i=1}^{n}', title: 'Γινόμενο', before: '\\prod_{', after: '}^{}' },
          { render: '\\lim_{x \\to 0}', title: 'Όριο', before: '\\lim_{x \\to 0} ', after: '' },
          { render: '\\lim_{x \\to \\infty}', title: 'Όριο στο άπειρο', before: '\\lim_{x \\to \\infty} ', after: '' },
          { render: '\\limsup_{n \\to \\infty}', title: 'Άνω όριο', before: '\\limsup_{', after: '}' },
          { render: '\\liminf_{n \\to \\infty}', title: 'Κάτω όριο', before: '\\liminf_{', after: '}' },
          { render: '\\frac{d}{dx}', title: 'Παράγωγος', before: '\\frac{d}{dx}\\left(', after: '\\right)' },
          { render: '\\frac{dy}{dx}', title: 'Διαφορικό πηλίκο', before: '\\frac{d', after: '}{dx}' },
          { render: '\\partial', title: 'Μερική παράγωγος', before: '\\partial', after: '' },
          { render: '\\dot{x}', title: 'Χρονική παράγωγος', before: '\\dot{', after: '}' },
          { render: '\\,\\mathrm{d}x', title: 'Διαφορικό dx', before: '\\,\\mathrm{d}', after: '' },
        ]
      },
      {
        id: 'complex', title: 'Μιγαδικοί Αριθμοί', previewCols: 3, previewRows: 2,
        items: [
          { render: 'i', title: 'Φανταστική Μονάδα', before: 'i', after: '' },
          { render: '\\Re(z)', title: 'Πραγματικό Μέρος', before: '\\Re(', after: ')' },
          { render: '\\Im(z)', title: 'Φανταστικό Μέρος', before: '\\Im(', after: ')' },
          { render: '\\bar{z}', title: 'Συζυγής', before: '\\bar{', after: '}' },
          { render: '|z|', title: 'Μέτρο', before: '|', after: '|' },
          { render: '\\arg(z)', title: 'Όρισμα', before: '\\arg(', after: ')' },
          { render: 'r e^{i\\theta}', title: 'Πολική Μορφή', before: 'r e^{i', after: '}' },
        ]
      },
      {
        id: 'numbertheory', title: 'Θεωρία Αριθμών', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\mid', title: 'Διαιρεί', before: '\\mid', after: '' },
          { render: '\\nmid', title: 'Δεν διαιρεί', before: '\\nmid', after: '' },
          { render: '\\bmod', title: 'mod (τελεστής)', before: '\\bmod', after: '' },
          { render: '\\pmod{n}', title: 'mod (σύγκριση)', before: '\\pmod{', after: '}' },
          { render: '\\gcd(a,b)', title: 'Μέγιστος Κοινός Διαιρέτης', before: '\\gcd(', after: ')' },
          { render: '\\operatorname{lcm}(a,b)', title: 'Ελάχιστο Κοινό Πολλαπλάσιο', before: '\\operatorname{lcm}(', after: ')' },
        ]
      },
      {
        id: 'logic_sets', title: 'Λογική & Σύνολα', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\land', title: 'Και (∧)', before: '\\land', after: '' },
          { render: '\\lor', title: 'Ή (∨)', before: '\\lor', after: '' },
          { render: '\\neg', title: 'Άρνηση (¬)', before: '\\neg', after: '' },
          { render: '\\implies', title: 'Συνεπάγεται (⇒)', before: '\\implies ', after: '' },
          { render: '\\iff', title: 'Αν και μόνο αν (⇔)', before: '\\iff ', after: '' },
          { render: '\\forall', title: 'Για κάθε', before: '\\forall', after: '' },
          { render: '\\exists', title: 'Υπάρχει', before: '\\exists', after: '' },
          { render: '\\nexists', title: 'Δεν υπάρχει', before: '\\nexists', after: '' },
          { render: '\\therefore', title: 'Άρα', before: '\\therefore', after: '' },
          { render: '\\because', title: 'Διότι', before: '\\because', after: '' },
          { render: '\\in', title: 'Ανήκει', before: '\\in', after: '' },
          { render: '\\notin', title: 'Δεν ανήκει', before: '\\notin', after: '' },
          { render: '\\ni', title: 'Περιέχει', before: '\\ni', after: '' },
          { render: '\\subset', title: 'Υποσύνολο', before: '\\subset', after: '' },
          { render: '\\supset', title: 'Υπερσύνολο', before: '\\supset', after: '' },
          { render: '\\subseteq', title: 'Υποσύνολο ή ίσο', before: '\\subseteq', after: '' },
          { render: '\\supseteq', title: 'Υπερσύνολο ή ίσο', before: '\\supseteq', after: '' },
          { render: '\\cup', title: 'Ένωση', before: '\\cup', after: '' },
          { render: '\\cap', title: 'Τομή', before: '\\cap', after: '' },
          { render: '\\emptyset', title: 'Κενό σύνολο', before: '\\emptyset', after: '' },
          { render: '\\mathbb{N}', title: 'Φυσικοί', before: '\\mathbb{N}', after: '' },
          { render: '\\mathbb{Z}', title: 'Ακέραιοι', before: '\\mathbb{Z}', after: '' },
          { render: '\\mathbb{Q}', title: 'Ρητοί', before: '\\mathbb{Q}', after: '' },
          { render: '\\mathbb{R}', title: 'Πραγματικοί', before: '\\mathbb{R}', after: '' },
          { render: '\\mathbb{C}', title: 'Μιγαδικοί', before: '\\mathbb{C}', after: '' },
        ]
      },
      {
        id: 'arrows', title: 'Βέλη', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\rightarrow', title: 'Δεξί βέλος', before: '\\rightarrow', after: '' },
          { render: '\\leftarrow', title: 'Αριστερό βέλος', before: '\\leftarrow', after: '' },
          { render: '\\leftrightarrow', title: 'Αμφίδρομο', before: '\\leftrightarrow', after: '' },
          { render: '\\Rightarrow', title: 'Διπλό δεξί', before: '\\Rightarrow', after: '' },
          { render: '\\Leftarrow', title: 'Διπλό αριστερό', before: '\\Leftarrow', after: '' },
          { render: '\\Leftrightarrow', title: 'Διπλό αμφίδρομο', before: '\\Leftrightarrow', after: '' },
          { render: '\\longrightarrow', title: 'Μακρύ δεξί', before: '\\longrightarrow', after: '' },
          { render: '\\Longleftrightarrow', title: 'Μακρύ αμφίδρομο', before: '\\Longleftrightarrow', after: '' },
          { render: '\\mapsto', title: 'Maps to', before: '\\mapsto', after: '' },
          { render: '\\xrightarrow{a}', title: 'Εκτεταμένο →', before: '\\xrightarrow{', after: '}' },
          { render: '\\uparrow', title: 'Πάνω βέλος', before: '\\uparrow', after: '' },
          { render: '\\downarrow', title: 'Κάτω βέλος', before: '\\downarrow', after: '' },
          { render: '\\nearrow', title: 'Πάνω-δεξιά (↗)', before: '\\nearrow', after: '' },
          { render: '\\searrow', title: 'Κάτω-δεξιά (↘)', before: '\\searrow', after: '' },
        ]
      },
      {
        id: 'symbols', title: 'Σύμβολα', previewCols: 4, previewRows: 2,
        items: [
          { render: '\\infty', title: 'Άπειρο', before: '\\infty', after: '' },
          { render: '\\nabla', title: 'Ανάδελτα', before: '\\nabla', after: '' },
          { render: '\\angle', title: 'Γωνία', before: '\\angle', after: '' },
          { render: '\\measuredangle', title: 'Μετρημένη Γωνία', before: '\\measuredangle', after: '' },
          { render: '\\perp', title: 'Κάθετο', before: '\\perp', after: '' },
          { render: '\\parallel', title: 'Παράλληλο', before: '\\parallel', after: '' },
          { render: '\\ell', title: 'Καλλιγραφικό l', before: '\\ell', after: '' },
          { render: '\\ldots', title: 'Κάτω τελείες', before: '\\ldots', after: '' },
          { render: '\\cdots', title: 'Κεντρικές τελείες', before: '\\cdots', after: '' },
          { render: '\\vdots', title: 'Κάθετες τελείες', before: '\\vdots', after: '' },
          { render: '\\ddots', title: 'Διαγώνιες τελείες', before: '\\ddots', after: '' },
        ]
      },
      {
        id: 'accents', title: 'Τόνοι & Διακοσμητικά', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\hat{a}', title: 'Καπέλο', before: '\\hat{', after: '}' },
          { render: '\\bar{a}', title: 'Μπάρα', before: '\\bar{', after: '}' },
          { render: '\\vec{a}', title: 'Διάνυσμα', before: '\\vec{', after: '}' },
          { render: '\\dot{a}', title: 'Τελεία', before: '\\dot{', after: '}' },
          { render: '\\ddot{a}', title: 'Διπλή τελεία', before: '\\ddot{', after: '}' },
          { render: '\\tilde{a}', title: 'Περισπωμένη', before: '\\tilde{', after: '}' },
          { render: '\\overline{ab}', title: 'Πάνω γραμμή', before: '\\overline{', after: '}' },
          { render: '\\underline{ab}', title: 'Κάτω γραμμή', before: '\\underline{', after: '}' },
          { render: '\\overbrace{a+b}', title: 'Πάνω αγκύλη', before: '\\overbrace{', after: '}' },
          { render: '\\underbrace{a+b}', title: 'Κάτω αγκύλη', before: '\\underbrace{', after: '}' },
          { render: '\\widehat{AB}', title: 'Μεγάλο καπέλο', before: '\\widehat{', after: '}' },
          { render: '\\overrightarrow{AB}', title: 'Βέλος διανύσματος', before: '\\overrightarrow{', after: '}' },
          { render: 'f^{\\prime}', title: 'Τόνος (παράγωγος)', before: '^{\\prime}', after: '' },
          { render: 'f^{\\prime\\prime}', title: 'Διπλός τόνος', before: '^{\\prime\\prime}', after: '' },
          { render: '90^{\\circ}', title: 'Μοίρες', before: '^{\\circ}', after: '' },
        ]
      },
      {
        id: 'probability', title: 'Πιθανότητες & Στατιστική', previewCols: 3, previewRows: 2,
        items: [
          { render: 'P(A)', title: 'Πιθανότητα', before: 'P(', after: ')' },
          { render: '\\mathbb{E}[X]', title: 'Αναμενόμενη Τιμή', before: '\\mathbb{E}[', after: ']' },
          { render: '\\operatorname{Var}(X)', title: 'Διακύμανση', before: '\\operatorname{Var}(', after: ')' },
          { render: '\\mu', title: 'Μέσος (μ)', before: '\\mu', after: '' },
          { render: '\\sigma', title: 'Τυπική Απόκλιση (σ)', before: '\\sigma', after: '' },
          { render: '\\bar{x}', title: 'Δειγματικός Μέσος', before: '\\bar{', after: '}' },
          { render: '\\sim', title: 'Ακολουθεί κατανομή', before: '\\sim', after: '' },
        ]
      },
      {
        id: 'geometry', title: 'Γεωμετρία', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\triangle', title: 'Τρίγωνο', before: '\\triangle', after: '' },
          { render: '\\square', title: 'Τετράγωνο', before: '\\square', after: '' },
          { render: '\\bigcirc', title: 'Κύκλος', before: '\\bigcirc', after: '' },
          { render: '\\sim', title: 'Όμοιο', before: '\\sim', after: '' },
          { render: '\\cong', title: 'Ίσο (γεωμ.)', before: '\\cong', after: '' },
          { render: '\\vec{v}', title: 'Διάνυσμα', before: '\\vec{', after: '}' },
          { render: '\\overline{AB}', title: 'Ευθύγραμμο τμήμα', before: '\\overline{', after: '}' },
        ]
      },
      {
        id: 'spaces', title: 'Διαστήματα', previewCols: 3, previewRows: 2,
        items: [
          { render: 'a\\,b', title: 'Λεπτό (\\,)', before: '\\,', after: '', label: 'thin' },
          { render: 'a\\:b', title: 'Μεσαίο (\\:)', before: '\\:', after: '', label: 'med' },
          { render: 'a\\;b', title: 'Παχύ (\\;)', before: '\\;', after: '', label: 'thick' },
          { render: 'a\\!b', title: 'Αρνητικό (\\!)', before: '\\!', after: '', label: 'neg' },
          { render: 'a\\quad b', title: 'Quad (\\quad)', before: '\\quad', after: '', label: 'quad' },
          { render: 'a\\qquad b', title: 'Διπλό quad (\\qquad)', before: '\\qquad', after: '', label: '2×quad' },
        ]
      },
      {
        id: 'colors', title: 'Χρώματα', previewCols: 3, previewRows: 2,
        items: [
          { render: '\\textcolor{red}{\\blacksquare}', title: 'Κόκκινο', before: '\\textcolor{red}{', after: '}' },
          { render: '\\textcolor{green}{\\blacksquare}', title: 'Πράσινο', before: '\\textcolor{green}{', after: '}' },
          { render: '\\textcolor{blue}{\\blacksquare}', title: 'Μπλε', before: '\\textcolor{blue}{', after: '}' },
          { render: '\\textcolor{yellow}{\\blacksquare}', title: 'Κίτρινο', before: '\\textcolor{yellow}{', after: '}' },
          { render: '\\textcolor{cyan}{\\blacksquare}', title: 'Cyan', before: '\\textcolor{cyan}{', after: '}' },
          { render: '\\textcolor{magenta}{\\blacksquare}', title: 'Ματζέντα', before: '\\textcolor{magenta}{', after: '}' },
          { render: '\\textcolor{brown}{\\blacksquare}', title: 'Καφέ', before: '\\textcolor{brown}{', after: '}' },
          { render: '\\textcolor{teal}{\\blacksquare}', title: 'Teal', before: '\\textcolor{teal}{', after: '}' },
          { render: '\\textcolor{purple}{\\blacksquare}', title: 'Μωβ', before: '\\textcolor{purple}{', after: '}' },
          { render: '\\textcolor{orange}{\\blacksquare}', title: 'Πορτοκαλί', before: '\\textcolor{orange}{', after: '}' },
          { render: '\\textcolor{olive}{\\blacksquare}', title: 'Ελιά', before: '\\textcolor{olive}{', after: '}' },
          { render: '\\textcolor{violet}{\\blacksquare}', title: 'Βιολετί', before: '\\textcolor{violet}{', after: '}' },
          { render: '\\textcolor{pink}{\\blacksquare}', title: 'Ροζ', before: '\\textcolor{pink}{', after: '}' },
          { render: '\\textcolor{gray}{\\blacksquare}', title: 'Γκρι', before: '\\textcolor{gray}{', after: '}' },
          { render: '\\textcolor{black}{\\blacksquare}', title: 'Μαύρο', before: '\\textcolor{black}{', after: '}' },
        ]
      },
    ]
  }
];

if (typeof window !== 'undefined') window.TOOLBARS_CODECOGS_ALIKE = TOOLBARS_CODECOGS_ALIKE;
