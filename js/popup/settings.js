import { KEYS, LIMITS, DEFAULTS } from '../core/constants.js';
import { mirrorGet, mirrorSet, get, set, onChanged } from '../core/storage.js';
import { $, on, clamp } from '../core/dom.js';
import { computeAutoScale } from '../core/scale.js';

export const state = {
  ta: null, previewWrap: null, preview: null,
  alignLeft: false,
  toolbarScale: 1, toolbarScaleAuto: true,
  previewScale: 1, previewScaleAuto: true,
  editorScale: 1, editorScaleAuto: true,
  notepadScale: 1, notepadScaleAuto: true,
  notepadPreviewScale: 1, notepadPreviewScaleAuto: true,
  recent: [], dataset: DEFAULTS.dataset,
  userScrolled: false,
  notepadUserScrolled: false,
};

const SCALE_PROP = {
  toolbar: 'toolbarScale',
  preview: 'previewScale',
  editor: 'editorScale',
  notepad: 'notepadScale',
  notepadPreview: 'notepadPreviewScale',
};
const SCALE_KEY = {
  toolbar: { scale: KEYS.toolbarScale, auto: KEYS.toolbarScaleAuto },
  preview: { scale: KEYS.previewZoom, auto: KEYS.previewZoomAuto },
  editor: { scale: KEYS.editorScale, auto: KEYS.editorScaleAuto },
  notepad: { scale: KEYS.notepadScale, auto: KEYS.notepadScaleAuto },
  notepadPreview: { scale: KEYS.notepadPreviewScale, auto: KEYS.notepadPreviewScaleAuto },
};

const persist = (key, value) => set(key, value);

export function applyTheme(theme, shouldPersist = true) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  window.__renderPreview?.();
  window.__renderHybridPreview?.();
  if (shouldPersist) persist(KEYS.theme, t);
  else mirrorSet(KEYS.theme, t);
}

export function snapTransparency(raw) {
  const v = clamp(Math.round(Number(raw) || 0), 0, 100);
  return v >= 88 && v <= 96 ? 90 : v;
}

export function applyTransparency(lvl, shouldPersist = true) {
  const level = clamp(Math.round(Number(lvl) || 0), 0, 100);
  document.documentElement.setAttribute('data-transparent', level > 0 ? 'true' : 'false');
  document.documentElement.style.setProperty('--panel-alpha', level > 0 ? 1 - level / 100 : 1);
  const trT = $('#transparency-toggle');
  const trS = $('#transparency-slider');
  const trV = $('#transparency-val');
  if (trT) {
    trT.classList.toggle('active', level > 0);
    trT.title = (level > 0 ? 'Αδιαφάνεια' : 'Διαφάνεια') + ' (Alt+O)';
  }
  if (trS) {
    if (Number(trS.value) !== level) trS.value = String(level);
    trS.title = `Βαθμός Διαφάνειας: ${level}%${level === 90 ? ' (Μαγνήτης 90%)' : ' (μαγνήτης στο 90%)'}`;
  }
  if (trV) {
    trV.textContent = `${level}%`;
    trV.classList.toggle('at-magnet', level === 90);
  }
  if (shouldPersist) persist(KEYS.transparency, level);
  else mirrorSet(KEYS.transparency, level);
}

export function applyBlur(enabled, shouldPersist = true) {
  const b = enabled === false ? false : true;
  document.documentElement.setAttribute('data-blur', b ? 'true' : 'false');
  const btn = $('#blur-toggle');
  if (btn) {
    btn.classList.toggle('active', b);
    btn.title = (b ? 'Θόλωμα (Τζαμαρία): ΕΝΕΡΓΟ' : 'Θόλωμα (Τζαμαρία): ΑΝΕΝΕΡΓΟ') + ' (Alt+B)';
  }
  if (shouldPersist) persist(KEYS.blurEnabled, b);
  else mirrorSet(KEYS.blurEnabled, b);
}

export function applyToolbarHidden(hidden, shouldPersist = true) {
  const h = Boolean(hidden);
  const target = $('#toolbars-container');
  const btn = $('#toolbar-toggle');
  if (target) target.classList.toggle('hidden', h);
  if (btn) { btn.classList.toggle('active', h); btn.title = (h ? 'Εμφάνιση εργαλειοθήκης' : 'Απόκρυψη εργαλειοθήκης') + ' (Alt+K)'; }
  if (shouldPersist) persist(KEYS.toolbarHidden, h);
  else mirrorSet(KEYS.toolbarHidden, h);
}

export function applyPreviewHidden(hidden, shouldPersist = true) {
  const h = Boolean(hidden);
  const target = $('.preview-outer');
  const rz = $('#resizer-middle');
  const npTarget = $('#notepad-preview-outer');
  const npRz = $('#notepad-resizer');
  const btn = $('#preview-toggle');
  if (target) target.classList.toggle('hidden', h);
  if (rz) rz.classList.toggle('hidden', h);
  if (npTarget) npTarget.classList.toggle('hidden', h);
  if (npRz) npRz.classList.toggle('hidden', h);
  if (btn) { btn.classList.toggle('active', h); btn.title = (h ? 'Εμφάνιση ζωντανής προεπισκόπησης' : 'Απόκρυψη ζωντανής προεπισκόπησης') + ' (Alt+P)'; }
  if (shouldPersist) persist(KEYS.previewHidden, h);
  else mirrorSet(KEYS.previewHidden, h);
}

export async function load() {
  try {
    const r = await get(Object.values(KEYS));
    state.alignLeft = r[KEYS.alignLeft] ?? mirrorGet(KEYS.alignLeft, 'bool') ?? false;
    state.dataset = r[KEYS.dataset] || DEFAULTS.dataset;
    state.recent = Array.isArray(r[KEYS.recent]) ? r[KEYS.recent] : (mirrorGet(KEYS.recent, 'json') || []);

    applyTheme(r[KEYS.theme] ?? mirrorGet(KEYS.theme) ?? DEFAULTS.theme, false);
    applyTransparency(r[KEYS.transparency] ?? mirrorGet(KEYS.transparency, 'num') ?? DEFAULTS.transparency, false);
    applyBlur(r[KEYS.blurEnabled] ?? mirrorGet(KEYS.blurEnabled, 'bool') ?? true, false);
    applyToolbarHidden(r[KEYS.toolbarHidden] ?? mirrorGet(KEYS.toolbarHidden, 'bool') ?? false, false);
    applyPreviewHidden(r[KEYS.previewHidden] ?? mirrorGet(KEYS.previewHidden, 'bool') ?? false, false);

    const pick = (kind, apply) => {
      const autoKey = SCALE_KEY[kind].auto, valKey = SCALE_KEY[kind].scale;
      const auto = r[autoKey] ?? mirrorGet(autoKey, 'bool');
      const val = r[valKey] ?? mirrorGet(valKey, 'num');
      if (auto === true || (auto === undefined && typeof val !== 'number')) {
        apply(computeAutoScale(kind), true);
      } else {
        apply(clamp(typeof val === 'number' ? val : computeAutoScale(kind), LIMITS[kind].min, LIMITS[kind].max), false);
      }
    };
    pick('toolbar', (v, a) => { state.toolbarScale = v; state.toolbarScaleAuto = a; });
    pick('preview', (v, a) => { state.previewScale = v; state.previewScaleAuto = a; });
    pick('editor', (v, a) => { state.editorScale = v; state.editorScaleAuto = a; });
    pick('notepad', (v, a) => { state.notepadScale = v; state.notepadScaleAuto = a; });
    pick('notepadPreview', (v, a) => { state.notepadPreviewScale = v; state.notepadPreviewScaleAuto = a; });
  } catch (e) {
    console.warn('[settings.load] Failed:', e);
  }
}

export function applyVisuals() {
  try {
    document.documentElement.style.setProperty('--toolbar-scale', state.toolbarScale);
    if (state.ta) {
      state.ta.style.fontSize = (16 * state.editorScale) + 'px';
      window.__syncHighlightFont?.('latex-input');
    }
    const npTa = $('#notepad-input');
    const npPv = $('#notepad-preview');
    if (npTa) {
      npTa.style.fontSize = (16 * state.notepadScale).toFixed(2) + 'px';
      window.__syncHighlightFont?.('notepad-input');
    }
    if (npPv) {
      npPv.style.fontSize = (16 * state.notepadPreviewScale).toFixed(2) + 'px';
    }
    if (state.preview) state.preview.style.fontSize = state.previewScale + 'em';
    for (const [id, auto] of [
      ['toolbar-auto-badge', state.toolbarScaleAuto],
      ['preview-auto-badge', state.previewScaleAuto],
      ['editor-auto-badge', state.editorScaleAuto],
      ['notepad-auto-badge', state.notepadScaleAuto],
      ['notepad-text-auto-badge', state.notepadScaleAuto],
      ['notepad-preview-auto-badge', state.notepadPreviewScaleAuto],
      ['notepad-preview-inline-auto-badge', state.notepadPreviewScaleAuto],
    ]) {
      const b = $(`#${id}`);
      if (b) { b.classList.toggle('active', auto); b.setAttribute('aria-pressed', String(auto)); }
    }
    const zl = $('#zoom-label'); if (zl) zl.value = Math.round(state.previewScale * 100);
    const el = $('#editor-zoom-label'); if (el) el.value = Math.round(state.editorScale * 100);
    const nl = $('#notepad-zoom-label'); if (nl) nl.value = Math.round(state.notepadScale * 100);
    const ntl = $('#notepad-text-zoom-label'); if (ntl) ntl.value = Math.round(state.notepadScale * 100);
    const npl = $('#notepad-preview-zoom-label'); if (npl) npl.value = Math.round(state.notepadPreviewScale * 100);
    const npil = $('#notepad-preview-inline-zoom-label'); if (npil) npil.value = Math.round(state.notepadPreviewScale * 100);
    const tl = $('#toolbar-size-label'); if (tl) tl.value = Math.round(state.toolbarScale * 100);
  } catch { }
}

export function setSize(kind, value, isAuto) {
  const L = LIMITS[kind];
  const prop = SCALE_PROP[kind];
  const v = clamp(value, L.min, L.max);
  const changed = Math.abs(state[prop] - v) >= 1e-4 || state[`${prop}Auto`] !== isAuto;
  state[prop] = v;
  state[`${prop}Auto`] = isAuto;
  if (!changed) return;
  applyVisuals();
  persist(SCALE_KEY[kind].auto, isAuto);
  if (!isAuto) persist(SCALE_KEY[kind].scale, v);
}

export function bindControls(ac) {
  const sig = ac.signal;
  const step = (kind, dir) => setSize(kind, state[SCALE_PROP[kind]] + dir * LIMITS[kind].step, false);

  on($('#toolbar-size-down'), 'click', () => step('toolbar', -1), false, sig);
  on($('#toolbar-size-up'), 'click', () => step('toolbar', +1), false, sig);
  on($('#zoom-out'), 'click', () => step('preview', -1), false, sig);
  on($('#zoom-in'), 'click', () => step('preview', +1), false, sig);
  on($('#editor-zoom-out'), 'click', () => step('editor', -1), false, sig);
  on($('#editor-zoom-in'), 'click', () => step('editor', +1), false, sig);
  on($('#notepad-zoom-out'), 'click', () => step('notepad', -1), false, sig);
  on($('#notepad-zoom-in'), 'click', () => step('notepad', +1), false, sig);
  on($('#notepad-text-zoom-out'), 'click', () => step('notepad', -1), false, sig);
  on($('#notepad-text-zoom-in'), 'click', () => step('notepad', +1), false, sig);
  on($('#notepad-preview-zoom-out'), 'click', () => step('notepadPreview', -1), false, sig);
  on($('#notepad-preview-zoom-in'), 'click', () => step('notepadPreview', +1), false, sig);
  on($('#notepad-preview-inline-zoom-out'), 'click', () => step('notepadPreview', -1), false, sig);
  on($('#notepad-preview-inline-zoom-in'), 'click', () => step('notepadPreview', +1), false, sig);

  const num = (sel, kind) => {
    const i = $(sel); if (!i) return;
    const h = () => { const v = parseInt(i.value, 10); if (!Number.isNaN(v)) setSize(kind, v / 100, false); };
    on(i, 'change', h, false, sig);
    on(i, 'keydown', e => { if (e.key === 'Enter') i.blur(); }, false, sig);
  };
  num('#toolbar-size-label', 'toolbar'); num('#zoom-label', 'preview'); num('#editor-zoom-label', 'editor');
  num('#notepad-zoom-label', 'notepad'); num('#notepad-text-zoom-label', 'notepad');
  num('#notepad-preview-zoom-label', 'notepadPreview'); num('#notepad-preview-inline-zoom-label', 'notepadPreview');

  const auto = (sel, kind) => on($(sel), 'click', () => {
    const prop = SCALE_PROP[kind];
    if (state[`${prop}Auto`]) setSize(kind, state[prop], false);
    else setSize(kind, computeAutoScale(kind), true);
  }, false, sig);
  auto('#toolbar-auto-badge', 'toolbar'); auto('#preview-auto-badge', 'preview'); auto('#editor-auto-badge', 'editor');
  auto('#notepad-auto-badge', 'notepad'); auto('#notepad-text-auto-badge', 'notepad');
  auto('#notepad-preview-auto-badge', 'notepadPreview'); auto('#notepad-preview-inline-auto-badge', 'notepadPreview');

  const themeBtn = $('#theme-toggle');
  if (themeBtn) {
    on(themeBtn, 'click', () => {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
    }, false, sig);
  }

  const blurBtn = $('#blur-toggle');
  if (blurBtn) {
    on(blurBtn, 'click', () => {
      const next = document.documentElement.getAttribute('data-blur') === 'false';
      if (next) {
        const curT = parseInt($('#transparency-slider')?.value || '0', 10);
        if (curT === 0) applyTransparency(40, true);
      }
      applyBlur(next, true);
    }, false, sig);
  }

  const trT = $('#transparency-toggle'), trS = $('#transparency-slider');
  if (trT && trS) {
    on(trT, 'click', () => applyTransparency(parseInt(trS.value || '0', 10) > 0 ? 0 : 45, true), false, sig);
    on(trS, 'input', () => {
      const snapped = snapTransparency(trS.value);
      trS.value = String(snapped);
      applyTransparency(snapped, false);
    }, false, sig);
    on(trS, 'change', () => {
      const snapped = snapTransparency(trS.value);
      trS.value = String(snapped);
      applyTransparency(snapped, true);
    }, false, sig);
    on(trS, 'keydown', e => {
      const cur = parseInt(trS.value || '0', 10);
      if (cur === 90) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          applyTransparency(100, true);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          applyTransparency(85, true);
        }
      }
    }, false, sig);
  }

  const tbToggle = $('#toolbar-toggle');
  if (tbToggle) on(tbToggle, 'click', () => applyToolbarHidden(!$('#toolbars-container')?.classList.contains('hidden'), true), false, sig);

  const pvToggle = $('#preview-toggle');
  if (pvToggle) on(pvToggle, 'click', () => applyPreviewHidden(!$('.preview-outer')?.classList.contains('hidden'), true), false, sig);

  const unsub = onChanged(changes => {
    if (changes[KEYS.theme]) applyTheme(changes[KEYS.theme].newValue, false);
    if (changes[KEYS.transparency]) applyTransparency(changes[KEYS.transparency].newValue, false);
    if (changes[KEYS.blurEnabled]) applyBlur(changes[KEYS.blurEnabled].newValue, false);
    if (changes[KEYS.toolbarHidden]) applyToolbarHidden(changes[KEYS.toolbarHidden].newValue, false);
    if (changes[KEYS.previewHidden]) applyPreviewHidden(changes[KEYS.previewHidden].newValue, false);
  });
  sig.addEventListener('abort', unsub, { once: true });

  const al = $('#preview-inline-btn');
  const applyAlign = () => {
    if (state.previewWrap) state.previewWrap.classList.toggle('align-left', state.alignLeft);
    if (al) { al.classList.toggle('active', state.alignLeft); al.setAttribute('aria-pressed', String(state.alignLeft)); }
  };
  applyAlign();
  on(al, 'click', () => { state.alignLeft = !state.alignLeft; persist(KEYS.alignLeft, state.alignLeft); applyAlign(); window.__renderPreview?.(); }, false, sig);

  for (const [sel, key] of [['#tex-toggle', KEYS.texWrap], ['#inline-toggle', KEYS.textstyle], ['#displaystyle-toggle', KEYS.displaystyle]]) {
    const c = $(sel); if (c) on(c, 'change', () => persist(key, c.checked), false, sig);
  }

  const sb = $('#settings-btn'), tg = $('#toggle-group');
  on(sb, 'click', () => {
    if (!tg || !sb) return;
    const h = tg.classList.toggle('hidden'); sb.classList.toggle('active', h);
    persist(KEYS.settingsCollapsed, h); window.__reportNaturalSize?.(400);
  }, false, sig);

  const donateToggle = $('#settings-donate-toggle');
  const donateCard = $('#settings-donate-card');
  const donateCopy = $('#settings-donate-copy');
  if (donateToggle && donateCard) {
    on(donateToggle, 'click', e => {
      e.stopPropagation();
      const open = donateCard.classList.toggle('active');
      donateToggle.setAttribute('aria-expanded', String(open));
      const caret = donateToggle.querySelector('.donate-caret');
      if (caret) caret.textContent = open ? '▴' : '▾';
    }, false, sig);
  }
  if (donateCopy) {
    const DONATE_URL = "https://ko-fi.com/nikitask";
    on(donateCopy, 'click', async e => {
      e.stopPropagation();
      if (DONATE_URL && /^https?:\/\//i.test(DONATE_URL)) {
        if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
          chrome.tabs.create({ url: DONATE_URL });
        } else {
          window.open(DONATE_URL, '_blank', 'noopener');
        }
        return;
      }
      try { await navigator.clipboard?.writeText('Στήριξη ανάπτυξης — MathGlass'); } catch { }
      donateCopy.textContent = 'Ορίστε Donate URL!';
      setTimeout(() => { donateCopy.textContent = "☕ Κεράστε έναν καφέ"; }, 2000);
    }, false, sig);
  }
}