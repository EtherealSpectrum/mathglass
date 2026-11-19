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

const ac = new AbortController();

function mountStandaloneHeaderIfNeeded() {
    if (window.parent !== window) return;
    if (document.querySelector('.standalone-header')) return;
    const bar = document.createElement('div');
    bar.className = 'standalone-header';
    bar.innerHTML = `
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
            <button class="preview-toggle" id="transparency-toggle" type="button" aria-label="Διαφάνεια" title="Διαφάνεια">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" opacity="0.5"></path></svg>
            </button>
            <div class="transparency-slider-wrap">
                <span class="transparency-magnet-tick" aria-hidden="true"></span>
                <input type="range" id="transparency-slider" min="0" max="100" step="5" value="0" title="Βαθμός Διαφάνειας (%) — βήμα 5%, μαγνήτης στο 90%">
            </div>
            <span class="transparency-val" id="transparency-val">0%</span>
        </div>
        <button class="preview-toggle active" id="blur-toggle" type="button" aria-label="Θόλωμα (Τζαμαρία)" title="Θόλωμα (Τζαμαρία) ON/OFF" style="width:auto;padding:0 7px;font-size:10px;font-weight:700;">Blur</button>
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
    `;
    document.body.insertBefore(bar, document.body.firstChild);
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
        window.__refreshSyntaxHighlight = highlighter.refreshAll;
        window.__syncHighlightFont = highlighter.syncFontFromTextarea;
        highlighter.init(ac);

        bindControls(ac);
        toolbar.bind(ac);

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
