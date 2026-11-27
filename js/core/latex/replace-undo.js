// Αντικατάσταση κειμένου με διατήρηση του undo stack του browser.

export function replaceRangePreservingUndo(ta, start, end, text, newSelStart, newSelEnd) {
  if (!ta) return;
  ta.setSelectionRange(start, end);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { }
  if (!ok) {
    ta.setRangeText(text, start, end, 'preserve');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const s = typeof newSelStart === 'number' ? newSelStart : start + text.length;
  const e = typeof newSelEnd === 'number' ? newSelEnd : s;
  ta.setSelectionRange(s, e);
}