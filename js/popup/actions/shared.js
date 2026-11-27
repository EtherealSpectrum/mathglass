// Shared utilities για actions — feedback, toast, download, blob→dataURL.
import { $ } from '../../core/dom.js';

export function feedback(btn, text, bg) {
  if (!btn) return;
  clearTimeout(btn.__fb);
  if (btn.__orig === undefined) btn.__orig = btn.textContent;
  btn.textContent = text;
  btn.style.background = bg;
  btn.style.color = '#fff';
  btn.__fb = setTimeout(() => {
    btn.textContent = btn.__orig;
    btn.style.background = '';
    btn.style.color = '';
  }, 2400);
}

export function showErrorToast(msg) {
  const el = $('#error-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('active');
  clearTimeout(el.__t);
  el.__t = setTimeout(() => el.classList.remove('active'), 4800);
}

export function triggerDownload(blob, filename) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

export async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(reader.error || new Error('read-failed'));
    reader.readAsDataURL(blob);
  });
}