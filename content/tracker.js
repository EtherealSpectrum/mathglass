(() => {
    'use strict';
    if (typeof window.__latexGetLastFocused === 'function') return;
    const isEditable = el => {
        if (!el || el === document.body || el === document.documentElement) return false;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'textarea') return !el.disabled && !el.readOnly;
        if (tag === 'input') return ['text', 'search', 'email', 'url', 'tel'].includes((el.type || 'text').toLowerCase()) && !el.disabled && !el.readOnly;
        if (el.isContentEditable) return true;
        return el.getAttribute?.('role') === 'textbox';
    };
    let last = document.activeElement;
    if (!isEditable(last)) { try { const f = document.querySelector(':focus'); if (isEditable(f)) last = f; } catch { } }
    document.addEventListener('focusin', e => { if (isEditable(e.target)) last = e.target; }, true);
    document.addEventListener('pointerdown', e => { if (isEditable(e.target)) last = e.target; }, true);
    window.__latexGetLastFocused = () => last;
})();
