import { clamp } from './dom.js';
const BASE = Math.sqrt(540 * 640);
const CFG = {
  toolbar:        { e: 0.85, min: 0.75, max: 1.80 },
  preview:        { e: 0.80, min: 0.80, max: 1.80 },
  editor:         { e: 0.80, min: 0.85, max: 2.20 },
  notepad:        { e: 0.75, min: 1.00, max: 2.10 },
  notepadPreview: { e: 0.80, min: 0.95, max: 2.10 },
};
export function computeAutoScale(kind) {
  const vw = Math.max(200, window.innerWidth  || 540);
  const vh = Math.max(200, window.innerHeight || 640);
  const cfg = CFG[kind];
  return clamp(Math.pow(Math.sqrt(vw * vh) / BASE, cfg.e), cfg.min, cfg.max);
}
