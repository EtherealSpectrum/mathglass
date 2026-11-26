import { KEYS, LIMITS, DEFAULTS, FONT_PRESETS, WINDOW_PRESETS } from '../core/constants.js';
import { mirrorGet, mirrorSet, get, set, remove, onChanged } from '../core/storage.js';
import { $, on, clamp } from '../core/dom.js';
import { computeAutoScale } from '../core/scale.js';

export const DONATE_URL = 'https://ko-fi.com/nikitask';

export function openDonatePage() {
  if (window.mathglassDesktop?.openExternal) {
    window.mathglassDesktop.openExternal(DONATE_URL);
    return;
  }
  const tabsApi = (typeof browser !== 'undefined' && browser.tabs?.create)
    ? browser.tabs
    : (typeof chrome !== 'undefined' && chrome.tabs?.create ? chrome.tabs : null);
  if (tabsApi) {
    try { tabsApi.create({ url: DONATE_URL }); return; } catch { }
  }
  const link = document.createElement('a');
  link.href = DONATE_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
}

export const state = {
  ta: null, previewWrap: null, preview: null,
  alignLeft: false,
  previewEditEnabled: true,
  intuitiveNavEnabled: true,
  previewNavActive: false,
  previewClickCursorLock: false,
  notepadLayout: 'right',
  sansFont: 'default',
  monoFont: 'default',
  windowPreset: 'default',
  autoBracesEnabled: true,
  previewFollowEnabled: true,
  previewCaretEnabled: true,
  slotHintsEnabled: true,
  toolbarScale: 1, toolbarScaleAuto: true,
  previewScale: 1, previewScaleAuto: true,
  editorScale: 1, editorScaleAuto: true,
  notepadScale: 1, notepadScaleAuto: true,
  notepadPreviewScale: 1, notepadPreviewScaleAuto: true,
  notepadToolbarScale: 1, notepadToolbarScaleAuto: true,
  headerBtnScale: 1, headerBtnScaleAuto: true,
  recent: [],
  equationHistory: [],
  favoriteEquations: [],
  dataset: DEFAULTS.dataset,
  userScrolled: false,
  notepadUserScrolled: false,
};

const SCALE_PROP = {
  toolbar: 'toolbarScale',
  preview: 'previewScale',
  editor: 'editorScale',
  notepad: 'notepadScale',
  notepadPreview: 'notepadPreviewScale',
  notepadToolbar: 'notepadToolbarScale',
  headerBtn: 'headerBtnScale',
};
const SCALE_KEY = {
  toolbar: { scale: KEYS.toolbarScale, auto: KEYS.toolbarScaleAuto },
  preview: { scale: KEYS.previewZoom, auto: KEYS.previewZoomAuto },
  editor: { scale: KEYS.editorScale, auto: KEYS.editorScaleAuto },
  notepad: { scale: KEYS.notepadScale, auto: KEYS.notepadScaleAuto },
  notepadPreview: { scale: KEYS.notepadPreviewScale, auto: KEYS.notepadPreviewScaleAuto },
  notepadToolbar: { scale: KEYS.notepadToolbarScale, auto: KEYS.notepadToolbarScaleAuto },
  headerBtn: { scale: KEYS.headerBtnScale, auto: KEYS.headerBtnScaleAuto },
};

const persist = (key, value) => set(key, value);

export function applyTheme(theme, shouldPersist = true) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  window.__renderPreview?.(false);
  window.__renderHybridPreview?.(true, false);
  window.__refreshNotepadCaret?.();
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
  document.documentElement.setAttribute('data-full-transparent', level >= 100 ? 'true' : 'false');
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
  if (window.mathglassDesktop?.isDesktop) {
    document.documentElement.setAttribute('data-blur', 'false');
    return;
  }
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

export function applyNotepadToolbarHidden(hidden, shouldPersist = true) {
  const h = Boolean(hidden);
  const target = $('#phpbb-toolbar');
  const btn = $('#notepad-toolbar-toggle-btn');
  if (target) target.classList.toggle('hidden', h);
  if (h) {
    $('#phpbb-headings-menu')?.classList.remove('active');
    $('#phpbb-size-menu')?.classList.remove('active');
    $('#phpbb-color-menu')?.classList.remove('active');
  }
  if (btn) {
    btn.classList.toggle('active', !h);
    btn.setAttribute('aria-pressed', String(!h));
    btn.title = (h ? 'Εμφάνιση' : 'Απόκρυψη') + ' εργαλειοθήκης σημειωματάριου phpBB (Alt+G)';
  }
  requestAnimationFrame(() => window.__refreshNotepadCaret?.());
  if (shouldPersist) persist(KEYS.notepadToolbarHidden, h);
  else mirrorSet(KEYS.notepadToolbarHidden, h);
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
  if (!h) {
    requestAnimationFrame(() => {
      window.__renderPreview?.(false);
      window.__renderHybridPreview?.(true, false);
    });
  }
  if (shouldPersist) persist(KEYS.previewHidden, h);
  else mirrorSet(KEYS.previewHidden, h);
}

export function syncNavIndicators() {
  const allowed = state.previewEditEnabled !== false;
  const applyLed = (el, active) => {
    if (!el) return;
    const on = Boolean(allowed && active);
    el.classList.toggle('is-on', on);
    el.classList.toggle('is-locked-off', !allowed);
    const labelEl = el.querySelector('.mg-nav-text');
    if (labelEl) {
      labelEl.textContent = !allowed ? 'Κλειδωμένο' : (on ? 'Προεπισκόπηση' : 'Κώδικας');
    }
    if (!allowed) {
      el.title = 'Επεξεργασία από Προεπισκόπηση: ΚΛΕΙΔΩΜΕΝΗ (Alt+I για ξεκλείδωμα)';
    } else if (on) {
      el.title = 'Ενεργός τρόπος γραφής: Ζωντανή Προεπισκόπηση WYSIWYG — οι τροποποιήσεις γράφονται απευθείας στην προεπισκόπηση (κλικ στον κώδικα για επαναφορά)';
    } else {
      el.title = 'Ενεργός τρόπος γραφής: Κώδικας — κάντε κλικ στη ζωντανή προεπισκόπηση για επεξεργασία WYSIWYG';
    }
  };
  applyLed($('#preview-nav-indicator'), state.previewNavActive);
  const inWysiwyg = document.body.classList.contains('notepad-reader-edit');
  const npAllowed = inWysiwyg || state.previewEditEnabled !== false;
  const npEl = $('#notepad-nav-indicator');
  if (npEl) {
    const on = Boolean(npAllowed && (inWysiwyg || window.__isNotepadPreviewNavActive?.()));
    npEl.classList.toggle('is-on', on);
    npEl.classList.toggle('is-locked-off', !npAllowed);
    const labelEl = npEl.querySelector('.mg-nav-text');
    if (labelEl) {
      labelEl.textContent = !npAllowed ? 'Κλειδωμένο' : (on ? 'Προεπισκόπηση' : 'Κώδικας');
    }
    if (!npAllowed) {
      npEl.title = 'Επεξεργασία από Προεπισκόπηση: ΚΛΕΙΔΩΜΕΝΗ (Alt+I για ξεκλείδωμα)';
    } else if (on) {
      npEl.title = 'Ενεργός τρόπος γραφής: Ζωντανή Προεπισκόπηση WYSIWYG — οι τροποποιήσεις γράφονται απευθείας στην προεπισκόπηση (κλικ στον κώδικα για επαναφορά)';
    } else {
      npEl.title = 'Ενεργός τρόπος γραφής: Κώδικας — κάντε κλικ στη ζωντανή προεπισκόπηση για επεξεργασία WYSIWYG';
    }
  }
}
window.__syncNavIndicators = syncNavIndicators;

export function applyPreviewEdit(enabled, shouldPersist = true) {
  const on = enabled === false ? false : true;
  state.previewEditEnabled = on;
  state.intuitiveNavEnabled = on;
  if (!on) {
    state.previewNavActive = false;
    window.__setNotepadPreviewNav?.(false);
  }
  for (const sel of ['#preview-edit-btn', '#notepad-preview-edit-btn']) {
    const el = $(sel);
    if (!el) continue;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', String(on));
    el.title = (on
      ? 'Επεξεργασία από Προεπισκόπηση: ΕΝΕΡΓΗ — Κλικ στη ζωντανή προεπισκόπηση για άμεση WYSIWYG τροποποίηση'
      : 'Επεξεργασία από Προεπισκόπηση: ΚΛΕΙΔΩΜΕΝΗ — Μόνο προβολή (κλικ για ενεργοποίηση τροποποιήσεων από την προεπισκόπηση)') + ' (Alt+I)';
  }
  const sBtn = $('#preview-edit-toggle');
  if (sBtn) {
    sBtn.classList.toggle('active', on);
    sBtn.setAttribute('aria-pressed', String(on));
    sBtn.textContent = on ? 'Επεξεργασία από Προεπισκόπηση: ΕΝΕΡΓΗ' : 'Επεξεργασία από Προεπισκόπηση: ΑΝΕΝΕΡΓΗ';
  }
  syncNavIndicators();
  if (shouldPersist) persist(KEYS.previewEdit, on);
  else mirrorSet(KEYS.previewEdit, on);
}
export const applyIntuitiveNav = applyPreviewEdit;

export function applyPreviewClickCursorLock(enabled, shouldPersist = true) {
  const lock = enabled === true;
  state.previewClickCursorLock = lock;
  document.documentElement.setAttribute('data-cursor-lock', lock ? 'true' : 'false');
  for (const sel of ['#preview-click-lock-btn', '#notepad-preview-click-lock-btn']) {
    const el = $(sel);
    if (!el) continue;
    el.classList.toggle('active', lock);
    el.setAttribute('aria-pressed', String(lock));
    el.title = (lock
      ? 'Κέρσορας στην Προεπισκόπηση: ΚΛΕΙΔΩΜΕΝΟΣ — Το κλικ/επιλογή στην προεπισκόπηση ΔΕΝ μετακινεί τον κέρσορα κώδικα ώστε να αντιγράφετε ελεύθερα'
      : 'Κέρσορας στην Προεπισκόπηση: ΕΛΕΥΘΕΡΟΣ — Όταν ενεργοποιηθεί, το κλικ/επιλογή στην προεπισκόπηση ΔΕΝ μετακινεί τον κέρσορα κώδικα ώστε να αντιγράφετε ελεύθερα') + ' (Alt+Shift+E)';
  }
  const sBtn = $('#preview-click-lock-toggle');
  if (sBtn) {
    sBtn.classList.toggle('active', lock);
    sBtn.setAttribute('aria-pressed', String(lock));
    sBtn.textContent = lock
      ? 'Σταθερός Κέρσορας Προεπισκόπησης: ΕΝΕΡΓΟΣ'
      : 'Σταθερός Κέρσορας Προεπισκόπησης: ΑΝΕΝΕΡΓΟΣ';
  }
  if (shouldPersist) persist(KEYS.previewClickLock, lock);
  else mirrorSet(KEYS.previewClickLock, lock);
}

export function applyNotepadLayout(layout, shouldPersist = true) {
  const lay = layout === 'bottom' ? 'bottom' : 'right';
  state.notepadLayout = lay;
  document.documentElement.setAttribute('data-notepad-layout', lay);
  const bodyEl = $('.notepad-body');
  if (bodyEl) bodyEl.setAttribute('data-notepad-layout', lay);
  const btn = $('#notepad-layout-btn');
  if (btn) {
    btn.classList.toggle('active', lay === 'bottom');
    btn.setAttribute('aria-pressed', String(lay === 'bottom'));
    btn.textContent = lay === 'bottom' ? 'Δεξιά' : 'Κάτω';
    btn.title = (lay === 'bottom'
      ? 'Διάταξη Σημειωματάριου: Κάτω (πατήστε για μεταφορά Δεξιά)'
      : 'Διάταξη Σημειωματάριου: Δεξιά (πατήστε για μεταφορά Κάτω)') + ' (Alt+Shift+D)';
  }
  const sBtn = $('#notepad-layout-toggle');
  if (sBtn) {
    sBtn.classList.toggle('active', lay === 'bottom');
    sBtn.setAttribute('aria-pressed', String(lay === 'bottom'));
    sBtn.textContent = lay === 'bottom' ? 'Διάταξη Σημειωματάριου: Κάτω' : 'Διάταξη Σημειωματάριου: Δεξιά';
  }
  const rz = $('#notepad-resizer');
  if (rz) {
    rz.title = lay === 'bottom'
      ? 'Σύρετε για αλλαγή ύψους προεπισκόπησης'
      : 'Σύρετε για αλλαγή πλάτους προεπισκόπησης';
  }
  window.__applySavedNotepadDimensions?.();
  window.__invalidateNotepadMetricsCache?.();
  requestAnimationFrame(() => window.__refreshNotepadCaret?.(false));
  if (shouldPersist) persist(KEYS.notepadLayout, lay);
  else mirrorSet(KEYS.notepadLayout, lay);
}

export function applySansFont(preset, shouldPersist = true) {
  const key = Object.prototype.hasOwnProperty.call(FONT_PRESETS.sans, preset) ? preset : 'default';
  state.sansFont = key;
  document.documentElement.style.setProperty('--sans', FONT_PRESETS.sans[key]);
  const sel = $('#sans-font-select');
  if (sel && sel.value !== key) sel.value = key;
  window.__invalidateNotepadMetricsCache?.();
  requestAnimationFrame(() => {
    window.__renderPreview?.(false);
    window.__renderHybridPreview?.(true, false);
    window.__refreshNotepadCaret?.(false);
  });
  if (shouldPersist) persist(KEYS.sansFont, key);
  else mirrorSet(KEYS.sansFont, key);
}

export function applyMonoFont(preset, shouldPersist = true) {
  const key = Object.prototype.hasOwnProperty.call(FONT_PRESETS.mono, preset) ? preset : 'default';
  state.monoFont = key;
  document.documentElement.style.setProperty('--mono', FONT_PRESETS.mono[key]);
  const sel = $('#mono-font-select');
  if (sel && sel.value !== key) sel.value = key;
  window.__invalidateNotepadMetricsCache?.();
  window.__syncHighlightFont?.('latex-input');
  window.__syncHighlightFont?.('notepad-input');
  requestAnimationFrame(() => window.__refreshNotepadCaret?.(false));
  if (shouldPersist) persist(KEYS.monoFont, key);
  else mirrorSet(KEYS.monoFont, key);
}

export function applyWindowPreset(preset, shouldPersist = true, triggerResize = true) {
  const key = Object.prototype.hasOwnProperty.call(WINDOW_PRESETS, preset) ? preset : 'default';
  state.windowPreset = key;
  const sel = $('#window-size-select');
  if (sel && sel.value !== key) sel.value = key;
  const spec = WINDOW_PRESETS[key];
  if (triggerResize && spec) {
    if (window.mathglassDesktop?.setWindowSize) {
      try { window.mathglassDesktop.setWindowSize(spec); } catch { }
    } else if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'latex-panel-set-window-size', ...spec }, '*'); } catch { }
    }
  }
  if (shouldPersist) persist(KEYS.windowPreset, key);
  else mirrorSet(KEYS.windowPreset, key);
}

export function applyAutoBraces(enabled, shouldPersist = true) {
  const on = enabled === false ? false : true;
  state.autoBracesEnabled = on;
  for (const sel of ['#auto-braces-btn', '#notepad-auto-braces-btn']) {
    const el = $(sel);
    if (!el) continue;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', String(on));
    el.title = (on
      ? 'Αυτόματα Άγκιστρα { }: ΕΝΕΡΓΑ — Περιβάλλει εκθέτες, δείκτες, αριθμητές & κλείνει { }'
      : 'Αυτόματα Άγκιστρα { }: ΑΝΕΝΕΡΓΑ — Κλικ για αυτόματο { } σε εκθέτες, δείκτες κ.λπ.') + ' (Alt+J)';
  }
  const sBtn = $('#auto-braces-toggle');
  if (sBtn) {
    sBtn.classList.toggle('active', on);
    sBtn.setAttribute('aria-pressed', String(on));
    sBtn.textContent = on ? 'Αυτόματα Άγκιστρα { }: ΕΝΕΡΓΑ' : 'Αυτόματα Άγκιστρα { }: ΑΝΕΝΕΡΓΑ';
  }
  if (shouldPersist) persist(KEYS.autoBraces, on);
  else mirrorSet(KEYS.autoBraces, on);
}

export function applyPreviewFollow(enabled, shouldPersist = true) {
  const on = enabled === false ? false : true;
  state.previewFollowEnabled = on;
  if (on) {
    state.userScrolled = false;
    state.notepadUserScrolled = false;
  }
  for (const sel of ['#follow-mode-btn', '#notepad-follow-mode-btn']) {
    const el = $(sel);
    if (!el) continue;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', String(on));
    el.textContent = on ? 'Ακολούθηση' : 'Σταθερή';
    el.title = (on
      ? 'Παρακολούθηση Προεπισκόπησης: ΑΚΟΛΟΥΘΗΣΗ — Η προεπισκόπηση ακολουθεί αυτόματα τον κέρσορα καθώς γράφετε'
      : 'Παρακολούθηση Προεπισκόπησης: ΣΤΑΘΕΡΗ — Η προεπισκόπηση μένει ακίνητη εκεί που την αφήσατε και δεν πηδάει εκεί που γράφετε') + ' (Alt+5)';
  }
  const sBtn = $('#follow-mode-toggle');
  if (sBtn) {
    sBtn.classList.toggle('active', on);
    sBtn.setAttribute('aria-pressed', String(on));
    sBtn.textContent = on
      ? 'Παρακολούθηση Προεπισκόπησης: ΑΚΟΛΟΥΘΗΣΗ'
      : 'Παρακολούθηση Προεπισκόπησης: ΣΤΑΘΕΡΗ';
  }
  if (shouldPersist) persist(KEYS.previewFollow, on);
  else mirrorSet(KEYS.previewFollow, on);
}

export function applyPreviewCaret(enabled, shouldPersist = true) {
  const on = enabled === false ? false : true;
  state.previewCaretEnabled = on;
  for (const sel of ['#preview-caret-btn', '#notepad-preview-caret-btn']) {
    const el = $(sel);
    if (!el) continue;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', String(on));
    el.title = (on
      ? 'Κέρσορας Προεπισκόπησης: ΕΜΦΑΝΗΣ — Κλικ για απόκρυψη παλλόμενου δρομέα στη ζωντανή προεπισκόπηση'
      : 'Κέρσορας Προεπισκόπησης: ΚΡΥΦΟΣ — Κλικ για εμφάνιση παλλόμενου δρομέα στη ζωντανή προεπισκόπηση') + ' (Alt+9)';
  }
  const sBtn = $('#preview-caret-toggle');
  if (sBtn) {
    sBtn.classList.toggle('active', on);
    sBtn.setAttribute('aria-pressed', String(on));
    sBtn.textContent = on
      ? 'Κέρσορας Προεπισκόπησης: ΕΜΦΑΝΗΣ'
      : 'Κέρσορας Προεπισκόπησης: ΚΡΥΦΟΣ';
  }
  window.__renderPreview?.(false);
  window.__renderHybridPreview?.(true, false);
  if (shouldPersist) persist(KEYS.previewCaret, on);
  else mirrorSet(KEYS.previewCaret, on);
}

export function applySlotHints(enabled, shouldPersist = true) {
  const on = enabled === false ? false : true;
  state.slotHintsEnabled = on;
  for (const sel of ['#slot-hints-btn', '#notepad-slot-hints-btn']) {
    const el = $(sel);
    if (!el) continue;
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', String(on));
    el.title = (on
      ? 'Υποδείξεις Πλαισίου: ΕΝΕΡΓΕΣ — Εμφάνιση διακεκομμένου πλαισίου γύρω από εκθέτες, δείκτες & κλάσματα'
      : 'Υποδείξεις Πλαισίου: ΑΝΕΝΕΡΓΕΣ — Κλικ για εμφάνιση διακεκομμένου πλαισίου ενεργού πεδίου LaTeX') + ' (Alt+Shift+B)';
  }
  const sBtn = $('#slot-hints-toggle');
  if (sBtn) {
    sBtn.classList.toggle('active', on);
    sBtn.setAttribute('aria-pressed', String(on));
    sBtn.textContent = on
      ? 'Υποδείξεις Πλαισίου: ΕΝΕΡΓΕΣ'
      : 'Υποδείξεις Πλαισίου: ΑΝΕΝΕΡΓΕΣ';
  }
  window.__renderPreview?.(false);
  window.__renderHybridPreview?.(true, false);
  if (shouldPersist) persist(KEYS.slotHints, on);
  else mirrorSet(KEYS.slotHints, on);
}

export async function load() {
  try {
    const r = await get(Object.values(KEYS));
    state.alignLeft = r[KEYS.alignLeft] ?? mirrorGet(KEYS.alignLeft, 'bool') ?? DEFAULTS.alignLeft;
    state.dataset = r[KEYS.dataset] || DEFAULTS.dataset;
    state.recent = Array.isArray(r[KEYS.recent]) ? r[KEYS.recent] : (mirrorGet(KEYS.recent, 'json') || []);
    const rawEqHist = r[KEYS.equationHistory] ?? mirrorGet(KEYS.equationHistory, 'json');
    state.equationHistory = Array.isArray(rawEqHist) ? rawEqHist.filter(x => typeof x === 'string' && x.trim()) : [];
    const rawEqFavs = r[KEYS.favoriteEquations] ?? mirrorGet(KEYS.favoriteEquations, 'json');
    state.favoriteEquations = Array.isArray(rawEqFavs) ? rawEqFavs.filter(x => typeof x === 'string' && x.trim()) : [];

    applyTheme(r[KEYS.theme] ?? mirrorGet(KEYS.theme) ?? DEFAULTS.theme, false);
    applyTransparency(r[KEYS.transparency] ?? mirrorGet(KEYS.transparency, 'num') ?? DEFAULTS.transparency, false);
    applyBlur(r[KEYS.blurEnabled] ?? mirrorGet(KEYS.blurEnabled, 'bool') ?? DEFAULTS.blurEnabled, false);
    applyToolbarHidden(r[KEYS.toolbarHidden] ?? mirrorGet(KEYS.toolbarHidden, 'bool') ?? DEFAULTS.toolbarHidden, false);
    applyNotepadToolbarHidden(r[KEYS.notepadToolbarHidden] ?? mirrorGet(KEYS.notepadToolbarHidden, 'bool') ?? DEFAULTS.notepadToolbarHidden, false);
    applyPreviewHidden(r[KEYS.previewHidden] ?? mirrorGet(KEYS.previewHidden, 'bool') ?? DEFAULTS.previewHidden, false);
    applyPreviewEdit(r[KEYS.previewEdit] ?? mirrorGet(KEYS.previewEdit, 'bool') ?? DEFAULTS.previewEdit, false);
    applyPreviewClickCursorLock(r[KEYS.previewClickLock] ?? mirrorGet(KEYS.previewClickLock, 'bool') ?? DEFAULTS.previewClickLock, false);
    applyNotepadLayout(r[KEYS.notepadLayout] ?? mirrorGet(KEYS.notepadLayout) ?? DEFAULTS.notepadLayout, false);
    applySansFont(r[KEYS.sansFont] ?? mirrorGet(KEYS.sansFont) ?? DEFAULTS.sansFont, false);
    applyMonoFont(r[KEYS.monoFont] ?? mirrorGet(KEYS.monoFont) ?? DEFAULTS.monoFont, false);
    applyWindowPreset(r[KEYS.windowPreset] ?? mirrorGet(KEYS.windowPreset) ?? DEFAULTS.windowPreset, false, false);
    applyAutoBraces(r[KEYS.autoBraces] ?? mirrorGet(KEYS.autoBraces, 'bool') ?? DEFAULTS.autoBraces, false);
    applyPreviewFollow(r[KEYS.previewFollow] ?? mirrorGet(KEYS.previewFollow, 'bool') ?? DEFAULTS.previewFollow, false);
    applyPreviewCaret(r[KEYS.previewCaret] ?? mirrorGet(KEYS.previewCaret, 'bool') ?? DEFAULTS.previewCaret, false);
    applySlotHints(r[KEYS.slotHints] ?? mirrorGet(KEYS.slotHints, 'bool') ?? DEFAULTS.slotHints, false);

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
    pick('notepadToolbar', (v, a) => { state.notepadToolbarScale = v; state.notepadToolbarScaleAuto = a; });
    pick('headerBtn', (v, a) => { state.headerBtnScale = v; state.headerBtnScaleAuto = a; });
  } catch (e) {
    console.warn('[settings.load] Failed:', e);
  }
}

export function applyVisuals() {
  try {
    document.documentElement.style.setProperty('--toolbar-scale', state.toolbarScale);
    document.documentElement.style.setProperty('--notepad-toolbar-scale', state.notepadToolbarScale);
    document.documentElement.style.setProperty('--header-btn-scale', state.headerBtnScale);
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: 'latex-panel-header-btn-scale', scale: state.headerBtnScale }, '*'); } catch { }
    }
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
      ['notepad-toolbar-auto-badge', state.notepadToolbarScaleAuto],
      ['header-btn-auto-badge', state.headerBtnScaleAuto],
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
    const ntbl = $('#notepad-toolbar-size-label'); if (ntbl) ntbl.value = Math.round(state.notepadToolbarScale * 100);
    const hbl = $('#header-btn-size-label'); if (hbl) hbl.value = Math.round(state.headerBtnScale * 100);
    const tl = $('#toolbar-size-label'); if (tl) tl.value = Math.round(state.toolbarScale * 100);
    window.__invalidateNotepadMetricsCache?.();
    window.__refreshNotepadCaret?.();
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
  if (kind === 'preview') window.__syncPreviewCursor?.();
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
  on($('#notepad-toolbar-size-down'), 'click', () => step('notepadToolbar', -1), false, sig);
  on($('#notepad-toolbar-size-up'), 'click', () => step('notepadToolbar', +1), false, sig);
  on($('#phpbb-tb-font-down'), 'click', () => step('notepadToolbar', -1), false, sig);
  on($('#phpbb-tb-font-up'), 'click', () => step('notepadToolbar', +1), false, sig);
  on($('#header-btn-size-down'), 'click', () => step('headerBtn', -1), false, sig);
  on($('#header-btn-size-up'), 'click', () => step('headerBtn', +1), false, sig);

  const num = (sel, kind) => {
    const i = $(sel); if (!i) return;
    const h = () => { const v = parseInt(i.value, 10); if (!Number.isNaN(v)) setSize(kind, v / 100, false); };
    on(i, 'change', h, false, sig);
    on(i, 'keydown', e => { if (e.key === 'Enter') i.blur(); }, false, sig);
  };
  num('#toolbar-size-label', 'toolbar'); num('#zoom-label', 'preview'); num('#editor-zoom-label', 'editor');
  num('#notepad-zoom-label', 'notepad'); num('#notepad-text-zoom-label', 'notepad');
  num('#notepad-preview-zoom-label', 'notepadPreview'); num('#notepad-preview-inline-zoom-label', 'notepadPreview');
  num('#notepad-toolbar-size-label', 'notepadToolbar'); num('#header-btn-size-label', 'headerBtn');

  const auto = (sel, kind) => on($(sel), 'click', () => {
    const prop = SCALE_PROP[kind];
    if (state[`${prop}Auto`]) setSize(kind, state[prop], false);
    else setSize(kind, computeAutoScale(kind), true);
  }, false, sig);
  auto('#toolbar-auto-badge', 'toolbar'); auto('#preview-auto-badge', 'preview'); auto('#editor-auto-badge', 'editor');
  auto('#notepad-auto-badge', 'notepad'); auto('#notepad-text-auto-badge', 'notepad');
  auto('#notepad-preview-auto-badge', 'notepadPreview'); auto('#notepad-preview-inline-auto-badge', 'notepadPreview');
  auto('#notepad-toolbar-auto-badge', 'notepadToolbar'); auto('#header-btn-auto-badge', 'headerBtn');

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
    on(trT, 'click', () => applyTransparency(parseInt(trS.value || '0', 10) > 0 ? 0 : DEFAULTS.transparency, true), false, sig);
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

  const npTbToggle = $('#notepad-toolbar-toggle-btn');
  if (npTbToggle) on(npTbToggle, 'click', () => applyNotepadToolbarHidden(!$('#phpbb-toolbar')?.classList.contains('hidden'), true), false, sig);

  const pvToggle = $('#preview-toggle');
  if (pvToggle) on(pvToggle, 'click', () => applyPreviewHidden(!$('.preview-outer')?.classList.contains('hidden'), true), false, sig);

  for (const sel of ['#preview-edit-btn', '#notepad-preview-edit-btn', '#preview-edit-toggle']) {
    const el = $(sel);
    if (!el) continue;
    on(el, 'mousedown', e => e.preventDefault(), false, sig);
    on(el, 'click', e => {
      e.stopPropagation();
      applyPreviewEdit(state.previewEditEnabled === false, true);
      window.__focusActiveEditor?.();
    }, false, sig);
  }

  for (const sel of ['#preview-click-lock-btn', '#notepad-preview-click-lock-btn', '#preview-click-lock-toggle']) {
    const el = $(sel);
    if (!el) continue;
    on(el, 'mousedown', e => e.preventDefault(), false, sig);
    on(el, 'click', e => {
      e.stopPropagation();
      applyPreviewClickCursorLock(!state.previewClickCursorLock, true);
      window.__focusActiveEditor?.();
    }, false, sig);
  }

  for (const sel of ['#notepad-layout-btn', '#notepad-layout-toggle']) {
    const el = $(sel);
    if (!el) continue;
    on(el, 'mousedown', e => e.preventDefault(), false, sig);
    on(el, 'click', e => {
      e.stopPropagation();
      applyNotepadLayout(state.notepadLayout === 'bottom' ? 'right' : 'bottom', true);
      window.__focusActiveEditor?.();
    }, false, sig);
  }

  const sansSel = $('#sans-font-select');
  if (sansSel) on(sansSel, 'change', () => applySansFont(sansSel.value, true), false, sig);

  const monoSel = $('#mono-font-select');
  if (monoSel) on(monoSel, 'change', () => applyMonoFont(monoSel.value, true), false, sig);

  const winSel = $('#window-size-select');
  if (winSel) on(winSel, 'change', () => applyWindowPreset(winSel.value, true, true), false, sig);

  for (const sel of ['#auto-braces-btn', '#notepad-auto-braces-btn', '#auto-braces-toggle']) {
    const el = $(sel);
    if (!el) continue;
    on(el, 'mousedown', e => e.preventDefault(), false, sig);
    on(el, 'click', e => {
      e.stopPropagation();
      applyAutoBraces(!state.autoBracesEnabled, true);
      window.__focusActiveEditor?.();
    }, false, sig);
  }

  for (const sel of ['#follow-mode-btn', '#notepad-follow-mode-btn', '#follow-mode-toggle']) {
    const el = $(sel);
    if (!el) continue;
    on(el, 'mousedown', e => e.preventDefault(), false, sig);
    on(el, 'click', e => {
      e.stopPropagation();
      applyPreviewFollow(!state.previewFollowEnabled, true);
      window.__focusActiveEditor?.();
    }, false, sig);
  }

  for (const sel of ['#preview-caret-btn', '#notepad-preview-caret-btn', '#preview-caret-toggle']) {
    const el = $(sel);
    if (!el) continue;
    on(el, 'mousedown', e => e.preventDefault(), false, sig);
    on(el, 'click', e => {
      e.stopPropagation();
      applyPreviewCaret(!state.previewCaretEnabled, true);
      window.__focusActiveEditor?.();
    }, false, sig);
  }

  for (const sel of ['#slot-hints-btn', '#notepad-slot-hints-btn', '#slot-hints-toggle']) {
    const el = $(sel);
    if (!el) continue;
    on(el, 'mousedown', e => e.preventDefault(), false, sig);
    on(el, 'click', e => {
      e.stopPropagation();
      applySlotHints(!state.slotHintsEnabled, true);
      window.__focusActiveEditor?.();
    }, false, sig);
  }

  const unsub = onChanged(changes => {
    if (changes[KEYS.theme]) applyTheme(changes[KEYS.theme].newValue, false);
    if (changes[KEYS.transparency]) applyTransparency(changes[KEYS.transparency].newValue, false);
    if (changes[KEYS.blurEnabled]) applyBlur(changes[KEYS.blurEnabled].newValue, false);
    if (changes[KEYS.toolbarHidden]) applyToolbarHidden(changes[KEYS.toolbarHidden].newValue, false);
    if (changes[KEYS.notepadToolbarHidden]) applyNotepadToolbarHidden(changes[KEYS.notepadToolbarHidden].newValue, false);
    if (changes[KEYS.previewHidden]) applyPreviewHidden(changes[KEYS.previewHidden].newValue, false);
    if (changes[KEYS.previewEdit]) applyPreviewEdit(changes[KEYS.previewEdit].newValue, false);
    if (changes[KEYS.previewClickLock]) applyPreviewClickCursorLock(changes[KEYS.previewClickLock].newValue, false);
    if (changes[KEYS.notepadLayout]) applyNotepadLayout(changes[KEYS.notepadLayout].newValue, false);
    if (changes[KEYS.sansFont]) applySansFont(changes[KEYS.sansFont].newValue, false);
    if (changes[KEYS.monoFont]) applyMonoFont(changes[KEYS.monoFont].newValue, false);
    if (changes[KEYS.windowPreset]) applyWindowPreset(changes[KEYS.windowPreset].newValue, false, false);
    if (changes[KEYS.autoBraces]) applyAutoBraces(changes[KEYS.autoBraces].newValue, false);
    if (changes[KEYS.previewFollow]) applyPreviewFollow(changes[KEYS.previewFollow].newValue, false);
    if (changes[KEYS.previewCaret]) applyPreviewCaret(changes[KEYS.previewCaret].newValue, false);
    if (changes[KEYS.slotHints]) applySlotHints(changes[KEYS.slotHints].newValue, false);
    if (changes[KEYS.equationHistory] && Array.isArray(changes[KEYS.equationHistory].newValue)) {
      state.equationHistory = changes[KEYS.equationHistory].newValue;
    }
    if (changes[KEYS.favoriteEquations] && Array.isArray(changes[KEYS.favoriteEquations].newValue)) {
      state.favoriteEquations = changes[KEYS.favoriteEquations].newValue;
    }
  });
  sig.addEventListener('abort', unsub, { once: true });

  const al = $('#preview-inline-btn');
  const applyAlign = () => {
    if (state.previewWrap) state.previewWrap.classList.toggle('align-left', state.alignLeft);
    if (al) { al.classList.toggle('active', state.alignLeft); al.setAttribute('aria-pressed', String(state.alignLeft)); }
  };
  applyAlign();
  on(al, 'click', () => { state.alignLeft = !state.alignLeft; persist(KEYS.alignLeft, state.alignLeft); applyAlign(); window.__renderPreview?.(false); }, false, sig);
  syncNavIndicators();

  for (const [sel, key] of [['#tex-toggle', KEYS.texWrap], ['#inline-toggle', KEYS.textstyle], ['#displaystyle-toggle', KEYS.displaystyle]]) {
    const c = $(sel); if (c) on(c, 'change', () => persist(key, c.checked), false, sig);
  }

  const sb = $('#settings-btn'), tg = $('#toggle-group');
  on(sb, 'click', () => {
    if (!tg || !sb) return;
    const h = tg.classList.toggle('hidden'); sb.classList.toggle('active', h);
    persist(KEYS.settingsCollapsed, h); window.__reportNaturalSize?.(400);
  }, false, sig);

  const resetBtn = $('#reset-defaults-btn');
  if (resetBtn) {
    let resetConfirmTimer = null;
    let resetDoneTimer = null;
    const clearResetBtnState = () => {
      clearTimeout(resetConfirmTimer);
      clearTimeout(resetDoneTimer);
      resetBtn.dataset.confirm = '';
      resetBtn.classList.remove('confirming', 'done');
      resetBtn.textContent = 'Επαναφορά Προεπιλογών';
    };
    on(resetBtn, 'click', e => {
      e.stopPropagation();
      if (resetBtn.dataset.confirm !== '1') {
        clearTimeout(resetDoneTimer);
        resetBtn.classList.remove('done');
        resetBtn.dataset.confirm = '1';
        resetBtn.classList.add('confirming');
        resetBtn.textContent = 'Σίγουρα επαναφορά;';
        resetConfirmTimer = setTimeout(clearResetBtnState, 3500);
        return;
      }
      clearTimeout(resetConfirmTimer);
      clearTimeout(resetDoneTimer);
      resetBtn.dataset.confirm = '';
      resetBtn.classList.remove('confirming');
      resetAllDefaults();
      resetBtn.classList.add('done');
      resetBtn.textContent = 'Επαναφέρθηκαν ✓';
      resetDoneTimer = setTimeout(clearResetBtnState, 2000);
    }, false, sig);
  }

  const donateCopy = $('#settings-donate-copy');
  if (donateCopy) {
    on(donateCopy, 'click', e => {
      e.stopPropagation();
      openDonatePage();
    }, false, sig);
  }
}

export function resetAllDefaults() {
  state.alignLeft = DEFAULTS.alignLeft;
  persist(KEYS.alignLeft, state.alignLeft);
  if (state.previewWrap) state.previewWrap.classList.toggle('align-left', state.alignLeft);
  const al = $('#preview-inline-btn');
  if (al) {
    al.classList.toggle('active', state.alignLeft);
    al.setAttribute('aria-pressed', String(state.alignLeft));
  }

  state.dataset = DEFAULTS.dataset;
  persist(KEYS.dataset, state.dataset);
  const ds = $('#toolbar-dataset-select');
  if (ds) ds.value = state.dataset;
  window.__rebuildToolbar?.();

  remove(KEYS.previewHeight);
  remove(KEYS.notepadHeight);
  remove(KEYS.notepadWidth);
  remove(KEYS.notepadBottomHeight);
  remove(KEYS.geometry);
  remove(KEYS.notepadAutoDollar);
  document.documentElement.style.removeProperty('--notepad-preview-width');
  document.documentElement.style.removeProperty('--notepad-bottom-height');
  const lhw = $('#latex-highlight-wrap');
  if (lhw) lhw.style.height = '';

  applyTheme(DEFAULTS.theme, true);
  applyTransparency(DEFAULTS.transparency, true);
  applyBlur(DEFAULTS.blurEnabled, true);
  applyToolbarHidden(DEFAULTS.toolbarHidden, true);
  applyNotepadToolbarHidden(DEFAULTS.notepadToolbarHidden, true);
  applyPreviewHidden(DEFAULTS.previewHidden, true);
  applyPreviewEdit(DEFAULTS.previewEdit, true);
  applyPreviewClickCursorLock(DEFAULTS.previewClickLock, true);
  applyNotepadLayout(DEFAULTS.notepadLayout, true);
  applySansFont(DEFAULTS.sansFont, true);
  applyMonoFont(DEFAULTS.monoFont, true);
  applyAutoBraces(DEFAULTS.autoBraces, true);
  applyPreviewFollow(DEFAULTS.previewFollow, true);
  applyPreviewCaret(DEFAULTS.previewCaret, true);
  applySlotHints(DEFAULTS.slotHints, true);

  if (document.documentElement.getAttribute('data-syntax') !== String(DEFAULTS.syntaxHighlight)) {
    $('#syntax-highlight-toggle')?.click();
  } else {
    persist(KEYS.syntaxHighlight, DEFAULTS.syntaxHighlight);
  }

  for (const [sel, key, defVal] of [
    ['#tex-toggle', KEYS.texWrap, DEFAULTS.texWrap],
    ['#inline-toggle', KEYS.textstyle, DEFAULTS.textstyle],
    ['#displaystyle-toggle', KEYS.displaystyle, DEFAULTS.displaystyle],
  ]) {
    const c = $(sel);
    if (c) c.checked = Boolean(defVal);
    persist(key, Boolean(defVal));
  }

  const tg = $('#toggle-group');
  const sb = $('#settings-btn');
  if (tg) tg.classList.toggle('hidden', DEFAULTS.settingsCollapsed);
  if (sb) sb.classList.toggle('active', DEFAULTS.settingsCollapsed);
  persist(KEYS.settingsCollapsed, DEFAULTS.settingsCollapsed);

  const scaleKinds = ['toolbar', 'preview', 'editor', 'notepad', 'notepadPreview', 'notepadToolbar', 'headerBtn'];
  for (const k of scaleKinds) {
    setSize(k, computeAutoScale(k), true);
  }

  applyWindowPreset(DEFAULTS.windowPreset, true, true);
  setTimeout(() => {
    for (const k of scaleKinds) {
      if (state[`${SCALE_PROP[k]}Auto`]) {
        setSize(k, computeAutoScale(k), true);
      }
    }
  }, 160);

  window.__setNotepadOpen?.(true);
  window.__setNotepadViewMode?.('wysiwyg');

  window.__renderPreview?.(false);
  window.__renderHybridPreview?.(true, false);
  window.__refreshSyntaxHighlight?.();
  window.__refreshNotepadCaret?.();
}

export function recordEquationHistory(latex) {
  const clean = typeof latex === 'string' ? latex.trim() : '';
  if (!clean) return;
  state.equationHistory = [clean, ...state.equationHistory.filter(item => item !== clean)].slice(0, LIMITS.equationHistoryMax);
  persist(KEYS.equationHistory, state.equationHistory);
}

export function toggleFavoriteEquation(latex) {
  const clean = typeof latex === 'string' ? latex.trim() : '';
  if (!clean) return false;
  const exists = state.favoriteEquations.includes(clean);
  if (exists) {
    state.favoriteEquations = state.favoriteEquations.filter(item => item !== clean);
  } else {
    state.favoriteEquations = [clean, ...state.favoriteEquations].slice(0, 24);
  }
  persist(KEYS.favoriteEquations, state.favoriteEquations);
  return !exists;
}

export function removeEquationFromHistory(latex) {
  const clean = typeof latex === 'string' ? latex.trim() : '';
  if (!clean) return;
  if (state.equationHistory.includes(clean)) {
    state.equationHistory = state.equationHistory.filter(item => item !== clean);
    persist(KEYS.equationHistory, state.equationHistory);
  }
  if (state.favoriteEquations.includes(clean)) {
    state.favoriteEquations = state.favoriteEquations.filter(item => item !== clean);
    persist(KEYS.favoriteEquations, state.favoriteEquations);
  }
}

export function clearEquationHistory() {
  state.equationHistory = [];
  persist(KEYS.equationHistory, []);
}
