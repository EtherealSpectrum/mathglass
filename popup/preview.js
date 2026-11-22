import { KEYS } from '../core/constants.js';
import { $, on, clamp, rafThrottle } from '../core/dom.js';
import { computeAutoScale } from '../core/scale.js';
import { translateLatexErrorToGreek } from '../core/errors.js';
import { resolveLatexOffsetAtPoint, applyLatexSelectionHighlight, clearLatexSelectionHighlight, applyActiveSlotHighlight, clearActiveSlotHighlight } from '../core/latex-click.js';
import { get, set, mirrorGet, mirrorSet } from '../core/storage.js';
import { state, setSize } from './settings.js';

export const CARET_COLOR_HEX = '#8b7bfe';
const CARET_TEX = `\\rlap{\\color{${CARET_COLOR_HEX}}{\\rule[-0.18em]{0.11em}{1.08em}}}`;

let lastProg = { left: -1, top: -1 };
let minH = 50;
let progScrolling = false;
let lastRenderedSrc = null;
let lastRenderedAlign = null;
let lastRenderedTheme = null;
let lastCursorPos = -1;
let lastSelStart = -1;
let lastSelEnd = -1;
let lastWasSelection = false;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getActiveCursorPos(ta) {
    if (!ta) return 0;
    return (ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd) ?? ta.value.length;
}

function getSelectionBounds(ta) {
    if (!ta) return { start: 0, end: 0, active: false };
    const s = ta.selectionStart ?? 0;
    const e = ta.selectionEnd ?? 0;
    const start = Math.min(s, e);
    const end = Math.max(s, e);
    return { start, end, active: end > start };
}

function readTokenEnd(s, idx) {
    if (idx >= s.length) return idx;
    if (s[idx] === '\\') {
        if (idx + 1 < s.length && /[a-zA-Z@]/.test(s[idx + 1])) {
            let j = idx + 2;
            while (j < s.length && /[a-zA-Z@]/.test(s[j])) j++;
            return j;
        }
        return Math.min(s.length, idx + 2);
    }
    return idx + 1;
}

function findMatchingBrace(s, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < s.length; i++) {
        if (s[i] === '\\') { i++; continue; }
        if (s[i] === '{') depth++;
        else if (s[i] === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    return -1;
}

export function injectLatexCaret(rawMath, cursorOffset) {
    const n = rawMath.length;
    let pos = clamp(cursorOffset, 0, n);

    let i = 0;
    while (i < n) {
        const ch = rawMath[i];
        if (ch === '%') {
            const nl = rawMath.indexOf('\n', i);
            const end = nl === -1 ? n : nl;
            if (pos > i && pos <= end) pos = i;
            i = end + 1;
            continue;
        }
        if (ch === '\\') {
            if (rawMath.startsWith('\\begin{', i)) {
                const endB = rawMath.indexOf('}', i + 7);
                if (endB !== -1) {
                    const envName = rawMath.slice(i + 7, endB).trim();
                    let afterEnv = endB + 1;
                    if ((envName === 'array' || envName === 'tabular') && rawMath[afterEnv] === '{') {
                        const specEnd = findMatchingBrace(rawMath, afterEnv);
                        if (specEnd !== -1) afterEnv = specEnd + 1;
                    }
                    if (pos > i && pos < afterEnv) pos = afterEnv;
                    i = afterEnv;
                    continue;
                }
            }
            if (rawMath.startsWith('\\end{', i)) {
                const endE = rawMath.indexOf('}', i + 5);
                if (endE !== -1) {
                    if (pos > i && pos <= endE + 1) pos = i;
                    i = endE + 1;
                    continue;
                }
            }
            if (rawMath.startsWith('\\left', i) && !/[a-zA-Z]/.test(rawMath[i + 5] || '')) {
                let j = i + 5;
                while (j < n && rawMath[j] === ' ') j++;
                const delEnd = readTokenEnd(rawMath, j);
                if (pos > i && pos < delEnd) pos = delEnd;
                i = delEnd;
                continue;
            }
            if (rawMath.startsWith('\\right', i) && !/[a-zA-Z]/.test(rawMath[i + 6] || '')) {
                let j = i + 6;
                while (j < n && rawMath[j] === ' ') j++;
                const delEnd = readTokenEnd(rawMath, j);
                if (pos > i && pos < delEnd) pos = pos <= i + 6 ? i : delEnd;
                i = delEnd;
                continue;
            }
            const cmdEnd = readTokenEnd(rawMath, i);
            const cmd = rawMath.slice(i, cmdEnd);
            if (pos > i && pos < cmdEnd) pos = cmdEnd;

            if (/^\\(?:color|textcolor|hspace|vspace|rule)$/.test(cmd)) {
                let j = cmdEnd;
                while (j < n && rawMath[j] === ' ') j++;
                if (rawMath[j] === '{') {
                    const bEnd = findMatchingBrace(rawMath, j);
                    if (bEnd !== -1 && pos > i && pos <= bEnd + 1) {
                        pos = bEnd + 1;
                    }
                }
            }
            i = cmdEnd;
            continue;
        }
        i++;
    }

    let nextNonWs = pos;
    while (nextNonWs < n && (rawMath[nextNonWs] === ' ' || rawMath[nextNonWs] === '\t')) nextNonWs++;
    let prevNonWs = pos - 1;
    while (prevNonWs >= 0 && (rawMath[prevNonWs] === ' ' || rawMath[prevNonWs] === '\t')) prevNonWs--;

    if (rawMath[nextNonWs] === '{' && prevNonWs >= 0 && (rawMath[prevNonWs] === '^' || rawMath[prevNonWs] === '_' || rawMath[prevNonWs] === '}' || rawMath[prevNonWs] === ']' || /[a-zA-Z]/.test(rawMath[prevNonWs]))) {
        const beforePrev = rawMath.slice(0, prevNonWs + 1);
        if (/(?:\\(?:frac|dfrac|tfrac|binom|sqrt|vec|hat|bar|tilde|dot|ddot|overline|underline|overset|underset|stackrel|text|textbf|mathrm|mathbf|mathbb|mathcal|operatorname|textcolor|colorbox|fcolorbox|xrightarrow|xleftarrow)\s*(?:\[[^\]]*\])?(?:\{[^}]*\})*|[_^]|\})$/.test(beforePrev)) {
            pos = nextNonWs + 1;
            prevNonWs = nextNonWs;
        }
    }

    if (prevNonWs >= 0 && (rawMath[prevNonWs] === '^' || rawMath[prevNonWs] === '_')) {
        let afterScript = pos;
        while (afterScript < n && (rawMath[afterScript] === ' ' || rawMath[afterScript] === '\t')) afterScript++;
        if (afterScript >= n || rawMath[afterScript] === '}' || (rawMath[afterScript] === '\\' && rawMath.startsWith('\\end{', afterScript))) {
            return rawMath.slice(0, pos) + '{' + CARET_TEX + '}' + rawMath.slice(pos);
        }
        if (rawMath[afterScript] !== '{') {
            const tokEnd = readTokenEnd(rawMath, afterScript);
            return rawMath.slice(0, pos) + '{' + CARET_TEX + rawMath.slice(afterScript, tokEnd) + '}' + rawMath.slice(tokEnd);
        }
    }

    return rawMath.slice(0, pos) + CARET_TEX + rawMath.slice(pos);
}

export function findCaretElement(root) {
    if (!root) return null;
    return root.querySelector(
        '.katex-rule[style*="#8b7bfe"], .katex-rule[style*="139, 123, 254"], ' +
        '.rule[style*="#8b7bfe"], .rule[style*="139, 123, 254"]'
    );
}

export function markCaretElement(root) {
    const el = findCaretElement(root);
    if (el) el.classList.add('mg-katex-caret');
    return el;
}

export function buildBalancedCandidate(trimmed, errorColor) {
    let s = trimmed;
    const ghost = `{\\color{${errorColor}}{\\square}}`;

    let trailingSlashes = 0;
    for (let k = s.length - 1; k >= 0 && s[k] === '\\'; k--) trailingSlashes++;
    if (trailingSlashes % 2 === 1) {
        s = s.slice(0, -1) + ghost;
    }

    const braceStack = [];
    const envStack = [];
    let leftCount = 0;
    let i = 0;

    while (i < s.length) {
        const ch = s[i];
        if (ch === '%') {
            while (i < s.length && s[i] !== '\n') i++;
            continue;
        }
        if (ch === '\\') {
            if (s.startsWith('\\begin{', i)) {
                const endB = s.indexOf('}', i + 7);
                if (endB !== -1) {
                    const envName = s.slice(i + 7, endB).trim();
                    if (envName) envStack.push(envName);
                    if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
                    i = endB + 1;
                    continue;
                }
            }
            if (s.startsWith('\\end{', i)) {
                const endE = s.indexOf('}', i + 5);
                if (endE !== -1) {
                    const envName = s.slice(i + 5, endE).trim();
                    const idx = envStack.lastIndexOf(envName);
                    if (idx !== -1) envStack.splice(idx, 1);
                    if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
                    i = endE + 1;
                    continue;
                }
            }
            if (s.startsWith('\\left', i) && !/[a-zA-Z]/.test(s[i + 5] || '')) {
                leftCount++;
                if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
                i += 5;
                continue;
            }
            if (s.startsWith('\\right', i) && !/[a-zA-Z]/.test(s[i + 6] || '')) {
                if (leftCount > 0) leftCount--;
                if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
                i += 6;
                continue;
            }
            if (braceStack.length) braceStack[braceStack.length - 1].hadContent = true;
            if (i + 1 < s.length && /[a-zA-Z]/.test(s[i + 1])) {
                i += 2;
                while (i < s.length && /[a-zA-Z]/.test(s[i])) i++;
            } else {
                i += 2;
            }
            continue;
        }
        if (ch === '{') {
            braceStack.push({ hadContent: false });
            i++;
            continue;
        }
        if (ch === '}') {
            if (braceStack.length > 0) {
                braceStack.pop();
                if (braceStack.length > 0) braceStack[braceStack.length - 1].hadContent = true;
            }
            i++;
            continue;
        }
        if (!/\s/.test(ch) && braceStack.length > 0) {
            braceStack[braceStack.length - 1].hadContent = true;
        }
        i++;
    }

    if (/[_^]\s*$/.test(s)) {
        s += ghost;
    }

    for (let b = braceStack.length - 1; b >= 0; b--) {
        if (!braceStack[b].hadContent) {
            s += `\\color{${errorColor}}{\\square}`;
        }
        s += '}';
        if (b > 0) braceStack[b - 1].hadContent = true;
    }

    while (leftCount > 0) {
        s += '\\right.';
        leftCount--;
    }

    for (let e = envStack.length - 1; e >= 0; e--) {
        s += `\\end{${envStack[e]}}`;
    }

    return s;
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
        return `<div class="katex-partial-combo" style="display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:${alignLeft ? 'flex-start' : 'center'};gap:6px;max-width:100%;"><span class="katex-partial-valid">${bestHtml}</span><span class="katex-error-tail" style="color:${errorColor};font-family:var(--mono);font-size:0.85em;background:rgba(239,68,68,0.12);border-bottom:2px wavy ${errorColor};padding:1px 5px;border-radius:4px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(tail)}</span></div>`;
    }

    return `<span class="katex-error-tail" style="color:${errorColor};font-family:var(--mono);font-size:0.9em;background:rgba(239,68,68,0.12);border-bottom:2px wavy ${errorColor};padding:2px 6px;border-radius:4px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(trimmed)}</span>`;
}

export function renderLatexWithCaret(rawMath, cursorOffset, alignLeft, displayMode = true, isLight = false) {
    const leadLen = rawMath.length - rawMath.trimStart().length;
    const trimmed = rawMath.trim();
    if (!trimmed) return { html: '', ok: true, error: null };

    if (typeof cursorOffset !== 'number') {
        try {
            const html = katex.renderToString(trimmed, {
                throwOnError: true,
                displayMode,
                fleqn: alignLeft,
            });
            return { html, ok: true, error: null };
        } catch (err) {
            return {
                html: renderPartialLatexHtml(rawMath, err, alignLeft, displayMode, isLight, null),
                ok: false,
                error: err,
            };
        }
    }

    const localPos = clamp(cursorOffset - leadLen, 0, trimmed.length);
    const withCaret = injectLatexCaret(trimmed, localPos);

    try {
        const html = katex.renderToString(withCaret, {
            throwOnError: true,
            displayMode,
            fleqn: alignLeft,
        });
        return { html, ok: true, error: null };
    } catch {
        try {
            const html = katex.renderToString(trimmed, {
                throwOnError: true,
                displayMode,
                fleqn: alignLeft,
            });
            return { html, ok: true, error: null };
        } catch (err) {
            return {
                html: renderPartialLatexHtml(rawMath, err, alignLeft, displayMode, isLight, cursorOffset),
                ok: false,
                error: err,
            };
        }
    }
}

export function render(shouldScroll = false) {
    if (!state.ta || !state.preview || !state.previewWrap) return;
    const raw = state.ta.value;
    const src = raw.trim();
    const cursorPos = getActiveCursorPos(state.ta);
    const sel = getSelectionBounds(state.ta);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const follow = Boolean(shouldScroll) && !state.userScrolled;
    const prevScrollLeft = state.previewWrap.scrollLeft;
    const prevScrollTop = state.previewWrap.scrollTop;

    lastRenderedSrc = raw;
    lastRenderedAlign = state.alignLeft;
    lastRenderedTheme = isLight;
    lastCursorPos = cursorPos;
    lastSelStart = sel.start;
    lastSelEnd = sel.end;
    lastWasSelection = sel.active;

    progScrolling = true;
    try {
        if (!src) {
            state.previewWrap.classList.remove('error');
            state.preview.innerHTML = '<span class="placeholder">Η προεπισκόπηση θα εμφανιστεί εδώ…</span>';
        } else {
            const res = renderLatexWithCaret(raw, sel.active ? null : cursorPos, state.alignLeft, true, isLight);
            if (res.ok) {
                state.previewWrap.classList.remove('error');
                state.preview.innerHTML = res.html;
            } else {
                state.previewWrap.classList.add('error');
                state.preview.innerHTML = '';

                if (res.html) {
                    const partialWrap = document.createElement('div');
                    partialWrap.className = 'preview-partial-wrap';
                    const mathDiv = document.createElement('div');
                    mathDiv.className = 'preview-partial-math';
                    mathDiv.innerHTML = res.html;
                    partialWrap.appendChild(mathDiv);
                    state.preview.appendChild(partialWrap);
                }

                const errDiv = document.createElement('div');
                errDiv.className = 'preview-error-msg';
                errDiv.textContent = translateLatexErrorToGreek(res.error);
                state.preview.appendChild(errDiv);
            }
            if (sel.active) {
                const targetRoot = state.preview.querySelector('.preview-partial-math') || state.preview;
                clearActiveSlotHighlight(targetRoot);
                applyLatexSelectionHighlight(raw, sel.start, sel.end, targetRoot, {
                    displayMode: true,
                    alignLeft: state.alignLeft,
                    buildBalancedCandidate,
                });
            } else {
                markCaretElement(state.preview);
                const targetRoot = state.preview.querySelector('.preview-partial-math') || state.preview;
                applyActiveSlotHighlight(raw, cursorPos, targetRoot, {
                    displayMode: true,
                    alignLeft: state.alignLeft,
                    buildBalancedCandidate,
                    injectLatexCaret,
                });
            }
        }
        if (!follow) {
            state.previewWrap.scrollLeft = prevScrollLeft;
            state.previewWrap.scrollTop = prevScrollTop;
        }
    } finally {
        lastProg = { left: state.previewWrap.scrollLeft, top: state.previewWrap.scrollTop };
        requestAnimationFrame(() => { progScrolling = false; });
    }

    measureMinHeight();
    if (follow) requestAnimationFrame(scrollToCursor);
}

function measurePrefixWidth(beforeRow) {
    const cleaned = beforeRow
        .replace(/\\(?:begin|end)\{[^}]*\}/g, '')
        .replace(/&/g, ' ')
        .trim();
    if (!cleaned) return 0;

    const candidate = buildBalancedCandidate(cleaned, '#888');
    const t = document.createElement('div');
    t.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px;top:0;pointer-events:none;';
    t.style.fontSize = getComputedStyle(state.preview).fontSize;
    t.style.fontFamily = getComputedStyle(state.preview).fontFamily;

    let w = 0;
    try {
        katex.render(candidate, t, { throwOnError: false, displayMode: true });
        document.body.appendChild(t);
        w = t.getBoundingClientRect().width;
    } catch { }
    t.remove();
    return w;
}

function scrollToCursor() {
    if (!state.ta || !state.previewWrap || !state.preview) return;
    const raw = state.ta.value;
    const pos = clamp(getActiveCursorPos(state.ta), 0, raw.length);
    lastCursorPos = pos;

    const wrap = state.previewWrap;
    const maxX = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    const maxY = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    if (maxX <= 0 && maxY <= 0) {
        lastProg = { left: wrap.scrollLeft, top: wrap.scrollTop };
        return;
    }

    progScrolling = true;
    try {
        const caretEl = findCaretElement(state.preview);
        if (caretEl) {
            const wRect = wrap.getBoundingClientRect();
            const cRect = caretEl.getBoundingClientRect();
            const padY = 20;
            const padX = 36;

            if (maxY > 0 && (cRect.height > 0 || cRect.top !== 0)) {
                if (cRect.bottom > wRect.bottom - padY) {
                    wrap.scrollTop = clamp(wrap.scrollTop + (cRect.bottom - wRect.bottom) + padY, 0, maxY);
                } else if (cRect.top < wRect.top + padY) {
                    wrap.scrollTop = clamp(wrap.scrollTop - (wRect.top - cRect.top) - padY, 0, maxY);
                }
            }
            if (maxX > 0) {
                if (cRect.right > wRect.right - padX) {
                    wrap.scrollLeft = clamp(wrap.scrollLeft + (cRect.right - wRect.right) + padX, 0, maxX);
                } else if (cRect.left < wRect.left + padX) {
                    wrap.scrollLeft = clamp(wrap.scrollLeft - (wRect.left - cRect.left) - padX, 0, maxX);
                }
            }
            return;
        }

        // Fallback όταν δεν υπάρχει caretEl (π.χ. στην ουρά σφάλματος)
        const before = raw.slice(0, pos);
        const linesBefore = before.split('\\\\');
        const allLines = raw.split('\\\\');
        const rowIdx = linesBefore.length - 1;
        const totalRows = Math.max(1, allLines.length);

        if (maxY > 0) {
            if (pos >= raw.length) wrap.scrollTop = maxY;
            else if (pos <= 0) wrap.scrollTop = 0;
            else if (totalRows > 1) {
                const pvTop = state.preview.offsetTop;
                const pvH = Math.max(24, state.preview.offsetHeight);
                const targetY = pvTop + (rowIdx / Math.max(1, totalRows - 1)) * Math.max(0, pvH - 28);
                if (targetY < wrap.scrollTop + 20) wrap.scrollTop = clamp(targetY - 20, 0, maxY);
                else if (targetY + 28 > wrap.scrollTop + wrap.clientHeight - 20) {
                    wrap.scrollTop = clamp(targetY + 28 - wrap.clientHeight + 20, 0, maxY);
                }
            }
        }

        if (maxX > 0) {
            if (pos <= 0) wrap.scrollLeft = 0;
            else if (pos >= raw.length) wrap.scrollLeft = maxX;
            else {
                const katexEl = state.preview.querySelector('.katex-display > .katex, .katex');
                const katexLeft = katexEl ? katexEl.offsetLeft : 0;
                const katexWidth = katexEl ? katexEl.offsetWidth : state.preview.scrollWidth;
                const w = measurePrefixWidth(linesBefore[linesBefore.length - 1] || '');
                const cursorX = katexLeft + clamp(w, 0, katexWidth);
                if (cursorX < wrap.scrollLeft + 32) wrap.scrollLeft = clamp(cursorX - 32, 0, maxX);
                else if (cursorX > wrap.scrollLeft + wrap.clientWidth - 48) {
                    wrap.scrollLeft = clamp(cursorX - wrap.clientWidth + 48, 0, maxX);
                }
            }
        }
    } finally {
        lastProg = { left: wrap.scrollLeft, top: wrap.scrollTop };
        requestAnimationFrame(() => { progScrolling = false; });
    }
}

export function syncCursor() {
    if (!state.ta) return;
    const pos = getActiveCursorPos(state.ta);
    const sel = getSelectionBounds(state.ta);
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const srcChanged = state.ta.value !== lastRenderedSrc ||
        state.alignLeft !== lastRenderedAlign ||
        isLight !== lastRenderedTheme;
    const selChanged = sel.start !== lastSelStart || sel.end !== lastSelEnd;

    if (!srcChanged && !selChanged && pos === lastCursorPos) return;

    if (!srcChanged && sel.active && lastWasSelection && state.preview && state.ta.value.trim()) {
        lastCursorPos = pos;
        lastSelStart = sel.start;
        lastSelEnd = sel.end;
        const targetRoot = state.preview.querySelector('.preview-partial-math') || state.preview;
        clearActiveSlotHighlight(targetRoot);
        clearLatexSelectionHighlight(targetRoot);
        applyLatexSelectionHighlight(state.ta.value, sel.start, sel.end, targetRoot, {
            displayMode: true,
            alignLeft: state.alignLeft,
            buildBalancedCandidate,
        });
        return;
    }

    render(false);
}

function measureMinHeight() {
    requestAnimationFrame(() => {
        if (!state.preview) return;
        const h = state.preview.getBoundingClientRect().height;
        const main = document.querySelector('main');
        const cap = Math.max(150, Math.round((main?.clientHeight || innerHeight) * 0.65));
        const hasScrollbar = state.previewWrap && state.previewWrap.scrollWidth > state.previewWrap.clientWidth ? 12 : 0;
        const v = Math.max(50, Math.min(cap, Math.ceil(h + 28 + hasScrollbar)));
        if (Math.abs(minH - v) > 1) {
            minH = v;
            document.documentElement.style.setProperty('--preview-min-height', v + 'px');
            window.__reportNaturalSize?.(80);
        }
    });
}

function ensureTextareaOffsetVisible(ta, pos) {
    if (!ta) return;
    const cs = getComputedStyle(ta);
    const mirror = document.createElement('div');
    mirror.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;box-sizing:border-box;overflow:hidden;';
    mirror.style.width = ta.clientWidth + 'px';
    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.fontWeight = cs.fontWeight;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.padding = cs.padding;
    mirror.style.border = cs.border;

    const val = (ta.value || '').replace(/\r\n?/g, '\n');
    const p = clamp(pos, 0, val.length);
    const before = document.createTextNode(val.slice(0, p));
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    const after = document.createTextNode(val.slice(p) || ' ');
    mirror.append(before, marker, after);
    document.body.appendChild(mirror);
    try {
        const mRect = mirror.getBoundingClientRect();
        const r = marker.getBoundingClientRect();
        const relTop = r.top - mRect.top;
        const padTop = parseFloat(cs.paddingTop) || 8;
        const padBottom = parseFloat(cs.paddingBottom) || 8;
        const h = Math.max(14, r.height || parseFloat(cs.fontSize) || 16);
        const maxTop = Math.max(0, ta.scrollHeight - ta.clientHeight);
        if (relTop < ta.scrollTop + padTop) {
            ta.scrollTop = clamp(relTop - padTop - 4, 0, maxTop);
        } else if (relTop + h > ta.scrollTop + ta.clientHeight - padBottom) {
            ta.scrollTop = clamp(relTop + h - ta.clientHeight + padBottom + 4, 0, maxTop);
        }
        const hl = $('#latex-highlight');
        if (hl) {
            hl.scrollTop = ta.scrollTop;
            hl.scrollLeft = ta.scrollLeft;
        }
    } finally {
        mirror.remove();
    }
}

export function init(ac) {
    const sig = ac.signal;
    window.__renderPreview = (shouldScroll = false) => render(shouldScroll);
    window.__syncPreviewCursor = syncCursor;

    on(state.previewWrap, 'click', e => {
        if (!state.ta || !state.preview) return;
        if (e.target.closest('.preview-controls, .preview-error-msg, .mg-nav-led, button, a')) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().length > 0) return;

        const prevTop = state.previewWrap.scrollTop;
        const prevLeft = state.previewWrap.scrollLeft;
        const raw = state.ta.value || '';

        if (!raw.trim()) {
            state.previewNavActive = Boolean(state.intuitiveNavEnabled);
            window.__syncNavIndicators?.();
            try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
            return;
        }

        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const pos = resolveLatexOffsetAtPoint(raw, e.clientX, e.clientY, state.preview, {
            displayMode: true,
            alignLeft: state.alignLeft,
            isLight,
            clickTarget: e.target,
            buildBalancedCandidate,
            injectLatexCaret,
            findCaretElement,
        });

        state.previewNavActive = Boolean(state.intuitiveNavEnabled);
        window.__syncNavIndicators?.();
        try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
        state.ta.setSelectionRange(pos, pos);
        ensureTextareaOffsetVisible(state.ta, pos);
        lastCursorPos = -1;
        lastSelStart = -1;
        lastSelEnd = -1;
        syncCursor();
        state.previewWrap.scrollTop = prevTop;
        state.previewWrap.scrollLeft = prevLeft;
        lastProg = { left: state.previewWrap.scrollLeft, top: state.previewWrap.scrollTop };
    }, false, sig);

    on(state.previewWrap, 'wheel', e => {
        if (e.ctrlKey || e.metaKey) return;
        if (state.previewWrap.scrollWidth <= state.previewWrap.clientWidth) return;
        if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
        const maxY = state.previewWrap.scrollHeight - state.previewWrap.clientHeight;
        if (maxY > 1) {
            const down = e.deltaY > 0;
            const atEnd = down ? state.previewWrap.scrollTop >= maxY - 1 : state.previewWrap.scrollTop <= 1;
            if (!atEnd) return;
        }
        const before = state.previewWrap.scrollLeft;
        state.previewWrap.scrollLeft += e.deltaY;
        if (state.previewWrap.scrollLeft !== before) e.preventDefault();
    }, { passive: false }, sig);

    on(state.previewWrap, 'scroll', () => {
        if (progScrolling) return;
        const same = Math.abs(state.previewWrap.scrollLeft - lastProg.left) < 2 &&
                     Math.abs(state.previewWrap.scrollTop - lastProg.top) < 2;
        if (!same) state.userScrolled = true;
    }, { passive: true }, sig);

    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(measureMinHeight);
        ro.observe(state.preview);
        sig.addEventListener('abort', () => ro.disconnect(), { once: true });
    }

    const rz = $('#resizer-middle');
    let start = null;
    const minHGetter = () => Math.max(50, minH);
    const applySavedHeight = h => {
        if (!(typeof h === 'number' && h > 0)) return;
        const maxH = Math.max(minHGetter(), (document.querySelector('main')?.clientHeight || innerHeight) - 62);
        const clamped = clamp(Math.round(h), 50, maxH);
        document.documentElement.style.setProperty('--preview-height', clamped + 'px');
    };

    on(rz, 'pointerdown', e => {
        e.preventDefault();
        start = {
            y: e.clientY,
            h: state.previewWrap.offsetHeight,
            max: Math.max(minHGetter(), (document.querySelector('main')?.clientHeight || innerHeight) - 62),
            val: state.previewWrap.offsetHeight,
        };
        rz.classList.add('active');
        document.body.classList.add('is-resizing');
        rz.setPointerCapture(e.pointerId);
    }, false, sig);

    on(rz, 'pointermove', e => {
        if (!start) return;
        const v = Math.round(clamp(start.h + (start.y - e.clientY), minHGetter(), start.max));
        start.val = v;
        document.documentElement.style.setProperty('--preview-height', v + 'px');
        mirrorSet(KEYS.previewHeight, v);
        window.__reportNaturalSize?.(50);
    }, false, sig);

    const endRz = e => {
        if (!start) return;
        const finalV = start.val;
        start = null;
        try { rz.releasePointerCapture(e.pointerId); } catch { }
        rz.classList.remove('active');
        document.body.classList.remove('is-resizing');
        set(KEYS.previewHeight, finalV);
    };
    on(rz, 'pointerup', endRz, false, sig);
    on(rz, 'pointercancel', endRz, false, sig);

    const cachedH = mirrorGet(KEYS.previewHeight, 'num');
    if (cachedH > 0) applySavedHeight(cachedH);
    get([KEYS.previewHeight]).then(r => {
        if (typeof r[KEYS.previewHeight] === 'number') applySavedHeight(r[KEYS.previewHeight]);
    });

    on(window, 'resize', rafThrottle(() => {
        if (state.toolbarScaleAuto) setSize('toolbar', computeAutoScale('toolbar'), true);
        if (state.previewScaleAuto) setSize('preview', computeAutoScale('preview'), true);
        if (state.editorScaleAuto) setSize('editor', computeAutoScale('editor'), true);
        if (state.notepadScaleAuto) setSize('notepad', computeAutoScale('notepad'), true);
        if (state.notepadPreviewScaleAuto) setSize('notepadPreview', computeAutoScale('notepadPreview'), true);
        if (state.notepadToolbarScaleAuto) setSize('notepadToolbar', computeAutoScale('notepadToolbar'), true);
        if (state.headerBtnScaleAuto) setSize('headerBtn', computeAutoScale('headerBtn'), true);
    }), false, sig);
}
