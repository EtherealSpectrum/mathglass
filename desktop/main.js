const { app, BrowserWindow, ipcMain, Menu, shell, globalShortcut, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.etherealspectrum.mathglass.desktop');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let snapPreviewWindow = null;
let isAlwaysOnTopPinned = false;
let currentSnapZone = null;
let preSnapBounds = null;
let dragSession = null;
let isReassertingPin = false;
let pinWatchdogTimer = null;
let pinBlurTimers = [];
let globalPinRegistered = false;

function resolveWebAsset(...segments) {
  const candidates = [
    path.join(__dirname, 'web', ...segments),
    process.resourcesPath ? path.join(process.resourcesPath, 'web', ...segments) : null,
    path.join(__dirname, '..', ...segments),
    path.join(__dirname, ...segments),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function clearPinTimers() {
  if (pinWatchdogTimer) {
    clearInterval(pinWatchdogTimer);
    pinWatchdogTimer = null;
  }
  if (pinBlurTimers.length) {
    for (const t of pinBlurTimers) clearTimeout(t);
    pinBlurTimers = [];
  }
}

function applyAggressiveAlwaysOnTop(hardReset = false) {
  if (!isAlwaysOnTopPinned || !mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized() || !mainWindow.isVisible()) return;

  isReassertingPin = true;
  try {
    if (typeof mainWindow.setVisibleOnAllWorkspaces === 'function') {
      try {
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } catch { }
    }
    if (hardReset) {
      try { mainWindow.setAlwaysOnTop(false); } catch { }
    }
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    if (typeof mainWindow.moveTop === 'function') {
      mainWindow.moveTop();
    }
  } catch {
  } finally {
    isReassertingPin = false;
  }
}

function schedulePinBlurReinforcement() {
  for (const t of pinBlurTimers) clearTimeout(t);
  pinBlurTimers = [];
  if (!isAlwaysOnTopPinned) return;

  applyAggressiveAlwaysOnTop(true);
  for (const delay of [50, 160, 350, 750]) {
    pinBlurTimers.push(setTimeout(() => {
      if (isAlwaysOnTopPinned) applyAggressiveAlwaysOnTop(true);
    }, delay));
  }
}

function setAlwaysOnTopPinned(nextPinned, { fromGlobalShortcut = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isAlwaysOnTopPinned = Boolean(nextPinned);

  if (isAlwaysOnTopPinned) {
    if (fromGlobalShortcut) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) {
        if (typeof mainWindow.showInactive === 'function') mainWindow.showInactive();
        else mainWindow.show();
      }
    }
    applyAggressiveAlwaysOnTop(true);
    if (!pinWatchdogTimer) {
      pinWatchdogTimer = setInterval(() => {
        if (!isAlwaysOnTopPinned || !mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isMinimized() || !mainWindow.isVisible()) return;
        const dropped = !mainWindow.isAlwaysOnTop();
        applyAggressiveAlwaysOnTop(dropped);
      }, 500);
    }
  } else {
    clearPinTimers();
    isReassertingPin = true;
    try {
      mainWindow.setAlwaysOnTop(false);
      if (typeof mainWindow.setVisibleOnAllWorkspaces === 'function') {
        try { mainWindow.setVisibleOnAllWorkspaces(false); } catch { }
      }
    } catch {
    } finally {
      isReassertingPin = false;
    }
  }

  emitWindowState();
}

function isFullOrMaximized() {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && (mainWindow.isMaximized() || mainWindow.isFullScreen()));
}

function syncWindowLockState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const locked = isFullOrMaximized();
  try { mainWindow.setResizable(!locked); } catch { }
  if (typeof mainWindow.setMovable === 'function') {
    try { mainWindow.setMovable(!locked); } catch { }
  }
}

const SNAP_LABELS = {
  left: 'Μισό Αριστερά (1/2)',
  right: 'Μισό Δεξιά (1/2)',
  'top-left': 'Πάνω Αριστερά (1/4)',
  'bottom-left': 'Κάτω Αριστερά (1/4)',
  'top-right': 'Πάνω Δεξιά (1/4)',
  'bottom-right': 'Κάτω Δεξιά (1/4)',
  maximize: 'Πλήρης Οθόνη',
};

function getSnapTargetRect(zone, wa) {
  if (!zone || !wa) return null;
  const halfW = Math.floor(wa.width / 2);
  const rightW = wa.width - halfW;
  const halfH = Math.floor(wa.height / 2);
  const botH = wa.height - halfH;
  switch (zone) {
    case 'left': return { x: wa.x, y: wa.y, width: halfW, height: wa.height };
    case 'right': return { x: wa.x + halfW, y: wa.y, width: rightW, height: wa.height };
    case 'top-left': return { x: wa.x, y: wa.y, width: halfW, height: halfH };
    case 'bottom-left': return { x: wa.x, y: wa.y + halfH, width: halfW, height: botH };
    case 'top-right': return { x: wa.x + halfW, y: wa.y, width: rightW, height: halfH };
    case 'bottom-right': return { x: wa.x + halfW, y: wa.y + halfH, width: rightW, height: botH };
    case 'maximize': return { x: wa.x, y: wa.y, width: wa.width, height: wa.height };
    default: return null;
  }
}

function ensureSnapPreviewWindow() {
  if (snapPreviewWindow && !snapPreviewWindow.isDestroyed()) return snapPreviewWindow;
  snapPreviewWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try { snapPreviewWindow.setIgnoreMouseEvents(true, { forward: true }); } catch { }
  const previewHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{width:100%;height:100%;background:transparent;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif}
    .box{position:fixed;inset:6px;border-radius:14px;border:2px solid rgba(139,123,255,0.9);background:rgba(139,123,255,0.16);box-shadow:0 4px 18px rgba(0,0,0,0.16);display:flex;align-items:flex-end;justify-content:flex-start;padding:12px 14px}
    .tag{padding:4px 10px;border-radius:6px;background:rgba(15,18,25,0.82);color:#f3f5f8;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,0.14)}
  </style></head><body><div class="box"><span class="tag" id="t"></span></div></body></html>`;
  snapPreviewWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(previewHtml));
  snapPreviewWindow._lastZone = null;
  snapPreviewWindow.on('closed', () => { snapPreviewWindow = null; });
  return snapPreviewWindow;
}

function showSnapPreview(zone, wa) {
  const rect = getSnapTargetRect(zone, wa);
  if (!rect) {
    hideSnapPreview();
    return;
  }
  const win = ensureSnapPreviewWindow();
  win.setBounds(rect, false);
  if (win._lastZone !== zone) {
    win._lastZone = zone;
    const label = SNAP_LABELS[zone] || '';
    win.webContents.executeJavaScript(`document.getElementById('t').textContent = ${JSON.stringify(label)};`).catch(() => { });
  }
  if (!win.isVisible()) {
    try { win.setAlwaysOnTop(true, 'floating'); } catch { }
    if (typeof win.showInactive === 'function') win.showInactive();
    else win.show();
    if (mainWindow && !mainWindow.isDestroyed() && typeof mainWindow.moveTop === 'function') {
      try { mainWindow.moveTop(); } catch { }
    }
  }
}

function hideSnapPreview() {
  if (!snapPreviewWindow || snapPreviewWindow.isDestroyed()) return;
  snapPreviewWindow._lastZone = null;
  if (snapPreviewWindow.isVisible()) {
    try { snapPreviewWindow.hide(); } catch { }
  }
}

function detectSnapZoneFromCursor(cursor, wa, vx = 0, vy = 0) {
  const leftThresh = vx < -0.5 ? 24 : 12;
  const rightThresh = vx > 0.5 ? 24 : 12;
  const topThresh = vy < -0.5 ? 18 : 10;

  const atLeft = cursor.x <= wa.x + leftThresh;
  const atRight = cursor.x >= wa.x + wa.width - rightThresh;
  const atTop = cursor.y <= wa.y + topThresh;

  const cornerY = Math.min(180, Math.round(wa.height * 0.28));
  const cornerX = Math.min(220, Math.round(wa.width * 0.20));

  if (atLeft) {
    if (cursor.y <= wa.y + cornerY) return 'top-left';
    if (cursor.y >= wa.y + wa.height - cornerY) return 'bottom-left';
    return 'left';
  }
  if (atRight) {
    if (cursor.y <= wa.y + cornerY) return 'top-right';
    if (cursor.y >= wa.y + wa.height - cornerY) return 'bottom-right';
    return 'right';
  }
  if (atTop) {
    if (cursor.x <= wa.x + cornerX) return 'top-left';
    if (cursor.x >= wa.x + wa.width - cornerX) return 'top-right';
    return 'maximize';
  }
  return null;
}

function applySnapZone(zone, displayHint) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!zone) return;

  if (zone === 'maximize') {
    if (isFullOrMaximized()) {
      try { mainWindow.setResizable(true); } catch { }
      if (typeof mainWindow.setMovable === 'function') {
        try { mainWindow.setMovable(true); } catch { }
      }
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      currentSnapZone = null;
    } else {
      if (!currentSnapZone && !isFullOrMaximized()) {
        preSnapBounds = mainWindow.getBounds();
      }
      currentSnapZone = null;
      mainWindow.maximize();
    }
    syncWindowLockState();
    emitWindowState();
    return;
  }

  const display = displayHint || screen.getDisplayMatching(mainWindow.getBounds());
  const wa = display?.workArea || { x: 0, y: 0, width: 1280, height: 800 };
  const rect = getSnapTargetRect(zone, wa);
  if (!rect) return;

  if (!currentSnapZone && !isFullOrMaximized()) {
    preSnapBounds = mainWindow.getBounds();
  }
  currentSnapZone = null;
  try { mainWindow.setMinimumSize(480, 400); } catch { }
  if (isFullOrMaximized()) {
    try { mainWindow.setResizable(true); } catch { }
    if (typeof mainWindow.setMovable === 'function') {
      try { mainWindow.setMovable(true); } catch { }
    }
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
  }

  try {
    mainWindow.setMinimumSize(Math.min(480, rect.width), Math.min(400, rect.height));
  } catch { }
  currentSnapZone = zone;
  mainWindow.setBounds(rect, true);
  syncWindowLockState();
  emitWindowState();
}

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('mathglass:window-state', {
    maximized: isFullOrMaximized(),
    snapped: Boolean(currentSnapZone),
    snapZone: currentSnapZone,
    alwaysOnTop: isAlwaysOnTopPinned,
  });
}

function createWindow() {
  const iconCandidate = resolveWebAsset('icons', 'icon128.png');
  const iconPath = fs.existsSync(iconCandidate) ? iconCandidate : undefined;
  const wa = screen.getPrimaryDisplay()?.workArea || { x: 0, y: 0, width: 1280, height: 800 };
  const initW = Math.min(wa.width, Math.max(480, Math.min(920, wa.width - 24)));
  const initH = Math.min(wa.height, Math.max(400, Math.min(700, wa.height - 24)));
  const initX = Math.round(wa.x + Math.max(0, (wa.width - initW) / 2));
  const initY = Math.round(wa.y + Math.max(0, (wa.height - initH) / 2));

  mainWindow = new BrowserWindow({
    x: initX,
    y: initY,
    width: initW,
    height: initH,
    minWidth: 480,
    minHeight: 400,
    frame: false,
    transparent: true,
    thickFrame: false,
    hasShadow: false,
    resizable: true,
    autoHideMenuBar: true,
    show: false,
    title: 'MathGlass — Επεξεργαστής LaTeX & phpBB',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(resolveWebAsset('popup.html'), { query: { mode: 'desktop' } });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    syncWindowLockState();
    emitWindowState();
  });

  // Μεταφορά Ctrl+W (Επεξεργασία στην Ανάγνωση) & Ctrl+F (Λειτουργία Ανάγνωσης) στον renderer
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    // Αποφυγή διπλής εκτέλεσης του Alt+Shift+P αν έχει δεσμευτεί ως globalShortcut
    if (globalPinRegistered && input.alt && input.shift && !(input.control || input.meta) && input.code === 'KeyP') {
      event.preventDefault();
      return;
    }

    if ((input.control || input.meta) && !input.alt && !input.shift) {
      if (input.code === 'KeyW' || input.code === 'KeyF') {
        event.preventDefault();
        mainWindow.webContents.send('mathglass:shortcut', {
          code: input.code,
          key: input.code === 'KeyW' ? 'w' : 'f',
          ctrlKey: true,
          altKey: false,
          shiftKey: false,
        });
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const onLockStateChange = () => {
    syncWindowLockState();
    emitWindowState();
  };
  mainWindow.on('maximize', onLockStateChange);
  mainWindow.on('unmaximize', onLockStateChange);
  mainWindow.on('enter-full-screen', onLockStateChange);
  mainWindow.on('leave-full-screen', onLockStateChange);
  mainWindow.on('will-resize', event => {
    if (isFullOrMaximized()) event.preventDefault();
  });
  mainWindow.on('will-move', event => {
    if (isFullOrMaximized()) event.preventDefault();
  });
  mainWindow.on('blur', () => {
    if (isAlwaysOnTopPinned) schedulePinBlurReinforcement();
  });
  mainWindow.on('focus', () => {
    if (isAlwaysOnTopPinned) applyAggressiveAlwaysOnTop(false);
  });
  mainWindow.on('show', () => {
    if (isAlwaysOnTopPinned) applyAggressiveAlwaysOnTop(true);
  });
  mainWindow.on('restore', () => {
    syncWindowLockState();
    emitWindowState();
    if (isAlwaysOnTopPinned) applyAggressiveAlwaysOnTop(true);
  });
  mainWindow.on('always-on-top-changed', (_e, isOnTop) => {
    if (isReassertingPin) return;
    if (isAlwaysOnTopPinned && !isOnTop) {
      applyAggressiveAlwaysOnTop(true);
      return;
    }
    emitWindowState();
  });
  mainWindow.on('closed', () => {
    clearPinTimers();
    hideSnapPreview();
    if (snapPreviewWindow && !snapPreviewWindow.isDestroyed()) {
      try { snapPreviewWindow.destroy(); } catch { }
    }
    snapPreviewWindow = null;
    dragSession = null;
    currentSnapZone = null;
    isAlwaysOnTopPinned = false;
    mainWindow = null;
  });
}

ipcMain.on('mathglass:win-action', (_e, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  switch (action) {
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (isFullOrMaximized()) {
        applySnapZone('maximize');
      } else if (currentSnapZone) {
        applySnapZone('maximize');
      } else {
        applySnapZone('maximize');
      }
      break;
    case 'pin':
      setAlwaysOnTopPinned(!isAlwaysOnTopPinned);
      break;
    case 'close':
      mainWindow.close();
      break;
  }
});

ipcMain.on('mathglass:drag-start', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  dragSession = {
    grabDx: cursor.x - bounds.x,
    grabDy: cursor.y - bounds.y,
    startCursorX: cursor.x,
    startCursorY: cursor.y,
    lastCursorX: cursor.x,
    lastCursorY: cursor.y,
    lastSampleAt: Date.now(),
    startBounds: bounds,
    snappedOnStart: Boolean(currentSnapZone),
    maxOnStart: isFullOrMaximized(),
    hoveredZone: null,
    activeDisplay: screen.getDisplayNearestPoint(cursor),
  };
});

ipcMain.on('mathglass:drag-move', () => {
  if (!mainWindow || mainWindow.isDestroyed() || !dragSession) return;
  const cursor = screen.getCursorScreenPoint();
  const now = Date.now();
  const dt = Math.max(8, now - dragSession.lastSampleAt);
  const vx = (cursor.x - dragSession.lastCursorX) / dt;
  const vy = (cursor.y - dragSession.lastCursorY) / dt;
  dragSession.lastCursorX = cursor.x;
  dragSession.lastCursorY = cursor.y;
  dragSession.lastSampleAt = now;

  if (dragSession.maxOnStart || dragSession.snappedOnStart) {
    const moved = Math.hypot(cursor.x - dragSession.startCursorX, cursor.y - dragSession.startCursorY);
    if (moved < 6) return;
    const targetW = Math.max(480, preSnapBounds?.width || 920);
    const targetH = Math.max(400, preSnapBounds?.height || 700);
    const ratioX = dragSession.startBounds.width > 0
      ? Math.max(0.1, Math.min(0.9, dragSession.grabDx / dragSession.startBounds.width))
      : 0.5;
    dragSession.grabDx = Math.round(targetW * ratioX);
    dragSession.grabDy = Math.min(Math.max(dragSession.grabDy, 10), 34);
    dragSession.maxOnStart = false;
    dragSession.snappedOnStart = false;
    currentSnapZone = null;

    if (isFullOrMaximized()) {
      try { mainWindow.setResizable(true); } catch { }
      if (typeof mainWindow.setMovable === 'function') {
        try { mainWindow.setMovable(true); } catch { }
      }
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
    }
    try { mainWindow.setMinimumSize(480, 400); } catch { }
    dragSession.startBounds = {
      x: Math.round(cursor.x - dragSession.grabDx),
      y: Math.round(cursor.y - dragSession.grabDy),
      width: targetW,
      height: targetH,
    };
    mainWindow.setBounds(dragSession.startBounds, false);
    syncWindowLockState();
    emitWindowState();
  }

  const nextX = Math.round(cursor.x - dragSession.grabDx);
  const nextY = Math.round(cursor.y - dragSession.grabDy);
  mainWindow.setBounds({
    x: nextX,
    y: nextY,
    width: dragSession.startBounds.width,
    height: dragSession.startBounds.height,
  }, false);

  const display = screen.getDisplayNearestPoint(cursor);
  const wa = display?.workArea || { x: 0, y: 0, width: 1280, height: 800 };
  const zone = detectSnapZoneFromCursor(cursor, wa, vx, vy);
  dragSession.hoveredZone = zone;
  dragSession.activeDisplay = display;
  if (zone) {
    showSnapPreview(zone, wa);
  } else {
    hideSnapPreview();
  }
});

ipcMain.on('mathglass:drag-end', () => {
  if (!dragSession) {
    hideSnapPreview();
    return;
  }
  const zone = dragSession.hoveredZone;
  const disp = dragSession.activeDisplay;
  dragSession = null;
  hideSnapPreview();
  if (zone) {
    applySnapZone(zone, disp);
  }
});

ipcMain.on('mathglass:snap-zone', (_e, zone) => {
  hideSnapPreview();
  if (typeof zone === 'string' && SNAP_LABELS[zone]) {
    applySnapZone(zone);
  }
});

ipcMain.on('mathglass:resize-bounds', (_e, bounds) => {
  if (!mainWindow || mainWindow.isDestroyed() || isFullOrMaximized()) return;
  if (!bounds || typeof bounds !== 'object') return;
  if (currentSnapZone) {
    currentSnapZone = null;
    try { mainWindow.setMinimumSize(480, 400); } catch { }
    emitWindowState();
  }
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.max(480, Math.round(Number(bounds.width)));
  const height = Math.max(400, Math.round(Number(bounds.height)));
  if ([x, y, width, height].every(Number.isFinite)) {
    mainWindow.setBounds({ x, y, width, height }, false);
  }
});

ipcMain.on('mathglass:set-window-size', (_e, opts) => {
  if (!mainWindow || mainWindow.isDestroyed() || !opts || typeof opts !== 'object') return;
  if (opts.maximize) {
    if (!mainWindow.isMaximized()) mainWindow.maximize();
    syncWindowLockState();
    emitWindowState();
    return;
  }
  if (isFullOrMaximized()) {
    try { mainWindow.setResizable(true); } catch { }
    if (typeof mainWindow.setMovable === 'function') {
      try { mainWindow.setMovable(true); } catch { }
    }
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
  }
  const curBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(curBounds);
  const wa = display?.workArea || { x: 0, y: 0, width: 1280, height: 800 };
  const targetW = Math.min(wa.width, Math.max(480, Math.round(Number(opts.width) || 920)));
  const targetH = Math.min(wa.height, Math.max(400, Math.round(Number(opts.height) || 700)));
  const x = Math.round(wa.x + Math.max(0, (wa.width - targetW) / 2));
  const y = Math.round(wa.y + Math.max(0, (wa.height - targetH) / 2));
  mainWindow.setBounds({ x, y, width: targetW, height: targetH }, true);
  syncWindowLockState();
  emitWindowState();
});

ipcMain.handle('mathglass:get-bounds', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow.getBounds();
});

ipcMain.handle('mathglass:get-state', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { maximized: false, snapped: false, snapZone: null, alwaysOnTop: false };
  return {
    maximized: isFullOrMaximized(),
    snapped: Boolean(currentSnapZone),
    snapZone: currentSnapZone,
    alwaysOnTop: isAlwaysOnTopPinned,
  };
});

ipcMain.on('mathglass:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle('mathglass:fetch-image-data-url', async (_e, rawUrl) => {
  if (typeof rawUrl !== 'string' || !/^https?:\/\//i.test(rawUrl)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const fetchFn = (net && typeof net.fetch === 'function') ? net.fetch.bind(net) : fetch;
    const res = await fetchFn(rawUrl, {
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct && !ct.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > 15 * 1024 * 1024) return null;
    const mime = ct || 'image/png';
    return `data:${mime};base64,${Buffer.from(ab).toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
});

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    if (isAlwaysOnTopPinned) applyAggressiveAlwaysOnTop(true);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    try {
      globalPinRegistered = globalShortcut.register('Alt+Shift+P', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        setAlwaysOnTopPinned(!isAlwaysOnTopPinned, { fromGlobalShortcut: true });
      });
    } catch {
      globalPinRegistered = false;
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('will-quit', () => {
    clearPinTimers();
    hideSnapPreview();
    if (snapPreviewWindow && !snapPreviewWindow.isDestroyed()) {
      try { snapPreviewWindow.destroy(); } catch { }
    }
    try { globalShortcut.unregisterAll(); } catch { }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
