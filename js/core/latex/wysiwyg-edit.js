// WYSIWYG Backspace/Delete/↑/↓ (τύπου Wolfram Alpha Math Input).
//
// Μεταφέρθηκε αυτούσιο από το παλιό latex-nav.js — η λογική ΔΕΝ άλλαξε.
// Single responsibility: μόνο τα 2 exports (edit + vertical arrow).
import { parseMathStructures } from './structures.js';
import {
  skipInvisibleMathWhitespaceBack,
  skipInvisibleMathWhitespaceForward,
  isEscapedBackslashAt,
} from './whitespace.js';

/**
 * Υπολογίζει την ενέργεια Backspace / Delete σε λειτουργία WYSIWYG (τύπου Wolfram Alpha Math Input):
 * - Δεν σπάει ποτέ άγκιστρα `{}` ή `\left...\right` / `\begin...\end`
 * - Από δεξιά άκρη (`\dfrac{x}{y}|`) μπαίνει μέσα στο τελευταίο πλαίσιο (`\dfrac{x}{y|}`)
 * - Από την αρχή πλαισίου (`\dfrac{x}{|}` ή `\dfrac{|}{y}`) διαλύει το κλάσμα διατηρώντας το περιεχόμενο (`x|` ή `|y`)
 * - Παρακάμπτει τα αόρατα κενά μαθηματικών διατηρώντας τα ορατά εντός `\text{...}` και `\ `.
 */
export function computeWysiwygMathEdit(val, pos, key, segStart = 0, segEnd = val.length) {
  const sStart = Math.max(0, segStart);
  const sEnd = Math.min(val.length, segEnd);
  const seg = val.slice(sStart, sEnd);
  const n = seg.length;
  const p = Math.max(0, Math.min(n, pos - sStart));
  const nodes = parseMathStructures(seg);

  const visualEnd = (lo, hi) => skipInvisibleMathWhitespaceBack(val, sStart + lo, sStart + hi, sStart + hi) - sStart;
  const visualStart = (lo, hi) => skipInvisibleMathWhitespaceForward(val, sStart + lo, sStart + hi, sStart + lo) - sStart;
  const cleanPart = (lo, hi) => {
    const raw = seg.slice(lo, hi);
    return raw.trim() ? raw : '';
  };

  let scopeLo = 0;
  let scopeHi = n;
  let scopeSpan = n;
  const considerScope = (lo, hi) => {
    if (typeof lo !== 'number' || typeof hi !== 'number' || hi < lo) return;
    if (p >= lo && p <= hi && (hi - lo) < scopeSpan) {
      scopeLo = lo;
      scopeHi = hi;
      scopeSpan = hi - lo;
    }
  };
  for (const node of nodes) {
    if (node.optSlot) considerScope(node.optSlot.contentStart, node.optSlot.contentEnd);
    if (node.slots) {
      for (const sl of node.slots) considerScope(sl.contentStart, sl.contentEnd);
    }
    if (typeof node.innerStart === 'number' && typeof node.innerEnd === 'number') {
      considerScope(node.innerStart, node.innerEnd);
    }
  }

  const absorbOuterWhitespace = (relStart, relEnd, text = '', useScope = false) => {
    if (text) return { relStart, relEnd };
    let nextStart = relStart;
    let nextEnd = relEnd;
    const lo = useScope ? scopeLo : 0;
    const hi = useScope ? scopeHi : n;
    if (nextStart >= lo && visualEnd(lo, nextStart) === lo) nextStart = lo;
    if (nextEnd <= hi && visualStart(nextEnd, hi) === hi) nextEnd = hi;
    return { relStart: nextStart, relEnd: nextEnd };
  };

  if (key === 'Backspace') {
    const eff = skipInvisibleMathWhitespaceBack(val, sStart, sStart + p, sEnd) - sStart;
    if (eff <= 0) return null;
    const effFwdAtCaret = skipInvisibleMathWhitespaceForward(val, sStart + p, sStart + scopeHi, sStart + scopeLo) - sStart;
    const trailEnd = effFwdAtCaret === scopeHi ? scopeHi : p;

    // 1. Αν ο κέρσορας (μετά τα αόρατα κενά) βρίσκεται στην αρχή ενός slot / delim / env: διάλυση δομής!
    //    Προσοχή: επιλέγουμε τον εσωτερικότερο κόμβο που ταιριάζει.
    const startCandidates = [];
    for (const node of nodes) {
      if (node.type === 'two-arg') {
        if (eff === node.slots[0].contentStart) startCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
        else if (eff === node.slots[1].contentStart) startCandidates.push({ node, slotIdx: 1, span: node.end - node.start });
      } else if (node.type === 'one-arg') {
        if (node.optSlot && eff === node.optSlot.contentStart) startCandidates.push({ node, opt: true, span: node.end - node.start });
        else if (eff === node.slots[0].contentStart) startCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'script' && node.slots[0]?.braced) {
        if (eff === node.slots[0].contentStart) startCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (eff === node.innerStart) startCandidates.push({ node, span: node.end - node.start });
      }
    }

    if (startCandidates.length) {
      startCandidates.sort((a, b) => a.span - b.span);
      const hit = startCandidates[0];
      const { node } = hit;

      if (node.type === 'two-arg') {
        const a = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const b = cleanPart(node.slots[1].contentStart, node.slots[1].contentEnd);
        if (hit.slotIdx === 0) {
          // \dfrac{|}{y} -> |y, \dfrac{|x}{y} -> |xy, \dfrac{|}{} -> ''
          const rep = a + b;
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, rep);
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: rep, caret: sStart + relStart };
        }
        // \dfrac{x}{|} -> x|, \dfrac{x}{|y} -> x|y, \dfrac{}{|y} -> |y
        const rep = a + b;
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, rep);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: rep, caret: sStart + relStart + a.length };
      }

      if (node.type === 'one-arg') {
        if (hit.opt) {
          // \sqrt[|n]{x} -> \sqrt{|x} (αφαιρεί το [n])
          const body = seg.slice(node.slots[0].open, node.slots[0].close + 1);
          const rep = `${node.cmd}${body}`;
          return {
            kind: 'replace',
            start: sStart + node.start,
            end: sStart + node.end,
            text: rep,
            caret: sStart + node.start + node.cmd.length + 1,
          };
        }
        if (node.optSlot && seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim()) {
          // \sqrt[3]{|x} -> μετακίνηση κέρσορα στο \sqrt[3|]{x}
          const target = visualEnd(node.optSlot.contentStart, node.optSlot.contentEnd);
          return { kind: 'move', caret: sStart + target };
        }
        const inner = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, inner);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: inner, caret: sStart + relStart };
      }

      if (node.type === 'script') {
        const inner = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, inner);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: inner, caret: sStart + relStart };
      }

      if (node.type === 'delim' || node.type === 'brace') {
        const inner = cleanPart(node.innerStart, node.innerEnd);
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, inner);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: inner, caret: sStart + relStart };
      }

      if (node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.start };
      }
    }

    // 2. Αν ο κέρσορας βρίσκεται αμέσως ΜΕΤΑ το τέλος μιας δομής (\dfrac{x}{y}|, \sqrt{x}|, \left(x\right)|, x^{2}|)
    const endCandidates = nodes.filter(nd => nd.end === eff);
    if (endCandidates.length) {
      endCandidates.sort((a, b) => (a.end - a.start) - (b.end - b.start));
      const node = endCandidates[0];

      if (node.type === 'two-arg') {
        const aEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        const bEmpty = !seg.slice(node.slots[1].contentStart, node.slots[1].contentEnd).trim();
        if (aEmpty && bEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const target = visualEnd(node.slots[1].contentStart, node.slots[1].contentEnd);
        return { kind: 'move', caret: sStart + target };
      }

      if (node.type === 'one-arg') {
        const optEmpty = !node.optSlot || !seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim();
        const bodyEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        if (optEmpty && bodyEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const target = visualEnd(node.slots[0].contentStart, node.slots[0].contentEnd);
        return { kind: 'move', caret: sStart + target };
      }

      if (node.type === 'script') {
        if (node.bare) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        if (node.slots[0].braced) {
          const empty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
          if (empty) {
            const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
            return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
          }
          const target = visualEnd(node.slots[0].contentStart, node.slots[0].contentEnd);
          return { kind: 'move', caret: sStart + target };
        }
        // Unbraced script e.g. x^2| -> x^| (διαγράφει μόνο το 2, όχι το x^)
        return { kind: 'replace', start: sStart + node.slots[0].contentStart, end: sStart + trailEnd, text: '', caret: sStart + node.slots[0].contentStart };
      }

      if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, trailEnd, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const target = visualEnd(node.innerStart, node.innerEnd);
        return { kind: 'move', caret: sStart + target };
      }
    }

    // 3. Ατομική διαγραφή εντολής LaTeX (\alpha, \cdot, \\, \,)
    const before = seg.slice(0, eff);
    const cmdMatch = before.match(/\\([A-Za-z@]+|[,;:!%&$#_{}\\]) ?$/);
    if (cmdMatch) {
      const cmdStart = eff - cmdMatch[0].length;
      if (!isEscapedBackslashAt(seg, cmdStart)) {
        const { relStart, relEnd } = absorbOuterWhitespace(cmdStart, trailEnd, '', true);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
      }
    }

    // 4. Απλός χαρακτήρας πριν/ανάμεσα σε αόρατα κενά (διαγράφει τον χαρακτήρα και τα αόρατα κενά)
    if (eff > 0 && (eff < p || effFwdAtCaret === scopeHi || visualEnd(scopeLo, eff - 1) === scopeLo)) {
      let charStart = eff - 1;
      if (charStart > 0 && seg.charCodeAt(charStart) >= 0xDC00 && seg.charCodeAt(charStart) <= 0xDFFF) {
        charStart--;
      }
      const { relStart, relEnd } = absorbOuterWhitespace(charStart, trailEnd, '', true);
      return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
    }
    return null;
  }

  if (key === 'Delete') {
    const effFwd = skipInvisibleMathWhitespaceForward(val, sStart + p, sEnd, sStart) - sStart;
    if (effFwd >= n) return null;
    const effBackAtCaret = skipInvisibleMathWhitespaceBack(val, sStart + scopeLo, sStart + p, sStart + scopeHi) - sStart;
    const leadStart = effBackAtCaret === scopeLo ? scopeLo : p;

    // 1. Αν ο κέρσορας είναι στο ΤΕΛΟΣ ενός εσωτερικού slot/delim/env πριν το `}` / `\right` / `\end`:
    const endSlotCandidates = [];
    for (const node of nodes) {
      if (node.type === 'two-arg') {
        if (effFwd === node.slots[0].contentEnd) endSlotCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
        else if (effFwd === node.slots[1].contentEnd) endSlotCandidates.push({ node, slotIdx: 1, span: node.end - node.start });
      } else if (node.type === 'one-arg') {
        if (node.optSlot && effFwd === node.optSlot.contentEnd) endSlotCandidates.push({ node, opt: true, span: node.end - node.start });
        else if (effFwd === node.slots[0].contentEnd) endSlotCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'script' && node.slots[0]?.braced) {
        if (effFwd === node.slots[0].contentEnd) endSlotCandidates.push({ node, slotIdx: 0, span: node.end - node.start });
      } else if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (effFwd === node.innerEnd) endSlotCandidates.push({ node, span: node.end - node.start });
      }
    }

    if (endSlotCandidates.length) {
      endSlotCandidates.sort((a, b) => a.span - b.span);
      const hit = endSlotCandidates[0];
      const { node } = hit;

      if (node.type === 'two-arg' && hit.slotIdx === 0) {
        // \dfrac{x|}{y} + Delete -> x|y (ή x| / |y)
        const a = cleanPart(node.slots[0].contentStart, node.slots[0].contentEnd);
        const b = cleanPart(node.slots[1].contentStart, node.slots[1].contentEnd);
        const rep = a + b;
        const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, rep);
        return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: rep, caret: sStart + relStart + a.length };
      }
      if (node.type === 'two-arg' && hit.slotIdx === 1) {
        const aEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        const bEmpty = !seg.slice(node.slots[1].contentStart, node.slots[1].contentEnd).trim();
        if (aEmpty && bEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
      if (node.type === 'one-arg') {
        if (hit.opt) {
          return { kind: 'move', caret: sStart + visualStart(node.slots[0].contentStart, node.slots[0].contentEnd) };
        }
        const optEmpty = !node.optSlot || !seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim();
        const bodyEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        if (optEmpty && bodyEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
      if (node.type === 'script') {
        if (!seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
      if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(node.start, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + node.end };
      }
    }

    // 2. Αν ο κέρσορας είναι αμέσως ΠΡΙΝ από μια δομή (|\dfrac{x}{y}, |\sqrt{x}, |^{2}, |\left(x\right))
    const startNodes = nodes.filter(nd => nd.start === effFwd);
    if (startNodes.length) {
      startNodes.sort((a, b) => (b.end - b.start) - (a.end - a.start));
      const node = startNodes[0];
      if (node.type === 'two-arg') {
        const aEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        const bEmpty = !seg.slice(node.slots[1].contentStart, node.slots[1].contentEnd).trim();
        if (aEmpty && bEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + visualStart(node.slots[0].contentStart, node.slots[0].contentEnd) };
      }
      if (node.type === 'one-arg') {
        const optEmpty = !node.optSlot || !seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim();
        const bodyEmpty = !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim();
        if (optEmpty && bodyEmpty) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        const firstSlot = node.optSlot && seg.slice(node.optSlot.contentStart, node.optSlot.contentEnd).trim()
          ? node.optSlot
          : node.slots[0];
        return { kind: 'move', caret: sStart + visualStart(firstSlot.contentStart, firstSlot.contentEnd) };
      }
      if (node.type === 'script') {
        if (node.bare) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        if (node.slots[0].braced && !seg.slice(node.slots[0].contentStart, node.slots[0].contentEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + visualStart(node.slots[0].contentStart, node.slots[0].contentEnd) };
      }
      if (node.type === 'delim' || node.type === 'brace' || node.type === 'env') {
        if (!seg.slice(node.innerStart, node.innerEnd).trim()) {
          const { relStart, relEnd } = absorbOuterWhitespace(leadStart, node.end, '');
          return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
        }
        return { kind: 'move', caret: sStart + visualStart(node.innerStart, node.innerEnd) };
      }
    }

    // 3. Ατομική διαγραφή επόμενης εντολής LaTeX
    const after = seg.slice(effFwd);
    const cmdMatch = after.match(/^\\([A-Za-z@]+|[,;:!%&$#_{}\\]) ?/);
    if (cmdMatch && !isEscapedBackslashAt(seg, effFwd)) {
      const { relStart, relEnd } = absorbOuterWhitespace(leadStart, effFwd + cmdMatch[0].length, '', true);
      return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
    }

    // 4. Απλός χαρακτήρας μετά/ανάμεσα σε αόρατα κενά
    if (effFwd < n && (effFwd > p || effBackAtCaret === scopeLo || visualStart(effFwd + 1, scopeHi) === scopeHi)) {
      let charEnd = effFwd + 1;
      if (charEnd < n && seg.charCodeAt(effFwd) >= 0xD800 && seg.charCodeAt(effFwd) <= 0xDBFF) {
        charEnd++;
      }
      const { relStart, relEnd } = absorbOuterWhitespace(leadStart, charEnd, '', true);
      return { kind: 'replace', start: sStart + relStart, end: sStart + relEnd, text: '', caret: sStart + relStart };
    }
    return null;
  }

  return null;
}

/**
 * Κατακόρυφη πλοήγηση τύπου Wolfram Alpha Math Input (ArrowUp / ArrowDown)
 * μεταξύ αριθμητή-παρονομαστή (\frac, \dfrac, \binom, \overset, \underset),
 * εκθέτη-δείκτη (^{}/_{}), και γραμμών πίνακα (`\\`).
 */
export function computeWysiwygVerticalArrowTarget(val, pos, direction, segStart = 0, segEnd = val.length) {
  const dir = direction >= 0 ? 1 : -1;
  const sStart = Math.max(0, segStart);
  const sEnd = Math.min(val.length, segEnd);
  const seg = val.slice(sStart, sEnd);
  const p = Math.max(0, Math.min(seg.length, pos - sStart));
  const nodes = parseMathStructures(seg);

  const clampSlot = (slot, relOffset) => {
    const lo = slot.contentStart;
    const hi = slot.contentEnd;
    const target = Math.max(lo, Math.min(hi, lo + relOffset));
    return sStart + (skipInvisibleMathWhitespaceBack(val, sStart + lo, sStart + target, sStart + hi) - sStart);
  };

  const containing = nodes
    .filter(nd => p >= nd.start && p <= nd.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));

  for (const node of containing) {
    if (node.type === 'two-arg') {
      const top = node.cmd === '\\underset' ? node.slots[1] : node.slots[0];
      const bot = node.cmd === '\\underset' ? node.slots[0] : node.slots[1];
      if (dir > 0 && p >= top.contentStart && p <= top.contentEnd) {
        return clampSlot(bot, p - top.contentStart);
      }
      if (dir < 0 && p >= bot.contentStart && p <= bot.contentEnd) {
        return clampSlot(top, p - bot.contentStart);
      }
    }

    if (node.type === 'script' && node.slots[0]?.braced) {
      const slot = node.slots[0];
      if (p >= slot.contentStart && p <= slot.contentEnd) {
        if (node.op === '^' && dir > 0) {
          // Ψάξε αδελφό _{...} αμέσως πριν ή μετά
          const subAfter = nodes.find(x => x.type === 'script' && x.op === '_' && x.slots[0]?.braced && Math.abs(x.start - node.end) <= 1);
          const subBefore = nodes.find(x => x.type === 'script' && x.op === '_' && x.slots[0]?.braced && Math.abs(node.start - x.end) <= 1);
          const sib = subAfter || subBefore;
          if (sib) return clampSlot(sib.slots[0], p - slot.contentStart);
          return sStart + node.end;
        }
        if (node.op === '_' && dir < 0) {
          const supAfter = nodes.find(x => x.type === 'script' && x.op === '^' && x.slots[0]?.braced && Math.abs(x.start - node.end) <= 1);
          const supBefore = nodes.find(x => x.type === 'script' && x.op === '^' && x.slots[0]?.braced && Math.abs(node.start - x.end) <= 1);
          const sib = supAfter || supBefore;
          if (sib) return clampSlot(sib.slots[0], p - slot.contentStart);
          return sStart + node.end;
        }
      }
    }

    if (node.type === 'env' && p >= node.innerStart && p <= node.innerEnd) {
      const body = seg.slice(node.innerStart, node.innerEnd);
      const localP = p - node.innerStart;
      // Χωρισμός σε γραμμές (top-level \\) και στήλες (top-level &)
      const rows = [];
      let depth = 0;
      let rowStart = 0;
      const splitCols = (rStart, rEnd) => {
        const cols = [];
        let d = 0;
        let cStart = rStart;
        for (let i = rStart; i < rEnd; i++) {
          if (body[i] === '\\') { i++; continue; }
          if (body[i] === '{') d++;
          else if (body[i] === '}') d = Math.max(0, d - 1);
          else if (d === 0 && body[i] === '&') {
            cols.push({ start: cStart, end: i });
            cStart = i + 1;
          }
        }
        cols.push({ start: cStart, end: rEnd });
        return cols;
      };
      for (let i = 0; i < body.length; i++) {
        if (body[i] === '{') depth++;
        else if (body[i] === '}') depth = Math.max(0, depth - 1);
        else if (depth === 0 && body[i] === '\\' && body[i + 1] === '\\') {
          rows.push(splitCols(rowStart, i));
          i += 1;
          rowStart = i + 1;
        }
      }
      rows.push(splitCols(rowStart, body.length));

      if (rows.length > 1) {
        let curR = -1;
        let curC = 0;
        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < rows[r].length; c++) {
            if (localP >= rows[r][c].start && localP <= rows[r][c].end) {
              curR = r;
              curC = c;
              break;
            }
          }
          if (curR !== -1) break;
        }
        if (curR !== -1) {
          const nextR = curR + dir;
          if (nextR >= 0 && nextR < rows.length) {
            const targetCol = rows[nextR][Math.min(curC, rows[nextR].length - 1)];
            const rel = localP - rows[curR][curC].start;
            const targetLocal = Math.max(targetCol.start, Math.min(targetCol.end, targetCol.start + rel));
            return sStart + node.innerStart + targetLocal;
          }
        }
      }
    }
  }

  return null;
}