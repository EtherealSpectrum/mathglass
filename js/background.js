// Background v3.4.0 — αξιόπιστο toggle + proxy για insert/tracker
(() => {
  'use strict';
  const KEYS = { draft: 'latex_editor_text', geometry: 'latex_panel_geometry' };
  const MSG = { INSERT: 'latex-insert-into-page', TRACKER: 'latex-inject-tracker' };
  const CONTENT_PANEL = 'js/content/floating-panel.js';
  const CONTENT_TRACKER = 'js/content/tracker.js';
  const actionApi = (typeof chrome !== 'undefined' && chrome.action) ? chrome.action
    : (typeof browser !== 'undefined' && browser.action ? browser.action : null);
  const sidePanelApi = (typeof chrome !== 'undefined' && chrome.sidePanel) || null;
  const sidebarApi = (typeof browser !== 'undefined' && browser.sidebarAction) || null;
  const PROTECTED_PREFIXES = [
    'chrome://', 'edge://', 'brave://', 'opera://', 'vivaldi://', 'about:',
    'chrome-extension://', 'moz-extension://',
    'https://chrome.google.com/webstore', 'https://chromewebstore.google.com',
    'https://addons.mozilla.org',
  ];
  const isProtectedPage = url => !url || PROTECTED_PREFIXES.some(p => url.startsWith(p));

  const openWindows = new Set();
  async function toggleSidePanel(tab) {
    if (!sidePanelApi?.open) return;
    const wid = tab.windowId;
    if (openWindows.has(wid)) {
      try {
        await sidePanelApi.setOptions({ enabled: false });
        openWindows.delete(wid);
        await new Promise(r => setTimeout(r, 120));
        await sidePanelApi.setOptions({ enabled: true, path: 'popup.html' });
      } catch (e) {
        try { await sidePanelApi.setOptions({ enabled: true, path: 'popup.html' }); } catch { }
      }
    } else {
      try { await sidePanelApi.open({ windowId: wid }); openWindows.add(wid); }
      catch (e) { console.warn('[LaTeX] side panel open failed:', e); }
    }
  }

  function toggleSidebar() {
    if (!sidebarApi) return;
    if (typeof sidebarApi.toggle === 'function') { try { sidebarApi.toggle(); } catch { } return; }
    if (typeof sidebarApi.isOpen === 'function') {
      sidebarApi.isOpen({}, isOpen => { try { isOpen ? sidebarApi.close() : sidebarApi.open(); } catch { } });
      return;
    }
    try { sidebarApi.open(); } catch { }
  }

  function injectPanel(tabId) {
    return (typeof chrome !== 'undefined' ? chrome : browser).scripting.executeScript({
      target: { tabId }, files: [CONTENT_PANEL],
    });
  }

  async function handleToggle(tab) {
    if (!tab?.id) return;
    if (!isProtectedPage(tab.url)) {
      try { await injectPanel(tab.id); return; }
      catch (e) { console.warn('[LaTeX] inject failed:', e); }
    }
    if (sidePanelApi?.open) { toggleSidePanel(tab); return; }
    if (sidebarApi) { toggleSidebar(); return; }
  }

  function __insertIntoPageFn(code) {
    const isEditable = e => {
      if (!e) return false;
      const tag = (e.tagName || '').toLowerCase();
      if (tag === 'textarea') return true;
      if (tag === 'input') return ['text', 'search', 'email', 'url'].includes((e.type || 'text').toLowerCase());
      if (e.isContentEditable) return true;
      return false;
    };
    let el = (typeof window.__latexGetLastFocused === 'function') ? window.__latexGetLastFocused() : null;
    if (!isEditable(el)) el = document.activeElement;
    if (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!isEditable(el)) {
      const f = document.forms?.postform;
      if (f?.elements?.message) el = f.elements.message;
    }
    if (!isEditable(el)) {
      el = Array.prototype.slice.call(document.querySelectorAll('textarea'))
        .find(t => t.offsetParent !== null && !t.disabled && !t.readOnly) || null;
    }
    if (!isEditable(el)) return { success: false };
    el.focus();
    if (el.isContentEditable) {
      try {
        const sel = getSelection();
        if (sel?.rangeCount) {
          const r = sel.getRangeAt(0); r.deleteContents();
          const tn = document.createTextNode(code); r.insertNode(tn);
          r.setStartAfter(tn); r.collapse(true);
          sel.removeAllRanges(); sel.addRange(r);
        } else el.textContent += code;
      } catch { el.textContent += code; }
    } else {
      const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, s) + code + el.value.slice(e);
      el.selectionStart = el.selectionEnd = s + code.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { success: true };
  }

  const ffRuntime = (typeof browser !== 'undefined' && browser.runtime) ? browser.runtime : null;
  if (ffRuntime) {
    ffRuntime.onMessage.addListener(msg => {
      if (msg?.action === MSG.INSERT) return ffInsertIntoPage(msg.code);
      if (msg?.action === MSG.TRACKER) return ffInjectTracker();
    });
  }

  async function ffInsertIntoPage(code) {
    try {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !/^https?:/.test(tab.url || '')) return { success: false, reason: 'no-eligible-tab' };
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id }, func: __insertIntoPageFn, args: [code],
      });
      return { success: !!(results?.[0]?.result?.success) };
    } catch (err) {
      return { success: false, reason: String(err?.message || err) };
    }
  }

  async function ffInjectTracker() {
    try {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (!tab?.id || isProtectedPage(tab.url)) return { ok: false, reason: 'no-eligible-tab' };
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_TRACKER] });
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }

  if (actionApi?.onClicked) actionApi.onClicked.addListener(handleToggle);
  if (typeof chrome !== 'undefined' && chrome.commands?.onCommand) {
    chrome.commands.onCommand.addListener(cmd => {
      if (cmd !== 'toggle-editor') return;
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => { if (tabs[0]) handleToggle(tabs[0]); });
    });
  }
  if (typeof chrome !== 'undefined' && chrome.windows?.onRemoved) {
    chrome.windows.onRemoved.addListener(wid => openWindows.delete(wid));
  }
  if (!ffRuntime && typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.action !== MSG.TRACKER) return;
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
        const tab = tabs?.[0];
        if (!tab?.id || isProtectedPage(tab.url)) { sendResponse({ ok: false, reason: 'no-eligible-tab' }); return; }
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_TRACKER] })
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
      });
      return true;
    });
  }
})();
