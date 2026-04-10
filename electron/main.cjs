const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');
const RESOURCE_ROOT = app.isPackaged ? process.resourcesPath : ROOT_DIR;
const SERVER_URL = 'http://127.0.0.1:3001';
const LAST_URL_FILE = path.join(app.getPath('userData'), 'last-visited-url.json');

let mainWindow = null;
let serverInstance = null;

function isRestorableUrl(url) {
  try {
    const candidate = new URL(url);
    const base = new URL(SERVER_URL);
    return candidate.origin === base.origin && !candidate.pathname.startsWith('/api');
  } catch {
    return false;
  }
}

function readLastVisitedUrl() {
  try {
    if (!fs.existsSync(LAST_URL_FILE)) return null;
    const raw = fs.readFileSync(LAST_URL_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.url && isRestorableUrl(parsed.url)) {
      return parsed.url;
    }
  } catch {
    // Ignore read/parse failures and fall back to root URL.
  }
  return null;
}

function writeLastVisitedUrl(url) {
  if (!isRestorableUrl(url)) return;
  try {
    fs.writeFileSync(LAST_URL_FILE, JSON.stringify({ url }), 'utf8');
  } catch {
    // Ignore persistence failures.
  }
}

async function ensureServer() {
  process.env.CLIENT_DIST_DIR = path.join(RESOURCE_ROOT, 'client', 'dist');

  const serverEntry = path.join(RESOURCE_ROOT, 'server', 'src', 'index.js');
  const serverModule = await import(pathToFileURL(serverEntry).href);
  serverInstance = await serverModule.startServer(3001);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(readLastVisitedUrl() || SERVER_URL);
  mainWindow.webContents.on('did-navigate', (_event, url) => writeLastVisitedUrl(url));
  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => writeLastVisitedUrl(url));
  mainWindow.on('close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      writeLastVisitedUrl(mainWindow.webContents.getURL());
    }
  });
}

app.whenReady().then(async () => {
  try {
    await ensureServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox(
      'Unable to start Scorecard',
      `Desktop app could not start the local backend.\n\n${error.message}`,
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
  }
});