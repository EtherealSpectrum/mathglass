const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
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

function emitWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('mathglass:window-state', {
    maximized: mainWindow.isMaximized(),
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
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

  // Μεταφορά Ctrl+W (Επεξεργασία στην Ανάγνωση) στον renderer χωρίς να κλείνει το παράθυρο
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if ((input.control || input.meta) && !input.alt && input.code === 'KeyW') {
      event.preventDefault();
      mainWindow.webContents.send('mathglass:shortcut', {
        code: 'KeyW',
        key: 'w',
        ctrlKey: true,
        altKey: false,
        shiftKey: Boolean(input.shift),
      });
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
  mainWindow.on('always-on-top-changed', emitWindowState);
  mainWindow.on('closed', () => { mainWindow = null; });
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
      mainWindow.setAlwaysOnTop(!mainWindow.isAlwaysOnTop(), 'floating');
      emitWindowState();
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
    alwaysOnTop: mainWindow.isAlwaysOnTop(),
  };
});

ipcMain.on('mathglass:open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
