import { LIMITS, MSG } from '../core/constants.js';
import { $, on, clamp } from '../core/dom.js';
import { state, toggleFavoriteEquation, removeEquationFromHistory, clearEquationHistory } from './settings.js';

let openPanelId = null, hoverTimer = null, anchor = null;
let lastRecentAnchor = null;
let lastSettingsAnchor = null;
let panelAnchors = { settingsLeft: null, recentLeft: null };
let pendingSettingsAnchorSync = false;
let pendingRecentAnchorSync = false;
let recentActiveTab = 'symbols';
let searchIndexCache = null;
let searchResultsItems = [];
let searchSelectedIdx = 0;
const popupGridCache = new Map();

const DATASETS = {
  codecogs_alike: () => window.TOOLBARS_CODECOGS_ALIKE || [],
  basic:          () => window.TOOLBARS_BASIC || [],
  science:        () => window.TOOLBARS_SCIENCE || [],
};

function normalizeSearchStr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getSymbolSearchIndex() {
  if (searchIndexCache) return searchIndexCache;
  const list = [];
  const seen = new Set();
  for (const dsFn of [DATASETS.codecogs_alike, DATASETS.basic, DATASETS.science]) {
    const groupsList = dsFn() || [];
    for (const tb of groupsList) {
      for (const grp of tb.groups || []) {
        for (const item of grp.items || []) {
          const sigKey = `${item.action || ''}|${item.matrixType || ''}|${item.before || ''}|${item.after || ''}|${item.title || ''}`;
          if (seen.has(sigKey)) continue;
          seen.add(sigKey);
          const hay = normalizeSearchStr([
            item.title,
            item.before,
            item.after,
            item.render,
            item.label,
            grp.title,
            item.id,
          ].filter(Boolean).join(' '));
          list.push({ item, groupTitle: grp.title || '', hay });
        }
      }
    }
  }
  searchIndexCache = list;
  return list;
}

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

function clampOpenPopup(popup) {
  if (!popup || !popup.classList.contains('active')) return;
  const prevScrollTop = popup.scrollTop;
  popup.style.maxHeight = '';
  const pr = popup.getBoundingClientRect();
  const curLeft = parseFloat(popup.style.left);
  if (Number.isFinite(curLeft)) {
    const left = clamp(curLeft, 8, Math.max(8, innerWidth - pr.width - 8));
    popup.style.left = left + 'px';
  }
  const curTop = parseFloat(popup.style.top);
  const topVal = Number.isFinite(curTop) ? Math.max(6, curTop) : 6;
  popup.style.top = topVal + 'px';
  popup.style.maxHeight = Math.max(120, innerHeight - topVal - 8) + 'px';
  popup.scrollTop = prevScrollTop;
}

export function setPanelAnchors(anchors) {
  if (!anchors || typeof anchors !== 'object') return;
  if (typeof anchors.settingsLeft === 'number') {
    panelAnchors.settingsLeft = anchors.settingsLeft;
    lastSettingsAnchor = { left: anchors.settingsLeft };
    const sp = $('#settings-popup');
    if (sp?.classList.contains('active')) {
      if (pendingSettingsAnchorSync) {
        pendingSettingsAnchorSync = false;
        position(sp, lastSettingsAnchor);
      } else {
        clampOpenPopup(sp);
      }
    } else {
      pendingSettingsAnchorSync = false;
    }
  }
  if (typeof anchors.recentLeft === 'number') {
    panelAnchors.recentLeft = anchors.recentLeft;
    lastRecentAnchor = { left: anchors.recentLeft };
    const rp = $('#recent-popup');
    if (rp?.classList.contains('active')) {
      if (pendingRecentAnchorSync) {
        pendingRecentAnchorSync = false;
        position(rp, lastRecentAnchor);
      } else {
        clampOpenPopup(rp);
      }
    } else {
      pendingRecentAnchorSync = false;
    }
  }
}

function requestHostAnchors() {
  if (window.parent === window) return;
  try { window.parent.postMessage({ type: 'latex-request-anchors' }, '*'); } catch {}
}

function resolveAnchor(preferred, fallbackSaved, toggleEl, defaultLeft) {
  if (preferred) {
    if (typeof preferred.left === 'number' || preferred.isConnected) return preferred;
  }
  if (fallbackSaved) {
    if (typeof fallbackSaved.left === 'number' || fallbackSaved.isConnected) return fallbackSaved;
  }
  if (toggleEl && toggleEl.isConnected) return toggleEl;
  return { left: defaultLeft };
}

function makeToolbarSearchButton() {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = 'toolbar-search-btn';
  b.className = 'cc-search-trigger';
  b.title = 'Αναζήτηση συμβόλων KaTeX (Alt+/ ή Ctrl+Shift+F)';
  b.setAttribute('aria-label', 'Αναζήτηση συμβόλων KaTeX');
  b.setAttribute('aria-expanded', String(Boolean($('#toolbar-search-bar')?.classList.contains('active'))));
  b.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  on(b, 'mousedown', e => e.preventDefault());
  on(b, 'click', e => { e.stopPropagation(); toggleSymbolSearch(); });
  return b;
}

export function build() {
  const r1 = $('#toolbar-row-1'), r2 = $('#toolbar-row-2');
  if (!r1 || !r2) return;
  popupGridCache.clear();
  searchIndexCache = null;

  const dataset = DATASETS[state.dataset] || DATASETS.codecogs_alike;
  const toolbars = dataset();
  if (!toolbars || toolbars.length === 0) {
    r1.replaceChildren();
    r2.replaceChildren();
    return;
  }

  const frag1 = document.createDocumentFragment();
  const frag2 = document.createDocumentFragment();
  frag1.appendChild(makeToolbarSearchButton());
  const firstDivider = document.createElement('div');
  firstDivider.className = 'cc-vline';
  frag1.appendChild(firstDivider);

  toolbars.forEach(tb => {
    const frag = tb.row === 1 ? frag1 : frag2;
    tb.groups.forEach((g, i) => {
      frag.appendChild(createPanel(g));
      if (i < tb.groups.length - 1) { const v = document.createElement('div'); v.className = 'cc-vline'; frag.appendChild(v); }
    });
  });

  r1.replaceChildren(frag1);
  r2.replaceChildren(frag2);

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
  const prevScrollTop = popup.scrollTop;
  popup.classList.add('active');
  popup.style.maxHeight = '';
  popup.style.right = 'auto';
  popup.style.left = '8px';
  popup.style.top = '6px';
  const pr = popup.getBoundingClientRect();

  if (typeof anchorOrPos.left === 'number' && !anchorOrPos.getBoundingClientRect) {
    const left = clamp(anchorOrPos.left, 8, Math.max(8, innerWidth - pr.width - 8));
    popup.style.left = left + 'px';
    popup.style.top = '6px';
    popup.style.maxHeight = Math.max(120, innerHeight - 14) + 'px';
    popup.scrollTop = prevScrollTop;
    return;
  }

  const r = anchorOrPos.getBoundingClientRect();
  const left = clamp(r.left, 8, Math.max(8, innerWidth - pr.width - 8));
  popup.style.left = left + 'px';
  const below = innerHeight - r.bottom - 12, above = r.top - 8;
  if (below >= pr.height) popup.style.top = (r.bottom + 4) + 'px';
  else if (above > below && above >= 100) { popup.style.top = Math.max(8, r.top - pr.height - 4) + 'px'; popup.style.maxHeight = above + 'px'; }
  else { const t = Math.max(8, Math.min(r.bottom + 4, innerHeight - 150)); popup.style.top = t + 'px'; popup.style.maxHeight = Math.max(100, innerHeight - t - 8) + 'px'; }
  popup.scrollTop = prevScrollTop;
}

function makeCell(item, click) {
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'cc-cell'; if (item.title) c.title = item.action === 'matrix-builder' && !item.title.includes('Alt+M') ? `${item.title} (Alt+M)` : item.title;
  if (item.render) { try { katex.render(item.render, c, { throwOnError: false }); } catch { c.textContent = item.label || '?'; } }
  else { c.textContent = item.label || '?'; if (!item.label) c.classList.add('cc-cell-text'); }
  c.addEventListener('mousedown', e => e.preventDefault());
  if (click) c.addEventListener('click', e => { e.stopPropagation(); handle(item); });
  return c;
}

function handle(item) {
  if (item.action === 'matrix-builder') { window.__openMatrixBuilder(item.matrixType || 'matrix'); closeAllPopups(); return; }
  window.__insertSnippet(item.before || '', item.after || '');
  addToRecent(item); closePopup();
  if ($('#recent-popup')?.classList.contains('active')) openRecent(lastRecentAnchor);
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
  openPanelId = group.id;
  const cols = Math.max(3, Math.round(Math.max(4, Math.min(8, group.previewCols * 2)) / Math.max(1, state.toolbarScale)));
  const cacheKey = `${state.dataset}:${group.id}:${cols}:${state.toolbarScale}`;
  let grid = popupGridCache.get(cacheKey);
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'cc-popup-grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    const frag = document.createDocumentFragment();
    items.forEach(it => frag.appendChild(makeCell(it, true)));
    grid.appendChild(frag);
    popupGridCache.set(cacheKey, grid);
  }
  popup.replaceChildren(grid);
  anchor = panelEl; position(popup, panelEl);
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

function renderSymbolSearchResults(query) {
  const resultsEl = $('#toolbar-search-results');
  if (!resultsEl) return;
  const terms = normalizeSearchStr(query).split(/\s+/).filter(Boolean);
  const index = getSymbolSearchIndex();
  const matches = terms.length === 0
    ? index.slice(0, 14)
    : index.filter(entry => terms.every(t => entry.hay.includes(t))).slice(0, 18);

  searchResultsItems = matches.map(m => m.item);
  searchSelectedIdx = 0;

  if (!matches.length) {
    resultsEl.innerHTML = '<div class="toolbar-search-empty">Δεν βρέθηκαν αντίστοιχα σύμβολα KaTeX.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  matches.forEach((entry, idx) => {
    const { item } = entry;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toolbar-search-item' + (idx === 0 ? ' is-selected' : '');
    btn.title = `${item.title || item.before || ''} (${entry.groupTitle})`;
    const symSpan = document.createElement('span');
    symSpan.className = 'toolbar-search-sym';
    if (item.render) {
      try { katex.render(item.render, symSpan, { throwOnError: false }); } catch { symSpan.textContent = item.label || item.before || '?'; }
    } else {
      symSpan.textContent = item.label || item.before || '?';
    }
    const labelSpan = document.createElement('span');
    labelSpan.className = 'toolbar-search-label';
    labelSpan.textContent = item.title || item.before || '';
    btn.append(symSpan, labelSpan);
    on(btn, 'mousedown', e => e.preventDefault());
    on(btn, 'click', e => {
      e.stopPropagation();
      handle(item);
      closeSymbolSearch(true);
    });
    frag.appendChild(btn);
  });
  resultsEl.replaceChildren(frag);
}

export function openSymbolSearch() {
  const bar = $('#toolbar-search-bar');
  const inp = $('#toolbar-search-input');
  if (!bar || !inp) return;
  closePopup();
  bar.classList.add('active');
  $('#toolbar-search-btn')?.classList.add('active');
  $('#toolbar-search-btn')?.setAttribute('aria-expanded', 'true');
  renderSymbolSearchResults(inp.value);
  requestAnimationFrame(() => {
    try { inp.focus({ preventScroll: true }); } catch { inp.focus(); }
    inp.select();
  });
  window.__reportNaturalSize?.(40);
}

export function closeSymbolSearch(refocusEditor = false) {
  const bar = $('#toolbar-search-bar');
  if (!bar || !bar.classList.contains('active')) return;
  bar.classList.remove('active');
  $('#toolbar-search-btn')?.classList.remove('active');
  $('#toolbar-search-btn')?.setAttribute('aria-expanded', 'false');
  window.__reportNaturalSize?.(40);
  if (refocusEditor) window.__focusActiveEditor?.();
}

export function toggleSymbolSearch() {
  const bar = $('#toolbar-search-bar');
  if (!bar) return;
  if (bar.classList.contains('active')) closeSymbolSearch(true);
  else openSymbolSearch();
}

function loadOrInsertEquation(latex) {
  const inNotepad = document.body.classList.contains('notepad-open');
  if (inNotepad) {
    window.__insertSnippet(latex, '');
    return;
  }
  if (state.ta) {
    try { state.ta.focus({ preventScroll: true }); } catch { state.ta.focus(); }
    state.ta.value = latex;
    state.ta.setSelectionRange(latex.length, latex.length);
    window.__draftUserEdited = true;
    window.__renderPreview?.(true);
    window.__refreshSyntaxHighlight?.();
    import('../core/storage.js').then(m => m.set('latex_editor_text', latex));
  }
}

function renderEquationListSection(popup, title, items, favSet, allowDeleteHistory, resolvedAnchor) {
  const label = document.createElement('div');
  label.className = 'equation-section-title';
  label.textContent = title;
  popup.appendChild(label);

  const listEl = document.createElement('div');
  listEl.className = 'equation-list';

  for (const eq of items) {
    const row = document.createElement('div');
    row.className = 'equation-item';

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'equation-item-preview';
    mainBtn.title = eq;
    try {
      katex.render(eq, mainBtn, { throwOnError: false, displayMode: false });
    } catch {
      mainBtn.textContent = eq;
    }
    on(mainBtn, 'mousedown', e => e.preventDefault());
    on(mainBtn, 'click', e => {
      e.stopPropagation();
      loadOrInsertEquation(eq);
      $('#recent-popup')?.classList.remove('active');
      notifyPopupState();
    });

    const isFav = favSet.has(eq);
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'equation-act-btn' + (isFav ? ' is-fav' : '');
    favBtn.textContent = isFav ? '★' : '☆';
    favBtn.title = isFav ? 'Αφαίρεση από αγαπημένες' : 'Προσθήκη στις αγαπημένες';
    on(favBtn, 'mousedown', e => e.preventDefault());
    on(favBtn, 'click', e => {
      e.stopPropagation();
      toggleFavoriteEquation(eq);
      openRecent(resolvedAnchor);
    });

    row.append(mainBtn, favBtn);

    if (allowDeleteHistory) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'equation-act-btn is-del';
      delBtn.textContent = '×';
      delBtn.title = 'Αφαίρεση';
      on(delBtn, 'mousedown', e => e.preventDefault());
      on(delBtn, 'click', e => {
        e.stopPropagation();
        removeEquationFromHistory(eq);
        openRecent(resolvedAnchor);
      });
      row.appendChild(delBtn);
    }

    listEl.appendChild(row);
  }
  popup.appendChild(listEl);
}

export function openRecent(anchorOrPos) {
  const popup = $('#recent-popup'); if (!popup) return;
  closePopup();

  const resolvedAnchor = resolveAnchor(
    anchorOrPos,
    lastRecentAnchor,
    $('#recent-toggle'),
    typeof panelAnchors.recentLeft === 'number' ? panelAnchors.recentLeft : Math.max(40, innerWidth - 410)
  );
  lastRecentAnchor = resolvedAnchor;
  if (window.parent !== window && typeof panelAnchors.recentLeft !== 'number' && !anchorOrPos) {
    pendingRecentAnchorSync = true;
    requestHostAnchors();
  } else {
    pendingRecentAnchorSync = false;
  }

  popup.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'recent-header';

  const tabs = document.createElement('div');
  tabs.className = 'recent-tabs';

  const tabSym = document.createElement('button');
  tabSym.type = 'button';
  tabSym.className = 'recent-tab-btn' + (recentActiveTab === 'symbols' ? ' active' : '');
  tabSym.textContent = 'Σύμβολα';
  on(tabSym, 'mousedown', e => e.preventDefault());
  on(tabSym, 'click', e => { e.stopPropagation(); recentActiveTab = 'symbols'; openRecent(resolvedAnchor); });

  const tabEq = document.createElement('button');
  tabEq.type = 'button';
  tabEq.className = 'recent-tab-btn' + (recentActiveTab === 'equations' ? ' active' : '');
  tabEq.textContent = 'Εξισώσεις';
  on(tabEq, 'mousedown', e => e.preventDefault());
  on(tabEq, 'click', e => { e.stopPropagation(); recentActiveTab = 'equations'; openRecent(resolvedAnchor); });

  tabs.append(tabSym, tabEq);
  header.appendChild(tabs);

  const hasClearable = recentActiveTab === 'symbols'
    ? state.recent.length > 0
    : state.equationHistory.length > 0;

  if (hasClearable) {
    const clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'recent-clear-btn';
    clr.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    clr.title = recentActiveTab === 'symbols' ? 'Καθαρισμός πρόσφατων συμβόλων' : 'Καθαρισμός ιστορικού εξισώσεων';
    on(clr, 'mousedown', e => e.preventDefault());
    on(clr, 'click', e => {
      e.stopPropagation();
      if (recentActiveTab === 'symbols') {
        state.recent = [];
        import('../core/storage.js').then(m => m.set('latex_recent_symbols', []));
      } else {
        clearEquationHistory();
      }
      openRecent(resolvedAnchor);
    });
    header.appendChild(clr);
  }
  popup.appendChild(header);

  if (recentActiveTab === 'symbols') {
    if (!state.recent.length) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = 'Κανένα πρόσφατο σύμβολο';
      popup.appendChild(empty);
    } else {
      const grid = document.createElement('div'); grid.className = 'cc-popup-grid';
      grid.style.gridTemplateColumns = 'repeat(4, auto)';
      state.recent.forEach(it => grid.appendChild(makeCell(it, true)));
      popup.appendChild(grid);
    }
  } else {
    const curVal = (state.ta?.value || '').trim();
    const favSet = new Set(state.favoriteEquations);

    const saveBar = document.createElement('div');
    saveBar.className = 'equation-save-bar';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'equation-save-current-btn';
    const curIsFav = Boolean(curVal && favSet.has(curVal));
    saveBtn.textContent = curIsFav ? '★ Ήδη στις Αγαπημένες' : '☆ Αποθήκευση τρέχουσας εξίσωσης';
    saveBtn.disabled = !curVal;
    on(saveBtn, 'mousedown', e => e.preventDefault());
    on(saveBtn, 'click', e => {
      e.stopPropagation();
      if (curVal) {
        toggleFavoriteEquation(curVal);
        openRecent(resolvedAnchor);
      }
    });
    saveBar.appendChild(saveBtn);
    popup.appendChild(saveBar);

    const favs = state.favoriteEquations;
    const hist = state.equationHistory.filter(eq => !favSet.has(eq));
    if (!favs.length && !hist.length) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = 'Δεν υπάρχουν αποθηκευμένες εξισώσεις ακόμη. Αντιγράψτε, εισάγετε ή πατήστε ☆.';
      popup.appendChild(empty);
    } else {
      if (favs.length) renderEquationListSection(popup, 'Αγαπημένες', favs, favSet, false, resolvedAnchor);
      if (hist.length) renderEquationListSection(popup, 'Πρόσφατες Εξισώσεις', hist, favSet, true, resolvedAnchor);
    }
  }

  position(popup, resolvedAnchor);
  notifyPopupState();
}

export function closeAllPopups() {
  closePopup();
  closeSymbolSearch(false);
  $('#settings-popup')?.classList.remove('active');
  $('#recent-popup')?.classList.remove('active');
  notifyPopupState();
}

export function toggleSettingsFromPanel(anchorLeft) {
  const sp = $('#settings-popup');
  const rp = $('#recent-popup');
  if (!sp) return;
  closePopup();
  rp?.classList.remove('active');
  if (typeof anchorLeft === 'number') {
    panelAnchors.settingsLeft = anchorLeft;
    lastSettingsAnchor = { left: anchorLeft };
  }
  if (sp.classList.contains('active')) {
    sp.classList.remove('active');
    pendingSettingsAnchorSync = false;
  } else {
    const resolved = resolveAnchor(
      typeof anchorLeft === 'number' ? { left: anchorLeft } : null,
      lastSettingsAnchor,
      $('#settings-toggle'),
      typeof panelAnchors.settingsLeft === 'number' ? panelAnchors.settingsLeft : Math.max(8, innerWidth - 440)
    );
    lastSettingsAnchor = resolved;
    position(sp, resolved);
    if (window.parent !== window && typeof panelAnchors.settingsLeft !== 'number' && typeof anchorLeft !== 'number') {
      pendingSettingsAnchorSync = true;
      requestHostAnchors();
    } else {
      pendingSettingsAnchorSync = false;
    }
  }
  notifyPopupState();
}

export function toggleRecentFromPanel(anchorLeft) {
  const sp = $('#settings-popup');
  const rp = $('#recent-popup');
  if (!rp) return;
  closePopup();
  sp?.classList.remove('active');
  if (typeof anchorLeft === 'number') {
    panelAnchors.recentLeft = anchorLeft;
    lastRecentAnchor = { left: anchorLeft };
  }
  if (rp.classList.contains('active')) {
    rp.classList.remove('active');
    notifyPopupState();
  } else {
    const resolved = typeof anchorLeft === 'number'
      ? { left: anchorLeft }
      : (typeof panelAnchors.recentLeft === 'number' ? { left: panelAnchors.recentLeft } : lastRecentAnchor);
    openRecent(resolved);
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
      closePopup();
      $('#recent-popup')?.classList.remove('active');
      const p = $('#settings-popup');
      if (p.classList.contains('active')) p.classList.remove('active');
      else {
        lastSettingsAnchor = settingsBtn;
        position(p, settingsBtn);
      }
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

  const sInput = $('#toolbar-search-input');
  const sClear = $('#toolbar-search-clear');
  const sClose = $('#toolbar-search-close');
  if (sInput) {
    on(sInput, 'input', () => renderSymbolSearchResults(sInput.value), false, sig);
    on(sInput, 'keydown', e => {
      const resultsEl = $('#toolbar-search-results');
      const count = searchResultsItems.length;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSymbolSearch(true);
        return;
      }
      if (!count) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        searchSelectedIdx = (searchSelectedIdx + 1) % count;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        searchSelectedIdx = (searchSelectedIdx - 1 + count) % count;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const item = searchResultsItems[searchSelectedIdx];
        if (item) {
          handle(item);
          closeSymbolSearch(true);
        }
        return;
      } else {
        return;
      }
      if (resultsEl) {
        const btns = resultsEl.querySelectorAll('.toolbar-search-item');
        btns.forEach((b, i) => b.classList.toggle('is-selected', i === searchSelectedIdx));
        btns[searchSelectedIdx]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }, false, sig);
  }
  if (sClear && sInput) {
    on(sClear, 'mousedown', e => e.preventDefault(), false, sig);
    on(sClear, 'click', e => { e.stopPropagation(); sInput.value = ''; renderSymbolSearchResults(''); sInput.focus(); }, false, sig);
  }
  if (sClose) {
    on(sClose, 'mousedown', e => e.preventDefault(), false, sig);
    on(sClose, 'click', e => { e.stopPropagation(); closeSymbolSearch(true); }, false, sig);
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

  on(window, 'resize', () => {
    closePopup();
    const sp = $('#settings-popup');
    if (sp?.classList.contains('active')) {
      clampOpenPopup(sp);
    }
    const rp = $('#recent-popup');
    if (rp?.classList.contains('active')) {
      clampOpenPopup(rp);
    }
  }, false, sig);
}
