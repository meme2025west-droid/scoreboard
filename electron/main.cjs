const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');
const RESOURCE_ROOT = app.isPackaged ? process.resourcesPath : ROOT_DIR;
const SERVER_URL = 'http://127.0.0.1:3001';

let mainWindow = null;
let serverInstance = null;

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

  mainWindow.loadURL(SERVER_URL);
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