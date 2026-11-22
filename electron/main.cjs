const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Hardware acceleration flags for 60fps WebGL/Canvas rendering
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let mainWindow = null;
let stageWindow = null;
let tray = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function getLicenseFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'omnivibe_license.json');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0D1117',
    title: 'OmniVibe — Atmosphere & Visual Mood Studio',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0D1117',
      symbolColor: '#E2E8F0',
      height: 38,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
    show: false,
  });

  const indexPath = path.join(__dirname, '../dist/index.html');
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(indexPath)) {
    mainWindow.loadFile(indexPath);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (stageWindow && !stageWindow.isDestroyed()) {
      stageWindow.close();
    }
  });
}

function createStageWindow(targetDisplayIndex = 1) {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.focus();
    return;
  }

  const displays = screen.getAllDisplays();
  const targetDisplay = displays[targetDisplayIndex] || displays[0];

  stageWindow = new BrowserWindow({
    x: targetDisplay.bounds.x + 50,
    y: targetDisplay.bounds.y + 50,
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    title: 'OmniVibe Big-Screen Stage',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  const stageUrl = isDev && process.env.VITE_DEV_SERVER_URL
    ? `${process.env.VITE_DEV_SERVER_URL}?stage=true`
    : `file://${path.join(__dirname, '../dist/index.html')}?stage=true`;

  stageWindow.loadURL(stageUrl);

  stageWindow.on('closed', () => {
    stageWindow = null;
  });
}

function setupTray() {
  const iconPath = path.join(__dirname, '../public/icon-192.png');
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('OmniVibe Studio — Audio Atmosphere Active');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open OmniVibe Studio',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Launch Big-Screen Stage',
      click: () => createStageWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit OmniVibe',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function setupIpcHandlers() {
  ipcMain.handle('stage:launch', (_event, displayIndex) => {
    createStageWindow(displayIndex ?? 1);
    return true;
  });

  ipcMain.handle('display:get-all', () => {
    return screen.getAllDisplays().map((d, index) => ({
      id: d.id,
      index,
      bounds: d.bounds,
      isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
    }));
  });

  ipcMain.handle('license:save', (_event, licenseData) => {
    try {
      const filePath = getLicenseFilePath();
      fs.writeFileSync(filePath, JSON.stringify(licenseData, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('license:read', () => {
    try {
      const filePath = getLicenseFilePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      }
      return null;
    } catch {
      return null;
    }
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createMainWindow();
  setupTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
