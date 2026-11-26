// ============================================================
//  Shared Bilingual Search & Autocomplete Normalization / Synonyms
// ============================================================

export function normalizeSearchStr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const COMMAND_ALIASES = {
  '^{': ['εκθετης', 'δυναμη', 'ekthetis', 'dynami', 'power', 'exponent', 'superscript'],
  '_{': ['δεικτης', 'deiktis', 'subscript', 'index'],
  '\\frac': ['κλασμα', 'klasma', 'fraction', 'division', 'ratio', 'διαιρεση'],
  '\\dfrac': ['κλασμα', 'display', 'fraction', 'klasma'],
  '\\tfrac': ['κλασμα', 'inline', 'text', 'fraction', 'klasma'],
  '\\sqrt': ['ριζα', 'τετραγωνικη', 'νιοστη', 'riza', 'root', 'radical', 'square root'],
  '\\binom': ['διωνυμικος', 'συνδυασμοι', 'binomial', 'choose', 'combination', 'syndyasmoi'],
  '\\sin': ['ημιτονο', 'ημ', 'imito', 'sine', 'trig', 'τριγωνομετρια'],
  '\\cos': ['συνημιτονο', 'συν', 'synimitono', 'cosine', 'trig'],
  '\\tan': ['εφαπτομενη', 'εφ', 'efaptomeni', 'tangent', 'trig'],
  '\\cot': ['συνεφαπτομενη', 'σφ', 'synefaptomeni', 'cotangent', 'trig'],
  '\\sec': ['τεμνουσα', 'temnousa', 'secant'],
  '\\csc': ['συντεμνουσα', 'syntemnousa', 'cosecant'],
  '\\arcsin': ['τοξο ημιτονου', 'αντιστροφο ημιτονο', 'arcsine', 'asin'],
  '\\arccos': ['τοξο συνημιτονου', 'αντιστροφο συνημιτονο', 'arccosine', 'acos'],
  '\\arctan': ['τοξο εφαπτομενης', 'αντιστροφη εφαπτομενη', 'arctangent', 'atan'],
  '\\sinh': ['υπερβολικο ημιτονο', 'hyperbolic sine'],
  '\\cosh': ['υπερβολικο συνημιτονο', 'hyperbolic cosine'],
  '\\tanh': ['υπερβολικη εφαπτομενη', 'hyperbolic tangent'],
  '\\coth': ['υπερβολικη συνεφαπτομενη', 'hyperbolic cotangent'],
  '\\log': ['λογαριθμος', 'logari8mos', 'logarithmos', 'logarithm'],
  '\\ln': ['φυσικος λογαριθμος', 'νεπεριος', 'natural log', 'logarithm'],
  '\\exp': ['εκθετικη', 'εκθετικο', 'exponential'],
  '\\max': ['μεγιστο', 'megisto', 'maximum'],
  '\\min': ['ελαχιστο', 'elaxisto', 'minimum'],
  '\\det': ['οριζουσα', 'orizousa', 'determinant', 'matrix'],
  '\\dim': ['διασταση', 'diastasi', 'dimension'],
  '\\ker': ['πυρηνας', 'pyrinas', 'kernel', 'nullspace'],
  '\\gcd': ['μκδ', 'μεγιστος κοινος διαιρετης', 'mkd', 'greatest common divisor'],
  '\\int': ['ολοκληρωμα', 'olokliroma', 'integral', 'antiderivative'],
  '\\iint': ['διπλο ολοκληρωμα', 'double integral', 'olokliroma'],
  '\\iiint': ['τριπλο ολοκληρωμα', 'triple integral', 'olokliroma'],
  '\\oint': ['επικαμπυλιο', 'κλειστο ολοκληρωμα', 'contour integral', 'line integral'],
  '\\sum': ['αθροισμα', 'athroisma', 'sum', 'summation', 'sigma', 'σειρα'],
  '\\prod': ['γινομενο', 'ginomeno', 'product'],
  '\\coprod': ['συμπροιον', 'coproduct'],
  '\\lim': ['οριο', 'orio', 'limit'],
  '\\limsup': ['ανω οριο', 'upper limit'],
  '\\liminf': ['κατω οριο', 'lower limit'],
  '\\partial': ['μερικη παραγωγος', 'paragogos', 'partial derivative'],
  '\\nabla': ['αναδελτα', 'κλιση', 'anadelta', 'gradient', 'del', 'laplacian'],
  '\\infty': ['απειρο', 'apeiro', 'infinity', 'inf'],
  '\\pm': ['συν πλην', 'syn plin', 'plus minus', 'plusminus'],
  '\\mp': ['πλην συν', 'plin syn', 'minus plus'],
  '\\times': ['επι', 'πολλαπλασιασμος', 'epi', 'multiply', 'cross'],
  '\\div': ['δια', 'διαιρεση', 'dia', 'divide', 'division'],
  '\\cdot': ['επι', 'κουκκιδα', 'εσωτερικο γινομενο', 'dot', 'multiply'],
  '\\neq': ['διαφορο', 'ανισο', 'οχι ισο', 'diaforo', 'not equal', 'notequal'],
  '\\approx': ['περιπου ισο', 'προσεγγιστικα', 'peripou', 'approximately'],
  '\\equiv': ['ταυτοσημο', 'ισοδυναμο', 'taytosimo', 'equivalent', 'congruent'],
  '\\le': ['μικροτερο η ισο', 'mikrotero', 'less than or equal', 'leq'],
  '\\leq': ['μικροτερο η ισο', 'mikrotero', 'less than or equal', 'le'],
  '\\ge': ['μεγαλυτερο η ισο', 'megalytero', 'greater than or equal', 'geq'],
  '\\geq': ['μεγαλυτερο η ισο', 'megalytero', 'greater than or equal', 'ge'],
  '\\leqslant': ['μικροτερο η ισο', 'slant', 'leq'],
  '\\geqslant': ['μεγαλυτερο η ισο', 'slant', 'geq'],
  '\\ll': ['πολυ μικροτερο', 'much less'],
  '\\gg': ['πολυ μεγαλυτερο', 'much greater'],
  '\\sim': ['ομοιο', 'κατανομη', 'similar', 'tilde'],
  '\\cong': ['ισο γεωμετρικα', 'congruent', 'isomorphic'],
  '\\propto': ['αναλογο', 'analogiko', 'proportional'],
  '\\forall': ['για καθε', 'καθολικος ποσοδεικτης', 'gia kathe', 'for all', 'universal'],
  '\\exists': ['υπαρχει', 'υπαρξιακος ποσοδεικτης', 'yparxei', 'exists'],
  '\\nexists': ['δεν υπαρχει', 'not exists'],
  '\\neg': ['αρνηση', 'οχι', 'arnisi', 'not', 'negation'],
  '\\land': ['και', 'λογικο και', 'συζευξη', 'and', 'wedge'],
  '\\lor': ['η', 'λογικο η', 'διαζευξη', 'or', 'vee'],
  '\\implies': ['συνεπαγεται', 'τοτε', 'synepagetai', 'implies', 'then'],
  '\\impliedby': ['επεται απο', 'implied by'],
  '\\iff': ['αν και μονο αν', 'ισοδυναμια', 'isodynamia', 'iff', 'if and only if'],
  '\\therefore': ['αρα', 'επομενως', 'ara', 'therefore'],
  '\\because': ['διοτι', 'επειδη', 'dioti', 'because'],
  '\\in': ['ανηκει', 'στοιχειο', 'anikei', 'element of', 'member'],
  '\\notin': ['δεν ανηκει', 'den anikei', 'not element'],
  '\\ni': ['περιεχει', 'contains'],
  '\\subset': ['υποσυνολο', 'yposynolo', 'subset'],
  '\\subseteq': ['υποσυνολο η ισο', 'yposynolo', 'subset equal'],
  '\\subsetneq': ['γνησιο υποσυνολο', 'proper subset'],
  '\\supset': ['υπερσυνολο', 'ypersynolo', 'superset'],
  '\\supseteq': ['υπερσυνολο η ισο', 'ypersynolo', 'superset equal'],
  '\\cup': ['ενωση', 'enosi', 'union'],
  '\\bigcup': ['μεγαλη ενωση', 'big union', 'enosi'],
  '\\cap': ['τομη', 'tomi', 'intersection'],
  '\\bigcap': ['μεγαλη τομη', 'big intersection', 'tomi'],
  '\\setminus': ['διαφορα συνολων', 'set difference', 'minus'],
  '\\emptyset': ['κενο συνολο', 'keno synolo', 'empty set', 'null set'],
  '\\varnothing': ['κενο συνολο', 'empty set'],
  '\\rightarrow': ['δεξι βελος', 'βελος', 'τείνει', 'teinei', 'velos', 'right arrow', 'to'],
  '\\leftarrow': ['αριστερο βελος', 'βελος', 'velos', 'left arrow'],
  '\\leftrightarrow': ['αμφιδρομο βελος', 'βελος', 'double arrow', 'both'],
  '\\Rightarrow': ['διπλο δεξι βελος', 'συνεπαγεται', 'double right arrow'],
  '\\Leftarrow': ['διπλο αριστερο βελος', 'double left arrow'],
  '\\Leftrightarrow': ['διπλο αμφιδρομο', 'ισοδυναμια', 'double arrow'],
  '\\mapsto': ['απεικονιζει', 'αντιστοιχιζει', 'maps to'],
  '\\uparrow': ['πανω βελος', 'up arrow'],
  '\\downarrow': ['κατω βελος', 'down arrow'],
  '\\xrightarrow': ['εκτεταμενο βελος', 'βελος με κειμενο', 'labeled arrow'],
  '\\rightleftharpoons': ['ισορροπια', 'χημικη αντιδραση', 'equilibrium', 'reversible'],
  '\\vec': ['διανυσμα', 'dianysma', 'vector', 'arrow'],
  '\\overrightarrow': ['διανυσμα', 'dianysma', 'vector', 'arrow'],
  '\\hat': ['καπελο', 'εκτιμητρια', 'μοναδιαιο', 'kapelo', 'hat'],
  '\\widehat': ['μεγαλο καπελο', 'γωνια', 'wide hat'],
  '\\bar': ['μπαρα', 'μεσος', 'συζυγης', 'mpara', 'bar', 'conjugate', 'mean'],
  '\\overline': ['πανω γραμμη', 'τμημα', 'ευθυγραμμο τμημα', 'συζυγης', 'overline', 'segment'],
  '\\underline': ['κατω γραμμη', 'υπογραμμιση', 'underline'],
  '\\overbrace': ['πανω αγκυλη', 'overbrace'],
  '\\underbrace': ['κατω αγκυλη', 'underbrace'],
  '\\dot': ['τελεια', 'παραγωγος', 'dot'],
  '\\ddot': ['διπλη τελεια', 'δευτερη παραγωγος', 'ddot'],
  '\\tilde': ['περισπωμενη', 'tilde'],
  '\\widetilde': ['μεγαλη περισπωμενη', 'wide tilde'],
  '\\angle': ['γωνια', 'gonia', 'angle'],
  '\\perp': ['καθετο', 'ορθογωνιο', 'ανεξαρτητο', 'katheto', 'perpendicular'],
  '\\parallel': ['παραλληλο', 'parallilo', 'parallel'],
  '\\triangle': ['τριγωνο', 'trigono', 'triangle'],
  '\\square': ['τετραγωνο', 'tetragono', 'square'],
  '\\bigcirc': ['κυκλος', 'kyklos', 'circle'],
  '\\mathbb': ['συνολο αριθμων', 'blackboard', 'reals', 'naturals', 'integers', 'complex'],
  '\\mathcal': ['καλλιγραφικα', 'big o', 'calligraphic'],
  '\\mathfrak': ['fraktur', 'γοτθικα'],
  '\\boldsymbol': ['εντονο συμβολο', 'bold symbol'],
  '\\mathbf': ['εντονα', 'bold', 'πινακας', 'διανυσμα'],
  '\\mathrm': ['ορθια γραφη', 'roman', 'upright'],
  '\\text': ['κειμενο', 'keimeno', 'text'],
  '\\textbf': ['εντονο κειμενο', 'bold text'],
  '\\textit': ['πλαγιο κειμενο', 'italic text'],
  '\\textcolor': ['χρωμα', 'xroma', 'color', 'colour'],
  '\\left': ['παρενθεση', 'αγκυλη', 'απολυτη τιμη', 'νορμα', 'bracket', 'parenthesis', 'abs', 'norm'],
  '\\begin': ['πινακας', 'μητρα', 'συστημα', 'περιπτωσεις', 'pinakas', 'mitra', 'matrix', 'cases', 'aligned'],
  '\\alpha': ['αλφα', 'alfa', 'alpha'],
  '\\beta': ['βητα', 'bhta', 'vita', 'beta'],
  '\\gamma': ['γαμμα', 'γαμα', 'gama', 'gamma'],
  '\\delta': ['δελτα', 'delta'],
  '\\epsilon': ['εψιλον', 'epsilon'],
  '\\varepsilon': ['εψιλον', 'ε καμπυλο', 'varepsilon', 'epsilon'],
  '\\zeta': ['ζητα', 'zhta', 'zeta'],
  '\\eta': ['ητα', 'hta', 'eta'],
  '\\theta': ['θητα', 'thita', '8hta', 'theta'],
  '\\vartheta': ['θητα', 'vartheta', 'theta'],
  '\\iota': ['ιωτα', 'iota'],
  '\\kappa': ['καππα', 'καπα', 'kappa'],
  '\\lambda': ['λαμδα', 'λαμβδα', 'lamda', 'lambda'],
  '\\mu': ['μυ', 'μι', 'μεσος', 'mu'],
  '\\nu': ['νυ', 'νι', 'nu'],
  '\\xi': ['ξι', 'ksi', 'xi'],
  '\\pi': ['πι', 'pi'],
  '\\varpi': ['πι', 'varpi', 'pi'],
  '\\rho': ['ρω', 'ro', 'rho'],
  '\\varrho': ['ρω', 'varrho', 'rho'],
  '\\sigma': ['σιγμα', 'τυπικη αποκλιση', 'sigma'],
  '\\varsigma': ['τελικο σιγμα', 'σιγμα', 'varsigma', 'sigma'],
  '\\tau': ['ταυ', 'taf', 'tau'],
  '\\upsilon': ['υψιλον', 'upsilon'],
  '\\phi': ['φι', 'fi', 'phi'],
  '\\varphi': ['φι', 'fi', 'varphi', 'phi'],
  '\\chi': ['χι', 'xi', 'chi'],
  '\\psi': ['ψι', 'psi'],
  '\\omega': ['ωμεγα', 'ομεγα', 'omega'],
  '\\Gamma': ['γαμμα κεφαλαιο', 'gamma'],
  '\\Delta': ['δελτα κεφαλαιο', 'διακρινουσα', 'μεταβολη', 'delta'],
  '\\Theta': ['θητα κεφαλαιο', 'theta'],
  '\\Lambda': ['λαμδα κεφαλαιο', 'lambda'],
  '\\Xi': ['ξι κεφαλαιο', 'xi'],
  '\\Pi': ['πι κεφαλαιο', 'γινομενο', 'pi'],
  '\\Sigma': ['σιγμα κεφαλαιο', 'αθροισμα', 'sigma'],
  '\\Upsilon': ['υψιλον κεφαλαιο', 'upsilon'],
  '\\Phi': ['φι κεφαλαιο', 'ροη', 'phi'],
  '\\Psi': ['ψι κεφαλαιο', 'κυματικη', 'psi'],
  '\\Omega': ['ωμεγα κεφαλαιο', 'ωμ', 'ohm', 'omega'],
  '\\hbar': ['planck', 'σταθερα planck', 'h bar', 'φυσικη'],
  '\\ell': ['καλλιγραφικο l', 'ell'],
  '\\aleph': ['αλεφ', 'aleph', 'πληθαριθμος'],
  '\\Re': ['πραγματικο μερος', 'real part', 'μιγαδικος'],
  '\\Im': ['φανταστικο μερος', 'imaginary part', 'μιγαδικος'],
  '\\oplus': ['αμεσο αθροισμα', 'xor', 'direct sum', 'circle plus'],
  '\\otimes': ['τανυστικο γινομενο', 'tensor product', 'circle times'],
  '\\ldots': ['τελειες', 'αποσιωπητικα', 'dots', 'ellipsis'],
  '\\cdots': ['τελειες κεντρο', 'dots', 'cdots'],
  '\\vdots': ['καθετες τελειες', 'vertical dots'],
  '\\ddots': ['διαγωνιες τελειες', 'diagonal dots'],
  '\\bmod': ['υπολοιπο', 'modulo', 'mod'],
  '\\pmod': ['υπολοιπο', 'modulo', 'mod', 'συγκριση'],
  '\\Pr': ['πιθανοτητα', 'probability'],
};

const GROUP_ALIASES = {
  operators: ['τελεστες', 'βασικα', 'operators'],
  relations: ['σχεσεις', 'ισοτητες', 'ανισοτητες', 'relations', 'inequality'],
  functions: ['συναρτησεις', 'τριγωνομετρια', 'λογαριθμοι', 'functions', 'trig'],
  greeklower: ['ελληνικα', 'πεζα', 'γραμματα', 'greek'],
  greekupper: ['ελληνικα', 'κεφαλαια', 'γραμματα', 'greek'],
  brackets: ['παρενθεσεις', 'αγκυλες', 'αγκιστρα', 'brackets', 'delimiters'],
  matrix: ['πινακες', 'μητρες', 'συστηματα', 'matrix', 'matrices'],
  linalg: ['γραμμικη αλγεβρα', 'πινακες', 'διανυσματα', 'linear algebra'],
  style: ['στυλ', 'γραμματοσειρα', 'style', 'font'],
  binary: ['δυαδικοι', 'πραξεις', 'τελεστες', 'binary', 'operators'],
  calculus: ['απειροστικος', 'λογισμος', 'ολοκληρωμα', 'παραγωγος', 'οριο', 'calculus'],
  vectorcalc: ['διανυσματικος', 'κλιση', 'αποκλιση', 'στροβιλισμος', 'vector calculus'],
  numbertheory: ['θεωρια αριθμων', 'διαιρεση', 'number theory'],
  complex: ['μιγαδικοι', 'complex'],
  logic_sets: ['λογικη', 'συνολα', 'logic', 'sets'],
  subsupset: ['συνολα', 'υποσυνολο', 'sets'],
  arrows: ['βελη', 'arrows'],
  symbols: ['συμβολα', 'symbols'],
  accents: ['τονοι', 'διακοσμητικα', 'accents'],
  stats: ['πιθανοτητες', 'στατιστικη', 'probability', 'statistics'],
  geometry: ['γεωμετρια', 'geometry'],
  spaces: ['διαστηματα', 'κενα', 'spaces', 'spacing'],
  colors: ['χρωματα', 'colors'],
  foreign: ['ξενα', 'νομισματα', 'currency', 'foreign'],
};

const MATRIX_NAMES = {
  matrix: 'πινακας matrix απλος',
  bmatrix: 'πινακας matrix αγκυλες bracket',
  pmatrix: 'πινακας matrix παρενθεσεις parenthesis',
  vmatrix: 'οριζουσα determinant matrix |...|',
  Vmatrix: 'νορμα norm matrix ||...||',
  Bmatrix: 'πινακας matrix αγκιστρα braces',
  cases: 'περιπτωσεις κλαδικη συστημα cases piecewise',
  aligned: 'στοιχισμενες εξισωσεις συστημα aligned equations',
};

export function extractPrimaryCommands(item) {
  const cmds = new Set();
  const sources = [item?.before, item?.render];
  for (const src of sources) {
    if (!src || typeof src !== 'string') continue;
    const beginMatch = src.match(/\\begin\{([a-zA-Z]+)\}/);
    if (beginMatch) {
      cmds.add(`\\begin{${beginMatch[1]}}`);
    }
    const opMatch = src.match(/\\operatorname\*?\{([a-zA-Z]+)\}/);
    if (opMatch) {
      cmds.add(`\\${opMatch[1]}`);
      cmds.add(`\\operatorname{${opMatch[1]}}`);
    }
    const bbMatch = src.match(/\\mathbb\{([A-Z])\}/);
    if (bbMatch) {
      cmds.add(`\\mathbb{${bbMatch[1]}}`);
    }
    const colMatch = src.match(/\\textcolor\{([a-zA-Z]+)\}/);
    if (colMatch) {
      cmds.add(`\\textcolor{${colMatch[1]}}`);
    }
    const cmdMatches = src.match(/\\[a-zA-Z]+/g);
    if (cmdMatches) {
      for (const c of cmdMatches) cmds.add(c);
    }
  }
  return Array.from(cmds);
}

export function buildAliasList(item, groupId, groupTitle) {
  const aliases = new Set();
  const cmds = extractPrimaryCommands(item);
  for (const c of cmds) {
    aliases.add(c);
    aliases.add(c.slice(1));
    const exact = COMMAND_ALIASES[c];
    if (exact) exact.forEach(a => aliases.add(a));
    // Strip {arg} suffix if present
    const base = c.split('{')[0];
    if (base && COMMAND_ALIASES[base]) {
      COMMAND_ALIASES[base].forEach(a => aliases.add(a));
    }
  }
  if (item?.before && COMMAND_ALIASES[item.before]) {
    COMMAND_ALIASES[item.before].forEach(a => aliases.add(a));
  }
  if (item?.matrixType && MATRIX_NAMES[item.matrixType]) {
    aliases.add(MATRIX_NAMES[item.matrixType]);
  }
  if (groupId && GROUP_ALIASES[groupId]) {
    GROUP_ALIASES[groupId].forEach(a => aliases.add(a));
  }
  if (groupTitle) aliases.add(groupTitle);
  return normalizeSearchStr(Array.from(aliases).join(' '));
}

export function scoreTextMatch(entry, terms, rawQueryNorm, options = {}) {
  if (!terms.length) return 1;
  // Require every query term to match somewhere in the entry search fields
  for (const t of terms) {
    if (!entry.hay.includes(t)) return -1;
  }

  const qNoSlash = rawQueryNorm.startsWith('\\') ? rawQueryNorm.slice(1) : rawQueryNorm;
  let score = 0;

  // 1. Primary command matching
  for (const cmd of entry.cmdsNorm) {
    const cmdNoSlash = cmd.startsWith('\\') ? cmd.slice(1) : cmd;
    if (cmd === rawQueryNorm || cmdNoSlash === qNoSlash) {
      score += 1200;
    } else if (cmd.startsWith(rawQueryNorm) || cmdNoSlash.startsWith(qNoSlash)) {
      score += 680 - Math.min(200, cmdNoSlash.length * 4);
    } else if (cmdNoSlash.includes(qNoSlash)) {
      score += 260;
    }
  }

  // 2. Title matching
  if (entry.titleNorm === rawQueryNorm) {
    score += 720;
  } else if (entry.titleNorm.startsWith(rawQueryNorm)) {
    score += 420;
  } else if (entry.titleWords.some(w => w.startsWith(rawQueryNorm))) {
    score += 310;
  } else if (entry.titleNorm.includes(rawQueryNorm)) {
    score += 170;
  }

  // 3. Per-term prefix/word match on aliases & group
  for (const t of terms) {
    const tNoSlash = t.startsWith('\\') ? t.slice(1) : t;
    if (entry.cmdsNorm.some(c => (c.startsWith('\\') ? c.slice(1) : c) === tNoSlash)) {
      score += 320;
    } else if (entry.cmdsNorm.some(c => (c.startsWith('\\') ? c.slice(1) : c).startsWith(tNoSlash))) {
      score += 180;
    } else if (entry.titleWords.some(w => w.startsWith(t))) {
      score += 150;
    } else if (entry.aliasWords.some(w => w.startsWith(t))) {
      score += 130;
    } else if (entry.aliasesNorm.includes(t)) {
      score += 70;
    } else if (entry.groupNorm.includes(t)) {
      score += 40;
    }
  }

  // 4. Contextual boosts (active dataset, recent usage)
  if (options.activeDataset && entry.datasets?.has(options.activeDataset)) {
    score += 55;
  }
  if (options.recentMap && entry.recentKey && options.recentMap.has(entry.recentKey)) {
    const recRank = options.recentMap.get(entry.recentKey);
    score += Math.max(20, 110 - recRank * 8);
  }
  // Slight preference for simpler / shorter commands on ties
  score -= Math.min(30, entry.primaryCmdLen || 0);

  return score;
}
