import { $, on } from '../core/dom.js';
import {
  state,
  applyTheme,
  applyTransparency,
  applyBlur,
  applyToolbarHidden,
  applyNotepadToolbarHidden,
  applyPreviewHidden,
  applyIntuitiveNav,
  applyAutoBraces,
  applyPreviewFollow,
} from './settings.js';
import * as toolbar from './toolbar.js';
import * as notepad from './notepad.js';

const SHORTCUT_HINTS = [
  ['#insert-btn', 'Ctrl+Enter', 'Εισαγωγή εξίσωσης στη σελίδα'],
  ['#notepad-insert-btn', 'Ctrl+Enter', 'Εισαγωγή κειμένου σημειωματάριου στη σελίδα'],
  ['#copy-btn', 'Alt+C', 'Αντιγραφή εξίσωσης στο πρόχειρο'],
  ['#notepad-copy-btn', 'Alt+C', 'Αντιγραφή κειμένου σημειωματάριου'],
  ['#export-more-btn', 'Alt+Z', 'Επιλογές εξαγωγής'],
  ['#notepad-export-btn', 'Alt+Z', 'Επιλογές εξαγωγής σημειωματάριου'],
  ['#notepad-toggle', 'Alt+N', 'Σημειωματάριο phpBB'],
  ['#notepad-templates-btn', 'Alt+L', 'Εμφάνιση/Απόκρυψη προτύπων'],
  ['#notepad-toolbar-toggle-btn', 'Alt+G', 'Εμφάνιση/Απόκρυψη εργαλειοθήκης σημειωματάριου phpBB'],
  ['#notepad-reader-btn', 'Alt+F', 'Λειτουργία Ανάγνωσης — Πλήρης οθόνη ζωντανής προεπισκόπησης'],
  ['#notepad-reader-edit-btn', 'Alt+W', 'Επεξεργασία σημειωματάριου μέσα στην οθόνη ανάγνωσης'],
  ['#theme-toggle', 'Alt+T', 'Εναλλαγή θέματος'],
  ['#transparency-toggle', 'Alt+O', 'Διαφάνεια / Αδιαφάνεια'],
  ['#blur-toggle', 'Alt+B', 'Θόλωμα (Τζαμαρία)'],
  ['#toolbar-toggle', 'Alt+K', 'Εμφάνιση/Απόκρυψη εργαλειοθήκης'],
  ['#preview-toggle', 'Alt+P', 'Εμφάνιση/Απόκρυψη ζωντανής προεπισκόπησης'],
  ['#desktop-pin-btn', 'Alt+Shift+P', 'Πάντα σε πρώτο πλάνο'],
  ['#desktop-min-btn', 'Alt+Shift+M', 'Ελαχιστοποίηση παραθύρου'],
  ['#desktop-max-btn', 'Alt+Shift+F', 'Μεγιστοποίηση / Επαναφορά παραθύρου'],
  ['#desktop-close-btn', 'Alt+Shift+Q', 'Κλείσιμο παραθύρου'],
  ['#preview-inline-btn', 'Alt+A', 'Αριστερή στοίχιση προεπισκόπησης'],
  ['#preview-auto-badge', 'Alt+0', 'Αυτόματο μέγεθος προεπισκόπησης'],
  ['#zoom-out', 'Alt+-', 'Σμίκρυνση προεπισκόπησης'],
  ['#zoom-in', 'Alt+=', 'Μεγέθυνση προεπισκόπησης'],
  ['#notepad-preview-inline-auto-badge', 'Alt+0', 'Αυτόματη κλιμάκωση προεπισκόπησης'],
  ['#notepad-preview-inline-zoom-out', 'Alt+-', 'Μικρότερη προεπισκόπηση'],
  ['#notepad-preview-inline-zoom-in', 'Alt+=', 'Μεγαλύτερη προεπισκόπηση'],
  ['#notepad-text-auto-badge', 'Alt+Shift+0', 'Αυτόματη κλιμάκωση κειμένου σημειωματάριου'],
  ['#notepad-text-zoom-out', 'Alt+Shift+-', 'Μικρότερο κείμενο σημειωματάριου'],
  ['#notepad-text-zoom-in', 'Alt+Shift+=', 'Μεγαλύτερο κείμενο σημειωματάριου'],
  ['#settings-btn', 'Alt+V', 'Απόκρυψη/Εμφάνιση ρυθμίσεων κάτω μπάρας'],
  ['#settings-toggle', 'Alt+S', 'Ρυθμίσεις'],
  ['#recent-toggle', 'Alt+R', 'Πρόσφατα σύμβολα'],
  ['#syntax-highlight-toggle', 'Alt+H', 'Χρωματισμός Σύνταξης'],
  ['#intuitive-nav-toggle', 'Alt+I', 'Διαισθητική Πλοήγηση (κλικ προεπισκόπησης)'],
  ['#auto-braces-btn', 'Alt+J', 'Αυτόματα Άγκιστρα { }'],
  ['#notepad-auto-braces-btn', 'Alt+J', 'Αυτόματα Άγκιστρα { }'],
  ['#auto-braces-toggle', 'Alt+J', 'Αυτόματα Άγκιστρα { }'],
  ['#follow-mode-btn', 'Alt+5', 'Παρακολούθηση προεπισκόπησης (Ακολούθηση / Σταθερή)'],
  ['#notepad-follow-mode-btn', 'Alt+5', 'Παρακολούθηση προεπισκόπησης (Ακολούθηση / Σταθερή)'],
  ['#follow-mode-toggle', 'Alt+5', 'Παρακολούθηση Προεπισκόπησης'],
  ['#notepad-pull-btn', 'Alt+E', 'Επικόλληση της τρέχουσας εξίσωσης από τον Editor'],
  ['#notepad-auto-dollar-btn', 'Alt+4', 'Αυτόματο $...$'],
  ['#phpbb-headings-btn', 'Alt+Shift+H', 'Επικεφαλίδες H1–H7 ([size][b])'],
  ['#phpbb-size-btn', 'Alt+Shift+S', 'Μέγεθος ([size])'],
  ['#phpbb-tb-font-down', 'Alt+6', 'Μικρότερα γράμματα εργαλειοθήκης σημειωματάριου'],
  ['#phpbb-tb-font-up', 'Alt+7', 'Μεγαλύτερα γράμματα εργαλειοθήκης σημειωματάριου'],
  ['[data-bb-wrap="[*] ||στοιχείο"]', 'Alt+8', 'Στοιχείο λίστας ([*])'],
  ['#phpbb-img-btn', 'Alt+Shift+I', 'Εικόνα ([img])'],
  ['#phpbb-ggb-btn', 'Alt+Shift+G', 'GeoGebra ([ggb])'],
  ['#notepad-clear-btn', 'Alt+Shift+Backspace', 'Εκκαθάριση σημειωματάριου'],
  ['[data-bb-wrap="[b]|[/b]|έντονο"]', 'Ctrl+B', 'Έντονα ([b]...[/b])'],
  ['[data-bb-wrap="[i]|[/i]|πλάγιο"]', 'Ctrl+I', 'Πλάγια ([i]...[/i])'],
  ['[data-bb-wrap="[u]|[/u]|υπογράμμιση"]', 'Ctrl+U', 'Υπογράμμιση ([u]...[/u])'],
  ['[data-bb-wrap="[s]|[/s]|διαγραφή"]', 'Ctrl+Shift+X', 'Διακριτή Διαγραφή ([s]...[/s])'],
  ['#phpbb-list-ul', 'Ctrl+Shift+8', 'Λίστα με κουκκίδες ([list])'],
  ['#phpbb-list-ol', 'Ctrl+Shift+7', 'Αριθμημένη λίστα ([list=1])'],
  ['#phpbb-url-btn', 'Ctrl+K', 'Σύνδεσμος ([url])'],
  ['[data-bb-wrap="[quote]|[/quote]|Παράθεση..."]', 'Alt+Q', 'Παράθεση ([quote])'],
  ['[data-bb-wrap="[code]|[/code]|κώδικας"]', 'Alt+U', 'Κώδικας ([code])'],
  ['[data-bb-wrap="[tex]|[/tex]|x^2+y^2=r^2"]', 'Alt+X', 'Εξίσωση phpBB ([tex])'],
  ['[data-bb-wrap="[hide]|[/hide]|Κρυφή λύση..."]', 'Alt+Y', 'Απόκρυψη / Spoiler ([hide])'],
  ['#phpbb-clear-fmt-btn', 'Ctrl+\\', 'Απαλοιφή μορφοποίησης'],
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
  for (const sel of ['#matrix-modal', '#phpbb-media-modal']) {
    const m = $(sel);
    if (m?.classList.contains('active')) {
      m.classList.remove('active');
      return true;
    }
  }
  const openMenus = document.querySelectorAll('.export-menu.active, .phpbb-dropdown-menu.active');
  if (openMenus.length) {
    openMenus.forEach(el => el.classList.remove('active'));
    return true;
  }
  for (const sel of ['#settings-popup', '#recent-popup']) {
    const p = $(sel);
    if (p?.classList.contains('active')) {
      toolbar.closeAllPopups();
      return true;
    }
  }
  if (document.body.classList.contains('notepad-reader-mode')) {
    window.__toggleNotepadReaderMode?.(false);
    return true;
  }
  return false;
}

function isTextOverlayOpen() {
  const inReaderOnly =
    document.body.classList.contains('notepad-reader-mode') &&
    !document.body.classList.contains('notepad-reader-edit');
  return Boolean(
    inReaderOnly ||
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
    if (e.code === 'KeyW' && !e.shiftKey && window.mathglassDesktop?.isDesktop) {
      if (!isFromHost) e.preventDefault?.();
      if (!inNotepad) notepad.setNotepadOpen(true);
      if (!document.body.classList.contains('notepad-reader-mode')) {
        window.__toggleNotepadReaderMode?.(true);
        window.__toggleNotepadReaderEditMode?.(true);
      } else {
        window.__toggleNotepadReaderEditMode?.();
      }
      return true;
    }
    if (e.key === 'Enter' && inNotepad && (isNpFocused || isFromHost) && !window.mathglassDesktop?.isDesktop) {
      const npInsBtn = $('#notepad-insert-btn');
      if (npInsBtn) {
        if (!isFromHost) e.preventDefault?.();
        npInsBtn.click();
        scheduleEditorFocus(false);
        return true;
      }
    }
    if (inNotepad && isNpFocused && !e.shiftKey) {
      if (e.code === 'KeyB') { if (!isFromHost) e.preventDefault?.(); $('[data-bb-wrap="[b]|[/b]|έντονο"]')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'KeyI') { if (!isFromHost) e.preventDefault?.(); $('[data-bb-wrap="[i]|[/i]|πλάγιο"]')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'KeyU') { if (!isFromHost) e.preventDefault?.(); $('[data-bb-wrap="[u]|[/u]|υπογράμμιση"]')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'KeyK') { if (!isFromHost) e.preventDefault?.(); $('#phpbb-url-btn')?.click(); return true; }
      if (e.code === 'Backslash') { if (!isFromHost) e.preventDefault?.(); $('#phpbb-clear-fmt-btn')?.click(); scheduleEditorFocus(false); return true; }
    }
    if (inNotepad && isNpFocused && e.shiftKey) {
      if (e.code === 'KeyX') { if (!isFromHost) e.preventDefault?.(); $('[data-bb-wrap="[s]|[/s]|διαγραφή"]')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'Digit8') { if (!isFromHost) e.preventDefault?.(); $('#phpbb-list-ul')?.click(); scheduleEditorFocus(false); return true; }
      if (e.code === 'Digit7') { if (!isFromHost) e.preventDefault?.(); $('#phpbb-list-ol')?.click(); scheduleEditorFocus(false); return true; }
    }
    return false;
  }

  if (!e.altKey || mod) return false;

  if (e.shiftKey) {
    switch (e.code) {
      case 'KeyP':
        if (window.mathglassDesktop?.isDesktop) {
          if (!isFromHost) e.preventDefault?.();
          window.mathglassDesktop.winAction('pin');
          return true;
        }
        return false;
      case 'KeyM':
        if (window.mathglassDesktop?.isDesktop) {
          if (!isFromHost) e.preventDefault?.();
          window.mathglassDesktop.winAction('minimize');
          return true;
        }
        return false;
      case 'KeyF':
        if (window.mathglassDesktop?.isDesktop) {
          if (!isFromHost) e.preventDefault?.();
          window.mathglassDesktop.winAction('maximize');
          return true;
        }
        return false;
      case 'KeyQ':
        if (window.mathglassDesktop?.isDesktop) {
          if (!isFromHost) e.preventDefault?.();
          window.mathglassDesktop.winAction('close');
          return true;
        }
        return false;
      case 'KeyH':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#phpbb-headings-btn')?.click();
          return true;
        }
        return false;
      case 'KeyS':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#phpbb-size-btn')?.click();
          return true;
        }
        return false;
      case 'KeyI':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#phpbb-img-btn')?.click();
          return true;
        }
        return false;
      case 'KeyG':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#phpbb-ggb-btn')?.click();
          return true;
        }
        return false;
      case 'Backspace':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#notepad-clear-btn')?.click();
          scheduleEditorFocus(false);
          return true;
        }
        return false;
      case 'Equal':
      case 'NumpadAdd':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#notepad-text-zoom-in')?.click();
          scheduleEditorFocus(false);
          return true;
        }
        return false;
      case 'Minus':
      case 'NumpadSubtract':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#notepad-text-zoom-out')?.click();
          scheduleEditorFocus(false);
          return true;
        }
        return false;
      case 'Digit0':
      case 'Numpad0':
        if (inNotepad) {
          if (!isFromHost) e.preventDefault?.();
          $('#notepad-text-auto-badge')?.click();
          scheduleEditorFocus(false);
          return true;
        }
        return false;
    }
    return false;
  }

  switch (e.code) {
    case 'KeyJ':
      if (!isFromHost) e.preventDefault?.();
      applyAutoBraces(!state.autoBracesEnabled, true);
      scheduleEditorFocus(false);
      return true;
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
    case 'KeyZ':
      if (!isFromHost) e.preventDefault?.();
      (inNotepad ? $('#notepad-export-btn') : $('#export-more-btn'))?.click();
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
      if (window.mathglassDesktop?.isDesktop) return false;
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
    case 'KeyA':
      if (!inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#preview-inline-btn')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'KeyV':
      if (!inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#settings-btn')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'KeyH':
      if (!isFromHost) e.preventDefault?.();
      $('#syntax-highlight-toggle')?.click();
      scheduleEditorFocus(false);
      return true;
    case 'KeyI':
      if (!isFromHost) e.preventDefault?.();
      applyIntuitiveNav(!state.intuitiveNavEnabled, true);
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
    case 'KeyW': {
      if (!isFromHost) e.preventDefault?.();
      if (!inNotepad) notepad.setNotepadOpen(true);
      if (!document.body.classList.contains('notepad-reader-mode')) {
        window.__toggleNotepadReaderMode?.(true);
        window.__toggleNotepadReaderEditMode?.(true);
      } else {
        window.__toggleNotepadReaderEditMode?.();
      }
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
    case 'KeyQ':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('[data-bb-wrap="[quote]|[/quote]|Παράθεση..."]')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'KeyU':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('[data-bb-wrap="[code]|[/code]|κώδικας"]')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'KeyY':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('[data-bb-wrap="[hide]|[/hide]|Κρυφή λύση..."]')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'Digit1':
      if (!inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#tex-toggle')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'Digit2':
      if (!inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#inline-toggle')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'Digit3':
      if (!inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#displaystyle-toggle')?.click();
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
    case 'Digit5':
    case 'Numpad5':
      if (!isFromHost) e.preventDefault?.();
      applyPreviewFollow(!state.previewFollowEnabled, true);
      scheduleEditorFocus(false);
      return true;
    case 'Digit6':
    case 'Numpad6':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#phpbb-tb-font-down')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'Digit7':
    case 'Numpad7':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('#phpbb-tb-font-up')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'Digit8':
    case 'Numpad8':
      if (inNotepad) {
        if (!isFromHost) e.preventDefault?.();
        $('[data-bb-wrap="[*] ||στοιχείο"]')?.click();
        scheduleEditorFocus(false);
        return true;
      }
      return false;
    case 'Equal':
    case 'NumpadAdd':
      if (!isFromHost) e.preventDefault?.();
      $(inNotepad ? '#notepad-preview-inline-zoom-in' : '#zoom-in')?.click();
      scheduleEditorFocus(false);
      return true;
    case 'Minus':
    case 'NumpadSubtract':
      if (!isFromHost) e.preventDefault?.();
      $(inNotepad ? '#notepad-preview-inline-zoom-out' : '#zoom-out')?.click();
      scheduleEditorFocus(false);
      return true;
    case 'Digit0':
    case 'Numpad0':
      if (!isFromHost) e.preventDefault?.();
      $(inNotepad ? '#notepad-preview-inline-auto-badge' : '#preview-auto-badge')?.click();
      scheduleEditorFocus(false);
      return true;
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
