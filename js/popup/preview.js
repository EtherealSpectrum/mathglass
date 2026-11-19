import { $, on, clamp, rafThrottle } from '../core/dom.js';
import { computeAutoScale } from '../core/scale.js';
import { translateLatexErrorToGreek } from '../core/errors.js';
import { state, setSize } from './settings.js';

let lastProg = { left: -1, top: -1 }, minH = 50;

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderPartialLatexHtml(src, err, alignLeft) {
    const trimmed = src.trim();
    if (!trimmed) return '';
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const errorColor = isLight ? '#dc2626' : '#f28b82';

    try {
        const nonThrowingHtml = katex.renderToString(trimmed, {
            throwOnError: false,
            displayMode: true,
            fleqn: alignLeft,
            errorColor,
        });
        if (nonThrowingHtml.includes('class="katex"')) {
            return nonThrowingHtml;
        }
    } catch {
        // Fallback παρακάτω για δομικά σφάλματα (π.χ. ανοιχτό { ή \begin)
    }

    const errPos = (err && typeof err === 'object' && typeof err.position === 'number')
        ? clamp(err.position, 0, trimmed.length)
        : trimmed.length;

    const tryRender = candidate => {
        if (!candidate.trim()) return null;
        try {
            return katex.renderToString(candidate, { throwOnError: true, displayMode: true, fleqn: alignLeft });
        } catch {
            return null;
        }
    };

    for (let pos = errPos; pos >= 1; pos--) {
        const slice = trimmed.slice(0, pos);
        const validHtml = tryRender(slice);
        if (validHtml) {
            const tail = trimmed.slice(pos);
            if (!tail) return validHtml;
            return `<div class="katex-partial-combo" style="display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:${alignLeft ? 'flex-start' : 'center'};gap:6px;max-width:100%;"><span class="katex-partial-valid">${validHtml}</span><span class="katex-error-tail" style="color:${errorColor};font-family:var(--mono);font-size:0.85em;background:rgba(239,68,68,0.12);border-bottom:2px wavy ${errorColor};padding:1px 5px;border-radius:4px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(tail)}</span></div>`;
        }
    }

    return `<span class="katex-error-tail" style="color:${errorColor};font-family:var(--mono);font-size:0.9em;background:rgba(239,68,68,0.12);border-bottom:2px wavy ${errorColor};padding:2px 6px;border-radius:4px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(trimmed)}</span>`;
}

export function render() {
    const src = state.ta.value.trim();
    const follow = !state.userScrolled;
    if (!src) {
        state.previewWrap.classList.remove('error');
        state.preview.innerHTML = '<span class="placeholder">Η προεπισκόπηση θα εμφανιστεί εδώ…</span>';
    } else {
        try {
            katex.render(src, state.preview, { throwOnError: true, displayMode: true, fleqn: state.alignLeft });
            state.previewWrap.classList.remove('error');
        }
        catch (e) {
            state.previewWrap.classList.add('error');
            state.preview.innerHTML = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'preview-error-msg';
            errDiv.textContent = translateLatexErrorToGreek(e);
            state.preview.appendChild(errDiv);

            const partialHtml = renderPartialLatexHtml(src, e, state.alignLeft);
            if (partialHtml) {
                const partialWrap = document.createElement('div');
                partialWrap.className = 'preview-partial-wrap';
                const lbl = document.createElement('div');
                lbl.className = 'preview-partial-label';
                lbl.textContent = 'Προεπισκόπηση με επισήμανση σφάλματος:';
                const mathDiv = document.createElement('div');
                mathDiv.className = 'preview-partial-math';
                mathDiv.innerHTML = partialHtml;
                partialWrap.append(lbl, mathDiv);
                state.preview.appendChild(partialWrap);
            }
        }
    }
    measureMinHeight();
    if (follow) requestAnimationFrame(scrollToCursor);
}

function scrollToCursor() {
    const maxX = Math.max(0, state.previewWrap.scrollWidth - state.previewWrap.clientWidth);
    if (maxX <= 0) { lastProg.left = state.previewWrap.scrollLeft; lastProg.top = state.previewWrap.scrollTop; return; }
    const before = state.ta.value.slice(0, state.ta.selectionStart).split('\\\\').pop();
    let w = 0;
    if (before.trim()) {
        const t = document.createElement('div');
        t.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px';
        t.style.fontSize = state.preview.style.fontSize; t.style.fontFamily = getComputedStyle(state.preview).fontFamily;
        try { katex.render(before, t, { throwOnError: false, displayMode: true }); document.body.appendChild(t); w = t.getBoundingClientRect().width; } catch { }
        t.remove();
    }
    const target = state.alignLeft
        ? clamp(w - state.previewWrap.clientWidth + 60, 0, maxX)
        : clamp(maxX / 2 + w / 2, 0, maxX);
    state.previewWrap.scrollLeft = target;
    state.previewWrap.scrollTop = state.previewWrap.scrollHeight;
    lastProg = { left: state.previewWrap.scrollLeft, top: state.previewWrap.scrollTop };
}

function measureMinHeight() {
    requestAnimationFrame(() => {
        const h = state.preview.getBoundingClientRect().height;
        const main = document.querySelector('main');
        const cap = Math.max(150, Math.round((main?.clientHeight || innerHeight) * 0.65));
        const v = Math.max(50, Math.min(cap, Math.ceil(h + 28)));
        if (Math.abs(minH - v) > 1) { minH = v; document.documentElement.style.setProperty('--preview-min-height', v + 'px'); window.__reportNaturalSize?.(80); }
    });
}

export function init(ac) {
    const sig = ac.signal;
    window.__renderPreview = render;

    // Wheel: vertical → horizontal → parent (μία κίνηση ανά notch)
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
        const same = Math.abs(state.previewWrap.scrollLeft - lastProg.left) < 2 && Math.abs(state.previewWrap.scrollTop - lastProg.top) < 2;
        if (!same) state.userScrolled = true;
    }, { passive: true }, sig);

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureMinHeight).observe(state.preview);

    // Resizer
    const rz = $('#resizer-middle');
    let start = null;
    const minHGetter = () => Math.max(50, minH);
    on(rz, 'pointerdown', e => {
        e.preventDefault();
        start = {
            y: e.clientY, h: state.previewWrap.offsetHeight,
            max: Math.max(minHGetter(), (document.querySelector('main')?.clientHeight || innerHeight) - 62)
        };
        rz.classList.add('active'); document.body.classList.add('is-resizing');
        rz.setPointerCapture(e.pointerId);
    }, false, sig);
    on(rz, 'pointermove', e => {
        if (!start) return;
        const v = clamp(start.h + (start.y - e.clientY), minHGetter(), start.max);
        document.documentElement.style.setProperty('--preview-height', Math.round(v) + 'px');
        import('../core/storage.js').then(m => m.set('latex_preview_height', Math.round(v)));
        window.__reportNaturalSize?.(50);
    }, false, sig);
    const endRz = e => {
        if (!start) return; start = null;
        try { rz.releasePointerCapture(e.pointerId); } catch { }
        rz.classList.remove('active'); document.body.classList.remove('is-resizing');
    };
    on(rz, 'pointerup', endRz); on(rz, 'pointercancel', endRz);

    // Φορτώσε αποθηκευμένο ύψος
    import('../core/storage.js').then(m => {
        const v = m.mirrorGet('latex_preview_height', 'num');
        if (v > 0 && v < innerHeight) document.documentElement.style.setProperty('--preview-height', v + 'px');
    });

    // Auto-scale ζωντανά στο resize (rAF, όχι debounce)
    on(window, 'resize', rafThrottle(() => {
        if (state.toolbarScaleAuto) setSize('toolbar', computeAutoScale('toolbar'), true);
        if (state.previewScaleAuto) setSize('preview', computeAutoScale('preview'), true);
        if (state.editorScaleAuto) setSize('editor', computeAutoScale('editor'), true);
        if (state.notepadScaleAuto) setSize('notepad', computeAutoScale('notepad'), true);
        if (state.notepadPreviewScaleAuto) setSize('notepadPreview', computeAutoScale('notepadPreview'), true);
    }), false, sig);
}
