// Export CSS — το πλήρες stylesheet για PNG/PDF/SVG exports.
// Περιλαμβάνει και το inline KaTeX CSS (προαιρετικά με embedded fonts για SVG).
import { blobToDataUrl } from './shared.js';

export const PHPBB_EXPORT_CSS = `
.phpbb-export-root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #111827;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}
.phpbb-export-root ul { list-style: disc; padding-left: 22px; margin: 4px 0; }
.phpbb-export-root ol { list-style: decimal; padding-left: 22px; margin: 4px 0; }
.phpbb-export-root blockquote.phpbb-quote {
  margin: 6px 0; padding: 6px 12px;
  border-left: 3px solid #4338ca;
  background: rgba(67, 56, 202, 0.06);
  border-radius: 0 6px 6px 0;
  color: #111827;
}
.phpbb-export-root pre.phpbb-code,
.phpbb-export-root .bb-code-block {
  margin: 6px 0; padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #f1f5f9;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.88em;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: visible;
}
.phpbb-export-root[data-export-transparent="true"] pre.phpbb-code,
.phpbb-export-root[data-export-transparent="true"] .bb-code-block {
  background: rgba(15, 23, 42, 0.06) !important;
  border-color: rgba(15, 23, 42, 0.25) !important;
}
.phpbb-export-root table.phpbb-table { border-collapse: collapse; margin: 6px 0; width: 100%; max-width: 100%; }
.phpbb-export-root table.phpbb-table th,
.phpbb-export-root table.phpbb-table td { border: 1px solid #cbd5e1; padding: 4px 8px; text-align: left; word-break: break-word; overflow-wrap: anywhere; }
.phpbb-export-root table.phpbb-table th { background: rgba(67, 56, 202, 0.10); font-weight: 700; }
.phpbb-export-root .phpbb-hide { margin: 6px 0; border: 1px dashed #cbd5e1 !important; border-radius: 6px; overflow: hidden; color: #111827; background: transparent !important; }
.phpbb-export-root .phpbb-hide > summary,
.phpbb-export-root .phpbb-hide > .phpbb-hide-summary {
  padding: 6px 12px; font-weight: 600; font-size: 0.9em;
  background: #f1f5f9 !important; color: #111827 !important;
  cursor: pointer; list-style: none;
  display: flex; align-items: center; gap: 6px;
}
.phpbb-export-root .phpbb-hide > summary::-webkit-details-marker { display: none; }
.phpbb-export-root .phpbb-hide-body { padding: 8px 12px; border-top: 1px dashed #cbd5e1 !important; background: transparent !important; }
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide {
  border-color: rgba(15, 23, 42, 0.28) !important;
  background: transparent !important;
}
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide > summary,
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide > .phpbb-hide-summary {
  background: rgba(15, 23, 42, 0.06) !important;
  color: #111827 !important;
}
.phpbb-export-root[data-export-transparent="true"] .phpbb-hide-body {
  border-top-color: rgba(15, 23, 42, 0.25) !important;
  background: transparent !important;
}
.phpbb-export-root .phpbb-ggb {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 6px;
  border: 1px solid #4338ca; background: rgba(67, 56, 202, 0.08);
  color: #111827; font-size: 0.88em; margin: 4px 0;
}
.phpbb-export-root .phpbb-center { text-align: center; margin: 4px 0; }
.phpbb-export-root a { color: #4338ca; text-decoration: underline; }
.phpbb-export-root img { max-width: 100%; height: auto; border-radius: 6px; margin: 4px 0; }
.phpbb-export-root .katex { white-space: normal !important; max-width: 100%; }
.phpbb-export-root .np-math-inline {
  display: inline-block !important;
  vertical-align: middle !important;
  margin: 0 2px !important;
  max-width: calc(100% - 4px) !important;
}
.phpbb-export-root .np-math-inline > .katex,
.phpbb-export-root .np-math-inline .katex-partial-valid > .katex {
  display: block !important;
  max-width: 100% !important;
  white-space: normal !important;
}
.phpbb-export-root .np-math-display {
  display: block !important;
  margin: 10px 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.phpbb-export-root .np-math-display .katex-display {
  margin: 0 !important;
  max-width: 100% !important;
  overflow: visible !important;
}
.phpbb-export-root .np-math-display .katex-display > .katex {
  white-space: normal !important;
  max-width: 100% !important;
}
`;

export function mountExportStyleTag() {
  const existing = document.getElementById('mg-export-temp-style');
  if (existing) existing.remove();
  const st = document.createElement('style');
  st.id = 'mg-export-temp-style';
  st.textContent = PHPBB_EXPORT_CSS;
  document.head.appendChild(st);
  return st;
}

let cachedKatexCssPromise = null;

export async function getInlineKatexCss(embedFonts = false) {
  if (!cachedKatexCssPromise) {
    cachedKatexCssPromise = (async () => {
      try {
        const cssUrl = new URL('lib/katex/katex.min.css', location.href).href;
        const res = await fetch(cssUrl);
        if (!res.ok) return '';
        let cssText = await res.text();
        if (!embedFonts) {
          cssText = cssText.replace(/@font-face\{[^}]*\}/g, '');
          return cssText;
        }
        const fontUrls = new Set();
        cssText.replace(/url\(["']?(fonts\/[^)"']+?\.woff2)["']?\)/g, (_, rel) => {
          fontUrls.add(rel);
          return _;
        });
        const fontMap = new Map();
        await Promise.all(Array.from(fontUrls).map(async rel => {
          try {
            const abs = new URL(`lib/katex/${rel}`, location.href).href;
            const r = await fetch(abs);
            if (!r.ok) return;
            const b = await r.blob();
            const du = await blobToDataUrl(b);
            if (du) fontMap.set(rel, du);
          } catch { }
        }));
        cssText = cssText.replace(/@font-face\{([^}]*)\}/g, (block, inner) => {
          const m = inner.match(/url\(["']?(fonts\/[^)"']+?\.woff2)["']?\)/);
          if (m && fontMap.has(m[1])) {
            const cleanedInner = inner.replace(/src:[^;]+;/, `src:url("${fontMap.get(m[1])}") format("woff2");`);
            return `@font-face{${cleanedInner}}`;
          }
          return '';
        });
        return cssText;
      } catch {
        return '';
      }
    })();
  }
  return await cachedKatexCssPromise;
}