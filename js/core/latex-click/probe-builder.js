// Probe building — εισάγει αόρατα \rlap markers στο LaTeX για batch μέτρηση θέσεων.
//
// Το trick: κάθε marker έχει μοναδικό RGB (0x020000 + id) και render-άρεται με
// \rlap{\color{#...}{\rule{0.01em}{0.25em}}} ώστε να πιάνει 1 pixel πλάτος.
// Μετά το render, ψάχνουμε τα .katex-rule elements με το αντίστοιχο RGB και
// παίρνουμε τις θέσεις τους. Ένα render για ΟΛΕΣ τις θέσεις — τεράστιο speedup.
import {
  readLatexTokenEnd as readCmdTokenEnd,
  findMatchingBraceEnd as findBraceClose,
  findMatchingBracketInSeg as findBracketClose,
} from '../latex/parsing.js';

// ─── Command sets (ποιοι όροι είναι δομικοί και πώς) ─────────────────────────
const TWO_ARG_COMMANDS = new Set([
  '\\frac', '\\dfrac', '\\tfrac', '\\cfrac',
  '\\binom', '\\dbinom', '\\tbinom', '\\genfrac',
  '\\overset', '\\underset', '\\stackrel',
  '\\xrightarrow', '\\xleftarrow',
]);

const SKIP_FIRST_BRACE_2ARG = new Set([
  '\\textcolor', '\\colorbox',
]);

const SKIP_TWO_BRACES_3ARG = new Set([
  '\\fcolorbox',
]);

const ONE_ARG_COMMANDS = new Set([
  '\\sqrt', '\\vec', '\\hat', '\\bar', '\\tilde', '\\dot', '\\ddot',
  '\\overline', '\\underline', '\\overbrace', '\\underbrace',
  '\\mathbb', '\\mathcal', '\\mathbf', '\\mathrm', '\\mathit', '\\mathsf', '\\mathtt',
  '\\boldsymbol', '\\pmb', '\\text', '\\textbf', '\\textit', '\\textrm', '\\operatorname',
  '\\not', '\\cancel', '\\bcancel', '\\xcancel',
  '\\phantom', '\\hphantom', '\\vphantom', '\\boxed', '\\fbox',
  '\\mathbin', '\\mathrel', '\\mathop', '\\mathord', '\\mathopen', '\\mathclose',
]);

const SKIP_ARG_COMMANDS = new Set([
  '\\color', '\\hspace', '\\vspace', '\\rule',
]);

const DELIM_COMMANDS = new Set([
  '\\left', '\\right', '\\middle',
  '\\bigl', '\\bigr', '\\Bigl', '\\Bigr',
  '\\biggl', '\\biggr', '\\Biggl', '\\Biggr',
  '\\big', '\\Big', '\\bigg', '\\Bigg',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function skipHorizWs(s, i) {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  return i;
}

function isFollowedByScript(s, pos) {
  const k = skipHorizWs(s, pos);
  return k < s.length && (s[k] === '^' || s[k] === '_');
}

// ─── Probe marker generation ─────────────────────────────────────────────────
export function makeProbeTex(id) {
  const hex = (0x020000 + id).toString(16).padStart(6, '0');
  return `\\rlap{\\color{#${hex}}{\\rule{0.01em}{0.25em}}}`;
}

export function parseColorRgb(str) {
  if (!str) return null;
  const mRgb = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (mRgb) return { r: Number(mRgb[1]), g: Number(mRgb[2]), b: Number(mRgb[3]) };
  const mHex = str.match(/#([0-9a-f]{6})/i);
  if (mHex) {
    const n = parseInt(mHex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return null;
}

/**
 * Συλλέγει ασφαλείς θέσεις εισαγωγής probe (και τυλίγει μονοσύμβολους εκθέτες/δείκτες
 * π.χ. e^x -> e^{...x...}) ώστε το batch render να παράγει όλες τις συντεταγμένες
 * και το συντακτικό scope σε ένα πέρασμα KaTeX.
 */
export function buildProbePass(trimmed) {
  const n = trimmed.length;
  const ops = []; // { at, offset, wrapEnd?, scopeId, endScopeId? }
  let scopeCounter = 0;
  const scopeStack = [0];
  const curScope = () => scopeStack[scopeStack.length - 1];

  const addOp = (at, offset, wrapEnd = null, scopeId = curScope(), endScopeId = null) => {
    if (ops.length && ops[ops.length - 1].at === at && !wrapEnd && ops[ops.length - 1].scopeId === scopeId) return;
    ops.push({ at, offset, wrapEnd, scopeId, endScopeId });
  };

  let i = 0;
  let lastWasSpace = false;

  const maybeAddBefore = (pos, scopeId = curScope()) => {
    if (pos < 0 || pos > n) return;
    if (isFollowedByScript(trimmed, pos)) return;
    addOp(pos, pos, null, scopeId);
  };

  while (i < n) {
    const ch = trimmed[i];

    if (ch === '%') {
      const nl = trimmed.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      lastWasSpace = false;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (!lastWasSpace) {
        maybeAddBefore(i);
        lastWasSpace = true;
      }
      i++;
      continue;
    }
    lastWasSpace = false;

    if (ch === '^' || ch === '_') {
      let j = skipHorizWs(trimmed, i + 1);
      if (j < n && trimmed[j] !== '{') {
        const tokEnd = readCmdTokenEnd(trimmed, j);
        if (tokEnd > j) {
          const scriptScope = ++scopeCounter;
          addOp(j, j, tokEnd, scriptScope, scriptScope);
          i = tokEnd;
          continue;
        }
      }
      i = j;
      continue;
    }

    if (ch === '\\') {
      if (trimmed.startsWith('\\begin{', i)) {
        maybeAddBefore(i);
        const endB = trimmed.indexOf('}', i + 7);
        if (endB !== -1) {
          const envName = trimmed.slice(i + 7, endB).trim();
          let after = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && trimmed[after] === '{') {
            const specEnd = findBraceClose(trimmed, after);
            if (specEnd !== -1) after = specEnd + 1;
          }
          scopeStack.push(++scopeCounter);
          i = after;
          continue;
        }
      }

      if (trimmed.startsWith('\\end{', i)) {
        maybeAddBefore(i);
        const endE = trimmed.indexOf('}', i + 5);
        if (endE !== -1) {
          if (scopeStack.length > 1) scopeStack.pop();
          i = endE + 1;
          continue;
        }
      }

      const cmdEnd = readCmdTokenEnd(trimmed, i);
      const cmd = trimmed.slice(i, cmdEnd);

      if (DELIM_COMMANDS.has(cmd)) {
        maybeAddBefore(i);
        const j = skipHorizWs(trimmed, cmdEnd);
        const delEnd = readCmdTokenEnd(trimmed, j);
        i = delEnd;
        continue;
      }

      if (SKIP_ARG_COMMANDS.has(cmd)) {
        maybeAddBefore(i);
        let j = skipHorizWs(trimmed, cmdEnd);
        while (j < n && trimmed[j] === '[') {
          const bEnd = findBracketClose(trimmed, j);
          if (bEnd === -1) break;
          j = skipHorizWs(trimmed, bEnd + 1);
        }
        const maxBraces = cmd === '\\rule' ? 2 : 1;
        for (let b = 0; b < maxBraces && j < n && trimmed[j] === '{'; b++) {
          const bEnd = findBraceClose(trimmed, j);
          if (bEnd === -1) break;
          j = skipHorizWs(trimmed, bEnd + 1);
        }
        i = j;
        continue;
      }

      if (SKIP_FIRST_BRACE_2ARG.has(cmd) || SKIP_TWO_BRACES_3ARG.has(cmd)) {
        maybeAddBefore(i);
        let j = skipHorizWs(trimmed, cmdEnd);
        const skipCount = SKIP_TWO_BRACES_3ARG.has(cmd) ? 2 : 1;
        for (let b = 0; b < skipCount && j < n && trimmed[j] === '{'; b++) {
          const bEnd = findBraceClose(trimmed, j);
          if (bEnd === -1) break;
          j = skipHorizWs(trimmed, bEnd + 1);
        }
        i = j;
        continue;
      }

      if (TWO_ARG_COMMANDS.has(cmd) || ONE_ARG_COMMANDS.has(cmd)) {
        maybeAddBefore(i);
        let j = skipHorizWs(trimmed, cmdEnd);
        if (j < n && trimmed[j] === '[') {
          const brEnd = findBracketClose(trimmed, j);
          if (brEnd !== -1) { i = j + 1; continue; }
        }
        if (j < n && trimmed[j] === '{') {
          scopeStack.push(++scopeCounter);
          i = j + 1;
          continue;
        }
        const argCount = TWO_ARG_COMMANDS.has(cmd) ? 2 : 1;
        for (let a = 0; a < argCount && j < n; a++) {
          if (trimmed[j] === '{') {
            const bEnd = findBraceClose(trimmed, j);
            j = bEnd === -1 ? n : bEnd + 1;
          } else {
            j = readCmdTokenEnd(trimmed, j);
          }
          if (a + 1 < argCount) j = skipHorizWs(trimmed, j);
        }
        i = j;
        continue;
      }

      if (cmd === '\\\\') {
        maybeAddBefore(i);
        scopeStack[scopeStack.length - 1] = ++scopeCounter;
        const j = skipHorizWs(trimmed, cmdEnd);
        if (j < n && trimmed[j] === '[') {
          const brEnd = findBracketClose(trimmed, j);
          if (brEnd !== -1) { i = brEnd + 1; continue; }
        }
        i = cmdEnd;
        continue;
      }

      maybeAddBefore(i);
      i = cmdEnd;
      continue;
    }

    if (ch === '{') {
      scopeStack.push(++scopeCounter);
      i++;
      continue;
    }

    if (ch === '}') {
      maybeAddBefore(i);
      if (scopeStack.length > 1) scopeStack.pop();
      const next = skipHorizWs(trimmed, i + 1);
      if (next < n && trimmed[next] === '{') {
        // Μεταξύ {arg1} και {arg2} (π.χ. \frac{a}{b}): μην εισάγεις \rlap
        scopeStack.push(++scopeCounter);
        i = next + 1;
        continue;
      }
      i++;
      continue;
    }

    if (ch === '&') {
      maybeAddBefore(i);
      scopeStack[scopeStack.length - 1] = ++scopeCounter;
      i++;
      continue;
    }

    maybeAddBefore(i);
    i++;
  }

  maybeAddBefore(n);

  if (!ops.length) {
    ops.push({ at: 0, offset: 0, wrapEnd: null, scopeId: 0, endScopeId: null });
  }

  // Κράτα έως 380 ops (ώστε μαζί με τα wrapEnd probes να μην ξεπερνούν ~450 probes)
  let chosen = ops;
  if (ops.length > 380) {
    chosen = [];
    const step = ops.length / 380;
    for (let k = 0; k < 380; k++) {
      chosen.push(ops[Math.min(ops.length - 1, Math.floor(k * step))]);
    }
    if (chosen[chosen.length - 1] !== ops[ops.length - 1]) {
      chosen.push(ops[ops.length - 1]);
    }
  }

  const probeMeta = []; // id (1-based) -> { offset, scopeId }
  let probedTex = '';
  let cursor = 0;
  for (let k = 0; k < chosen.length; k++) {
    const op = chosen[k];
    if (op.at > cursor) probedTex += trimmed.slice(cursor, op.at);
    if (op.wrapEnd && op.wrapEnd > op.at) {
      const startId = probeMeta.length + 1;
      probeMeta.push({ offset: op.offset, scopeId: op.scopeId });
      const endId = probeMeta.length + 1;
      probeMeta.push({ offset: op.wrapEnd, scopeId: op.endScopeId ?? op.scopeId });
      probedTex += '{' + makeProbeTex(startId) + trimmed.slice(op.at, op.wrapEnd) + makeProbeTex(endId) + '}';
      cursor = op.wrapEnd;
    } else {
      const id = probeMeta.length + 1;
      probeMeta.push({ offset: op.offset, scopeId: op.scopeId });
      probedTex += makeProbeTex(id);
      cursor = op.at;
    }
  }
  if (cursor < n) probedTex += trimmed.slice(cursor);

  return { chosen, probeMeta, probedTex };
}