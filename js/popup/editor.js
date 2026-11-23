import { KEYS } from '../core/constants.js';
import { $, on, clamp, rafThrottle } from '../core/dom.js';
import { computeCtrlArrowTarget, computeSmartLatexArrowTarget, computeTabJumpTarget, replaceRangePreservingUndo } from '../core/latex-nav.js';
import { set } from '../core/storage.js';
import { state } from './settings.js';
import { isAutoDollarWrapEnabled, isCursorInsideKaTeX } from './notepad.js';

function isEscapedAt(str, idx) {
  let b = 0;
  for (let k = idx - 1; k >= 0 && str[k] === '\\'; k--) b++;
  return (b % 2) === 1;
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
  { cmd: '\\left(', ins: '\\left(  \\right)', back: 8, tex: '\\left(x\\right)', desc: 'Προσαρμοζόμενες παρενθέσεις' },
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
  { cmd: '\\begin{cases}', ins: '\\begin{cases}\n & \\\\\n & \n\\end{cases}', back: 20, tex: '\\begin{cases} a \\\\ b \\end{cases}', desc: 'Σύστημα / κλαδική' },
  { cmd: '\\begin{aligned}', ins: '\\begin{aligned}\n &= \n\\end{aligned}', back: 17, tex: '\\begin{aligned} x &= 1 \\end{aligned}', desc: 'Στοίχιση εξισώσεων' },
  { cmd: '\\begin{pmatrix}', ins: '\\begin{pmatrix}\n & \\\\\n & \n\\end{pmatrix}', back: 22, tex: '\\begin{pmatrix} a & b \\end{pmatrix}', desc: 'Μήτρα (...)' },
  { cmd: '\\begin{bmatrix}', ins: '\\begin{bmatrix}\n & \\\\\n & \n\\end{bmatrix}', back: 22, tex: '\\begin{bmatrix} a & b \\end{bmatrix}', desc: 'Μήτρα [...]' },
  { cmd: '\\begin{vmatrix}', ins: '\\begin{vmatrix}\n & \\\\\n & \n\\end{vmatrix}', back: 22, tex: '\\begin{vmatrix} a & b \\end{vmatrix}', desc: 'Ορίζουσα |...|' },
];

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
  if (ta.id === 'notepad-input' && !isCursorInsideKaTeX(val, s)) {
    closeLatexAutocomplete();
    return;
  }
  const before = val.slice(0, s);
  const m = before.match(/\\([a-zA-Z]{1,20})$/);
  if (!m) { closeLatexAutocomplete(); return; }
  const slashPos = s - m[0].length;
  if (isEscapedAt(val, slashPos)) { closeLatexAutocomplete(); return; }
  const prefix = '\\' + m[1].toLowerCase();
  const matches = LATEX_AC_ITEMS
    .filter(it => it.cmd.toLowerCase().startsWith(prefix))
    .slice(0, 8);
  if (!matches.length || (matches.length === 1 && matches[0].cmd === '\\' + m[1])) {
    closeLatexAutocomplete();
    return;
  }
  acState = { open: true, target: ta, slashPos, endPos: s, matches, activeIdx: 0 };
  renderLatexAutocompletePopup(ta, s);
}

window.__isLatexAutocompleteOpen = () => acState.open;
window.__closeLatexAutocomplete = closeLatexAutocomplete;

export function init(ac) {
  const sig = ac.signal;
  let pendingScroll = false;
  let pendingClickFocus = null;
  const flushPreview = rafThrottle(() => {
    const shouldScroll = pendingScroll && Boolean(state.previewFollowEnabled);
    pendingScroll = false;
    if (shouldScroll) {
      state.userScrolled = false;
      window.__renderPreview?.(true);
    } else {
      window.__syncPreviewCursor?.();
    }
  });
  let saveTimer = null;
  const scheduleDraftSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => set(KEYS.draft, state.ta.value), 200);
  };

  on(state.ta, 'pointerdown', () => {
    state.previewNavActive = false;
    window.__syncNavIndicators?.();
    pendingClickFocus = document.activeElement !== state.ta
      ? { top: state.ta.scrollTop, left: state.ta.scrollLeft, at: performance.now() }
      : null;
  }, true, sig);

  on(state.ta, 'input', () => {
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
    if (NAV_KEYS.has(e.key) && state.previewFollowEnabled) {
      state.userScrolled = false;
      pendingScroll = true;
    }

    const isAltGr = e.ctrlKey && e.altKey && !e.metaKey;
    const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;

    if (state.autoBracesEnabled && (noMod || isAltGr)) {
      const val = state.ta.value || '';
      const s = state.ta.selectionStart ?? val.length;
      const en = state.ta.selectionEnd ?? s;
      const sel = val.slice(s, en);

      if (e.key === '{' && !isEscapedAt(val, s)) {
        e.preventDefault();
        replaceRangePreservingUndo(state.ta, s, en, `{${sel}}`, s + 1, s + 1 + sel.length);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
        scheduleDraftSave();
        return;
      }
      if (e.key === '}' && s === en && val[s] === '}' && !isEscapedAt(val, s)) {
        e.preventDefault();
        state.ta.setSelectionRange(s + 1, s + 1);
        if (state.previewFollowEnabled) pendingScroll = true;
        flushPreview();
        return;
      }
      if (noMod && e.key === 'Backspace' && s === en && s > 0 && val[s - 1] === '{' && val[s] === '}' && !isEscapedAt(val, s - 1)) {
        e.preventDefault();
        replaceRangePreservingUndo(state.ta, s - 1, s + 1, '', s - 1, s - 1);
        window.__draftUserEdited = true;
        pendingScroll = Boolean(state.previewFollowEnabled);
        flushPreview();
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

    if (state.intuitiveNavEnabled && state.previewNavActive && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
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
