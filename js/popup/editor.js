import { KEYS } from '../core/constants.js';
import { $, on, clamp, rafThrottle } from '../core/dom.js';
import {
  computeCtrlArrowTarget,
  computeSmartLatexArrowTarget,
  computeTabJumpTarget,
  computeWysiwygMathEdit,
  computeWysiwygVerticalArrowTarget,
  findPrecedingFractionOperandStart,
  replaceRangePreservingUndo,
  skipInvisibleMathWhitespaceBack,
  skipInvisibleMathWhitespaceForward,
} from '../core/latex-nav.js';
import { findActiveStructuralSlot } from '../core/latex-click.js';
import { normalizeSearchStr, buildAliasList, extractPrimaryCommands } from '../core/latex-search.js';
import { set } from '../core/storage.js';
import { state } from './settings.js';
import { isAutoDollarWrapEnabled, isCursorInsideKaTeX } from './notepad.js';

function isEscapedAt(str, idx) {
  let b = 0;
  for (let k = idx - 1; k >= 0 && str[k] === '\\'; k--) b++;
  return (b % 2) === 1;
}

function unwrapOuterMathDelims(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return rawText;
  const pairs = [
    ['$$', '$$'],
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['[latex]', '[/latex]'],
    ['[tex]', '[/tex]'],
    ['$', '$'],
  ];
  for (const [open, close] of pairs) {
    if (trimmed.length >= open.length + close.length) {
      const low = trimmed.toLowerCase();
      if (low.startsWith(open) && low.endsWith(close)) {
        const inner = trimmed.slice(open.length, trimmed.length - close.length);
        if (!inner.includes(close)) return inner.trim();
      }
    }
  }
  return rawText;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

const LATEX_AC_ITEMS = [
  { cmd: '\\frac', ins: '\\frac{}{}', back: 3, tex: '\\frac{a}{b}', desc: 'Κλάσμα' },
  { cmd: '\\dfrac', ins: '\\dfrac{}{}', back: 3, tex: '\\dfrac{a}{b}', desc: 'Κλάσμα (display)' },
  { cmd: '\\tfrac', ins: '\\tfrac{}{}', back: 3, tex: '\\tfrac{a}{b}', desc: 'Κλάσμα (inline)' },
  { cmd: '\\sqrt', ins: '\\sqrt{}', back: 1, tex: '\\sqrt{x}', desc: 'Τετραγωνική ρίζα' },
  { cmd: '\\sum', ins: '\\sum_{}^{}', back: 4, tex: '\\sum_{i=1}^n', desc: 'Άθροισμα' },
  { cmd: '\\prod', ins: '\\prod_{}^{}', back: 4, tex: '\\prod_{i=1}^n', desc: 'Γινόμενο' },
  { cmd: '\\int', ins: '\\int_{}^{}', back: 4, tex: '\\int_a^b', desc: 'Ολοκλήρωμα' },
  { cmd: '\\iint', ins: '\\iint', back: 0, tex: '\\iint', desc: 'Διπλό ολοκλήρωμα' },
  { cmd: '\\oint', ins: '\\oint', back: 0, tex: '\\oint', desc: 'Επικαμπύλιο ολοκλήρωμα' },
  { cmd: '\\lim', ins: '\\lim_{x \\to }', back: 1, tex: '\\lim_{x \\to 0}', desc: 'Όριο' },
  { cmd: '\\infty', ins: '\\infty', back: 0, tex: '\\infty', desc: 'Άπειρο' },
  { cmd: '\\to', ins: '\\to ', back: 0, tex: '\\to', desc: 'Βέλος' },
  { cmd: '\\implies', ins: '\\implies ', back: 0, tex: '\\implies', desc: 'Συνεπάγεται' },
  { cmd: '\\iff', ins: '\\iff ', back: 0, tex: '\\iff', desc: 'Ισοδυναμία' },
  { cmd: '\\equiv', ins: '\\equiv ', back: 0, tex: '\\equiv', desc: 'Ισοδύναμο / mod' },
  { cmd: '\\approx', ins: '\\approx ', back: 0, tex: '\\approx', desc: 'Περίπου ίσο' },
  { cmd: '\\neq', ins: '\\neq ', back: 0, tex: '\\neq', desc: 'Διάφορο' },
  { cmd: '\\leq', ins: '\\leq ', back: 0, tex: '\\leq', desc: 'Μικρότερο ή ίσο' },
  { cmd: '\\geq', ins: '\\geq ', back: 0, tex: '\\geq', desc: 'Μεγαλύτερο ή ίσο' },
  { cmd: '\\pm', ins: '\\pm ', back: 0, tex: '\\pm', desc: 'Συν-πλην' },
  { cmd: '\\mp', ins: '\\mp ', back: 0, tex: '\\mp', desc: 'Πλην-συν' },
  { cmd: '\\cdot', ins: '\\cdot ', back: 0, tex: '\\cdot', desc: 'Τελεία γινομένου' },
  { cmd: '\\times', ins: '\\times ', back: 0, tex: '\\times', desc: 'Πολλαπλασιασμός' },
  { cmd: '\\div', ins: '\\div ', back: 0, tex: '\\div', desc: 'Διαίρεση' },
  { cmd: '\\partial', ins: '\\partial', back: 0, tex: '\\partial', desc: 'Μερική παράγωγος' },
  { cmd: '\\nabla', ins: '\\nabla', back: 0, tex: '\\nabla', desc: 'Ανάδελτα / Gradient' },
  { cmd: '\\forall', ins: '\\forall ', back: 0, tex: '\\forall', desc: 'Για κάθε' },
  { cmd: '\\exists', ins: '\\exists ', back: 0, tex: '\\exists', desc: 'Υπάρχει' },
  { cmd: '\\in', ins: '\\in ', back: 0, tex: '\\in', desc: 'Ανήκει στο σύνολο' },
  { cmd: '\\notin', ins: '\\notin ', back: 0, tex: '\\notin', desc: 'Δεν ανήκει' },
  { cmd: '\\subset', ins: '\\subset ', back: 0, tex: '\\subset', desc: 'Υποσύνολο' },
  { cmd: '\\subseteq', ins: '\\subseteq ', back: 0, tex: '\\subseteq', desc: 'Υποσύνολο (ή ίσο)' },
  { cmd: '\\cup', ins: '\\cup ', back: 0, tex: '\\cup', desc: 'Ένωση συνόλων' },
  { cmd: '\\cap', ins: '\\cap ', back: 0, tex: '\\cap', desc: 'Τομή συνόλων' },
  { cmd: '\\emptyset', ins: '\\emptyset', back: 0, tex: '\\emptyset', desc: 'Κενό σύνολο' },
  { cmd: '\\mathbb', ins: '\\mathbb{}', back: 1, tex: '\\mathbb{R}', desc: 'Σύνολο αριθμών' },
  { cmd: '\\mathcal', ins: '\\mathcal{}', back: 1, tex: '\\mathcal{F}', desc: 'Καλλιγραφικά' },
  { cmd: '\\mathrm', ins: '\\mathrm{}', back: 1, tex: '\\mathrm{d}x', desc: 'Ορθή γραφή' },
  { cmd: '\\mathbf', ins: '\\mathbf{}', back: 1, tex: '\\mathbf{v}', desc: 'Έντονα μαθηματικά' },
  { cmd: '\\text', ins: '\\text{}', back: 1, tex: '\\text{αν}', desc: 'Κείμενο εντός LaTeX' },
  { cmd: '\\vec', ins: '\\vec{}', back: 1, tex: '\\vec{u}', desc: 'Διάνυσμα' },
  { cmd: '\\hat', ins: '\\hat{}', back: 1, tex: '\\hat{x}', desc: 'Καπέλο / εκτιμητής' },
  { cmd: '\\bar', ins: '\\bar{}', back: 1, tex: '\\bar{x}', desc: 'Μέσος όρος / συζυγής' },
  { cmd: '\\overline', ins: '\\overline{}', back: 1, tex: '\\overline{AB}', desc: 'Άνω γραμμή / ευθ. τμήμα' },
  { cmd: '\\underline', ins: '\\underline{}', back: 1, tex: '\\underline{x}', desc: 'Υπογράμμιση' },
  { cmd: '\\binom', ins: '\\binom{}{}', back: 3, tex: '\\binom{n}{k}', desc: 'Διωνυμικός συντελεστής' },
  { cmd: '\\left(', ins: '\\left(\\right)', back: 7, tex: '\\left(x\\right)', desc: 'Προσαρμοζόμενες παρενθέσεις' },
  { cmd: '\\sin', ins: '\\sin ', back: 0, tex: '\\sin', desc: 'Ημίτονο' },
  { cmd: '\\cos', ins: '\\cos ', back: 0, tex: '\\cos', desc: 'Συνημίτονο' },
  { cmd: '\\tan', ins: '\\tan ', back: 0, tex: '\\tan', desc: 'Εφαπτομένη' },
  { cmd: '\\cot', ins: '\\cot ', back: 0, tex: '\\cot', desc: 'Συνεφαπτομένη' },
  { cmd: '\\ln', ins: '\\ln ', back: 0, tex: '\\ln', desc: 'Φυσικός λογάριθμος' },
  { cmd: '\\log', ins: '\\log_{}', back: 1, tex: '\\log_{10}', desc: 'Λογάριθμος' },
  { cmd: '\\exp', ins: '\\exp ', back: 0, tex: '\\exp', desc: 'Εκθετική' },
  { cmd: '\\alpha', ins: '\\alpha', back: 0, tex: '\\alpha', desc: 'Ελληνικό α' },
  { cmd: '\\beta', ins: '\\beta', back: 0, tex: '\\beta', desc: 'Ελληνικό β' },
  { cmd: '\\gamma', ins: '\\gamma', back: 0, tex: '\\gamma', desc: 'Ελληνικό γ' },
  { cmd: '\\delta', ins: '\\delta', back: 0, tex: '\\delta', desc: 'Ελληνικό δ' },
  { cmd: '\\epsilon', ins: '\\epsilon', back: 0, tex: '\\epsilon', desc: 'Ελληνικό ε' },
  { cmd: '\\varepsilon', ins: '\\varepsilon', back: 0, tex: '\\varepsilon', desc: 'Ελληνικό ε (καμπύλο)' },
  { cmd: '\\zeta', ins: '\\zeta', back: 0, tex: '\\zeta', desc: 'Ελληνικό ζ' },
  { cmd: '\\eta', ins: '\\eta', back: 0, tex: '\\eta', desc: 'Ελληνικό η' },
  { cmd: '\\theta', ins: '\\theta', back: 0, tex: '\\theta', desc: 'Ελληνικό θ' },
  { cmd: '\\vartheta', ins: '\\vartheta', back: 0, tex: '\\vartheta', desc: 'Ελληνικό θ (παραλλαγή)' },
  { cmd: '\\lambda', ins: '\\lambda', back: 0, tex: '\\lambda', desc: 'Ελληνικό λ' },
  { cmd: '\\mu', ins: '\\mu', back: 0, tex: '\\mu', desc: 'Ελληνικό μ' },
  { cmd: '\\nu', ins: '\\nu', back: 0, tex: '\\nu', desc: 'Ελληνικό ν' },
  { cmd: '\\xi', ins: '\\xi', back: 0, tex: '\\xi', desc: 'Ελληνικό ξ' },
  { cmd: '\\pi', ins: '\\pi', back: 0, tex: '\\pi', desc: 'Ελληνικό π' },
  { cmd: '\\rho', ins: '\\rho', back: 0, tex: '\\rho', desc: 'Ελληνικό ρ' },
  { cmd: '\\sigma', ins: '\\sigma', back: 0, tex: '\\sigma', desc: 'Ελληνικό σ' },
  { cmd: '\\tau', ins: '\\tau', back: 0, tex: '\\tau', desc: 'Ελληνικό τ' },
  { cmd: '\\phi', ins: '\\phi', back: 0, tex: '\\phi', desc: 'Ελληνικό φ' },
  { cmd: '\\varphi', ins: '\\varphi', back: 0, tex: '\\varphi', desc: 'Ελληνικό φ (καμπύλο)' },
  { cmd: '\\chi', ins: '\\chi', back: 0, tex: '\\chi', desc: 'Ελληνικό χ' },
  { cmd: '\\psi', ins: '\\psi', back: 0, tex: '\\psi', desc: 'Ελληνικό ψ' },
  { cmd: '\\omega', ins: '\\omega', back: 0, tex: '\\omega', desc: 'Ελληνικό ω' },
  { cmd: '\\Gamma', ins: '\\Gamma', back: 0, tex: '\\Gamma', desc: 'Κεφαλαίο Γ' },
  { cmd: '\\Delta', ins: '\\Delta', back: 0, tex: '\\Delta', desc: 'Κεφαλαίο Δ' },
  { cmd: '\\Theta', ins: '\\Theta', back: 0, tex: '\\Theta', desc: 'Κεφαλαίο Θ' },
  { cmd: '\\Lambda', ins: '\\Lambda', back: 0, tex: '\\Lambda', desc: 'Κεφαλαίο Λ' },
  { cmd: '\\Pi', ins: '\\Pi', back: 0, tex: '\\Pi', desc: 'Κεφαλαίο Π' },
  { cmd: '\\Sigma', ins: '\\Sigma', back: 0, tex: '\\Sigma', desc: 'Κεφαλαίο Σ' },
  { cmd: '\\Phi', ins: '\\Phi', back: 0, tex: '\\Phi', desc: 'Κεφαλαίο Φ' },
  { cmd: '\\Omega', ins: '\\Omega', back: 0, tex: '\\Omega', desc: 'Κεφαλαίο Ω' },
  { cmd: '\\begin{cases}', ins: '\\begin{cases}\n & \\\\\n & \n\\end{cases}', back: 12, tex: '\\begin{cases} a \\\\ b \\end{cases}', desc: 'Σύστημα / κλαδική' },
  { cmd: '\\begin{aligned}', ins: '\\begin{aligned}\n &= \n\\end{aligned}', back: 14, tex: '\\begin{aligned} x &= 1 \\end{aligned}', desc: 'Στοίχιση εξισώσεων' },
  { cmd: '\\begin{pmatrix}', ins: '\\begin{pmatrix}\n & \\\\\n & \n\\end{pmatrix}', back: 14, tex: '\\begin{pmatrix} a & b \\end{pmatrix}', desc: 'Μήτρα (...)' },
  { cmd: '\\begin{bmatrix}', ins: '\\begin{bmatrix}\n & \\\\\n & \n\\end{bmatrix}', back: 14, tex: '\\begin{bmatrix} a & b \\end{bmatrix}', desc: 'Μήτρα [...]' },
  { cmd: '\\begin{vmatrix}', ins: '\\begin{vmatrix}\n & \\\\\n & \n\\end{vmatrix}', back: 14, tex: '\\begin{vmatrix} a & b \\end{vmatrix}', desc: 'Ορίζουσα |...|' },
  { cmd: '\\begin{Bmatrix}', ins: '\\begin{Bmatrix}\n & \\\\\n & \n\\end{Bmatrix}', back: 14, tex: '\\begin{Bmatrix} a & b \\end{Bmatrix}', desc: 'Μήτρα {...}' },
  { cmd: '\\begin{Vmatrix}', ins: '\\begin{Vmatrix}\n & \\\\\n & \n\\end{Vmatrix}', back: 14, tex: '\\begin{Vmatrix} a & b \\end{Vmatrix}', desc: 'Νόρμα ||...||' },
  { cmd: '\\begin{matrix}', ins: '\\begin{matrix}\n & \\\\\n & \n\\end{matrix}', back: 13, tex: '\\begin{matrix} a & b \\end{matrix}', desc: 'Απλός πίνακας' },
  { cmd: '\\textcolor', ins: '\\textcolor{}{}', back: 3, tex: '\\textcolor{red}{x}', desc: 'Χρώμα κειμένου' },
  { cmd: '\\operatorname', ins: '\\operatorname{}', back: 1, tex: '\\operatorname{sgn}(x)', desc: 'Προσαρμοσμένος τελεστής' },
  { cmd: '\\overset', ins: '\\overset{}{}', back: 3, tex: '\\overset{a}{b}', desc: 'Σύμβολο από πάνω' },
  { cmd: '\\underset', ins: '\\underset{}{}', back: 3, tex: '\\underset{a}{b}', desc: 'Σύμβολο από κάτω' },
  { cmd: '\\overbrace', ins: '\\overbrace{}', back: 1, tex: '\\overbrace{abc}', desc: 'Πάνω αγκύλη' },
  { cmd: '\\underbrace', ins: '\\underbrace{}', back: 1, tex: '\\underbrace{abc}', desc: 'Κάτω αγκύλη' },
  { cmd: '\\widehat', ins: '\\widehat{}', back: 1, tex: '\\widehat{abc}', desc: 'Μεγάλο καπέλο' },
  { cmd: '\\widetilde', ins: '\\widetilde{}', back: 1, tex: '\\widetilde{abc}', desc: 'Μεγάλη περισπωμένη' },
  { cmd: '\\overrightarrow', ins: '\\overrightarrow{}', back: 1, tex: '\\overrightarrow{AB}', desc: 'Διάνυσμα (βέλος)' },
  { cmd: '\\xrightarrow', ins: '\\xrightarrow[]{}', back: 3, tex: '\\xrightarrow[n]{m}', desc: 'Εκτεταμένο δεξί βέλος' },
  { cmd: '\\xleftarrow', ins: '\\xleftarrow[]{}', back: 3, tex: '\\xleftarrow[n]{m}', desc: 'Εκτεταμένο αριστερό βέλος' },
];

const AC_RECENT_KEY = 'latex_ac_recent';
let acCatalogCache = null;
let acRecentList = null;

function getAcRecentList() {
  if (acRecentList) return acRecentList;
  try {
    const raw = localStorage.getItem(AC_RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    acRecentList = Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
  } catch {
    acRecentList = [];
  }
  return acRecentList;
}

function recordAcRecent(cmd) {
  if (!cmd) return;
  const list = getAcRecentList().filter(c => c !== cmd);
  list.unshift(cmd);
  if (list.length > 24) list.length = 24;
  acRecentList = list;
  try { localStorage.setItem(AC_RECENT_KEY, JSON.stringify(list)); } catch { }
}

function deriveAcEntryFromItem(item) {
  if (!item) return null;
  if (item.action === 'matrix-builder' && item.matrixType) {
    const env = item.matrixType;
    const cmd = `\\begin{${env}}`;
    return {
      cmd,
      ins: `\\begin{${env}}\n & \\\\\n & \n\\end{${env}}`,
      back: env.length + 7,
      tex: item.render || cmd,
      desc: item.title || env,
    };
  }
  const before = typeof item.before === 'string' ? item.before : '';
  const after = typeof item.after === 'string' ? item.after : '';
  if (!before.startsWith('\\')) return null;

  // Handle \operatorname{name}( or \operatorname*{argmax}_{
  const opStar = before.match(/^\\operatorname\*?\{([a-zA-Z]+)\}(.*)$/);
  if (opStar) {
    const name = opStar[1];
    return {
      cmd: `\\${name}`,
      ins: before + after,
      back: after.length,
      tex: item.render || before + after,
      desc: item.title || name,
    };
  }

  // Handle \mathbb{R}, \textcolor{red}{, \left\langle, etc.
  const texCmd = before.match(/^\\(?:mathbb|mathbf|mathrm|mathcal|mathfrak|mathit|mathsf|mathtt|textcolor|text)\{[a-zA-Z0-9]+\}$/);
  if (texCmd && !after) {
    return {
      cmd: before,
      ins: before,
      back: 0,
      tex: item.render || before,
      desc: item.title || before,
    };
  }

  const colTemplate = before.match(/^(\\textcolor\{[a-zA-Z]+\})\{$/);
  if (colTemplate) {
    return {
      cmd: colTemplate[1],
      ins: before + after,
      back: after.length,
      tex: item.render || `${colTemplate[1]}{x}`,
      desc: item.title || colTemplate[1],
    };
  }

  const leftDelim = before.match(/^(\\left\\?[a-zA-Z(.|\[]+)/);
  if (leftDelim && before.startsWith('\\left')) {
    const cleanCmd = leftDelim[1].trim();
    return {
      cmd: cleanCmd,
      ins: before + after,
      back: after.length,
      tex: item.render || `${before}x${after}`,
      desc: item.title || cleanCmd,
    };
  }

  const baseMatch = before.match(/^(\\[a-zA-Z]+)/);
  if (!baseMatch) return null;
  const cmd = baseMatch[1];
  if (cmd.length < 2) return null;

  let ins = before + after;
  let back = after.length;
  if (!after && before === cmd && !before.endsWith(' ')) {
    // Pure zero-arg command
    ins = before;
    back = 0;
  }
  return {
    cmd,
    ins,
    back,
    tex: item.render || (after ? `${before}x${after}` : cmd),
    desc: item.title || cmd,
  };
}

function getAutocompleteCatalog() {
  if (acCatalogCache) return acCatalogCache;
  const map = new Map();

  const registerItem = (rawEntry, aliasesStr = '') => {
    if (!rawEntry || !rawEntry.cmd) return;
    const key = rawEntry.cmd.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      if (aliasesStr) {
        existing.aliasesNorm = `${existing.aliasesNorm} ${aliasesStr}`.trim();
        existing.aliasWords = existing.aliasesNorm.split(/\s+/).filter(Boolean);
      }
      return;
    }
    const cmdNorm = normalizeSearchStr(rawEntry.cmd);
    const descNorm = normalizeSearchStr(rawEntry.desc || '');
    const combinedAlias = normalizeSearchStr(`${rawEntry.desc || ''} ${aliasesStr || ''}`);
    map.set(key, {
      ...rawEntry,
      cmdNorm,
      cmdNoSlash: cmdNorm.startsWith('\\') ? cmdNorm.slice(1) : cmdNorm,
      descNorm,
      aliasesNorm: combinedAlias,
      aliasWords: combinedAlias.split(/[\s/(),]+/).filter(Boolean),
    });
  };

  for (const seed of LATEX_AC_ITEMS) {
    const seedCmds = extractPrimaryCommands({ before: seed.cmd, render: seed.tex });
    const seedAliases = seedCmds.map(c => buildAliasList({ before: c, render: seed.tex, title: seed.desc }, '', '')).join(' ');
    registerItem(seed, seedAliases);
  }

  const datasets = [
    window.TOOLBARS_CODECOGS_ALIKE,
    window.TOOLBARS_BASIC,
    window.TOOLBARS_SCIENCE,
  ];
  for (const tbList of datasets) {
    if (!Array.isArray(tbList)) continue;
    for (const tb of tbList) {
      for (const grp of tb.groups || []) {
        for (const item of grp.items || []) {
          const derived = deriveAcEntryFromItem(item);
          if (!derived) continue;
          const aliases = buildAliasList(item, grp.id, grp.title);
          registerItem(derived, aliases);
        }
      }
    }
  }

  acCatalogCache = Array.from(map.values());
  return acCatalogCache;
}

let acState = { open: false, target: null, slashPos: 0, endPos: 0, matches: [], activeIdx: 0 };
let acMirrorEl = null;

function measureCaretRectInTextarea(ta, pos) {
  if (!ta) return null;
  const cs = getComputedStyle(ta);
  if (!acMirrorEl) {
    acMirrorEl = document.createElement('div');
    acMirrorEl.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;box-sizing:border-box;overflow:hidden;contain:layout style;';
  }
  if (!acMirrorEl.isConnected) document.body.appendChild(acMirrorEl);
  acMirrorEl.style.width = ta.clientWidth + 'px';
  acMirrorEl.style.fontFamily = cs.fontFamily;
  acMirrorEl.style.fontSize = cs.fontSize;
  acMirrorEl.style.lineHeight = cs.lineHeight;
  acMirrorEl.style.padding = cs.padding;
  const val = (ta.value || '').replace(/\r\n?/g, '\n');
  const before = document.createTextNode(val.slice(0, pos));
  const mark = document.createElement('span');
  mark.textContent = '\u200b';
  const after = document.createTextNode(val.slice(pos) || ' ');
  acMirrorEl.replaceChildren(before, mark, after);
  const mRect = acMirrorEl.getBoundingClientRect();
  const r = mark.getBoundingClientRect();
  const taRect = ta.getBoundingClientRect();
  acMirrorEl.textContent = '';
  return {
    left: taRect.left + (r.left - mRect.left) - ta.scrollLeft,
    top: taRect.top + (r.top - mRect.top) - ta.scrollTop,
    height: Math.max(16, r.height || 18),
  };
}

function closeLatexAutocomplete() {
  acState.open = false;
  acState.matches = [];
  const popup = $('#latex-ac-popup');
  if (popup) popup.classList.remove('active');
}

function acceptLatexAutocomplete(idx = acState.activeIdx) {
  const item = acState.matches[idx];
  const ta = acState.target;
  if (!item || !ta) { closeLatexAutocomplete(); return; }
  recordAcRecent(item.cmd);
  const val = ta.value || '';
  let insText = item.ins;
  let caretPos = acState.slashPos + insText.length - item.back;
  if (insText.endsWith('{}') && val[acState.endPos] === '{') {
    insText = item.cmd;
    caretPos = acState.slashPos + insText.length;
  }
  replaceRangePreservingUndo(ta, acState.slashPos, acState.endPos, insText, caretPos, caretPos);
  closeLatexAutocomplete();
  if (ta.id === 'notepad-input') {
    const follow = Boolean(state.previewFollowEnabled);
    if (follow) state.notepadUserScrolled = false;
    window.__renderHybridPreview?.(true, follow);
    window.__refreshSyntaxHighlight?.();
    window.__refreshNotepadCaret?.(true);
    set(KEYS.notepadText, ta.value);
  } else {
    window.__draftUserEdited = true;
    const follow = Boolean(state.previewFollowEnabled);
    if (follow) state.userScrolled = false;
    window.__renderPreview?.(follow);
    window.__refreshSyntaxHighlight?.();
    set(KEYS.draft, ta.value);
  }
}

function renderLatexAutocompletePopup(ta, caretPos) {
  const popup = $('#latex-ac-popup');
  if (!popup) return;
  const frag = document.createDocumentFragment();
  acState.matches.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'latex-ac-item' + (i === acState.activeIdx ? ' active' : '');
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(i === acState.activeIdx));
    const icon = document.createElement('span');
    icon.className = 'latex-ac-preview';
    try { katex.render(item.tex, icon, { throwOnError: false }); } catch { icon.textContent = item.cmd; }
    const cmdSpan = document.createElement('span');
    cmdSpan.className = 'latex-ac-cmd';
    cmdSpan.textContent = item.cmd;
    const descSpan = document.createElement('span');
    descSpan.className = 'latex-ac-desc';
    descSpan.textContent = item.desc;
    btn.append(icon, cmdSpan, descSpan);
    on(btn, 'mousedown', e => { e.preventDefault(); e.stopPropagation(); acceptLatexAutocomplete(i); });
    frag.appendChild(btn);
  });
  popup.replaceChildren(frag);
  popup.classList.add('active');

  const rect = measureCaretRectInTextarea(ta, caretPos);
  if (rect) {
    const pw = popup.offsetWidth || 240;
    const ph = popup.offsetHeight || 180;
    const left = clamp(rect.left, 8, Math.max(8, innerWidth - pw - 8));
    let top = rect.top + rect.height + 4;
    if (top + ph > innerHeight - 8 && rect.top - ph - 4 >= 8) {
      top = rect.top - ph - 4;
    }
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(clamp(top, 8, Math.max(8, innerHeight - ph - 8)))}px`;
  }
}

function updateLatexAutocompleteFor(ta) {
  if (!ta || document.activeElement !== ta) { closeLatexAutocomplete(); return; }
  const s = ta.selectionStart ?? 0;
  const e = ta.selectionEnd ?? 0;
  if (s !== e) { closeLatexAutocomplete(); return; }
  const val = ta.value || '';
  const before = val.slice(Math.max(0, s - 28), s);
  const m = before.match(/\\([a-zA-Z\u0370-\u03FF\u1F00-\u1FFF]{1,24})$/);
  if (!m) { closeLatexAutocomplete(); return; }
  const slashPos = s - m[0].length;
  if (isEscapedAt(val, slashPos)) { closeLatexAutocomplete(); return; }
  if (ta.id === 'notepad-input' && !isCursorInsideKaTeX(val, s)) {
    closeLatexAutocomplete();
    return;
  }

  const qRaw = m[1];
  const qNorm = normalizeSearchStr(qRaw);
  const qSlashNorm = '\\' + qNorm;
  const catalog = getAutocompleteCatalog();
  const recents = getAcRecentList();
  const recentRank = new Map(recents.map((c, idx) => [c, idx]));

  const scored = [];
  for (const item of catalog) {
    let score = 0;
    if (item.cmdNorm === qSlashNorm) {
      score = 1500;
    } else if (item.cmdNorm.startsWith(qSlashNorm)) {
      score = 1000 - Math.min(260, item.cmdNoSlash.length * 5);
    } else if (item.cmdNoSlash.startsWith('begin{' + qNorm) || item.cmdNoSlash.startsWith('mathbb{' + qNorm)) {
      score = 720;
    } else if (item.cmdNoSlash.includes(qNorm)) {
      score = 420 - Math.min(120, item.cmdNoSlash.length * 2);
    } else if (item.aliasWords.some(w => w.startsWith(qNorm))) {
      score = 340;
    } else if (item.aliasesNorm.includes(qNorm)) {
      score = 200;
    }
    if (score <= 0) continue;
    if (recentRank.has(item.cmd)) {
      score += Math.max(30, 150 - recentRank.get(item.cmd) * 8);
    }
    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.cmd.length - b.item.cmd.length);
  const matches = scored.slice(0, 12).map(x => x.item);

  const singleExactNoArgs = matches.length === 1
    && matches[0].cmd === '\\' + qRaw
    && matches[0].back === 0
    && !matches[0].ins.includes('{')
    && !matches[0].ins.includes('(');

  if (!matches.length || singleExactNoArgs) {
    closeLatexAutocomplete();
    return;
  }
  acState = { open: true, target: ta, slashPos, endPos: s, matches, activeIdx: 0 };
  renderLatexAutocompletePopup(ta, s);
}

window.__isLatexAutocompleteOpen = () => acState.open;
window.__closeLatexAutocomplete = closeLatexAutocomplete;
window.__invalidateAutocompleteCatalog = () => { acCatalogCache = null; };

export function init(ac) {
  const sig = ac.signal;
  let pendingScroll = false;
  let pendingClickFocus = null;
  let skipAutoWrapOnce = false;
  let suppressAutoWrapInputScroll = false;

  let saveTimer = null;
  const scheduleDraftSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => set(KEYS.draft, state.ta.value), 200);
  };

  const maybeAutoWrapUnbracedSlot = () => {
    if (state.previewEditEnabled === false || !state.previewNavActive) return false;
    if (skipAutoWrapOnce) {
      skipAutoWrapOnce = false;
      return false;
    }
    const ta = state.ta;
    if (!ta) return false;
    const s = ta.selectionStart ?? 0;
    const en = ta.selectionEnd ?? 0;
    if (s !== en) return false;
    const val = ta.value || '';
    const leadLen = val.length - val.trimStart().length;
    const trimmed = val.trim();
    if (!trimmed) return false;
    const pos = clamp(s, 0, val.length);
    const localPos = clamp(pos - leadLen, 0, trimmed.length);
    const slot = findActiveStructuralSlot(trimmed, localPos);
    if (!slot || !slot.needsBraces || slot.isEmpty) return false;
    const rStart = slot.replaceStart ?? slot.contentStart;
    const rEnd = slot.replaceEnd ?? slot.contentEnd;
    const absStart = leadLen + rStart;
    const absEnd = leadLen + rEnd;
    const inner = val.slice(absStart, absEnd);
    if (!inner || inner.startsWith('{')) return false;
    const rel = clamp(pos - absStart, 0, inner.length);
    suppressAutoWrapInputScroll = true;
    replaceRangePreservingUndo(ta, absStart, absEnd, `{${inner}}`, absStart + 1 + rel, absStart + 1 + rel);
    suppressAutoWrapInputScroll = false;
    window.__refreshSyntaxHighlight?.();
    scheduleDraftSave();
    return true;
  };
  window.__maybeAutoWrapEditorSlot = maybeAutoWrapUnbracedSlot;

  const flushPreview = rafThrottle(() => {
    const shouldScroll = pendingScroll && Boolean(state.previewFollowEnabled);
    pendingScroll = false;
    if (shouldScroll) {
      state.userScrolled = false;
      window.__renderPreview?.(true);
    } else {
      maybeAutoWrapUnbracedSlot();
      window.__syncPreviewCursor?.();
    }
  });

  on(state.ta, 'pointerdown', () => {
    state.previewNavActive = false;
    window.__syncNavIndicators?.();
    if (!(state.ta.value || '').trim()) {
      window.__renderPreview?.(false);
    }
    pendingClickFocus = document.activeElement !== state.ta
      ? { top: state.ta.scrollTop, left: state.ta.scrollLeft, at: performance.now() }
      : null;
  }, true, sig);

  on(state.ta, 'input', e => {
    if (suppressAutoWrapInputScroll) return;
    window.__draftUserEdited = true;
    const follow = Boolean(state.previewFollowEnabled);
    if (follow) state.userScrolled = false;
    pendingScroll = follow;
    flushPreview();
    scheduleDraftSave();
  }, false, sig);

  const syncCursor = () => flushPreview();
  on(state.ta, 'keyup', syncCursor, false, sig);
  on(state.ta, 'mouseup', syncCursor, false, sig);
  on(state.ta, 'click', syncCursor, false, sig);
  on(state.ta, 'select', syncCursor, false, sig);
  on(state.ta, 'focus', () => {
    if (pendingClickFocus && performance.now() - pendingClickFocus.at < 250) {
      const { top, left } = pendingClickFocus;
      pendingClickFocus = null;
      if (Math.abs(state.ta.scrollTop - top) > 2 || Math.abs(state.ta.scrollLeft - left) > 2) {
        state.ta.scrollTop = top;
        state.ta.scrollLeft = left;
      }
      const pre = $('#latex-highlight');
      if (pre) { pre.scrollTop = state.ta.scrollTop; pre.scrollLeft = state.ta.scrollLeft; }
    }
    syncCursor();
  }, false, sig);
  on(document, 'selectionchange', () => {
    if (document.activeElement === state.ta) syncCursor();
  }, false, sig);

  on(state.ta, 'keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      skipAutoWrapOnce = true;
    }
    if (NAV_KEYS.has(e.key) && state.previewFollowEnabled) {
      state.userScrolled = false;
      pendingScroll = true;
    }

    const isAltGr = e.ctrlKey && e.altKey && !e.metaKey;
    const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;
    const isWysiwyg = state.previewEditEnabled !== false && state.previewNavActive;

    if (isWysiwyg && (noMod || isAltGr)) {
      const val = state.ta.value || '';
      const s = state.ta.selectionStart ?? val.length;
      const en = state.ta.selectionEnd ?? s;
      const sel = val.slice(s, en);

      if (e.key === '/' && !isEscapedAt(val, s)) {
        e.preventDefault();
        if (en > s) {
          const ins = `\\dfrac{${sel}}{}`;
          replaceRangePreservingUndo(state.ta, s, en, ins, s + 7 + sel.length + 2, s + 7 + sel.length + 2);
        } else {
          const { opStart, stripParens } = findPrecedingFractionOperandStart(val, 0, s);
          if (opStart < s) {
            let num = val.slice(opStart, s);
            if (stripParens) {
              if (num.startsWith('\\left(') && num.endsWith('\\right)')) num = num.slice(6, -7).trim();
              else if (num.startsWith('(') && num.endsWith(')')) num = num.slice(1, -1);
            }
            const ins = `\\dfrac{${num}}{}`;
            replaceRangePreservingUndo(state.ta, opStart, s, ins, opStart + 7 + num.length + 2, opStart + 7 + num.length + 2);
          } else {
            replaceRangePreservingUndo(state.ta, s, s, '\\dfrac{}{}', s + 7, s + 7);
          }
        }
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        window.__refreshSyntaxHighlight?.();
        scheduleDraftSave();
        return;
      }

      if (e.key === '*' && !isEscapedAt(val, s)) {
        e.preventDefault();
        replaceRangePreservingUndo(state.ta, s, en, '\\cdot ', s + 6, s + 6);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        window.__refreshSyntaxHighlight?.();
        scheduleDraftSave();
        return;
      }

      if (noMod && s === en && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (e.key === 'Backspace' && skipInvisibleMathWhitespaceBack(val, 0, s, val.length) <= 0) {
          e.preventDefault();
          state.ta.setSelectionRange(0, 0);
          pendingScroll = Boolean(state.previewFollowEnabled);
          flushPreview();
          return;
        }
        if (e.key === 'Delete' && skipInvisibleMathWhitespaceForward(val, s, val.length, 0) >= val.length) {
          e.preventDefault();
          state.ta.setSelectionRange(val.length, val.length);
          pendingScroll = Boolean(state.previewFollowEnabled);
          flushPreview();
          return;
        }
        const res = computeWysiwygMathEdit(val, s, e.key, 0, val.length);
        if (res) {
          e.preventDefault();
          if (res.kind === 'move') {
            state.ta.setSelectionRange(res.caret, res.caret);
            pendingScroll = Boolean(state.previewFollowEnabled);
            flushPreview();
            return;
          }
          const rem = val.slice(0, res.start) + res.text + val.slice(res.end);
          if (!rem.trim()) {
            replaceRangePreservingUndo(state.ta, 0, val.length, '', 0, 0);
          } else {
            replaceRangePreservingUndo(state.ta, res.start, res.end, res.text, res.caret, res.caret);
          }
          window.__draftUserEdited = true;
          pendingScroll = Boolean(state.previewFollowEnabled);
          flushPreview();
          window.__refreshSyntaxHighlight?.();
          scheduleDraftSave();
          return;
        }
      }
    }

    if ((state.autoBracesEnabled || isWysiwyg) && (noMod || isAltGr)) {
      const val = state.ta.value || '';
      const s = state.ta.selectionStart ?? val.length;
      const en = state.ta.selectionEnd ?? s;
      const sel = val.slice(s, en);

      if (state.autoBracesEnabled && e.key === '{' && !isEscapedAt(val, s)) {
        e.preventDefault();
        replaceRangePreservingUndo(state.ta, s, en, `{${sel}}`, s + 1, s + 1 + sel.length);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        window.__refreshSyntaxHighlight?.();
        scheduleDraftSave();
        return;
      }
      if (state.autoBracesEnabled && e.key === '}' && s === en && val[s] === '}' && !isEscapedAt(val, s)) {
        e.preventDefault();
        state.ta.setSelectionRange(s + 1, s + 1);
        if (state.previewFollowEnabled) pendingScroll = true;
        flushPreview();
        return;
      }
      if (state.autoBracesEnabled && noMod && e.key === 'Backspace' && s === en && s > 0 && val[s - 1] === '{' && val[s] === '}' && !isEscapedAt(val, s - 1)) {
        e.preventDefault();
        replaceRangePreservingUndo(state.ta, s - 1, s + 1, '', s - 1, s - 1);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        window.__refreshSyntaxHighlight?.();
        scheduleDraftSave();
        return;
      }
      if ((e.key === '^' || e.key === '_') && !isEscapedAt(val, s) && (sel.length > 0 || val[s] !== '{')) {
        e.preventDefault();
        const ins = `${e.key}{${sel}}`;
        replaceRangePreservingUndo(state.ta, s, en, ins, s + 2, s + 2 + sel.length);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        window.__refreshSyntaxHighlight?.();
        scheduleDraftSave();
        return;
      }
      if (noMod && e.key === 'Tab') {
        const caretPos = (state.ta.selectionDirection === 'backward' ? s : en);
        const target = computeTabJumpTarget(val, caretPos, e.shiftKey ? -1 : 1);
        if (target !== null && target !== caretPos) {
          e.preventDefault();
          state.ta.setSelectionRange(target, target);
          if (state.previewFollowEnabled) pendingScroll = true;
          flushPreview();
          return;
        }
      }
    }

    if (isWysiwyg && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const s = state.ta.selectionStart ?? 0;
      const en = state.ta.selectionEnd ?? s;
      if (s === en) {
        const val = state.ta.value || '';
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const target = computeWysiwygVerticalArrowTarget(val, s, dir, 0, val.length);
        if (target !== null && target !== s) {
          e.preventDefault();
          state.ta.setSelectionRange(target, target);
          flushPreview();
          return;
        }
      }
    }

    if (isWysiwyg && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const s = state.ta.selectionStart ?? 0;
      const en = state.ta.selectionEnd ?? s;
      if (e.shiftKey || s === en) {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const caretPos = (state.ta.selectionDirection === 'backward' ? state.ta.selectionStart : state.ta.selectionEnd) ?? state.ta.value.length;
        const target = computeSmartLatexArrowTarget(state.ta.value, caretPos, dir, null, true);
        if (target !== null && target !== caretPos) {
          e.preventDefault();
          if (e.shiftKey) {
            const anchor = state.ta.selectionDirection === 'backward' ? state.ta.selectionEnd : state.ta.selectionStart;
            const start = Math.min(anchor, target);
            const end = Math.max(anchor, target);
            const selDir = target < anchor ? 'backward' : 'forward';
            state.ta.setSelectionRange(start, end, selDir);
          } else {
            state.ta.setSelectionRange(target, target);
          }
          flushPreview();
        }
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const caretPos = (state.ta.selectionDirection === 'backward' ? state.ta.selectionStart : state.ta.selectionEnd) ?? state.ta.value.length;
      const fullRange = [{ type: 'math', start: 0, end: state.ta.value.length, contentStart: 0, contentEnd: state.ta.value.length }];
      const target = computeCtrlArrowTarget(state.ta.value, caretPos, dir, fullRange);
      if (target !== null && target !== caretPos) {
        e.preventDefault();
        if (e.shiftKey) {
          const anchor = state.ta.selectionDirection === 'backward' ? state.ta.selectionEnd : state.ta.selectionStart;
          const start = Math.min(anchor, target);
          const end = Math.max(anchor, target);
          const selDir = target < anchor ? 'backward' : 'forward';
          state.ta.setSelectionRange(start, end, selDir);
        } else {
          state.ta.setSelectionRange(target, target);
        }
        flushPreview();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !window.mathglassDesktop?.isDesktop) {
      const insBtn = document.getElementById('insert-btn');
      if (insBtn) { e.preventDefault(); insBtn.click(); }
    }
  }, false, sig);

  on(state.ta, 'paste', e => {
    const plain = e.clipboardData?.getData('text/plain');
    if (typeof plain !== 'string' || !plain) return;
    const val = state.ta.value || '';
    const s = state.ta.selectionStart ?? val.length;
    const en = state.ta.selectionEnd ?? s;
    const isWysiwyg = state.previewEditEnabled !== false && state.previewNavActive;
    const cleaned = isWysiwyg ? unwrapOuterMathDelims(plain) : plain;
    if (cleaned === plain) return;
    e.preventDefault();
    replaceRangePreservingUndo(state.ta, s, en, cleaned, s + cleaned.length, s + cleaned.length);
    window.__draftUserEdited = true;
    pendingScroll = Boolean(state.previewFollowEnabled);
    flushPreview();
    window.__refreshSyntaxHighlight?.();
    set(KEYS.draft, state.ta.value);
  }, false, sig);

  const wireAutocomplete = ta => {
    if (!ta) return;
    on(ta, 'input', () => updateLatexAutocompleteFor(ta), false, sig);
    on(ta, 'blur', () => setTimeout(() => { if (document.activeElement !== ta) closeLatexAutocomplete(); }, 90), false, sig);
    on(ta, 'keydown', e => {
      if (!acState.open || acState.target !== ta) return;
      const count = acState.matches.length;
      if (!count) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopImmediatePropagation();
        acState.activeIdx = e.key === 'ArrowDown'
          ? (acState.activeIdx + 1) % count
          : (acState.activeIdx - 1 + count) % count;
        const popup = $('#latex-ac-popup');
        if (popup) {
          const items = popup.querySelectorAll('.latex-ac-item');
          items.forEach((el, idx) => {
            const onAct = idx === acState.activeIdx;
            el.classList.toggle('active', onAct);
            el.setAttribute('aria-selected', String(onAct));
          });
          items[acState.activeIdx]?.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      if ((e.key === 'Tab' || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        acceptLatexAutocomplete(acState.activeIdx);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeLatexAutocomplete();
      }
    }, true, sig);
  };
  wireAutocomplete(state.ta);
  wireAutocomplete($('#notepad-input'));
}

export function insertSnippet(before, after) {
  const inNotepad = document.body.classList.contains('notepad-open');
  const npTa = inNotepad ? $('#notepad-input') : null;
  const target = npTa || state.ta;
  if (!target) return { start: 0, wrappedDollar: false, target: null };

  try { target.focus({ preventScroll: true }); } catch { target.focus(); }
  const s = target.selectionStart ?? target.value.length;
  const e = target.selectionEnd ?? target.value.length;
  const sel = target.value.slice(s, e);

  const shouldWrapDollar = Boolean(npTa) && isAutoDollarWrapEnabled() && !isCursorInsideKaTeX(target.value, s);
  const actualBefore = shouldWrapDollar ? '$' + before : before;
  const actualAfter = shouldWrapDollar ? after + '$' : after;
  const text = actualBefore + sel + actualAfter;

  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { }
  if (!ok) {
    target.setRangeText(text, s, e, 'preserve');
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  let pos = s + actualBefore.length + sel.length + (shouldWrapDollar ? actualAfter.length : 0);
  if (!sel.length && actualAfter.length) pos = s + actualBefore.length;
  target.setSelectionRange(pos, pos);

  const follow = Boolean(state.previewFollowEnabled);
  if (npTa) {
    if (follow) state.notepadUserScrolled = false;
    window.__renderHybridPreview?.(true, follow);
    window.__refreshSyntaxHighlight?.();
    window.__refreshNotepadCaret?.();
    set(KEYS.notepadText, target.value);
  } else {
    window.__draftUserEdited = true;
    if (follow) state.userScrolled = false;
    window.__renderPreview?.(follow);
    window.__refreshSyntaxHighlight?.();
    set(KEYS.draft, target.value);
  }
  return { start: s, wrappedDollar: shouldWrapDollar, target };
}
