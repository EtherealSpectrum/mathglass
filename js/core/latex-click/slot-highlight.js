// Active slot highlighting — δείχνει το τρέχον ενεργό {slot} με διακεκομμένο πλαίσιο.
import {
  readLatexTokenEnd,
  findMatchingBraceEnd,
  findMatchingBracketInSeg,
} from '../latex/parsing.js';
import { getReusableProbeClone, getInlineAvailableWidth } from './probe-measure.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function skipHorizWs(s, i) {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
  return i;
}

const SLOT_CARET_TEX = '\\rlap{\\color{#8b7bfe}{\\rule[-0.18em]{0.11em}{1.08em}}}';
const SLOT_FRAC_CMDS = new Set(['\\frac', '\\dfrac', '\\tfrac', '\\cfrac', '\\genfrac']);
const SLOT_TWO_ARG_CMDS = new Set([
  '\\frac', '\\dfrac', '\\tfrac', '\\cfrac', '\\genfrac',
  '\\binom', '\\dbinom', '\\tbinom',
  '\\overset', '\\underset', '\\stackrel',
  '\\xrightarrow', '\\xleftarrow',
]);
const SLOT_ONE_ARG_CMDS = new Set([
  '\\sqrt', '\\vec', '\\hat', '\\bar', '\\tilde', '\\dot', '\\ddot',
  '\\overline', '\\underline', '\\widehat', '\\widetilde',
  '\\overrightarrow', '\\overleftarrow', '\\overbrace', '\\underbrace',
  '\\boxed', '\\fbox', '\\text', '\\textbf', '\\textit', '\\textrm', '\\texttt', '\\mbox',
  '\\mathrm', '\\mathbf', '\\mathbb', '\\mathcal', '\\mathit', '\\mathsf', '\\operatorname',
]);
const SLOT_SKIP_1_OF_2 = new Set(['\\textcolor', '\\colorbox']);
const SLOT_SKIP_2_OF_3 = new Set(['\\fcolorbox']);

const SKIP_ARG_COMMANDS = new Set(['\\color', '\\hspace', '\\vspace', '\\rule']);

export function findActiveStructuralSlot(rawMath, cursorOffset) {
  const n = rawMath.length;
  const pos = clamp(cursorOffset, 0, n);
  let best = null;

  const consider = slot => {
    if (pos < slot.contentStart || pos > slot.contentEnd) return;
    if (!best || (slot.contentEnd - slot.contentStart) <= (best.contentEnd - best.contentStart)) {
      best = slot;
    }
  };

  const braceStack = [];
  let pending = null;
  let i = 0;

  while (i < n) {
    const ch = rawMath[i];

    if (ch === '%') {
      const nl = rawMath.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }

    if (/\s/.test(ch)) { i++; continue; }

    if (pending && ch !== '{' && !(ch === '[' && pending.allowOpt) && ch !== '^' && ch !== '_') {
      if (ch === '}' || (ch === '\\' && rawMath.startsWith('\\end{', i))) {
        consider({ kind: pending.kind, contentStart: i, contentEnd: i, isEmpty: true, needsBraces: true, replaceStart: i, replaceEnd: i });
        pending = null;
        if (ch === '}') {
          const top = braceStack.pop();
          if (top && top.structural) {
            consider({
              kind: top.kind,
              contentStart: top.openIdx + 1,
              contentEnd: i,
              isEmpty: top.openIdx + 1 === i,
              needsBraces: false,
            });
            pending = top.nextPending;
          }
          i++;
          continue;
        }
      } else {
        const tokEnd = readLatexTokenEnd(rawMath, i);
        if (pos >= i && pos <= tokEnd) {
          consider({ kind: pending.kind, contentStart: i, contentEnd: tokEnd, isEmpty: false, needsBraces: true, replaceStart: i, replaceEnd: tokEnd });
        }
        pending = pending.remainingArgs > 1
          ? { kind: pending.nextKind || 'arg', remainingArgs: pending.remainingArgs - 1, allowOpt: false }
          : null;
        i = tokEnd;
        continue;
      }
    }

    if (ch === '^' || ch === '_') {
      const kind = ch === '^' ? 'sup' : 'sub';
      let j = skipHorizWs(rawMath, i + 1);
      if (j < n && rawMath[j] === '{') {
        pending = { kind, remainingArgs: 1, allowOpt: false };
        i = j;
        continue;
      }
      if (j >= n || rawMath[j] === '}' || (rawMath[j] === '\\' && rawMath.startsWith('\\end{', j))) {
        consider({ kind, contentStart: j, contentEnd: j, isEmpty: true, needsBraces: true, replaceStart: j, replaceEnd: j });
        i = j;
        pending = null;
        continue;
      }
      const tokEnd = readLatexTokenEnd(rawMath, j);
      if (pos >= j && pos <= tokEnd) {
        consider({ kind, contentStart: j, contentEnd: tokEnd, isEmpty: false, needsBraces: true, replaceStart: j, replaceEnd: tokEnd });
      }
      i = tokEnd;
      pending = null;
      continue;
    }

    if (ch === '\\') {
      if (rawMath.startsWith('\\begin{', i)) {
        const endB = rawMath.indexOf('}', i + 7);
        if (endB !== -1) {
          const envName = rawMath.slice(i + 7, endB).trim();
          let afterEnv = endB + 1;
          if ((envName === 'array' || envName === 'tabular') && rawMath[afterEnv] === '{') {
            const specEnd = findMatchingBraceEnd(rawMath, afterEnv);
            if (specEnd !== -1) afterEnv = specEnd + 1;
          }
          i = afterEnv;
          pending = null;
          continue;
        }
      }
      if (rawMath.startsWith('\\end{', i)) {
        const endE = rawMath.indexOf('}', i + 5);
        if (endE !== -1) {
          i = endE + 1;
          pending = null;
          continue;
        }
      }

      const cmdEnd = readLatexTokenEnd(rawMath, i);
      const cmd = rawMath.slice(i, cmdEnd);

      if (SKIP_ARG_COMMANDS.has(cmd)) {
        let j = skipHorizWs(rawMath, cmdEnd);
        while (j < n && rawMath[j] === '[') {
          const brEnd = findMatchingBracketInSeg(rawMath, j);
          if (brEnd === -1) break;
          j = skipHorizWs(rawMath, brEnd + 1);
        }
        const maxBraces = cmd === '\\rule' ? 2 : 1;
        for (let b = 0; b < maxBraces && j < n && rawMath[j] === '{'; b++) {
          const bEnd = findMatchingBraceEnd(rawMath, j);
          if (bEnd === -1) break;
          j = skipHorizWs(rawMath, bEnd + 1);
        }
        i = j;
        pending = null;
        continue;
      }

      if (SLOT_SKIP_1_OF_2.has(cmd) || SLOT_SKIP_2_OF_3.has(cmd)) {
        let j = cmdEnd;
        const skipCnt = SLOT_SKIP_2_OF_3.has(cmd) ? 2 : 1;
        for (let b = 0; b < skipCnt; b++) {
          j = skipHorizWs(rawMath, j);
          if (rawMath[j] === '{') {
            const bEnd = findMatchingBraceEnd(rawMath, j);
            if (bEnd !== -1) j = bEnd + 1;
          }
        }
        pending = { kind: 'arg', remainingArgs: 1, allowOpt: false };
        i = j;
        continue;
      }

      if (SLOT_TWO_ARG_CMDS.has(cmd)) {
        pending = {
          kind: SLOT_FRAC_CMDS.has(cmd) ? 'frac-num' : 'arg1',
          nextKind: SLOT_FRAC_CMDS.has(cmd) ? 'frac-den' : 'arg2',
          remainingArgs: 2,
          allowOpt: cmd === '\\xrightarrow' || cmd === '\\xleftarrow',
          optKind: 'sub',
        };
        i = cmdEnd;
        continue;
      }

      if (SLOT_ONE_ARG_CMDS.has(cmd)) {
        pending = {
          kind: cmd === '\\sqrt' ? 'sqrt' : 'arg',
          remainingArgs: 1,
          allowOpt: cmd === '\\sqrt',
          optKind: 'sqrt-deg',
        };
        i = cmdEnd;
        continue;
      }

      pending = null;
      i = cmdEnd;
      continue;
    }

    if (ch === '[' && pending && pending.allowOpt) {
      let brDepth = 1;
      let j = i + 1;
      while (j < n && brDepth > 0) {
        if (rawMath[j] === '\\') { j += 2; continue; }
        if (rawMath[j] === '[') brDepth++;
        else if (rawMath[j] === ']') brDepth--;
        j++;
      }
      const closeBr = brDepth === 0 ? j - 1 : n;
      consider({
        kind: pending.optKind || 'opt',
        contentStart: i + 1,
        contentEnd: closeBr,
        isEmpty: i + 1 === closeBr,
        needsBraces: false,
      });
      pending = { ...pending, allowOpt: false };
      i++;
      continue;
    }

    if (ch === '{') {
      const info = pending
        ? {
            structural: true,
            kind: pending.kind,
            nextPending: pending.remainingArgs > 1
              ? { kind: pending.nextKind || 'arg', remainingArgs: pending.remainingArgs - 1, allowOpt: false }
              : null,
          }
        : { structural: false, kind: null, nextPending: null };
      braceStack.push({ openIdx: i, ...info });
      pending = null;
      i++;
      continue;
    }

    if (ch === '}') {
      const top = braceStack.pop();
      if (top && top.structural) {
        consider({
          kind: top.kind,
          contentStart: top.openIdx + 1,
          contentEnd: i,
          isEmpty: top.openIdx + 1 === i,
          needsBraces: false,
        });
        pending = top.nextPending;
      } else {
        pending = null;
      }
      i++;
      continue;
    }

    pending = null;
    i++;
  }

  for (const top of braceStack) {
    if (top.structural) {
      consider({
        kind: top.kind,
        contentStart: top.openIdx + 1,
        contentEnd: n,
        isEmpty: top.openIdx + 1 === n,
        needsBraces: false,
      });
    }
  }

  return best;
}

export function clearActiveSlotHighlight(liveRoot) {
  if (!liveRoot) return;
  liveRoot.querySelectorAll('.mg-slot-overlay').forEach(el => el.remove());
}

const slotBoxCache = new Map();
const SLOT_BOX_CACHE_MAX = 160;

export function applyActiveSlotHighlight(rawMath, cursorOffset, liveRoot, options = {}) {
  if (!liveRoot) return false;
  clearActiveSlotHighlight(liveRoot);
  if (typeof katex === 'undefined' || !katex?.renderToString) return false;
  if (typeof rawMath !== 'string' || !rawMath.length || typeof cursorOffset !== 'number') return false;

  const leadLen = rawMath.length - rawMath.trimStart().length;
  const trimmed = rawMath.trim();
  if (!trimmed) return false;

  const localPos = clamp(cursorOffset - leadLen, 0, trimmed.length);
  const slot = findActiveStructuralSlot(trimmed, localPos);
  if (!slot) return false;

  const {
    displayMode = true,
    alignLeft = false,
    buildBalancedCandidate = null,
    injectLatexCaret = null,
  } = options;

  const liveKatexEl = liveRoot.querySelector('.katex-display > .katex, .katex');
  if (!liveKatexEl) return false;

  const liveKRect = liveKatexEl.getBoundingClientRect();
  if (liveKRect.width <= 0 && liveKRect.height <= 0) return false;

  const liveCs = getComputedStyle(liveRoot);
  const inlineMaxWidth = displayMode ? null : getInlineAvailableWidth(liveRoot);
  const widthKey = displayMode
    ? Math.round(Math.max(40, liveRoot.getBoundingClientRect().width || liveRoot.clientWidth))
    : Math.round(inlineMaxWidth);
  const slotCacheKey = `${displayMode ? '1' : '0'}:${alignLeft ? '1' : '0'}:${liveCs.fontSize}:${liveCs.lineHeight}:${widthKey}:${trimmed}:${slot.kind}:${slot.contentStart}:${slot.contentEnd}:${slot.isEmpty ? '1' : '0'}`;

  let cachedBox = slotBoxCache.get(slotCacheKey);
  if (cachedBox) {
    slotBoxCache.delete(slotCacheKey);
    slotBoxCache.set(slotCacheKey, cachedBox);
  } else {
    const rStart = slot.needsBraces ? slot.replaceStart : slot.contentStart;
    const rEnd = slot.needsBraces ? slot.replaceEnd : slot.contentEnd;
    const innerRaw = trimmed.slice(slot.contentStart, slot.contentEnd);
    const localInSlot = clamp(localPos - slot.contentStart, 0, innerRaw.length);

    let innerWithCaret;
    if (!innerRaw.trim()) {
      innerWithCaret = SLOT_CARET_TEX;
    } else if (typeof injectLatexCaret === 'function') {
      innerWithCaret = injectLatexCaret(innerRaw, localInSlot);
    } else {
      innerWithCaret = innerRaw.slice(0, localInSlot) + SLOT_CARET_TEX + innerRaw.slice(localInSlot);
    }

    const wrapped = slot.needsBraces
      ? `{\\htmlClass{mg-slot-probe}{${innerWithCaret}}}`
      : `\\htmlClass{mg-slot-probe}{${innerWithCaret}}`;
    const slotTex = trimmed.slice(0, rStart) + wrapped + trimmed.slice(rEnd);

    const renderCloneHtml = src => katex.renderToString(src, {
      throwOnError: true,
      displayMode,
      fleqn: alignLeft,
      trust: ctx => ctx.command === '\\htmlClass',
    });

    let html = '';
    try {
      html = renderCloneHtml(slotTex);
    } catch {
      if (typeof buildBalancedCandidate === 'function') {
        try {
          html = katex.renderToString(buildBalancedCandidate(slotTex, '#888'), {
            throwOnError: false,
            displayMode,
            fleqn: alignLeft,
            trust: ctx => ctx.command === '\\htmlClass',
          });
        } catch {
          return false;
        }
      } else {
        return false;
      }
    }

    if (!html || !html.includes('mg-slot-probe')) return false;

    const clone = getReusableProbeClone(liveRoot, displayMode, inlineMaxWidth);
    clone.innerHTML = html;

    try {
      const cloneK = clone.querySelector('.katex-display > .katex, .katex') || clone;
      const probeEl = cloneK.querySelector('.mg-slot-probe');
      if (!probeEl) return false;

      const cloneKRect = cloneK.getBoundingClientRect();
      const pRect = probeEl.getBoundingClientRect();
      if (pRect.width <= 0 && pRect.height <= 0) return false;

      const rawScaleX = cloneKRect.width > 0 ? liveKRect.width / cloneKRect.width : 1;
      const rawScaleY = cloneKRect.height > 0 ? liveKRect.height / cloneKRect.height : 1;
      const scaleX = clamp(rawScaleX, 0.9, 1.1);
      const scaleY = clamp(rawScaleY, 0.9, 1.1);

      const relLeft = (pRect.left - cloneKRect.left) * scaleX;
      const relTop = (pRect.top - cloneKRect.top) * scaleY;
      const relW = pRect.width * scaleX;
      const relH = pRect.height * scaleY;

      const padX = slot.isEmpty ? 5 : 3;
      const padY = 2;
      const boxW = Math.max(slot.isEmpty ? 14 : 11, relW + padX * 2);
      const boxH = Math.max(12, relH + padY * 2);
      const boxLeft = slot.isEmpty
        ? (relLeft + relW * 0.5 - boxW * 0.5)
        : (relLeft - padX);
      const boxTop = relTop - padY;

      cachedBox = { boxLeft, boxTop, boxW, boxH };
      if (slotBoxCache.size >= SLOT_BOX_CACHE_MAX) {
        const oldest = slotBoxCache.keys().next().value;
        slotBoxCache.delete(oldest);
      }
      slotBoxCache.set(slotCacheKey, cachedBox);
    } finally {
      clone.textContent = '';
    }
  }

  liveKatexEl.classList.add('mg-katex-sel-host');
  const overlay = document.createElement('span');
  overlay.className = 'mg-slot-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.dataset.slotKind = slot.kind;

  const box = document.createElement('span');
  box.className = 'mg-slot-box';
  box.style.left = cachedBox.boxLeft.toFixed(1) + 'px';
  box.style.top = cachedBox.boxTop.toFixed(1) + 'px';
  box.style.width = cachedBox.boxW.toFixed(1) + 'px';
  box.style.height = cachedBox.boxH.toFixed(1) + 'px';
  overlay.appendChild(box);
  liveKatexEl.prepend(overlay);
  return true;
}