// js/core/dom.js
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function on(target, type, fn, opts, signal) {
  if (!target) {
    console.warn(`[dom.on] Target is null for event "${type}"`);
    return;
  }
  target.addEventListener(type, fn, opts || false);
  if (signal) {
    if (signal.aborted) {
      target.removeEventListener(type, fn, opts || false);
      return;
    }
    signal.addEventListener('abort', () => target.removeEventListener(type, fn, opts || false), { once: true });
  }
}

export function debounce(fn, ms) {
  let id = null;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

export function rafThrottle(fn) {
  let id = null;
  return (...a) => {
    if (id !== null) return;
    id = requestAnimationFrame(() => { id = null; fn(...a); });
  };
}
