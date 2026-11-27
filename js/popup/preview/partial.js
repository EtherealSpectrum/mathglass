// Partial render — δείχνει το έγκυρο κομμάτι + error tail (κόκκινο κείμενο).
//
// Χρησιμοποιείται όταν το πλήρες LaTeX έχει σφάλμα:
//   1. Δοκιμάζει το αυτούσιο
//   2. Δοκιμάζει balanced candidate (με ghost tokens)
//   3. Κάνει δυαδική αναζήτηση για το μεγαλύτερο έγκυρο prefix
//   4. Δείχνει το υπόλοιπο ως .katex-error-tail
import { injectLatexCaret } from './caret.js';
import { buildBalancedCandidate } from './balanced.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderPartialLatexHtml(src, err, alignLeft, displayMode = true, isLightOverride = null, cursorOffset = null) {
  const leadLen = src.length - src.trimStart().length;
  const trimmed = src.trim();
  if (!trimmed) return '';
  const isLight = isLightOverride !== null
    ? Boolean(isLightOverride)
    : document.documentElement.getAttribute('data-theme') === 'light';
  const errorColor = isLight ? '#dc2626' : '#f28b82';

  const tryVariants = typeof cursorOffset === 'number'
    ? [injectLatexCaret(trimmed, clamp(cursorOffset - leadLen, 0, trimmed.length)), trimmed]
    : [trimmed];

  for (const variant of tryVariants) {
    try {
      const nonThrowingHtml = katex.renderToString(variant, {
        throwOnError: false,
        displayMode,
        fleqn: alignLeft,
        errorColor,
      });
      if (nonThrowingHtml.includes('class="katex"')) {
        return nonThrowingHtml;
      }
    } catch {
      // Συνέχεια με αυτόματη εξισορρόπηση αγκυλών/περιβαλλόντων
    }

    const ghost = `{\\color{${errorColor}}{\\square}}`;
    let candidate = buildBalancedCandidate(variant, errorColor);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const html = katex.renderToString(candidate, {
          throwOnError: false,
          displayMode,
          fleqn: alignLeft,
          errorColor,
        });
        if (html.includes('class="katex"')) {
          return html;
        }
      } catch (balErr) {
        const msg = String(balErr?.message || '');
        if (/Expected group|got 'EOF'|Expected '\{'|Missing/i.test(msg)) {
          candidate += ghost;
          continue;
        }
        break;
      }
    }
  }

  // Γρήγορη δυαδική αναζήτηση O(log N) πάνω στο καθαρό trimmed (χωρίς CARET_TEX)
  const errPos = (err && typeof err === 'object' && typeof err.position === 'number')
    ? clamp(err.position, 0, trimmed.length)
    : trimmed.length;

  const tryRender = str => {
    if (!str.trim()) return null;
    try {
      return katex.renderToString(str, { throwOnError: true, displayMode, fleqn: alignLeft });
    } catch {
      return null;
    }
  };

  let lo = 1;
  let hi = Math.max(1, errPos);
  let bestPos = 0;
  let bestHtml = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const html = tryRender(trimmed.slice(0, mid));
    if (html) {
      bestPos = mid;
      bestHtml = html;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (bestPos < errPos) {
    for (let p = Math.min(errPos, bestPos + 6); p > bestPos; p--) {
      const html = tryRender(trimmed.slice(0, p));
      if (html) {
        bestPos = p;
        bestHtml = html;
        break;
      }
    }
  }

  if (bestHtml && bestPos > 0) {
    const tail = trimmed.slice(bestPos);
    if (!tail) return bestHtml;
    return `<div class="katex-partial-combo${alignLeft ? ' is-align-left' : ''}"><span class="katex-partial-valid">${bestHtml}</span><span class="katex-error-tail">${escapeHtml(tail)}</span></div>`;
  }

  return `<span class="katex-error-tail is-solo">${escapeHtml(trimmed)}</span>`;
}