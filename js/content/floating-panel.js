(() => {
  'use strict';

  const PANEL_ID = 'latex-editor-floating-panel';
  const STYLE_ID = 'latex-editor-floating-styles';
  const K_GEOM = 'latex_panel_geometry';
  const K_THEME = 'latex_theme';
  const K_TRANSP = 'latex_transparency_level';
  const K_BLUR = 'latex_blur_enabled';
  const K_TB_HIDDEN = 'latex_toolbar_hidden';
  const K_PV_HIDDEN = 'latex_preview_hidden';

  const M_SCROLL = 'latex-panel-scroll';
  const M_SIZE = 'latex-panel-natural-size';
  const M_CLOSE = 'latex-panel-will-close';
  const M_SAVE = 'latex-panel-save-draft';
  const M_ACTION = 'latex-panel-action';
  const M_POPUP_STATE = 'latex-panel-popup-state';

  const MIN_W = 420, HANDLE_H = 36;
  const storageLocal = (typeof chrome !== 'undefined' && chrome.storage?.local)
    ? chrome.storage.local
    : (typeof browser !== 'undefined' && browser.storage?.local ? browser.storage.local : null);
  const storageOnChanged = (typeof chrome !== 'undefined' && chrome.storage?.onChanged)
    ? chrome.storage.onChanged
    : (typeof browser !== 'undefined' && browser.storage?.onChanged ? browser.storage.onChanged : null);
  const runtimeApi = (typeof chrome !== 'undefined' && chrome.runtime)
    ? chrome.runtime
    : (typeof browser !== 'undefined' && browser.runtime ? browser.runtime : null);

  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    const f = existing.querySelector('iframe');
    try { f?.contentWindow?.postMessage({ type: M_SAVE }, '*'); } catch { }
    if (typeof window.__latexPanelCleanup === 'function') {
      try { window.__latexPanelCleanup(); } catch { }
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      existing.remove();
      document.getElementById(STYLE_ID)?.remove();
      window.__latexPanelMounted = false;
    }));
    return;
  }

  if (window.__latexPanelMounted) return;
  window.__latexPanelMounted = true;

  const listeners = [];
  const add = (t, e, f, o) => { t.addEventListener(e, f, o); listeners.push([t, e, f, o]); };
  let storageUnsub = null;
  const teardown = () => {
    listeners.forEach(([t, e, f, o]) => { try { t.removeEventListener(e, f, o); } catch { } });
    listeners.length = 0;
    if (storageUnsub) { try { storageUnsub(); } catch { } storageUnsub = null; }
    document.getElementById(STYLE_ID)?.remove();
    ssStop();
    window.__latexPanelMounted = false;
    window.__latexPanelCleanup = null;
  };
  window.__latexPanelCleanup = teardown;

  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
    #${PANEL_ID} {
      --lfp-accent: #8b7bff;
      --lfp-accent-soft: rgba(139, 123, 255, 0.2);
      --lfp-ink: #eceef2;
      --lfp-ink-soft: #9298a6;
      --lfp-btn-bg: rgba(255, 255, 255, 0.06);
      --lfp-line: rgba(255, 255, 255, 0.12);
    }
    #${PANEL_ID}[data-theme="light"] {
      --lfp-accent: #4338ca;
      --lfp-accent-soft: rgba(67, 56, 202, 0.16);
      --lfp-ink: #111214;
      --lfp-ink-soft: #363940;
      --lfp-btn-bg: rgba(17, 18, 20, 0.08);
      --lfp-line: rgba(17, 18, 20, 0.22);
    }
    #${PANEL_ID} .lfp-bar-btn {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 50%;
      color: var(--lfp-ink);
      cursor: pointer;
      padding: 0;
      margin: 0;
      flex: 0 0 auto;
      transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.08s;
      box-sizing: border-box;
    }
    #${PANEL_ID} .lfp-bar-btn.lfp-win-btn {
      border-radius: 4px;
    }
    #${PANEL_ID} .lfp-bar-btn.lfp-blur-btn {
      width: auto;
      padding: 0 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      gap: 3px;
      border-color: var(--lfp-line);
    }
    #${PANEL_ID} .lfp-bar-btn:hover {
      background: var(--lfp-accent-soft);
      border-color: var(--lfp-accent);
      color: var(--lfp-accent);
    }
    #${PANEL_ID} .lfp-bar-btn:active {
      transform: scale(0.92);
    }
    #${PANEL_ID} .lfp-bar-btn.lfp-active {
      background: var(--lfp-accent);
      border-color: var(--lfp-accent);
      color: #ffffff;
    }
    #${PANEL_ID} .lfp-bar-btn.lfp-active:hover {
      filter: brightness(1.1);
      color: #ffffff;
    }
    #${PANEL_ID} .lfp-slider-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      width: 76px;
      margin: 0 1px;
      flex: 0 0 auto;
    }
    #${PANEL_ID} .lfp-slider-tick {
      position: absolute;
      left: calc(6px + (100% - 12px) * 0.9);
      top: 50%;
      transform: translate(-50%, -50%);
      width: 2px;
      height: 9px;
      border-radius: 1px;
      background: var(--lfp-accent);
      opacity: 0.78;
      pointer-events: none;
      z-index: 0;
    }
    #${PANEL_ID} .lfp-slider {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 4px;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 2px;
      background: var(--lfp-line);
      accent-color: var(--lfp-accent);
      cursor: pointer;
      outline: none;
      -webkit-appearance: none;
      appearance: none;
      flex: 0 0 auto;
    }
    #${PANEL_ID} .lfp-transp-val {
      font-size: 9.5px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      min-width: 26px;
      text-align: right;
      color: var(--lfp-ink-soft);
      flex: 0 0 auto;
    }
    #${PANEL_ID} .lfp-transp-val.at-magnet {
      color: var(--lfp-accent);
    }
    #${PANEL_ID} .lfp-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--lfp-accent);
      cursor: pointer;
      border: none;
    }
    #${PANEL_ID} .lfp-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--lfp-accent);
      cursor: pointer;
      border: none;
    }
  `;
    (document.head || document.documentElement).appendChild(st);
  }

  let geo = { left: 80, top: 80, width: 580, height: 660 };
  let theme = 'dark', transparency = 0, blurEnabled = true, toolbarHidden = false, previewHidden = false;
  let minimized = false, fullscreen = false, readerOpenedFs = false, preFsGeo = null, savedHeight = 660, dynamicMinH = 300;

  const clampGeo = g => {
    const cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
    const minW = Math.min(MIN_W, cw - 16), minH = Math.min(dynamicMinH, ch - HANDLE_H - 16);
    g.width = Math.max(minW, Math.min(g.width, cw - 16));
    g.height = Math.max(minH, Math.min(g.height, ch - HANDLE_H - 16));
    g.left = Math.max(0, Math.min(g.left, cw - g.width));
    g.top = Math.max(0, Math.min(g.top, ch - HANDLE_H * 2));
    return g;
  };

  const wrapper = document.createElement('div');
  wrapper.id = PANEL_ID;
  wrapper.setAttribute('data-theme', theme);
  const handle = document.createElement('div');
  const iframe = document.createElement('iframe');
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.tabIndex = 0;
  iframe.src = runtimeApi.getURL('popup.html');
  const resizeHandle = document.createElement('div');

  const ICON = {
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    recent: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    notepad: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
    transp: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" opacity="0.5"/>',
    blur: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    preview: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    toolbar: '<rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    min: '<path d="M3 7h8"/>',
    restore: '<rect x="3" y="3" width="8" height="8" rx="1"/>',
    close: '<path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/>',
    full: '<path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9"/>',
    exit: '<path d="M5 2v3H2M9 2v3h3M5 12v-3H2M9 12v-3h3"/>',
  };
  const svg = (p, size = 14, vb = 14) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

  const mkBarBtn = (icon, label, vb = 24, size = 15, isWin = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = isWin ? 'lfp-bar-btn lfp-win-btn' : 'lfp-bar-btn';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = svg(icon, size, vb);
    return b;
  };

  const btnSettings = mkBarBtn(ICON.settings, 'Ρυθμίσεις (Alt+S)');
  const btnRecent = mkBarBtn(ICON.recent, 'Πρόσφατα σύμβολα (Alt+R)');
  const btnNotepad = mkBarBtn(ICON.notepad, 'Σημειωματάριο phpBB (Alt+N)');
  const btnTransp = mkBarBtn(ICON.transp, 'Διαφάνεια (Alt+O)');
  const sliderWrap = document.createElement('span');
  sliderWrap.className = 'lfp-slider-wrap';
  const sliderTick = document.createElement('span');
  sliderTick.className = 'lfp-slider-tick';
  sliderTick.setAttribute('aria-hidden', 'true');
  const sliderTransp = document.createElement('input');
  sliderTransp.type = 'range';
  sliderTransp.className = 'lfp-slider';
  sliderTransp.min = '0';
  sliderTransp.max = '100';
  sliderTransp.step = '5';
  sliderTransp.value = '0';
  sliderTransp.title = 'Βαθμός Διαφάνειας (%) — βήμα 5%, μαγνήτης στο 90% (Alt+O εναλλαγή)';
  sliderWrap.append(sliderTick, sliderTransp);
  const transpVal = document.createElement('span');
  transpVal.className = 'lfp-transp-val';
  transpVal.textContent = '0%';

  const btnBlur = document.createElement('button');
  btnBlur.type = 'button';
  btnBlur.className = 'lfp-bar-btn lfp-blur-btn';
  btnBlur.innerHTML = svg(ICON.blur, 12, 24) + '<span>Blur</span>';

  const btnPreview = mkBarBtn(ICON.preview, 'Απόκρυψη ζωντανής προεπισκόπησης (Alt+P)');
  const btnToolbar = mkBarBtn(ICON.toolbar, 'Απόκρυψη εργαλειοθήκης (Alt+K)');
  const btnTheme = mkBarBtn(ICON.sun, 'Εναλλαγή θέματος (Alt+T)');

  const divider = document.createElement('span');
  divider.style.cssText = 'width:1px;height:16px;background:var(--lfp-line);margin:0 2px;flex-shrink:0';

  const btnMin = mkBarBtn(ICON.min, 'Ελαχιστοποίηση', 14, 14, true);
  const btnFull = mkBarBtn(ICON.full, 'Πλήρης Οθόνη', 14, 14, true);
  const btnClose = mkBarBtn(ICON.close, 'Κλείσιμο', 14, 14, true);

  Object.assign(wrapper.style, {
    position: 'fixed', zIndex: '2147483647', borderRadius: '10px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    transition: 'height .18s ease, box-shadow .18s ease', userSelect: 'none'
  });
  Object.assign(handle.style, {
    height: HANDLE_H + 'px', flexShrink: '0', cursor: 'grab', display: 'flex',
    alignItems: 'center', padding: '0 6px 0 10px', gap: '6px', fontSize: '12.5px', fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    touchAction: 'none', borderBottom: '1px solid rgba(128,128,128,0.18)'
  });

  const titleSpan = document.createElement('span');
  titleSpan.textContent = 'MathGlass · LaTeX & phpBB';
  titleSpan.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none';

  const controlsGroup = document.createElement('div');
  controlsGroup.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0';
  controlsGroup.append(
    btnSettings, btnRecent, btnNotepad, btnTransp, sliderWrap, transpVal, btnBlur,
    btnPreview, btnToolbar, btnTheme, divider, btnMin, btnFull, btnClose
  );
  handle.append(titleSpan, controlsGroup);

  Object.assign(iframe.style, { flex: '1', width: '100%', border: 'none', display: 'block', background: 'transparent' });
  Object.assign(resizeHandle.style, {
    position: 'absolute', bottom: '0', right: '0', width: '16px', height: '16px',
    cursor: 'nwse-resize', zIndex: '10', touchAction: 'none'
  });
  resizeHandle.innerHTML = svg('<path d="M3 11L11 3M6 11L11 6M9 11L11 9"/>', 14, 14);
  wrapper.append(handle, iframe, resizeHandle);
  document.body.appendChild(wrapper);
  try { iframe.focus({ preventScroll: true }); } catch { try { iframe.focus(); } catch { } }

  let lastFocused = document.activeElement;
  add(document, 'focusin', e => {
    if (e.target === iframe || wrapper.contains(e.target)) return;
    lastFocused = e.target;
  }, true);
  add(document, 'pointerdown', e => {
    if (!wrapper.contains(e.target)) postToPanel({ type: M_ACTION, action: 'close-popups' });
  }, true);
  window.__latexGetLastFocused = () => lastFocused;

  const postToPanel = msg => {
    try { iframe.contentWindow?.postMessage(msg, '*'); } catch { }
  };
  const focusEditorInPanel = () => {
    try { iframe.focus({ preventScroll: true }); } catch { try { iframe.focus(); } catch { } }
    postToPanel({ type: M_ACTION, action: 'focus-editor' });
  };
  controlsGroup.addEventListener('mousedown', e => {
    if (e.target.closest('button')) e.preventDefault();
  });
  let suppressHostAltKeyup = false;
  add(window, 'keydown', e => {
    const ae = document.activeElement;
    const inPanel = wrapper.contains(ae) || ae === iframe;
    const onBarePage = !minimized && (!ae || ae === document.body || ae === document.documentElement);
    const isMod = e.ctrlKey || e.metaKey;
    const isPanelAlt = e.altKey && !isMod && !e.shiftKey && /^(Key[NCTOBKPSRMELFX]|Digit4)$/.test(e.code);
    const isPanelCtrl = inPanel && isMod && !e.altKey && (e.key === 'Enter' || /^(Key[BIKU])$/.test(e.code));
    const isPanelEsc = inPanel && e.key === 'Escape';
    if ((inPanel || (onBarePage && isPanelAlt)) && (isPanelAlt || isPanelCtrl || isPanelEsc)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.altKey) suppressHostAltKeyup = true;
      postToPanel({
        type: M_ACTION,
        action: 'run-shortcut',
        key: e.key,
        code: e.code,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        settingsLeft: anchorLeftFor(btnSettings),
        recentLeft: anchorLeftFor(btnRecent),
      });
      requestAnimationFrame(focusEditorInPanel);
    }
  }, true);
  add(window, 'keyup', e => {
    if (suppressHostAltKeyup && (e.key === 'Alt' || !e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      suppressHostAltKeyup = false;
      focusEditorInPanel();
    }
  }, true);

  const COLORS = {
    dark: { bg: '31,34,42', solidBg: '#15161b', solidHandle: '#2a2d36' },
    light: { bg: '226,228,232', solidBg: '#cfd1d5', solidHandle: '#a2a7b0' },
  };
  function applyLook() {
    wrapper.setAttribute('data-theme', theme);
    const c = COLORS[theme] || COLORS.dark;
    const alpha = transparency > 0 ? (1 - transparency / 100) : 1;
    if (transparency > 0) {
      wrapper.style.background = `rgba(${c.bg},${alpha})`;
      wrapper.style.boxShadow = 'none';
    } else {
      wrapper.style.background = c.solidBg;
      wrapper.style.boxShadow = '0 12px 40px rgba(0,0,0,0.45)';
    }
    wrapper.style.backdropFilter = 'none';
    wrapper.style.webkitBackdropFilter = 'none';
    handle.style.background = c.solidHandle;
    handle.style.color = theme === 'light' ? '#111214' : '#eceef2';
    handle.style.borderBottom = theme === 'light' ? '1px solid rgba(17,18,20,0.22)' : '1px solid rgba(255,255,255,0.12)';
    btnTheme.innerHTML = svg(theme === 'light' ? ICON.moon : ICON.sun, 15, 24);
  }

  function syncBarStates() {
    btnTransp.classList.toggle('lfp-active', transparency > 0);
    const trLabel = (transparency > 0 ? 'Αδιαφάνεια' : 'Διαφάνεια') + ' (Alt+O)';
    btnTransp.title = trLabel;
    btnTransp.setAttribute('aria-label', trLabel);
    if (Number(sliderTransp.value) !== transparency) sliderTransp.value = String(transparency);
    transpVal.textContent = transparency + '%';
    transpVal.classList.toggle('at-magnet', transparency === 90);
    sliderTransp.title = `Βαθμός Διαφάνειας: ${transparency}%${transparency === 90 ? ' (Μαγνήτης 90%)' : ' (μαγνήτης στο 90%)'} — Alt+O εναλλαγή`;

    btnBlur.classList.toggle('lfp-active', blurEnabled);
    btnBlur.title = blurEnabled
      ? 'Θόλωμα (Τζαμαρία): ΕΝΕΡΓΟ — Κλικ για απενεργοποίηση (Alt+B)'
      : 'Θόλωμα (Τζαμαρία): ΑΝΕΝΕΡΓΟ — Κλικ για ενεργοποίηση (Alt+B)';

    btnToolbar.classList.toggle('lfp-active', toolbarHidden);
    const tbLabel = (toolbarHidden ? 'Εμφάνιση εργαλειοθήκης' : 'Απόκρυψη εργαλειοθήκης') + ' (Alt+K)';
    btnToolbar.title = tbLabel;
    btnToolbar.setAttribute('aria-label', tbLabel);

    btnPreview.classList.toggle('lfp-active', previewHidden);
    const pvLabel = (previewHidden ? 'Εμφάνιση ζωντανής προεπισκόπησης' : 'Απόκρυψη ζωντανής προεπισκόπησης') + ' (Alt+P)';
    btnPreview.title = pvLabel;
    btnPreview.setAttribute('aria-label', pvLabel);
  }

  function syncPanelAnchors() {
    if (minimized) return;
    postToPanel({
      type: M_ACTION,
      action: 'set-panel-anchors',
      settingsLeft: anchorLeftFor(btnSettings),
      recentLeft: anchorLeftFor(btnRecent),
    });
  }

  function syncAllToIframe() {
    postToPanel({ type: M_ACTION, action: 'set-theme', theme });
    postToPanel({ type: M_ACTION, action: 'set-transparency', level: transparency });
    postToPanel({ type: M_ACTION, action: 'set-blur', enabled: blurEnabled });
    postToPanel({ type: M_ACTION, action: 'set-toolbar-hidden', hidden: toolbarHidden });
    postToPanel({ type: M_ACTION, action: 'set-preview-hidden', hidden: previewHidden });
    syncPanelAnchors();
  }

  try {
    storageLocal?.get([K_GEOM, K_THEME, K_TRANSP, K_BLUR, K_TB_HIDDEN, K_PV_HIDDEN], res => {
      if (res[K_GEOM]) Object.assign(geo, res[K_GEOM]);
      theme = res[K_THEME] === 'light' ? 'light' : 'dark';
      transparency = typeof res[K_TRANSP] === 'number' ? Math.max(0, Math.min(100, res[K_TRANSP])) : 0;
      blurEnabled = res[K_BLUR] === false ? false : true;
      toolbarHidden = Boolean(res[K_TB_HIDDEN]);
      previewHidden = Boolean(res[K_PV_HIDDEN]);
      clampGeo(geo);
      Object.assign(wrapper.style, { left: geo.left + 'px', top: geo.top + 'px', width: geo.width + 'px', height: geo.height + 'px' });
      savedHeight = geo.height;
      applyLook();
      syncBarStates();
      syncAllToIframe();
    });
    if (storageOnChanged) {
      const h = (changes, area) => {
        if (area !== 'local') return;
        let changedLook = false;
        if (changes[K_THEME]) { theme = changes[K_THEME].newValue === 'light' ? 'light' : 'dark'; changedLook = true; }
        if (changes[K_TRANSP]) { transparency = Math.max(0, Math.min(100, Number(changes[K_TRANSP].newValue) || 0)); changedLook = true; }
        if (changes[K_BLUR]) { blurEnabled = changes[K_BLUR].newValue === false ? false : true; changedLook = true; }
        if (changes[K_TB_HIDDEN]) toolbarHidden = Boolean(changes[K_TB_HIDDEN].newValue);
        if (changes[K_PV_HIDDEN]) previewHidden = Boolean(changes[K_PV_HIDDEN].newValue);
        if (changedLook) applyLook();
        syncBarStates();
      };
      storageOnChanged.addListener(h);
      storageUnsub = () => storageOnChanged.removeListener(h);
    }
  } catch { }

  let initialFocusPending = true;
  setTimeout(() => { initialFocusPending = false; }, 900);
  add(document, 'pointerdown', e => {
    if (!wrapper.contains(e.target)) initialFocusPending = false;
  }, true);
  add(window, 'keyup', e => {
    if (!initialFocusPending) return;
    if (e.code === 'KeyY' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Meta') {
      requestAnimationFrame(focusEditorInPanel);
    }
  }, true);
  iframe.addEventListener('load', () => {
    syncAllToIframe();
    focusEditorInPanel();
    if (initialFocusPending) {
      setTimeout(() => { if (initialFocusPending) focusEditorInPanel(); }, 60);
      setTimeout(() => { if (initialFocusPending) focusEditorInPanel(); }, 180);
      setTimeout(() => { if (initialFocusPending) focusEditorInPanel(); }, 340);
    }
  });

  const ensureUnminimized = () => { if (minimized) btnMin.click(); };
  const anchorLeftFor = btn => Math.round(btn.getBoundingClientRect().left - iframe.getBoundingClientRect().left);

  btnSettings.addEventListener('click', e => { e.stopPropagation(); ensureUnminimized(); postToPanel({ type: M_ACTION, action: 'toggle-settings', anchorLeft: anchorLeftFor(btnSettings) }); });
  btnRecent.addEventListener('click', e => { e.stopPropagation(); ensureUnminimized(); postToPanel({ type: M_ACTION, action: 'toggle-recent', anchorLeft: anchorLeftFor(btnRecent) }); });
  btnNotepad.addEventListener('click', e => { e.stopPropagation(); ensureUnminimized(); postToPanel({ type: M_ACTION, action: 'toggle-notepad' }); requestAnimationFrame(focusEditorInPanel); });

  const snapTransparency = raw => {
    const v = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    return v >= 88 && v <= 96 ? 90 : v;
  };

  const applyTransp = (lvl, persistLevel) => {
    transparency = Math.max(0, Math.min(100, Math.round(Number(lvl) || 0)));
    applyLook(); syncBarStates();
    postToPanel({ type: M_ACTION, action: 'set-transparency', level: transparency });
    if (persistLevel) { try { storageLocal?.set({ [K_TRANSP]: transparency }); } catch { } }
  };

  btnTransp.addEventListener('click', e => { e.stopPropagation(); applyTransp(transparency > 0 ? 0 : 45, true); requestAnimationFrame(focusEditorInPanel); });
  sliderTransp.addEventListener('input', e => {
    e.stopPropagation();
    const snapped = snapTransparency(sliderTransp.value);
    sliderTransp.value = String(snapped);
    applyTransp(snapped, false);
  });
  sliderTransp.addEventListener('change', e => {
    e.stopPropagation();
    const snapped = snapTransparency(sliderTransp.value);
    sliderTransp.value = String(snapped);
    applyTransp(snapped, true);
    requestAnimationFrame(focusEditorInPanel);
  });
  sliderTransp.addEventListener('keydown', e => {
    if (transparency === 90) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        applyTransp(100, true);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        applyTransp(85, true);
      }
    }
  });

  btnBlur.addEventListener('click', e => {
    e.stopPropagation();
    blurEnabled = !blurEnabled;
    if (blurEnabled && transparency === 0) applyTransp(40, true);
    else applyLook();
    syncBarStates();
    try { storageLocal?.set({ [K_BLUR]: blurEnabled }); } catch { }
    postToPanel({ type: M_ACTION, action: 'set-blur', enabled: blurEnabled });
    requestAnimationFrame(focusEditorInPanel);
  });

  btnPreview.addEventListener('click', e => {
    e.stopPropagation(); previewHidden = !previewHidden; syncBarStates();
    try { storageLocal?.set({ [K_PV_HIDDEN]: previewHidden }); } catch { }
    postToPanel({ type: M_ACTION, action: 'set-preview-hidden', hidden: previewHidden });
    requestAnimationFrame(focusEditorInPanel);
  });
  btnToolbar.addEventListener('click', e => {
    e.stopPropagation(); toolbarHidden = !toolbarHidden; syncBarStates();
    try { storageLocal?.set({ [K_TB_HIDDEN]: toolbarHidden }); } catch { }
    postToPanel({ type: M_ACTION, action: 'set-toolbar-hidden', hidden: toolbarHidden });
    requestAnimationFrame(focusEditorInPanel);
  });
  btnTheme.addEventListener('click', e => {
    e.stopPropagation(); theme = theme === 'light' ? 'dark' : 'light'; applyLook();
    try { storageLocal?.set({ [K_THEME]: theme }); } catch { }
    postToPanel({ type: M_ACTION, action: 'set-theme', theme });
    requestAnimationFrame(focusEditorInPanel);
  });

  let ssTX = 0, ssTY = 0, ssRaf = null, ssLastT = 0, ssLastRaf = 0, ssProgY = -1, ssPending = false;
  const SS_EASE = 0.40, SS_SNAP = 1;
  const ssClamp = () => {
    const root = document.scrollingElement || document.documentElement;
    ssTX = Math.max(0, Math.min(ssTX, root.scrollWidth - innerWidth));
    ssTY = Math.max(0, Math.min(ssTY, root.scrollHeight - innerHeight));
  };
  const ssSet = (x, y) => {
    const root = document.scrollingElement || document.documentElement;
    ssProgY = Math.round(y); ssPending = true;
    root.scrollLeft = Math.round(x); root.scrollTop = ssProgY;
    requestAnimationFrame(() => { ssPending = false; });
  };
  function ssLoop(now) {
    ssRaf = null; ssLastRaf = now;
    if (!ssLastT) ssLastT = now - 16.667;
    const dt = Math.max(1, Math.min(50, now - ssLastT)); ssLastT = now;
    const dx = ssTX - scrollX, dy = ssTY - scrollY;
    if (Math.abs(dx) < SS_SNAP && Math.abs(dy) < SS_SNAP) { if (dx || dy) ssSet(ssTX, ssTY); return; }
    const t = 1 - Math.pow(1 - SS_EASE, dt / 16.667);
    ssSet(scrollX + dx * t, scrollY + dy * t);
    ssRaf = requestAnimationFrame(ssLoop);
  }
  function ssStop() {
    if (ssRaf !== null) { cancelAnimationFrame(ssRaf); ssRaf = null; }
    ssLastT = 0; ssTX = scrollX; ssTY = scrollY;
  }
  function ssBy(dx, dy) {
    if (ssRaf !== null && performance.now() - ssLastRaf > 150) { cancelAnimationFrame(ssRaf); ssRaf = null; }
    if (ssRaf === null) { ssTX = scrollX; ssTY = scrollY; ssLastT = 0; }
    ssTX += dx; ssTY += dy; ssClamp();
    if (ssRaf === null) ssRaf = requestAnimationFrame(ssLoop);
  }
  add(window, 'scroll', () => {
    if (ssRaf === null) return;
    if (ssPending && Math.abs(scrollY - ssProgY) <= 2) return;
    ssStop();
  }, { passive: true });
  add(window, 'wheel', e => { if (!e.ctrlKey && !e.metaKey) ssStop(); }, { passive: true });
  add(document, 'visibilitychange', () => { if (document.hidden) ssStop(); });
  add(window, 'blur', ssStop);

  add(window, 'message', e => {
    if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
    const d = e.data;
    if (d?.type === 'latex-panel-ready') {
      focusEditorInPanel();
      return;
    }
    if (d?.type === 'latex-panel-reader-mode') {
      if (d.active) {
        ensureUnminimized();
        if (!fullscreen) { readerOpenedFs = true; btnFull.click(); }
      } else {
        if (readerOpenedFs && fullscreen) { readerOpenedFs = false; btnFull.click(); }
        else { readerOpenedFs = false; }
        requestAnimationFrame(focusEditorInPanel);
      }
      return;
    }
    if (d?.type === M_POPUP_STATE) {
      btnSettings.classList.toggle('lfp-active', Boolean(d.settingsOpen));
      btnRecent.classList.toggle('lfp-active', Boolean(d.recentOpen));
      btnNotepad.classList.toggle('lfp-active', Boolean(d.notepadOpen));
      return;
    }
    if (d?.type === M_SCROLL) { ssBy(d.deltaX || 0, d.deltaY || 0); return; }
    if (d?.type !== M_SIZE || fullscreen) return;
    const maxH = Math.max(240, document.documentElement.clientHeight - HANDLE_H - 16);
    if (typeof d.height === 'number' && d.height > 0) dynamicMinH = Math.max(360, Math.min(maxH, Math.round(d.height)));
    if (!minimized && wrapper.getBoundingClientRect().height < Math.min(dynamicMinH, maxH)) {
      wrapper.style.height = Math.min(dynamicMinH, maxH) + 'px';
      savedHeight = wrapper.offsetHeight;
      const r = wrapper.getBoundingClientRect();
      if (r.top + r.height > document.documentElement.clientHeight)
        wrapper.style.top = Math.max(0, document.documentElement.clientHeight - r.height) + 'px';
    }
  });

  const setIcon = (btn, icon, label) => { btn.innerHTML = svg(icon, 14, 14); btn.title = label; btn.setAttribute('aria-label', label); };
  function persist() {
    if (fullscreen) return;
    const r = wrapper.getBoundingClientRect();
    try {
      storageLocal?.set({
        [K_GEOM]: {
          left: Math.round(r.left), top: Math.round(r.top),
          width: Math.max(MIN_W, Math.round(r.width)),
          height: Math.max(dynamicMinH, Math.round(minimized ? savedHeight : r.height)),
        }
      });
    } catch { }
  }

  btnMin.addEventListener('click', e => {
    e.stopPropagation(); ssStop();
    if (fullscreen) btnFull.click();
    if (minimized) {
      const ch = document.documentElement.clientHeight;
      const h = Math.max(Math.min(dynamicMinH, ch - HANDLE_H - 16), Math.min(savedHeight, ch - HANDLE_H - 16));
      wrapper.style.height = h + 'px';
      iframe.style.display = 'block'; resizeHandle.style.display = 'flex';
      if (!transparency) wrapper.style.boxShadow = '0 12px 40px rgba(0,0,0,0.45)';
      const r = wrapper.getBoundingClientRect();
      if (r.top + r.height > ch - 8) wrapper.style.top = Math.max(0, ch - r.height - 8) + 'px';
      minimized = false; setIcon(btnMin, ICON.min, 'Ελαχιστοποίηση');
    } else {
      postToPanel({ type: M_ACTION, action: 'close-popups' });
      savedHeight = wrapper.offsetHeight;
      wrapper.style.height = HANDLE_H + 'px';
      iframe.style.display = 'none'; resizeHandle.style.display = 'none';
      wrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
      minimized = true; setIcon(btnMin, ICON.restore, 'Επαναφορά');
    }
    persist();
  });

  btnFull.addEventListener('click', e => {
    e.stopPropagation(); ssStop();
    fullscreen = !fullscreen;
    if (fullscreen) {
      preFsGeo = { left: wrapper.offsetLeft, top: wrapper.offsetTop, width: wrapper.offsetWidth, height: minimized ? savedHeight : wrapper.offsetHeight };
      if (minimized) { minimized = false; iframe.style.display = 'block'; setIcon(btnMin, ICON.min, 'Ελαχιστοποίηση'); }
      wrapper.style.transition = 'none';
      wrapper.style.left = '0px'; wrapper.style.top = '0px';
      wrapper.style.width = document.documentElement.clientWidth + 'px';
      wrapper.style.height = document.documentElement.clientHeight + 'px';
      wrapper.style.borderRadius = '0'; resizeHandle.style.display = 'none'; handle.style.cursor = 'default';
      setIcon(btnFull, ICON.exit, 'Έξοδος από Πλήρη Οθόνη');
    } else {
      const t = preFsGeo || { left: 80, top: 80, width: 580, height: 660 };
      const cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
      const w = Math.min(t.width, Math.max(MIN_W, cw - 16));
      const h = Math.min(t.height, Math.max(dynamicMinH, ch - HANDLE_H - 16));
      wrapper.style.transition = 'none';
      wrapper.style.left = Math.max(0, Math.min(t.left, cw - w)) + 'px';
      wrapper.style.top = Math.max(0, Math.min(t.top, ch - h)) + 'px';
      wrapper.style.width = w + 'px'; wrapper.style.height = h + 'px';
      minimized = false; iframe.style.display = 'block'; resizeHandle.style.display = 'flex';
      wrapper.style.borderRadius = '10px'; handle.style.cursor = 'grab';
      savedHeight = wrapper.offsetHeight;
      setIcon(btnMin, ICON.min, 'Ελαχιστοποίηση'); setIcon(btnFull, ICON.full, 'Πλήρης Οθόνη');
      persist();
    }
    requestAnimationFrame(() => { wrapper.style.transition = 'height .18s ease, box-shadow .18s ease'; });
  });

  btnClose.addEventListener('click', e => {
    e.stopPropagation();
    try { iframe.contentWindow.postMessage({ type: M_CLOSE }, '*'); } catch { }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      teardown();
      wrapper.remove();
      try { storageLocal?.remove('latex_editor_text'); } catch { }
    }));
  });

  let drag = null;
  add(handle, 'pointerdown', e => {
    if (e.button !== 0 || fullscreen || e.target.closest('button, input')) return;
    postToPanel({ type: M_ACTION, action: 'close-popups' });
    drag = { x: e.clientX, y: e.clientY, l: wrapper.offsetLeft, t: wrapper.offsetTop };
    handle.setPointerCapture(e.pointerId);
    handle.style.cursor = 'grabbing'; iframe.style.pointerEvents = 'none'; e.preventDefault();
  });
  add(handle, 'pointermove', e => {
    if (!drag) return;
    const w = wrapper.offsetWidth, h = minimized ? HANDLE_H : wrapper.offsetHeight;
    const cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
    wrapper.style.left = Math.max(0, Math.min(drag.l + e.clientX - drag.x, cw - w)) + 'px';
    wrapper.style.top = Math.max(0, Math.min(drag.t + e.clientY - drag.y, ch - h)) + 'px';
  });
  const endDrag = e => {
    if (!drag) return; drag = null;
    try { handle.releasePointerCapture(e.pointerId); } catch { }
    handle.style.cursor = 'grab'; iframe.style.pointerEvents = ''; persist();
  };
  add(handle, 'pointerup', endDrag); add(handle, 'pointercancel', endDrag);

  let rs = null;
  add(resizeHandle, 'pointerdown', e => {
    if (e.button !== 0 || fullscreen) return;
    rs = { x: e.clientX, y: e.clientY, w: wrapper.offsetWidth, h: wrapper.offsetHeight };
    wrapper.style.transition = 'none';
    resizeHandle.setPointerCapture(e.pointerId);
    iframe.style.pointerEvents = 'none'; e.preventDefault(); e.stopPropagation();
  });
  add(resizeHandle, 'pointermove', e => {
    if (!rs) return;
    const cw = document.documentElement.clientWidth, ch = document.documentElement.clientHeight;
    const minW = Math.min(MIN_W, cw - 16), minH = Math.min(dynamicMinH, ch - HANDLE_H - 16);
    wrapper.style.width = Math.max(minW, Math.min(rs.w + e.clientX - rs.x, cw - wrapper.offsetLeft - 8)) + 'px';
    wrapper.style.height = Math.max(minH, Math.min(rs.h + e.clientY - rs.y, ch - wrapper.offsetTop - 8)) + 'px';
    savedHeight = wrapper.offsetHeight;
  });
  const endResize = e => {
    if (!rs) return; rs = null;
    try { resizeHandle.releasePointerCapture(e.pointerId); } catch { }
    iframe.style.pointerEvents = '';
    wrapper.style.transition = 'height .18s ease, box-shadow .18s ease'; persist();
    syncPanelAnchors();
  };
  add(resizeHandle, 'pointerup', endResize); add(resizeHandle, 'pointercancel', endResize);

  add(window, 'resize', () => {
    if (fullscreen) {
      wrapper.style.width = document.documentElement.clientWidth + 'px';
      wrapper.style.height = document.documentElement.clientHeight + 'px';
      syncPanelAnchors();
      return;
    }
    if (minimized) return;
    const clamped = clampGeo({ left: wrapper.offsetLeft, top: wrapper.offsetTop, width: wrapper.offsetWidth, height: wrapper.offsetHeight });
    Object.assign(wrapper.style, {
      left: clamped.left + 'px',
      top: clamped.top + 'px',
      width: clamped.width + 'px',
      height: clamped.height + 'px',
    });
    savedHeight = clamped.height;
    syncPanelAnchors();
  });
})();
