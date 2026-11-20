import { $, on } from '../core/dom.js';
import { applyTheme, applyTransparency, applyBlur, applyToolbarHidden, applyNotepadToolbarHidden, applyPreviewHidden } from './settings.js';
import * as toolbar from './toolbar.js';
import * as notepad from './notepad.js';

const SHORTCUT_HINTS = [
  ['#insert-btn', 'Ctrl+Enter', 'Εισαγωγή εξίσωσης στη σελίδα'],
  ['#notepad-insert-btn', 'Ctrl+Enter', 'Εισαγωγή κειμένου σημειωματάριου στη σελίδα'],
  ['#copy-btn', 'Alt+C', 'Αντιγραφή εξίσωσης στο πρόχειρο'],
  ['#notepad-copy-btn', 'Alt+C', 'Αντιγραφή κειμένου σημειωματάριου'],
  ['#notepad-toggle', 'Alt+N', 'Σημειωματάριο phpBB'],
  ['#notepad-templates-btn', 'Alt+L', 'Εμφάνιση/Απόκρυψη προτύπων'],
  ['#notepad-toolbar-toggle-btn', 'Alt+G', 'Εμφάνιση/Απόκρυψη εργαλειοθήκης σημειωματάριου phpBB'],
  ['#notepad-reader-btn', 'Alt+F', 'Λειτουργία Ανάγνωσης — Πλήρης οθόνη ζωντανής προεπισκόπησης'],
  ['#theme-toggle', 'Alt+T', 'Εναλλαγή θέματος'],
  ['#transparency-toggle', 'Alt+O', 'Διαφάνεια / Αδιαφάνεια'],
  ['#blur-toggle', 'Alt+B', 'Θόλωμα (Τζαμαρία)'],
  ['#toolbar-toggle', 'Alt+K', 'Εμφάνιση/Απόκρυψη εργαλειοθήκης'],
  ['#preview-toggle', 'Alt+P', 'Εμφάνιση/Απόκρυψη ζωντανής προεπισκόπησης'],
  ['#settings-toggle', 'Alt+S', 'Ρυθμίσεις'],
  ['#recent-toggle', 'Alt+R', 'Πρόσφατα σύμβολα'],
  ['#notepad-pull-btn', 'Alt+E', 'Επικόλληση της τρέχουσας εξίσωσης από τον Editor'],
  ['#notepad-auto-dollar-btn', 'Alt+4', 'Αυτόματο $...$'],
  ['[data-bb-wrap="[b]|[/b]|έντονο"]', 'Ctrl+B', 'Έντονα ([b]...[/b])'],
  ['[data-bb-wrap="[i]|[/i]|πλάγιο"]', 'Ctrl+I', 'Πλάγια ([i]...[/i])'],
  ['[data-bb-wrap="[u]|[/u]|υπογράμμιση"]', 'Ctrl+U', 'Υπογράμμιση ([u]...[/u])'],
  ['#phpbb-url-btn', 'Ctrl+K', 'Σύνδεσμος ([url])'],
  ['[data-bb-wrap="[tex]|[/tex]|x^2+y^2=r^2"]', 'Alt+X', 'Εξίσωση phpBB ([tex])'],
  ['#close-matrix', 'Esc', 'Κλείσιμο παραθύρου'],
  ['#cancel-matrix', 'Esc', 'Κλείσιμο παραθύρου'],
  ['#close-phpbb-media', 'Esc', 'Κλείσιμο παραθύρου'],
  ['#cancel-phpbb-media', 'Esc', 'Ακύρωση'],
];

function applyShortcutTooltips() {
  for (const [sel, hint, fallbackDesc] of SHORTCUT_HINTS) {
    const el = $(sel);
    if (!el) continue;
    const base = (el.getAttribute('title') || fallbackDesc || '').trim();
    if (base && !base.includes(hint)) {
      el.setAttribute('title', `${base} (${hint})`);
    } else if (!base) {
      el.setAttribute('title', hint);
    }
  }
}

function closeActiveOverlays() {
  let closed = false;
  if (document.body.classList.contains('notepad-reader-mode')) {
    window.__toggleNotepadReaderMode?.(false);
    closed = true;
  }
  for (const sel of ['#matrix-modal', '#phpbb-media-modal']) {
    const m = $(sel);
    if (m?.classList.contains('active')) { m.classList.remove('active'); closed = true; }
  }
  document.querySelectorAll('.export-menu.active, .phpbb-dropdown-menu.active').forEach(el => {
    el.classList.remove('active');
    closed = true;
  });
  for (const sel of ['#settings-popup', '#recent-popup']) {
    const p = $(sel);
    if (p?.classList.contains('active')) { toolbar.closeAllPopups(); closed = true; break; }
  }

  return closed;
}

function isTextOverlayOpen() {
  return Boolean(
    document.body.classList.contains('notepad-reader-mode') ||
    $('#matrix-modal')?.classList.contains('active') ||
    $('#phpbb-media-modal')?.classList.contains('active') ||
    $('#settings-popup')?.classList.contains('active') ||
    $('#recent-popup')?.classList.contains('active')
  );
}

function focusElNoScroll(el) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch { } }
}

function focusActiveEditor(force = false) {
  if (!force && isTextOverlayOpen()) return;
  const inNotepad = document.body.classList.contains('notepad-open');
  if (inNotepad) {
    focusElNoScroll($('#notepad-input'));
  } else {
    focusElNoScroll($('#latex-input'));
  }
}

function scheduleEditorFocus(force = false) {
  focusActiveEditor(force);
  requestAnimationFrame(() => focusActiveEditor(force));
  setTimeout(() => focusActiveEditor(force), 20);
}

window.__focusActiveEditor = () => scheduleEditorFocus(false);

function handleShortcutEvent(e, isFromHost = false) {
  if (e.key === 'Escape') {
    if (closeActiveOverlays()) {
      if (!isFromHost) e.preventDefault?.();
      scheduleEditorFocus(true);
      return true;
    }
    return false;
  }

  const inNotepad = document.body.classList.contains('notepad-open');
  const npInput = $('#notepad-input');
  const isNpFocused = isFromHost ? inNotepad : document.activeElement === npInput;
  const mod = e.ctrlKey || e.metaKey;

  if (mod && !e.altKey) {
    if (e.key === 'Enter' && inNotepad && (isNpFocused || isFromHost)) {
      if (!isFromHost) e.preventDefault?.();
      $('#notepad-insert-btn')?.click();
      scheduleEditorFocus(false);
      return true;
    }
    if (inNotepad && isNpFocused && !e.shiftKey) {
      if (e.code === 'KeyB') { if (!isFromHost) e.preventDefault?.(); $('[data-bb-wrap="[b]|[/b]|έντονο"]')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'KeyI') { if (!isFromHost) e.preventDefault?.(); $('[data-bb-wrap="[i]|[/i]|πλάγιο"]')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'KeyU') { if (!isFromHost) e.preventDefault?.(); $('[data-bb-wrap="[u]|[/u]|υπογράμμιση"]')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'KeyK') { if (!isFromHost) e.preventDefault?.(); $('#phpbb-url-btn')?.click(); return true; }
    }
    return false;
  }

  if (!e.altKey || mod) return false;

  switch (e.code) {
    case 'KeyN':
      if (!isFromHost) e.preventDefault?.();
      notepad.toggleNotepad();
      scheduleEditorFocus(false);
      return true;
    case 'KeyC':
      if (!isFromHost) e.preventDefault?.();
      (inNotepad ? $('#notepad-copy-btn') : $('#copy-btn'))?.click();
      scheduleEditorFocus(false);
      return true;
    case 'KeyT':
      if (!isFromHost) e.preventDefault?.();
      applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
      scheduleEditorFocus(false);
      return true;
    case 'KeyO': {
      if (!isFromHost) e.preventDefault?.();
      const isTransparent = document.documentElement.getAttribute('data-transparent') === 'true';
      applyTransparency(isTransparent ? 0 : 90, true);
      scheduleEditorFocus(false);
      return true;
    }
    case 'KeyB':
      if (!isFromHost) e.preventDefault?.();
      applyBlur(document.documentElement.getAttribute('data-blur') === 'false', true);
      scheduleEditorFocus(false);
      return true;
    case 'KeyK':
      if (!isFromHost) e.preventDefault?.();
      applyToolbarHidden(!$('#toolbars-container')?.classList.contains('hidden'), true);
      scheduleEditorFocus(false);
      return true;
    case 'KeyP':
      if (!isFromHost) e.preventDefault?.();
      applyPreviewHidden(!$('.preview-outer')?.classList.contains('hidden'), true);
      scheduleEditorFocus(false);
      return true;
    case 'KeyS':
      if (!isFromHost) e.preventDefault?.();
      if ($('#settings-toggle')) $('#settings-toggle').click();
      else toolbar.toggleSettingsFromPanel(typeof e?.settingsLeft === 'number' ? e.settingsLeft : undefined);
      if (!$('#settings-popup')?.classList.contains('active')) scheduleEditorFocus(true);
      return true;
    case 'KeyR':
      if (!isFromHost) e.preventDefault?.();
      if ($('#recent-toggle')) $('#recent-toggle').click();
      else toolbar.toggleRecentFromPanel(typeof e?.recentLeft === 'number' ? e.recentLeft : undefined);
      if (!$('#recent-popup')?.classList.contains('active')) scheduleEditorFocus(true);
      return true;
    case 'KeyM':
      if (!isFromHost) e.preventDefault?.();
      window.__openMatrixBuilder?.('matrix');
      return true;
    case 'KeyE':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#notepad-pull-btn')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'KeyL':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#notepad-templates-btn')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'KeyG':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        applyNotepadToolbarHidden(!$('#phpbb-toolbar')?.classList.contains('hidden'), true);
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'KeyF': {
      if (!isFromHost) e.preventDefault?.();
      if (!inNotepad) notepad.setNotepadOpen(true);
      const willEnter = !document.body.classList.contains('notepad-reader-mode');
      window.__toggleNotepadReaderMode?.();
      if (!willEnter) scheduleEditorFocus(true);
      return true;
    }
    case 'KeyX':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('[data-bb-wrap="[tex]|[/tex]|x^2+y^2=r^2"]')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'Digit4':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#notepad-auto-dollar-btn')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
  }
  return false;
}

window.__handlePanelShortcut = payload => handleShortcutEvent(payload, true);

export function init(ac) {
  const sig = ac.signal;
  applyShortcutTooltips();
  let suppressNextAltKeyup = false;

  try { window.focus(); } catch { }
  scheduleEditorFocus(false);
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: 'latex-panel-ready' }, '*'); } catch { }
  }

  on(window, 'keydown', e => {
    const handled = handleShortcutEvent(e, false);
    if (handled && e.altKey) suppressNextAltKeyup = true;
  }, false, sig);

  // Αποτροπή εστίασης στο μενού του browser όταν αφήνεται το Alt μετά από shortcut
  on(window, 'keyup', e => {
    if (suppressNextAltKeyup && (e.key === 'Alt' || !e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      suppressNextAltKeyup = false;
      scheduleEditorFocus(false);
    }
  }, true, sig);
}
