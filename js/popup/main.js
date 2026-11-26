import { $ } from '../core/dom.js';
import { KEYS } from '../core/constants.js';
import { mirrorGet } from '../core/storage.js';
import { state, load, applyVisuals, bindControls } from './settings.js';
import * as toolbar from './toolbar.js';
import * as preview from './preview.js';
import * as editor from './editor.js';
import * as actions from './actions.js';
import * as matrix from './matrix.js';
import * as bridge from './bridge.js';
import * as notepad from './notepad.js';
import * as highlighter from './highlighter.js';
import * as shortcuts from './shortcuts.js';
import * as notepadExtras from './notepad-extras.js';
import * as tutorial from './tutorial.js';

const ac = new AbortController();

function getWindowContext() {
    const isDesktop = Boolean(window.mathglassDesktop?.isDesktop);
    return { isDesktop };
}

function mountDesktopResizeHandles() {
    const desktop = window.mathglassDesktop;
    if (!desktop?.isDesktop || !desktop.getBounds || !desktop.setBounds) return () => { };
    if (document.querySelector('.mg-edge-handle')) return () => { };

    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    let dragState = null;

    const onUp = () => {
        if (!dragState) return;
        dragState = null;
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
    };

    const onMove = e => {
        if (!dragState) return;
        if (document.documentElement.getAttribute('data-maximized') === 'true') {
            onUp();
            return;
        }
        const dx = e.screenX - dragState.sx;
        const dy = e.screenY - dragState.sy;
        const b = { ...dragState.bounds };
        const minW = 480;
        const minH = 400;

        if (dragState.dir.includes('e')) {
            b.width = Math.max(minW, dragState.bounds.width + dx);
        }
        if (dragState.dir.includes('s')) {
            b.height = Math.max(minH, dragState.bounds.height + dy);
        }
        if (dragState.dir.includes('w')) {
            const newW = Math.max(minW, dragState.bounds.width - dx);
            b.x = dragState.bounds.x + (dragState.bounds.width - newW);
            b.width = newW;
        }
        if (dragState.dir.includes('n')) {
            const newH = Math.max(minH, dragState.bounds.height - dy);
            b.y = dragState.bounds.y + (dragState.bounds.height - newH);
            b.height = newH;
        }
        desktop.setBounds(b);
    };

    for (const dir of dirs) {
        const el = document.createElement('div');
        el.className = `mg-edge-handle mg-edge-${dir}`;
        el.dataset.dir = dir;
        el.setAttribute('aria-hidden', 'true');
        el.addEventListener('pointerdown', async e => {
            if (e.button !== 0) return;
            if (document.documentElement.getAttribute('data-maximized') === 'true') {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const bounds = await desktop.getBounds();
            if (!bounds || document.documentElement.getAttribute('data-maximized') === 'true') return;
            dragState = { dir, sx: e.screenX, sy: e.screenY, bounds };
            window.addEventListener('pointermove', onMove, true);
            window.addEventListener('pointerup', onUp, true);
            window.addEventListener('pointercancel', onUp, true);
        });
        document.body.appendChild(el);
    }

    return onUp;
}

function bindDesktopBridge() {
    const desktop = window.mathglassDesktop;
    if (!desktop?.isDesktop) return;

    const cancelEdgeDrag = mountDesktopResizeHandles();

    const applyWinState = st => {
        if (!st) return;
        document.documentElement.setAttribute('data-maximized', st.maximized ? 'true' : 'false');
        document.documentElement.setAttribute('data-snapped', st.snapped ? 'true' : 'false');
        if (st.maximized) cancelEdgeDrag?.();
        const pinBtn = $('#desktop-pin-btn');
        const maxBtn = $('#desktop-max-btn');
        if (pinBtn) {
            pinBtn.classList.toggle('active', Boolean(st.alwaysOnTop));
            pinBtn.setAttribute('aria-pressed', String(Boolean(st.alwaysOnTop)));
        }
        if (maxBtn) {
            maxBtn.classList.toggle('active', Boolean(st.maximized));
            maxBtn.title = st.maximized
                ? 'Επαναφορά παραθύρου (Alt+Shift+F)'
                : 'Μεγιστοποίηση / Διάταξη παραθύρου (Alt+Shift+F)';
        }
        document.querySelectorAll('.mg-snap-tile[data-snap-zone]').forEach(tile => {
            tile.classList.toggle('is-active', tile.getAttribute('data-snap-zone') === st.snapZone);
        });
    };

    desktop.getState?.().then(applyWinState).catch(() => { });
    const unsubState = desktop.onWindowState?.(applyWinState);
    const unsubShortcut = desktop.onShortcut?.(payload => {
        window.__handlePanelShortcut?.(payload);
    });
    ac.signal.addEventListener('abort', () => {
        cancelEdgeDrag?.();
        unsubState?.();
        unsubShortcut?.();
    }, { once: true });

    $('#desktop-pin-btn')?.addEventListener('click', () => desktop.winAction('pin'));
    $('#desktop-min-btn')?.addEventListener('click', () => desktop.winAction('minimize'));
    $('#desktop-max-btn')?.addEventListener('click', () => {
        hideSnapFlyout();
        desktop.winAction('maximize');
    });
    $('#desktop-close-btn')?.addEventListener('click', () => desktop.winAction('close'));

    const headerBar = $('.standalone-header');
    if (headerBar && desktop.startDrag && desktop.dragMove && desktop.endDrag) {
        let draggingWin = false;
        let dragPointerId = null;
        const stopWinDrag = () => {
            if (!draggingWin) return;
            draggingWin = false;
            if (dragPointerId !== null) {
                try { headerBar.releasePointerCapture?.(dragPointerId); } catch { }
                dragPointerId = null;
            }
            window.removeEventListener('pointermove', onWinMove, true);
            window.removeEventListener('pointerup', stopWinDrag, true);
            window.removeEventListener('pointercancel', stopWinDrag, true);
            window.removeEventListener('blur', stopWinDrag, true);
            desktop.endDrag();
        };
        const onWinMove = () => {
            if (!draggingWin) return;
            desktop.dragMove();
        };
        headerBar.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.detail >= 2) return;
            if (e.target.closest('button, input, select, .transparency-group, .mg-snap-flyout')) return;
            e.preventDefault();
            draggingWin = true;
            dragPointerId = e.pointerId;
            try { headerBar.setPointerCapture?.(e.pointerId); } catch { }
            desktop.startDrag();
            window.addEventListener('pointermove', onWinMove, true);
            window.addEventListener('pointerup', stopWinDrag, true);
            window.addEventListener('pointercancel', stopWinDrag, true);
            window.addEventListener('blur', stopWinDrag, true);
        });
        headerBar.addEventListener('dblclick', e => {
            if (e.target.closest('button, input, select, .transparency-group, .mg-snap-flyout')) return;
            desktop.winAction('maximize');
        });
        ac.signal.addEventListener('abort', stopWinDrag, { once: true });
    }

    const maxWrap = $('#desktop-max-wrap');
    const snapFlyout = $('#mg-snap-flyout');
    let snapHoverTimer = null;
    let snapHideTimer = null;
    function hideSnapFlyout() {
        clearTimeout(snapHoverTimer);
        clearTimeout(snapHideTimer);
        snapFlyout?.classList.remove('open');
    }
    if (maxWrap && snapFlyout && desktop.snapZone) {
        const scheduleShow = () => {
            clearTimeout(snapHideTimer);
            clearTimeout(snapHoverTimer);
            snapHoverTimer = setTimeout(() => snapFlyout.classList.add('open'), 260);
        };
        const scheduleHide = () => {
            clearTimeout(snapHoverTimer);
            clearTimeout(snapHideTimer);
            snapHideTimer = setTimeout(() => snapFlyout.classList.remove('open'), 180);
        };
        maxWrap.addEventListener('mouseenter', scheduleShow);
        maxWrap.addEventListener('mouseleave', scheduleHide);
        snapFlyout.addEventListener('click', e => {
            const tile = e.target.closest('[data-snap-zone]');
            if (!tile) return;
            e.stopPropagation();
            const zone = tile.getAttribute('data-snap-zone');
            hideSnapFlyout();
            desktop.snapZone(zone);
        });
    }
}

function mountStandaloneHeaderIfNeeded() {
    const { isDesktop } = getWindowContext();
    if (isDesktop) {
        document.documentElement.setAttribute('data-desktop', 'true');
        $('#insert-btn')?.remove();
        $('#notepad-insert-btn')?.remove();
    }

    if (window.parent !== window && !isDesktop) return;
    if (document.querySelector('.standalone-header')) return;
    const bar = document.createElement('div');
    bar.className = 'standalone-header';

    const desktopBtnsHtml = isDesktop
        ? `<span class="standalone-win-sep" aria-hidden="true"></span>
        <button class="preview-toggle desktop-win-btn" id="desktop-pin-btn" type="button" aria-label="Πάντα σε πρώτο πλάνο" title="Πάντα σε πρώτο πλάνο (Alt+Shift+P)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>
        </button>
        <button class="preview-toggle desktop-win-btn" id="desktop-min-btn" type="button" aria-label="Ελαχιστοποίηση" title="Ελαχιστοποίηση (Alt+Shift+M)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <div class="mg-snap-wrap" id="desktop-max-wrap">
            <button class="preview-toggle desktop-win-btn" id="desktop-max-btn" type="button" aria-label="Μεγιστοποίηση" title="Μεγιστοποίηση / Διάταξη παραθύρου (Alt+Shift+F)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
            </button>
            <div class="mg-snap-flyout" id="mg-snap-flyout" role="menu" aria-label="Διατάξεις Παραθύρου">
                <div class="mg-snap-layout-card" title="Διαίρεση 1/2">
                    <button type="button" class="mg-snap-tile" data-snap-zone="left" aria-label="Μισό Αριστερά (1/2)" title="Μισό Αριστερά (1/2)"></button>
                    <button type="button" class="mg-snap-tile" data-snap-zone="right" aria-label="Μισό Δεξιά (1/2)" title="Μισό Δεξιά (1/2)"></button>
                </div>
                <div class="mg-snap-layout-card mg-snap-layout-grid" title="Τέταρτα 1/4">
                    <button type="button" class="mg-snap-tile" data-snap-zone="top-left" aria-label="Πάνω Αριστερά (1/4)" title="Πάνω Αριστερά (1/4)"></button>
                    <button type="button" class="mg-snap-tile" data-snap-zone="top-right" aria-label="Πάνω Δεξιά (1/4)" title="Πάνω Δεξιά (1/4)"></button>
                    <button type="button" class="mg-snap-tile" data-snap-zone="bottom-left" aria-label="Κάτω Αριστερά (1/4)" title="Κάτω Αριστερά (1/4)"></button>
                    <button type="button" class="mg-snap-tile" data-snap-zone="bottom-right" aria-label="Κάτω Δεξιά (1/4)" title="Κάτω Δεξιά (1/4)"></button>
                </div>
                <div class="mg-snap-layout-card mg-snap-layout-full" title="Πλήρης Οθόνη">
                    <button type="button" class="mg-snap-tile" data-snap-zone="maximize" aria-label="Πλήρης Οθόνη" title="Πλήρης Οθόνη"></button>
                </div>
            </div>
        </div>
        <button class="preview-toggle desktop-win-btn desktop-close-btn" id="desktop-close-btn" type="button" aria-label="Κλείσιμο" title="Κλείσιμο παραθύρου (Alt+Shift+Q)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>`
        : '';

    bar.innerHTML = `
        <div class="standalone-drag-spacer" aria-hidden="true">${isDesktop ? '<span class="standalone-brand-label">MathGlass</span>' : ''}</div>
        <button class="preview-toggle" id="settings-toggle" type="button" aria-label="Ρυθμίσεις" title="Ρυθμίσεις">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
        <button class="preview-toggle" id="recent-toggle" type="button" aria-label="Πρόσφατα σύμβολα" title="Πρόσφατα σύμβολα">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </button>
        <button class="preview-toggle" id="notepad-toggle" type="button" aria-label="Σημειωματάριο phpBB" title="Σημειωματάριο phpBB">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
        </button>
        <div class="transparency-group">
            <button class="preview-toggle active" id="transparency-toggle" type="button" aria-label="Αδιαφάνεια" title="Αδιαφάνεια (Alt+O)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" opacity="0.5"></path></svg>
            </button>
            <div class="transparency-slider-wrap">
                <span class="transparency-magnet-tick" aria-hidden="true"></span>
                <input type="range" id="transparency-slider" min="0" max="100" step="5" value="35" title="Βαθμός Διαφάνειας: 35% (μαγνήτης στο 90%)">
            </div>
            <span class="transparency-val" id="transparency-val">35%</span>
        </div>
        ${isDesktop ? '' : '<button class="preview-toggle active" id="blur-toggle" type="button" aria-label="Θόλωμα (Τζαμαρία)" title="Θόλωμα (Τζαμαρία) ON/OFF">Blur</button>'}
        <button class="preview-toggle" id="preview-toggle" type="button" aria-label="Απόκρυψη προεπισκόπησης" title="Απόκρυψη προεπισκόπησης">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button class="toolbar-toggle" id="toolbar-toggle" type="button" aria-label="Απόκρυψη εργαλειοθήκης" title="Απόκρυψη εργαλειοθήκης">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="4" rx="1"></rect><rect x="3" y="10" width="18" height="4" rx="1"></rect><rect x="3" y="17" width="18" height="4" rx="1"></rect></svg>
        </button>
        <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Εναλλαγή θέματος" title="Εναλλαγή θέματος">
            <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>
            <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        </button>
        <button class="preview-toggle" id="tutorial-toggle" type="button" aria-label="Οδηγός χρήσης" title="Οδηγός χρήσης (F1)">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </button>
        ${desktopBtnsHtml}
    `;
    document.body.insertBefore(bar, document.body.firstChild);
    if (isDesktop) bindDesktopBridge();
}

(async function boot() {
    try {
        try {
            localStorage.removeItem('latex_transparent');
            localStorage.removeItem('latex_live_preview');
        } catch { }
        mountStandaloneHeaderIfNeeded();

        state.ta = $('#latex-input');
        state.previewWrap = $('#preview-wrap');
        state.preview = $('#preview');
        if (!state.ta || !state.previewWrap || !state.preview) return;

        // Σύγχρονη αποκατάσταση προχείρου πριν το highlight ώστε να μην φαίνεται η προεπιλεγμένη εξίσωση
        const cachedDraft = mirrorGet(KEYS.draft);
        if (typeof cachedDraft === 'string' && cachedDraft.length > 0) {
            state.ta.value = cachedDraft;
        }

        window.__insertSnippet = editor.insertSnippet;

        await load();
        applyVisuals();
        toolbar.build();

        editor.init(ac);
        preview.init(ac);
        actions.init(ac);
        matrix.init(ac);
        bridge.init(ac);
        notepad.init(ac);
        shortcuts.init(ac);
        notepadExtras.init(ac);
        tutorial.init(ac);
        window.__refreshSyntaxHighlight = highlighter.refreshAll;
        window.__syncHighlightFont = highlighter.syncFontFromTextarea;
        window.__rebuildToolbar = toolbar.build;
        highlighter.init(ac);

        bindControls(ac);
        toolbar.bind(ac);

        notepad.setNotepadOpen(true);
        window.__setNotepadViewMode?.('wysiwyg', { silentFocus: true });

        if (window.__renderPreview) window.__renderPreview();
        bridge.reportNaturalSize(200);

        setTimeout(() => {
            try { window.focus(); } catch { }
            window.__focusActiveEditor?.();
            if (!document.body.classList.contains('notepad-open')) {
                try { state.ta.setSelectionRange(state.ta.value.length, state.ta.value.length); } catch { }
            }
        }, 100);
    } catch (e) {
        console.error('[LaTeX Editor] Boot failed:', e);
    }
})();
