import { KEYS } from '../core/constants.js';
import { $, on } from '../core/dom.js';
import { get, set, mirrorGet } from '../core/storage.js';
import { tokenizeHybridLatex } from './notepad.js';

let syntaxEnabled = true;
const editors = [];

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tokenizeLatex(code) {
  const tokens = [];
  let i = 0;
  const n = code.length;
  const braceStack = [];
  const unmatched = new Set();

  for (let k = 0; k < n; k++) {
    if (code[k] === '\\') { k++; continue; }
    if (code[k] === '%') { while (k < n && code[k] !== '\n') k++; continue; }
    if (code[k] === '{') braceStack.push(k);
    else if (code[k] === '}') {
      if (braceStack.length === 0) unmatched.add(k);
      else braceStack.pop();
    }
  }
  for (const idx of braceStack) unmatched.add(idx);

  while (i < n) {
    const ch = code[i];
    if (ch === '%') {
      let end = i + 1;
      while (end < n && code[end] !== '\n') end++;
      tokens.push(`<span class="sh-comment">${escHtml(code.slice(i, end))}</span>`);
      i = end; continue;
    }
    if (ch === '\\') {
      if (code.startsWith('\\begin', i) || code.startsWith('\\end', i)) {
        const m = code.slice(i).match(/^\\(?:begin|end)\{[^}]*\}/);
        if (m) { tokens.push(`<span class="sh-env">${escHtml(m[0])}</span>`); i += m[0].length; continue; }
      }
      if (i + 1 < n && /[a-zA-Z@]+/.test(code[i + 1])) {
        let end = i + 2;
        while (end < n && /[a-zA-Z@]+/.test(code[end])) end++;
        tokens.push(`<span class="sh-cmd">${escHtml(code.slice(i, end))}</span>`);
        i = end; continue;
      }
      if (i + 1 < n) {
        const pair = code.slice(i, i + 2);
        tokens.push(`<span class="${pair === '\\\\' ? 'sh-op' : 'sh-cmd'}">${escHtml(pair)}</span>`);
        i += 2; continue;
      }
      tokens.push('<span class="sh-err">\\</span>'); i++; continue;
    }
    if (ch === '{' || ch === '}') { tokens.push(`<span class="${unmatched.has(i) ? 'sh-err' : 'sh-brace'}">${ch}</span>`); i++; continue; }
    if (ch === '[' || ch === ']') { tokens.push(`<span class="sh-bracket">${ch}</span>`); i++; continue; }
    if (ch === '$') { tokens.push('<span class="sh-delim">$</span>'); i++; continue; }
    if ('&^_~'.includes(ch)) { tokens.push(`<span class="sh-op">${escHtml(ch)}</span>`); i++; continue; }
    if (/[0-9]/.test(ch)) {
      let end = i + 1;
      while (end < n && /[0-9.]/.test(code[end])) end++;
      tokens.push(`<span class="sh-num">${escHtml(code.slice(i, end))}</span>`);
      i = end; continue;
    }
    let end = i + 1;
    while (end < n && !'%\\{}[]$&^_~'.includes(code[end]) && !/[0-9]/.test(code[end])) end++;
    tokens.push(escHtml(code.slice(i, end)));
    i = end;
  }
  return tokens.join('');
}

const BBCODE_TAG_RE = /(\[(?:\/?(?:b|i|u|s|quote|code|list|img|url|size|color|ggb|hide|tex|table|tr|th|td)|\*)(?:=[^\]]*)?\])/gi;

function highlightBbcodeText(text) {
  return text.split(BBCODE_TAG_RE).map((part, idx) =>
    idx % 2 === 1
      ? `<span class="sh-bbtag">${escHtml(part)}</span>`
      : escHtml(part).replace(/\\\$/g, '<span class="sh-comment">\\$</span>')
  ).join('');
}

function renderHighlight(ta, pre, mode) {
  if (!ta || !pre) return;
  const val = ta.value || '';
  if (!syntaxEnabled) { pre.innerHTML = ''; return; }
  let html = '';
  if (mode === 'latex') {
    html = tokenizeLatex(val);
  } else {
    html = tokenizeHybridLatex(val).map(seg => {
      if (seg.type === 'text') return highlightBbcodeText(seg.content);
      return `<span class="sh-math-bg"><span class="sh-delim">${escHtml(seg.openDelim || '$')}</span>${tokenizeLatex(seg.content)}<span class="sh-delim">${escHtml(seg.closeDelim || '$')}</span></span>`;
    }).join('');
  }
  pre.innerHTML = html + (val.endsWith('\n') ? '\n ' : ' ');
  pre.scrollTop = ta.scrollTop;
  pre.scrollLeft = ta.scrollLeft;
}

function attachEditor(taId, preId, mode, sig) {
  const ta = $(taId), pre = $(preId);
  if (!ta || !pre) return;
  pre.style.fontSize = ta.style.fontSize || '';
  editors.push({ ta, pre, mode });
  on(ta, 'input', () => renderHighlight(ta, pre, mode), false, sig);
  on(ta, 'scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; }, { passive: true }, sig);
  renderHighlight(ta, pre, mode);
}

export function refreshAll() {
  document.documentElement.setAttribute('data-syntax', syntaxEnabled ? 'true' : 'false');
  const btn = $('#syntax-highlight-toggle');
  if (btn) {
    btn.classList.toggle('active', syntaxEnabled);
    btn.setAttribute('aria-pressed', String(syntaxEnabled));
    btn.textContent = syntaxEnabled ? 'Χρωματισμός Σύνταξης: ΕΝΕΡΓΟΣ' : 'Χρωματισμός Σύνταξης: ΑΝΕΝΕΡΓΟΣ';
  }
  for (const ed of editors) renderHighlight(ed.ta, ed.pre, ed.mode);
}

export function syncFontFromTextarea(taId) {
  const entry = editors.find(e => e.ta.id === taId);
  if (!entry) return;
  entry.pre.style.fontSize = entry.ta.style.fontSize || '';
  refreshAll();
}

export function init(ac) {
  const sig = ac.signal;
  const cached = mirrorGet(KEYS.syntaxHighlight, 'bool');
  if (typeof cached === 'boolean') syntaxEnabled = cached;
  attachEditor('#latex-input', '#latex-highlight', 'latex', sig);
  attachEditor('#notepad-input', '#notepad-highlight', 'hybrid', sig);
  refreshAll();
  get([KEYS.syntaxHighlight]).then(r => {
    if (typeof r[KEYS.syntaxHighlight] === 'boolean') { syntaxEnabled = r[KEYS.syntaxHighlight]; refreshAll(); }
  });
  const btn = $('#syntax-highlight-toggle');
  if (btn) on(btn, 'click', () => { syntaxEnabled = !syntaxEnabled; set(KEYS.syntaxHighlight, syntaxEnabled); refreshAll(); }, false, sig);
}
