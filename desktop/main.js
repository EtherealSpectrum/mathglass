const { app, BrowserWindow, ipcMain, Menu, shell, globalShortcut, net } = require('electron');
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
let isAlwaysOnTopPinned = false;
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

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('mathglass:window-state', {
    maximized: mainWindow.isMaximized(),
    alwaysOnTop: isAlwaysOnTopPinned,
  });
}

function createWindow() {
  const iconCandidate = resolveWebAsset('icons', 'icon128.png');
  const iconPath = fs.existsSync(iconCandidate) ? iconCandidate : undefined;

  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
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

  mainWindow.on('maximize', emitWindowState);
  mainWindow.on('unmaximize', emitWindowState);
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
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      break;
    case 'pin':
      setAlwaysOnTopPinned(!isAlwaysOnTopPinned);
      break;
    case 'close':
      mainWindow.close();
      break;
  }
});

ipcMain.on('mathglass:resize-bounds', (_e, bounds) => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return;
  if (!bounds || typeof bounds !== 'object') return;
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.max(480, Math.round(Number(bounds.width)));
  const height = Math.max(400, Math.round(Number(bounds.height)));
  if ([x, y, width, height].every(Number.isFinite)) {
    mainWindow.setBounds({ x, y, width, height }, false);
  }
});

ipcMain.handle('mathglass:get-bounds', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow.getBounds();
});

ipcMain.handle('mathglass:get-state', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { maximized: false, alwaysOnTop: false };
  return {
    maximized: mainWindow.isMaximized(),
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
    try { globalShortcut.unregisterAll(); } catch { }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
