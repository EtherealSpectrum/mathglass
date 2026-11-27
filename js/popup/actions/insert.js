// Insert κειμένου/εξίσωσης στην ενεργή σελίδα (extension ή desktop fallback σε copy).
import { MSG } from '../../core/constants.js';
import { feedback } from './shared.js';
import { copyText } from './clipboard.js';

const isFirefox = typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';
const api = isFirefox ? browser : (typeof chrome !== 'undefined' ? chrome : null);

export async function insertTextToPage(code, btn) {
  if (isFirefox) {
    try {
      const r = await api?.runtime?.sendMessage({ action: MSG.INSERT_INTO_PAGE, code });
      r?.success
        ? feedback(btn, 'Εισήχθη!', '#4caf50')
        : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
    } catch {
      feedback(btn, "Αντιγράφηκε αντ' αυτού", '#b78103');
      copyText(code);
    }
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.scripting) {
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('no-eligible-tab');
      const fn = window.__insertIntoPageFn;
      if (!fn) throw new Error('insert function not available');
      const res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fn, args: [code] });
      res?.[0]?.result?.success
        ? feedback(btn, 'Εισήχθη!', '#4caf50')
        : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
      return;
    } catch { }
  }

  try {
    if (!api?.runtime?.sendMessage) throw new Error('no-runtime');
    const r = await api.runtime.sendMessage({ action: MSG.INSERT_INTO_PAGE, code });
    r?.success
      ? feedback(btn, 'Εισήχθη!', '#4caf50')
      : (feedback(btn, 'Αντιγράφηκε (όχι πεδίο)', '#b78103'), copyText(code));
  } catch {
    feedback(btn, "Αντιγράφηκε αντ' αυτού", '#b78103');
    copyText(code);
  }
}