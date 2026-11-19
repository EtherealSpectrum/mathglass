// ============================================================
//  UI Init — εφαρμόζει άμεσα τις αρχικές κλάσεις πριν το main.js
// ============================================================
(function() {
    try {
        const tg = document.getElementById('toggle-group');
        const sb = document.getElementById('settings-btn');
        if (tg && sb && localStorage.getItem('latex_settings_collapsed') === 'true') {
            tg.classList.add('hidden');
            sb.classList.add('active');
        }

        const applyToggle = (id, key) => {
            const el = document.getElementById(id);
            if (!el) return;
            const v = localStorage.getItem(key);
            if (v !== null) el.checked = (v === 'true');
        };
        applyToggle('tex-toggle', 'latex_tex_toggle');
        applyToggle('inline-toggle', 'latex_inline_toggle');
        applyToggle('displaystyle-toggle', 'latex_displaystyle_toggle');

        const tb = document.getElementById('toolbars-container');
        if (tb && localStorage.getItem('latex_toolbar_hidden') === 'true') {
            tb.classList.add('hidden');
        }

        const po = document.querySelector('.preview-outer');
        const rz = document.getElementById('resizer-middle');
        if (po && rz && localStorage.getItem('latex_preview_hidden') === 'true') {
            po.classList.add('hidden');
            rz.classList.add('hidden');
        }

        const autoBadges = [
            ['editor-auto-badge', 'latex_editor_font_auto'],
            ['preview-auto-badge', 'latex_preview_zoom_auto'],
            ['toolbar-auto-badge', 'latex_toolbar_scale_auto']
        ];
        
        for (let i = 0; i < autoBadges.length; i++) {
            const badgeId = autoBadges[i][0];
            const key = autoBadges[i][1];
            const el = document.getElementById(badgeId);
            if (!el) continue;
            const v = localStorage.getItem(key);
            const active = (v === null) ? true : (v === 'true');
            el.classList.toggle('active', active);
            el.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    } catch (e) { /* ignore */ }
})();
