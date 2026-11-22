const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
  protocol,
  session,
  desktopCapturer,
  shell,
  systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { getOrInitTrialStatus } = require('./trialManager.cjs');

// Hardware acceleration flags for 60fps WebGL/Canvas rendering
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Register secure custom app:// protocol before app ready so WebGL, WebAudio, localStorage, and ES modules work 100% offline
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;
let stageWindow = null;
let tray = null;
let isQuitting = false;
let bridgeInstance = null;
let bridgeActive = false;
let trialHeartbeatTimer = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DIST_DIR = path.join(__dirname, '../dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

function getLicenseFilePath() {
  return path.join(app.getPath('userData'), 'omnivibe_license.json');
}

function registerOfflineAppProtocol() {
  protocol.handle('app', (request) => {
    try {
      const reqUrl = new URL(request.url);
      let relPath = decodeURIComponent(reqUrl.pathname || '/');
      if (relPath === '/' || relPath === '') {
        relPath = '/index.html';
      }

      const resolved = path.normalize(path.join(DIST_DIR, relPath));
      // Prevent directory traversal outside dist/
      const safePath = resolved.startsWith(DIST_DIR) ? resolved : path.join(DIST_DIR, 'index.html');

      const targetPath =
        fs.existsSync(safePath) && fs.statSync(safePath).isFile()
          ? safePath
          : path.join(DIST_DIR, 'index.html');

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const data = fs.readFileSync(targetPath);

      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });
}

async function startEmbeddedBridge() {
  try {
    const bridgeEntry = path.join(__dirname, '../bridge/server.mjs');
    const mod = await import(pathToFileURL(bridgeEntry).href);
    if (typeof mod.startBridgeServer === 'function') {
      bridgeInstance = mod.startBridgeServer(47890, { embedded: true });
      bridgeActive = true;
    }
  } catch (err) {
    console.error('[OmniVibe Desktop] Failed to start embedded hardware bridge:', err);
    bridgeActive = false;
  }
}

function setupOfflineAudioLoopback() {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        if (sources && sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' });
        } else {
          callback({});
        }
      })
      .catch(() => callback({}));
  });
}

function createMainWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0D1117',
    title: 'OmniVibe Studio — Offline Atmosphere & Smart Lighting',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: '#0D1117',
            symbolColor: '#E2E8F0',
            height: 38,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
    show: false,
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadURL('app://omnivibe.local/studio');
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

  const stageUrl =
    isDev && process.env.VITE_DEV_SERVER_URL
      ? `${process.env.VITE_DEV_SERVER_URL}?stage=true`
      : 'app://omnivibe.local/?stage=true';

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
  tray.setToolTip('OmniVibe Studio — 100% Offline Audio & Lighting Engine');

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

  ipcMain.handle('trial:status', () => {
    return getOrInitTrialStatus({ userDataPath: app.getPath('userData') });
  });

  ipcMain.handle('bridge:status', () => {
    return {
      embedded: true,
      active: bridgeActive,
      wsUrl: 'ws://127.0.0.1:47890',
    };
  });

  ipcMain.handle('system:mac-screen-permission', () => {
    if (process.platform !== 'darwin') return 'granted';
    try {
      return systemPreferences.getMediaAccessStatus('screen');
    } catch {
      return 'unknown';
    }
  });

  ipcMain.handle('shell:open-external', (_event, targetUrl) => {
    if (
      typeof targetUrl === 'string' &&
      (targetUrl.startsWith('https://omnivibe.app') || targetUrl.startsWith('https://buy.stripe.com'))
    ) {
      shell.openExternal(targetUrl);
      return true;
    }
    return false;
  });
}

app.whenReady().then(async () => {
  registerOfflineAppProtocol();
  setupOfflineAudioLoopback();
  await startEmbeddedBridge();
  setupIpcHandlers();
  getOrInitTrialStatus({ userDataPath: app.getPath('userData') });

  // Update monotonic trial clock every 5 minutes
  trialHeartbeatTimer = setInterval(() => {
    getOrInitTrialStatus({ userDataPath: app.getPath('userData') });
  }, 5 * 60 * 1000);

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

app.on('before-quit', async () => {
  isQuitting = true;
  if (trialHeartbeatTimer) {
    clearInterval(trialHeartbeatTimer);
    trialHeartbeatTimer = null;
  }
  if (bridgeInstance && typeof bridgeInstance.cleanup === 'function') {
    try {
      await bridgeInstance.cleanup();
    } catch {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
