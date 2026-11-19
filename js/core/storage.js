// chrome.storage.local = κύρια αποθήκη · localStorage = sync mirror
// (το mirror υπάρχει ΜΟΝΟ για το pre-init/ui-init που τρέχουν πριν το await)
import { KEYS } from './constants.js';

const api = (typeof browser !== 'undefined' && browser.storage?.local)
  ? browser.storage.local
  : (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null);

export function mirrorGet(key, type) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    if (type === 'bool') return raw === 'true';
    if (type === 'num')  { const n = parseFloat(raw); return Number.isNaN(n) ? undefined : n; }
    if (type === 'json') { try { return JSON.parse(raw); } catch { return undefined; } }
    return raw;
  } catch { return undefined; }
}
export function mirrorSet(key, value) {
  try { localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : String(value)); } catch {}
}
function mirrorRemove(key) { try { localStorage.removeItem(key); } catch {} }

export async function get(keys) {
  if (!api) return {};
  return new Promise(res => { try { api.get(keys, r => res(r || {})); } catch { res({}); } });
}

export function set(key, value) {
  mirrorSet(key, value);
  if (api) { try { api.set({ [key]: value }); } catch {} }
}

export function remove(key) {
  mirrorRemove(key);
  if (api) { try { api.remove(key); } catch {} }
}

export function onChanged(cb) {
  if (!api) return () => {};
  const storageRoot = (typeof browser !== 'undefined' && browser.storage) ? browser.storage : chrome.storage;
  const handler = (changes, area) => { if (area === 'local') cb(changes); };
  storageRoot.onChanged.addListener(handler);
  return () => { try { storageRoot.onChanged.removeListener(handler); } catch {} };
}

// Καθαρισμός legacy keys (παλιό boolean transparency / live preview κ.λπ.)
export function cleanupLegacy() {
  try {
    localStorage.removeItem('latex_transparent');
    localStorage.removeItem('latex_editor_text');
    localStorage.removeItem('latex_live_preview');
  } catch {}
}
