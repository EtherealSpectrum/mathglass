import { KEYS, MSG } from '../core/constants.js';
import { $, on, clamp, rafThrottle } from '../core/dom.js';
import { get, set, mirrorGet } from '../core/storage.js';
import { wrappedCode, copyText, insertTextToPage } from './actions.js';

let notepadOpen = false;
let autoDollarWrap = true;

export function isNotepadOpen() { return notepadOpen; }
export function isAutoDollarWrapEnabled() { return autoDollarWrap; }

function notifyState() {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({
      type: MSG.PANEL_POPUP_STATE,
      settingsOpen: Boolean($('#settings-popup')?.classList.contains('active')),
      recentOpen: Boolean($('#recent-popup')?.classList.contains('active')),
      notepadOpen,
    }, '*');
  } catch {}
}

export function setNotepadOpen(open) {
  notepadOpen = Boolean(open);
  document.body.classList.toggle('notepad-open', notepadOpen);
  const btn = $('#notepad-toggle');
  if (btn) btn.classList.toggle('active', notepadOpen);
  if (notepadOpen) {
    $('#settings-popup')?.classList.remove('active');
    $('#recent-popup')?.classList.remove('active');
    renderHybridPreview();
    requestAnimationFrame(() => { const np = $('#notepad-input'); try { np?.focus({ preventScroll: true }); } catch { np?.focus(); } });
  } else {
    requestAnimationFrame(() => { const lx = $('#latex-input'); try { lx?.focus({ preventScroll: true }); } catch { lx?.focus(); } });
  }
  notifyState();
}

export function toggleNotepad() { setNotepadOpen(!notepadOpen); }

export function tokenizeHybridLatex(input) {
  const tokens = [];
  let textBuf = '';
  let i = 0;
  const n = input.length;

  const flushText = () => {
    if (textBuf) { tokens.push({ type: 'text', content: textBuf }); textBuf = ''; }
  };

  const findClosing = (start, delim) => {
    let idx = start;
    while (idx < n) {
      if (input[idx] === '\\' && delim !== '\\)' && delim !== '\\]' && delim !== '[/tex]' && delim !== '[/latex]') {
        idx += 2; continue;
      }
      if (delim === '[/tex]' || delim === '[/latex]') {
        if (input.slice(idx, idx + delim.length).toLowerCase() === delim) return idx;
      } else if (input.startsWith(delim, idx)) return idx;
      idx++;
    }
    return -1;
  };

  const findSingleDollarEnd = start => {
    let idx = start;
    while (idx < n) {
      if (input[idx] === '\\') { idx += 2; continue; }
      if (input[idx] === '\n' && input[idx + 1] === '\n') return -1;
      if (input[idx] === '$' && input[idx + 1] !== '$') return idx;
      if (input[idx] === '$' && input[idx + 1] === '$') return -1;
      idx++;
    }
    return -1;
  };

  while (i < n) {
    if (input[i] === '\\' && input[i + 1] === '$') { textBuf += '\\$'; i += 2; continue; }

    if (input[i] === '[' && input.slice(i, i + 5).toLowerCase() === '[tex]') {
      const end = findClosing(i + 5, '[/tex]');
      if (end !== -1) {
        flushText();
        const inner = input.slice(i + 5, end);
        const beforeC = i > 0 ? input[i - 1] : '\n';
        const afterC = end + 6 < n ? input[end + 6] : '\n';
        const disp = ((beforeC === '\n' || i === 0) && (afterC === '\n' || end + 6 === n)) || inner.includes('\n') || inner.includes('\\displaystyle');
        tokens.push({ type: 'math', display: disp, content: inner, openDelim: input.slice(i, i + 5), closeDelim: input.slice(end, end + 6) });
        i = end + 6; continue;
      }
    }

    if (input[i] === '[' && input.slice(i, i + 7).toLowerCase() === '[latex]') {
      const end = findClosing(i + 7, '[/latex]');
      if (end !== -1) {
        flushText();
        tokens.push({ type: 'math', display: true, content: input.slice(i + 7, end), openDelim: input.slice(i, i + 7), closeDelim: input.slice(end, end + 8) });
        i = end + 8; continue;
      }
    }

    if (input[i] === '$' && input[i + 1] === '$') {
      const end = findClosing(i + 2, '$$');
      if (end !== -1) { flushText(); tokens.push({ type: 'math', display: true, content: input.slice(i + 2, end), openDelim: '$$', closeDelim: '$$' }); i = end + 2; continue; }
    }

    if (input[i] === '\\' && input[i + 1] === '[') {
      const end = findClosing(i + 2, '\\]');
      if (end !== -1) { flushText(); tokens.push({ type: 'math', display: true, content: input.slice(i + 2, end), openDelim: '\\[', closeDelim: '\\]' }); i = end + 2; continue; }
    }

    if (input[i] === '\\' && input[i + 1] === '(') {
      const end = findClosing(i + 2, '\\)');
      if (end !== -1) { flushText(); tokens.push({ type: 'math', display: false, content: input.slice(i + 2, end), openDelim: '\\(', closeDelim: '\\)' }); i = end + 2; continue; }
    }

    if (input[i] === '$' && input[i + 1] !== '$') {
      const end = findSingleDollarEnd(i + 1);
      if (end !== -1 && end > i + 1) { flushText(); tokens.push({ type: 'math', display: false, content: input.slice(i + 1, end), openDelim: '$', closeDelim: '$' }); i = end + 1; continue; }
    }

    textBuf += input[i];
    i++;
  }

  flushText();
  return tokens;
}

export function isCursorInsideKaTeX(input, cursorPos) {
  const pos = Math.max(0, Math.min(input.length, cursorPos));
  let i = 0;
  const n = input.length;

  const findClosing = (start, delim) => {
    let idx = start;
    while (idx < n) {
      if (input[idx] === '\\' && delim !== '\\)' && delim !== '\\]' && delim !== '[/tex]' && delim !== '[/latex]') {
        idx += 2; continue;
      }
      if (delim === '[/tex]' || delim === '[/latex]') {
        if (input.slice(idx, idx + delim.length).toLowerCase() === delim) return idx;
      } else if (input.startsWith(delim, idx)) return idx;
      idx++;
    }
    return -1;
  };

  const findSingleDollarEnd = start => {
    let idx = start;
    while (idx < n) {
      if (input[idx] === '\\') { idx += 2; continue; }
      if (input[idx] === '\n' && input[idx + 1] === '\n') return -1;
      if (input[idx] === '$' && input[idx + 1] !== '$') return idx;
      if (input[idx] === '$' && input[idx + 1] === '$') return -1;
      idx++;
    }
    return -1;
  };

  while (i < n) {
    if (i > pos) return false;
    if (input[i] === '\\' && input[i + 1] === '$') { i += 2; continue; }

    if (input[i] === '[' && input.slice(i, i + 5).toLowerCase() === '[tex]') {
      const end = findClosing(i + 5, '[/tex]');
      if (end !== -1) { if (pos >= i + 5 && pos <= end) return true; i = end + 6; continue; }
      if (pos >= i + 5) return true;
    }
    if (input[i] === '[' && input.slice(i, i + 7).toLowerCase() === '[latex]') {
      const end = findClosing(i + 7, '[/latex]');
      if (end !== -1) { if (pos >= i + 7 && pos <= end) return true; i = end + 8; continue; }
      if (pos >= i + 7) return true;
    }
    if (input[i] === '$' && input[i + 1] === '$') {
      const end = findClosing(i + 2, '$$');
      if (end !== -1) { if (pos >= i + 2 && pos <= end) return true; i = end + 2; continue; }
      if (pos >= i + 2) return true;
    }
    if (input[i] === '\\' && input[i + 1] === '[') {
      const end = findClosing(i + 2, '\\]');
      if (end !== -1) { if (pos >= i + 2 && pos <= end) return true; i = end + 2; continue; }
      if (pos >= i + 2) return true;
    }
    if (input[i] === '\\' && input[i + 1] === '(') {
      const end = findClosing(i + 2, '\\)');
      if (end !== -1) { if (pos >= i + 2 && pos <= end) return true; i = end + 2; continue; }
      if (pos >= i + 2) return true;
    }
    if (input[i] === '$' && input[i + 1] !== '$') {
      const end = findSingleDollarEnd(i + 1);
      if (end !== -1) { if (pos >= i + 1 && pos <= end) return true; i = end + 1; continue; }
      if (pos >= i + 1 && !input.slice(i + 1, pos).includes('\n\n')) return true;
    }
    i++;
  }
  return false;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderPhpbbHtml(input, isLight) {
  const tokens = tokenizeHybridLatex(input);
  const mathSlots = [];
  let combined = '';

  for (const tok of tokens) {
    if (tok.type === 'text') {
      combined += escHtml(tok.content.replace(/\\\$/g, '$'));
    } else {
      const idx = mathSlots.length;
      const inner = tok.content.trim();
      let rendered = '';
      if (!inner) {
        rendered = escHtml((tok.openDelim || '$') + (tok.closeDelim || '$'));
      } else {
        try {
          rendered = katex.renderToString(inner, {
            throwOnError: false,
            displayMode: tok.display,
            errorColor: isLight ? '#dc2626' : '#f28b82',
          });
        } catch {
          rendered = escHtml(tok.content);
        }
      }
      mathSlots.push(
        tok.display
          ? `<div class="np-math-display">${rendered}</div>`
          : `<span class="np-math-inline">${rendered}</span>`
      );
      combined += `@@MATH_SLOT_${idx}@@`;
    }
  }

  let html = combined;
  html = html.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, c) => `<pre class="phpbb-code">${c.trim()}</pre>`);
  html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
  html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>');
  html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>');
  html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>');
  for (let pass = 0; pass < 3; pass++) {
    html = html.replace(/\[size=(\d{2,3})\]([\s\S]*?)\[\/size\]/gi, (_, sz, inner) => {
      const pct = Math.max(60, Math.min(250, parseInt(sz, 10) || 100));
      return `<span style="font-size:${pct}%;line-height:1.35;">${inner}</span>`;
    });
  }
  html = html.replace(/\[url=(https?:\/\/[^\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');
  html = html.replace(/\[url\](https?:\/\/[^\[]+)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\[img\](https?:\/\/[^\[]+)\[\/img\]/gi, '<img src="$1" alt="Εικόνα phpBB" loading="lazy">');
  html = html.replace(/\[ggb\]([\s\S]*?)\[\/ggb\]/gi, (_, id) => `<div class="phpbb-ggb">📐 GeoGebra: <b>${id.trim()}</b></div>`);
  html = html.replace(/\[hide(?:=&quot;([^&]*)&quot;|=([^\]]*))?\]([\s\S]*?)\[\/hide\]/gi, (_, q1, q2, inner) => {
    const title = q1 || q2 || 'Κρυφό περιεχόμενο (κλικ)';
    return `<details class="phpbb-hide"><summary>${title}</summary><div class="phpbb-hide-body">${inner.trim()}</div></details>`;
  });
  html = html.replace(/\[quote(?:=&quot;([^&]*)&quot;|=([^\]]*))?\]([\s\S]*?)\[\/quote\]/gi, (_, q1, q2, inner) => {
    const author = q1 || q2;
    const head = author ? `<div style="font-size:0.85em;font-weight:700;margin-bottom:3px;">${author} έγραψε:</div>` : '';
    return `<blockquote class="phpbb-quote">${head}${inner.trim()}</blockquote>`;
  });
  html = html.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, inner) => {
    const clean = inner
      .replace(/\[tr\]/gi, '<tr>').replace(/\[\/tr\]/gi, '</tr>')
      .replace(/\[th\]/gi, '<th>').replace(/\[\/th\]/gi, '</th>')
      .replace(/\[td\]/gi, '<td>').replace(/\[\/td\]/gi, '</td>');
    return `<table class="phpbb-table">${clean}</table>`;
  });
  html = html.replace(/\[list(=1|=a|=i)?\]([\s\S]*?)\[\/list\]/gi, (_, ordered, inner) => {
    const tag = ordered ? 'ol' : 'ul';
    const parts = inner.split(/\[\*\]/i).map(s => s.trim()).filter(Boolean);
    const items = parts.length ? parts.map(p => `<li>${p}</li>`).join('') : `<li>${inner.trim()}</li>`;
    return `<${tag}>${items}</${tag}>`;
  });

  html = html.replace(/@@MATH_SLOT_(\d+)@@/g, (_, idx) => mathSlots[Number(idx)] || '');
  return html;
}

export function renderHybridPreview() {
  const inputEl = $('#notepad-input');
  const previewEl = $('#notepad-preview');
  if (!inputEl || !previewEl) return;

  const src = inputEl.value;
  if (!src.trim()) {
    previewEl.innerHTML = '<span class="np-placeholder">Η υβριδική προεπισκόπηση (phpBB + KaTeX) θα εμφανιστεί εδώ…</span>';
    return;
  }
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  previewEl.innerHTML = renderPhpbbHtml(src, isLight);
}

function wrapInNotepad(before, after, fallback = '') {
  const ta = $('#notepad-input');
  if (!ta) return;
  ta.focus();
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd ?? ta.value.length;
  const sel = ta.value.slice(s, e);
  const inner = sel || fallback;
  const text = before + inner + after;
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch {}
  if (!ok) ta.setRangeText(text, s, e, 'preserve');
  if (!sel && after) {
    ta.setSelectionRange(s + before.length, s + before.length + fallback.length);
  } else {
    ta.setSelectionRange(s + text.length, s + text.length);
  }
  renderHybridPreview();
  window.__refreshSyntaxHighlight?.();
  set(KEYS.notepadText, ta.value);
}

function clearBbcode(input) {
  return input
    .replace(/\[\/?(?:b|i|u|s|quote|code|list|img|url|size|ggb|hide|table|tr|th|td)(?:=[^\]]*)?\]/gi, '')
    .replace(/\[\*\]\s*/g, '• ')
    .replace(/^#{1,6}\s+/gm, '');
}

export function init(ac) {
  const sig = ac.signal;
  const ta = $('#notepad-input');
  const pvOuter = $('#notepad-preview-outer');
  const rz = $('#notepad-resizer');
  if (!ta || !pvOuter) return;

  window.__renderHybridPreview = renderHybridPreview;
  const render = rafThrottle(() => renderHybridPreview());
  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => set(KEYS.notepadText, ta.value), 200);
  };

  // Auto-$ toggle state
  const autoDollarBtn = $('#notepad-auto-dollar-btn');
  const syncAutoDollarBtn = () => {
    if (!autoDollarBtn) return;
    autoDollarBtn.classList.toggle('active', autoDollarWrap);
    autoDollarBtn.setAttribute('aria-pressed', String(autoDollarWrap));
    autoDollarBtn.title = autoDollarWrap
      ? 'Αυτόματο $...$: ΕΝΕΡΓΟ — Όταν ο κέρσορας είναι εκτός εξίσωσης ($...$, $$...$$, [tex]...[/tex]), τα σύμβολα της εργαλειοθήκης KaTeX περιβάλλονται αυτόματα με $...$ (Alt+4)'
      : 'Αυτόματο $...$: ΑΝΕΝΕΡΓΟ — Κλικ για αυτόματο περιτύλιγμα με $...$ στα σύμβολα της εργαλειοθήκης KaTeX όταν γράφετε εκτός εξίσωσης (Alt+4)';
  };
  const cachedAd = mirrorGet(KEYS.notepadAutoDollar, 'bool');
  if (typeof cachedAd === 'boolean') autoDollarWrap = cachedAd;
  syncAutoDollarBtn();

  get([KEYS.notepadText, KEYS.notepadHeight, KEYS.notepadAutoDollar]).then(r => {
    if (typeof r[KEYS.notepadAutoDollar] === 'boolean') {
      autoDollarWrap = r[KEYS.notepadAutoDollar];
      syncAutoDollarBtn();
    }
    if (typeof r[KEYS.notepadText] === 'string' && !ta.value) {
      ta.value = r[KEYS.notepadText];
      renderHybridPreview();
      window.__refreshSyntaxHighlight?.();
    }
    if (typeof r[KEYS.notepadHeight] === 'number' && r[KEYS.notepadHeight] > 60) {
      document.documentElement.style.setProperty('--notepad-preview-height', r[KEYS.notepadHeight] + 'px');
    }
  });

  if (autoDollarBtn) {
    on(autoDollarBtn, 'click', () => {
      autoDollarWrap = !autoDollarWrap;
      syncAutoDollarBtn();
      set(KEYS.notepadAutoDollar, autoDollarWrap);
    }, false, sig);
  }

  on(ta, 'input', () => { render(); scheduleSave(); }, false, sig);
  on(window, 'pagehide', () => set(KEYS.notepadText, ta.value), false, sig);

  const toggleBtn = $('#notepad-toggle');
  if (toggleBtn) on(toggleBtn, 'click', e => { e.stopPropagation(); toggleNotepad(); }, false, sig);

  on($('#notepad-pull-btn'), 'click', () => {
    const code = wrappedCode();
    if (code) wrapInNotepad('', '', code);
  }, false, sig);

  // phpBB Toolbar handlers (mousedown preventDefault διατηρεί την επιλογή κειμένου στο #notepad-input)
  const phpbbToolbar = $('#phpbb-toolbar');
  if (phpbbToolbar) {
    on(phpbbToolbar, 'mousedown', e => {
      if (e.target.closest('button')) e.preventDefault();
    }, false, sig);
  }
  const hBtn = $('#phpbb-headings-btn'), hMenu = $('#phpbb-headings-menu');
  const sBtn = $('#phpbb-size-btn'), sMenu = $('#phpbb-size-menu');
  if (hBtn && hMenu) {
    on(hBtn, 'click', e => { e.stopPropagation(); sMenu?.classList.remove('active'); hMenu.classList.toggle('active'); }, false, sig);
    hMenu.querySelectorAll('[data-phpbb-h]').forEach(b => {
      on(b, 'click', e => {
        e.stopPropagation();
        const pct = b.getAttribute('data-phpbb-h');
        wrapInNotepad(`[size=${pct}][b]`, '[/b][/size]', 'Επικεφαλίδα');
        hMenu.classList.remove('active');
      }, false, sig);
    });
  }
  if (sBtn && sMenu) {
    on(sBtn, 'click', e => { e.stopPropagation(); hMenu?.classList.remove('active'); sMenu.classList.toggle('active'); }, false, sig);
    sMenu.querySelectorAll('[data-phpbb-size]').forEach(b => {
      on(b, 'click', e => {
        e.stopPropagation();
        const sz = b.getAttribute('data-phpbb-size');
        wrapInNotepad(`[size=${sz}]`, '[/size]', 'κείμενο');
        sMenu.classList.remove('active');
      }, false, sig);
    });
  }
  on(document, 'click', () => { hMenu?.classList.remove('active'); sMenu?.classList.remove('active'); }, false, sig);

  document.querySelectorAll('[data-bb-wrap]').forEach(b => {
    on(b, 'click', () => {
      const [before, after, fb] = (b.getAttribute('data-bb-wrap') || '||').split('|');
      wrapInNotepad(before || '', after || '', fb || '');
    }, false, sig);
  });

  const insertList = ordered => {
    const s = ta.selectionStart ?? ta.value.length;
    const e = ta.selectionEnd ?? ta.value.length;
    const sel = ta.value.slice(s, e).trim();
    const tag = ordered ? '[list=1]' : '[list]';
    if (sel) {
      const lines = sel.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.startsWith('[*]') ? l : `[*] ${l}`).join('\n');
      wrapInNotepad('', '', `${tag}\n${lines}\n[/list]`);
    } else {
      wrapInNotepad('', '', `${tag}\n[*] Στοιχείο 1\n[*] Στοιχείο 2\n[/list]`);
    }
  };
  on($('#phpbb-list-ul'), 'click', () => insertList(false), false, sig);
  on($('#phpbb-list-ol'), 'click', () => insertList(true), false, sig);

  on($('#phpbb-clear-fmt-btn'), 'click', () => {
    ta.focus();
    const s = ta.selectionStart ?? 0, e = ta.selectionEnd ?? 0;
    if (e > s) {
      const cleaned = clearBbcode(ta.value.slice(s, e));
      wrapInNotepad('', '', cleaned);
    } else {
      const cleanedAll = clearBbcode(ta.value);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('insertText', false, cleanedAll); } catch {}
      if (!ok) ta.value = cleanedAll;
      renderHybridPreview();
      window.__refreshSyntaxHighlight?.();
      set(KEYS.notepadText, ta.value);
    }
  }, false, sig);

  // Media modal (URL, IMG, GGB)
  const mModal = $('#phpbb-media-modal');
  let mediaMode = 'url';
  if (mModal) {
    const closeM = () => mModal.classList.remove('active');
    const openM = mode => {
      mediaMode = mode;
      const sel = ta.value.slice(ta.selectionStart ?? 0, ta.selectionEnd ?? 0);
      $('#phpbb-media-title').textContent = mode === 'url' ? 'Σύνδεσμος ([url])' : mode === 'img' ? 'Εικόνα ([img])' : 'GeoGebra ([ggb])';
      $('#phpbb-media-url-label').textContent = mode === 'ggb' ? 'ID υλικού ή URL GeoGebra:' : 'Διεύθυνση URL:';
      $('#phpbb-media-text-wrap').style.display = mode === 'url' ? 'block' : 'none';
      $('#phpbb-media-url').value = sel.startsWith('http') ? sel : '';
      $('#phpbb-media-text').value = !sel.startsWith('http') ? sel : '';
      mModal.classList.add('active');
    };
    on($('#phpbb-url-btn'), 'click', () => openM('url'), false, sig);
    on($('#phpbb-img-btn'), 'click', () => openM('img'), false, sig);
    on($('#phpbb-ggb-btn'), 'click', () => openM('ggb'), false, sig);
    on($('#close-phpbb-media'), 'click', closeM, false, sig);
    on($('#cancel-phpbb-media'), 'click', closeM, false, sig);
    on($('#apply-phpbb-media'), 'click', () => {
      const u = ($('#phpbb-media-url')?.value || '').trim();
      const tx = ($('#phpbb-media-text')?.value || '').trim();
      if (!u) return;
      const bb = mediaMode === 'url' ? (tx ? `[url=${u}]${tx}[/url]` : `[url]${u}[/url]`)
        : mediaMode === 'img' ? `[img]${u}[/img]` : `[ggb]${u}[/ggb]`;
      wrapInNotepad('', '', bb);
      closeM();
    }, false, sig);
  }

  // Safe Clear
  const clearBtn = $('#notepad-clear-btn');
  if (clearBtn) {
    let clearTimer = null;
    const resetClear = () => {
      clearTimeout(clearTimer);
      clearBtn.dataset.confirm = '';
      clearBtn.classList.remove('confirming');
      clearBtn.textContent = 'Εκκαθάριση';
    };
    on(clearBtn, 'click', () => {
      if (!ta.value) return;
      if (clearBtn.dataset.confirm !== '1') {
        clearBtn.dataset.confirm = '1';
        clearBtn.classList.add('confirming');
        clearBtn.textContent = 'Σίγουρα;';
        clearTimer = setTimeout(resetClear, 3000);
        return;
      }
      resetClear();
      ta.focus(); ta.select();
      try { document.execCommand('insertText', false, ''); } catch { ta.value = ''; }
      renderHybridPreview();
      window.__refreshSyntaxHighlight?.();
      set(KEYS.notepadText, '');
    }, false, sig);
  }

  on($('#notepad-copy-btn'), 'click', function () { copyText(ta.value, this); }, false, sig);
  on($('#notepad-insert-btn'), 'click', function () { insertTextToPage(ta.value, this); }, false, sig);

  if (rz) {
    let start = null;
    on(rz, 'pointerdown', e => {
      e.preventDefault();
      const bodyEl = $('.notepad-body');
      start = { y: e.clientY, h: pvOuter.offsetHeight, max: Math.max(90, (bodyEl?.clientHeight || innerHeight) - 85) };
      rz.classList.add('active'); document.body.classList.add('is-resizing'); rz.setPointerCapture(e.pointerId);
    }, false, sig);
    on(rz, 'pointermove', e => {
      if (!start) return;
      const v = clamp(start.h + (start.y - e.clientY), 70, start.max);
      document.documentElement.style.setProperty('--notepad-preview-height', Math.round(v) + 'px');
      set(KEYS.notepadHeight, Math.round(v));
    }, false, sig);
    const endRz = e => {
      if (!start) return; start = null;
      try { rz.releasePointerCapture(e.pointerId); } catch {}
      rz.classList.remove('active'); document.body.classList.remove('is-resizing');
    };
    on(rz, 'pointerup', endRz, false, sig); on(rz, 'pointercancel', endRz, false, sig);
  }
}
