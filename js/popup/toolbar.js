import { LIMITS, MSG } from '../core/constants.js';
import { $, on, clamp } from '../core/dom.js';
import { state } from './settings.js';

let openPanelId = null, hoverTimer = null, anchor = null;

const DATASETS = {
  codecogs_alike: () => window.TOOLBARS_CODECOGS_ALIKE || [],
  basic:          () => window.TOOLBARS_BASIC || [],
  science:        () => window.TOOLBARS_SCIENCE || [],
};

function notifyPopupState() {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({
      type: MSG.PANEL_POPUP_STATE,
      settingsOpen: Boolean($('#settings-popup')?.classList.contains('active')),
      recentOpen: Boolean($('#recent-popup')?.classList.contains('active')),
      notepadOpen: document.body.classList.contains('notepad-open'),
    }, '*');
  } catch {}
}

export function build() {
  const r1 = $('#toolbar-row-1'), r2 = $('#toolbar-row-2');
  if (!r1 || !r2) return;
  r1.innerHTML = r2.innerHTML = '';

  const dataset = DATASETS[state.dataset] || DATASETS.codecogs_alike;
  const toolbars = dataset();
  if (!toolbars || toolbars.length === 0) return;

  toolbars.forEach(tb => {
    const row = tb.row === 1 ? r1 : r2;
    tb.groups.forEach((g, i) => {
      row.appendChild(createPanel(g));
      if (i < tb.groups.length - 1) { const v = document.createElement('div'); v.className = 'cc-vline'; row.appendChild(v); }
    });
  });

  [r1, r2].forEach(row => {
    if (row.dataset.wheel) return; row.dataset.wheel = '1';
    on(row, 'wheel', e => {
      if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const before = row.scrollLeft; row.scrollLeft += e.deltaY;
      if (row.scrollLeft !== before) e.preventDefault();
    }, { passive: false });
    on(row, 'scroll', () => {
      if (anchor && $('#panel-popup')?.classList.contains('active')) position($('#panel-popup'), anchor);
    }, { passive: true });
  });
}

function position(popup, anchorOrPos) {
  if (!popup || !anchorOrPos) return;
  popup.classList.add('active'); popup.style.maxHeight = '';
  const pr = popup.getBoundingClientRect();

  if (typeof anchorOrPos.left === 'number' && !anchorOrPos.getBoundingClientRect) {
    const left = clamp(anchorOrPos.left, 8, Math.max(8, innerWidth - pr.width - 8));
    popup.style.left = left + 'px';
    popup.style.top = '6px';
    popup.style.maxHeight = Math.max(120, innerHeight - 14) + 'px';
    return;
  }

  const r = anchorOrPos.getBoundingClientRect();
  const left = clamp(r.left, 8, Math.max(8, innerWidth - pr.width - 8));
  popup.style.left = left + 'px';
  const below = innerHeight - r.bottom - 12, above = r.top - 8;
  if (below >= pr.height) popup.style.top = (r.bottom + 4) + 'px';
  else if (above > below && above >= 100) { popup.style.top = Math.max(8, r.top - pr.height - 4) + 'px'; popup.style.maxHeight = above + 'px'; }
  else { const t = Math.max(8, Math.min(r.bottom + 4, innerHeight - 150)); popup.style.top = t + 'px'; popup.style.maxHeight = Math.max(100, innerHeight - t - 8) + 'px'; }
}

function makeCell(item, click) {
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'cc-cell'; if (item.title) c.title = item.action === 'matrix-builder' && !item.title.includes('Alt+M') ? `${item.title} (Alt+M)` : item.title;
  if (item.render) { try { katex.render(item.render, c, { throwOnError: false }); } catch { c.textContent = item.label || '?'; } }
  else { c.textContent = item.label || '?'; if (!item.label) c.classList.add('cc-cell-text'); }
  if (click) c.addEventListener('click', e => { e.stopPropagation(); handle(item); });
  return c;
}

function handle(item) {
  if (item.action === 'matrix-builder') { window.__openMatrixBuilder(item.matrixType || 'matrix'); closePopup(); return; }
  window.__insertSnippet(item.before || '', item.after || '');
  addToRecent(item); closePopup();
  if ($('#recent-popup')?.classList.contains('active')) openRecent();
}

function createPanel(group) {
  const panel = document.createElement('div');
  panel.className = 'cc-panel'; panel.title = group.title;
  const prev = document.createElement('div');
  prev.className = 'cc-panel-preview';
  prev.style.setProperty('--preview-cols', group.previewCols);
  const limit = group.previewCols * (group.previewRows || 2);
  const rest = group.items.slice(limit);
  group.items.slice(0, limit).forEach(it => prev.appendChild(makeCell(it, true)));
  panel.appendChild(prev);
  if (rest.length) { const ch = document.createElement('span'); ch.className = 'cc-chevron'; ch.textContent = '▼'; panel.appendChild(ch); }
  on(panel, 'mouseenter', () => { clearTimeout(hoverTimer); rest.length ? openPopup(group, panel, rest) : closePopup(); });
  on(panel, 'mouseleave', scheduleClose);
  return panel;
}

function openPopup(group, panelEl, items) {
  const popup = $('#panel-popup'); if (!popup) return;
  if (openPanelId === group.id && popup.classList.contains('active')) return;
  openPanelId = group.id; popup.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'cc-popup-grid';
  const cols = Math.max(3, Math.round(Math.max(4, Math.min(8, group.previewCols * 2)) / Math.max(1, state.toolbarScale)));
  grid.style.gridTemplateColumns = `repeat(${cols}, auto)`;
  items.forEach(it => grid.appendChild(makeCell(it, true)));
  popup.appendChild(grid); anchor = panelEl; position(popup, panelEl);
  popup.onmouseenter = () => clearTimeout(hoverTimer);
  popup.onmouseleave = scheduleClose;
}

const scheduleClose = () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(closePopup, 180); };
function closePopup() { const p = $('#panel-popup'); if (!p) return; p.classList.remove('active'); openPanelId = null; anchor = null; }

const persistRecent = (() => { let id = null; return () => { clearTimeout(id); id = setTimeout(() => {
  import('../core/storage.js').then(m => m.set('latex_recent_symbols', state.recent));
}, 300); }; })();

function addToRecent(item) {
  const id = item.id || item.title || item.render || '';
  state.recent = state.recent.filter(i => (i.id || i.title || i.render || '') !== id);
  state.recent.unshift({ id, ...item });
  if (state.recent.length > LIMITS.recentMax) state.recent.pop();
  persistRecent();
}

export function openRecent(anchorOrPos) {
  const popup = $('#recent-popup'); if (!popup) return;
  popup.innerHTML = '';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 6px;margin-bottom:6px;border-bottom:1px solid var(--line);font-size:11px;font-weight:600;color:var(--ink-soft)';
  header.innerHTML = '<span>Πρόσφατα</span>';
  if (state.recent.length) {
    const clr = document.createElement('button');
    clr.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    clr.title = 'Καθαρισμός ιστορικού';
    clr.style.cssText = 'background:none;border:none;color:var(--ink-soft);cursor:pointer;padding:0;display:flex';
    on(clr, 'mouseenter', () => clr.style.color = '#f28b82');
    on(clr, 'mouseleave', () => clr.style.color = 'var(--ink-soft)');
    on(clr, 'click', e => { e.stopPropagation(); state.recent = []; import('../core/storage.js').then(m => m.set('latex_recent_symbols', [])); openRecent(anchorOrPos); });
    header.appendChild(clr);
  }
  popup.appendChild(header);
  if (!state.recent.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:12px 6px;color:var(--ink-soft);font-size:12px;text-align:center';
    empty.textContent = 'Κανένα πρόσφατο σύμβολο';
    popup.appendChild(empty);
  } else {
    const grid = document.createElement('div'); grid.className = 'cc-popup-grid';
    grid.style.gridTemplateColumns = 'repeat(4, auto)';
    state.recent.forEach(it => grid.appendChild(makeCell(it, true)));
    popup.appendChild(grid);
  }
  position(popup, anchorOrPos || $('#recent-toggle') || { left: 8 });
  popup.onmouseenter = () => clearTimeout(hoverTimer);
  popup.onmouseleave = scheduleClose;
  notifyPopupState();
}

export function closeAllPopups() {
  closePopup();
  $('#settings-popup')?.classList.remove('active');
  $('#recent-popup')?.classList.remove('active');
  notifyPopupState();
}

export function toggleSettingsFromPanel(anchorLeft) {
  const sp = $('#settings-popup');
  const rp = $('#recent-popup');
  if (!sp) return;
  rp?.classList.remove('active');
  if (sp.classList.contains('active')) {
    sp.classList.remove('active');
  } else {
    position(sp, { left: typeof anchorLeft === 'number' ? anchorLeft : 8 });
  }
  notifyPopupState();
}

export function toggleRecentFromPanel(anchorLeft) {
  const sp = $('#settings-popup');
  const rp = $('#recent-popup');
  if (!rp) return;
  sp?.classList.remove('active');
  if (rp.classList.contains('active')) {
    rp.classList.remove('active');
    notifyPopupState();
  } else {
    openRecent({ left: typeof anchorLeft === 'number' ? anchorLeft : 8 });
  }
}

export function bind(ac) {
  const sig = ac.signal;

  const recentBtn = $('#recent-toggle');
  if (recentBtn) {
    on(recentBtn, 'click', e => {
      e.stopPropagation();
      $('#settings-popup')?.classList.remove('active');
      const p = $('#recent-popup');
      if (p.classList.contains('active')) {
        p.classList.remove('active');
        notifyPopupState();
      } else {
        openRecent(recentBtn);
      }
    }, false, sig);
  }

  const settingsBtn = $('#settings-toggle');
  if (settingsBtn) {
    on(settingsBtn, 'click', e => {
      e.stopPropagation();
      $('#recent-popup')?.classList.remove('active');
      const p = $('#settings-popup');
      if (p.classList.contains('active')) p.classList.remove('active');
      else position(p, settingsBtn);
      notifyPopupState();
    }, false, sig);
  }

  const ds = $('#toolbar-dataset-select');
  if (ds) {
    ds.value = state.dataset;
    on(ds, 'change', () => {
      state.dataset = ds.value;
      import('../core/storage.js').then(m => m.set('latex_toolbar_dataset', ds.value));
      build();
    }, false, sig);
  }

  on(document, 'click', e => {
    if (!e.target.closest('.cc-panel') && !e.target.closest('#panel-popup')) closePopup();
    let changed = false;
    if (!e.target.closest('#settings-toggle') && !e.target.closest('#settings-popup')) {
      const sp = $('#settings-popup');
      if (sp?.classList.contains('active')) { sp.classList.remove('active'); changed = true; }
    }
    if (!e.target.closest('#recent-toggle') && !e.target.closest('#recent-popup')) {
      const rp = $('#recent-popup');
      if (rp?.classList.contains('active')) { rp.classList.remove('active'); changed = true; }
    }
    if (changed) notifyPopupState();
  }, false, sig);

  on(window, 'resize', () => { closeAllPopups(); }, false, sig);
}
