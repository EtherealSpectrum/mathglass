// Clipboard copy με feedback.
import { feedback, showErrorToast } from './shared.js';

export async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) feedback(btn, 'Αντιγράφηκε!', '#4caf50');
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    if (ok) {
      if (btn) feedback(btn, 'Αντιγράφηκε!', '#4caf50');
    } else {
      showErrorToast('Δεν ήταν δυνατή η αντιγραφή.');
    }
  }
}