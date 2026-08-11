/**
 * IGNOSHASHI - Desktop App Main Process (Electron)
 * 
 * Starts the internal Express + WebSocket server (server.js) and opens
 * a native desktop window pointing at it, so the app is always online
 * and served locally even when packaged.
 */
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

/* ------------------------------------------------------------------ */
/* Open a URL in Google Chrome specifically (for extension wallets)     */
/* ------------------------------------------------------------------ */
function openInChrome(url) {
  // Try Chrome first; fall back to the default browser if Chrome isn't installed.
  const cmd = process.platform === 'darwin'
    ? `open -a "Google Chrome" "${url}"`
    : process.platform === 'win32'
      ? `start chrome "${url}"`
      : `google-chrome "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      // Chrome not found -> open in default browser as a fallback
      shell.openExternal(url);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Internal server (run IN-PROCESS for native-module compatibility)     */
/* ------------------------------------------------------------------ */
// Requires server.js directly so better-sqlite3 (Electron-ABI) loads
// inside this process. Files are unpacked via asarUnpack so native
// modules and the SQLite db resolve correctly when packaged.
const PORT = process.env.PORT || 3000;
let serverReady = false;
let httpServer = null;

function startServer() {
  try {
    // server.js calls server.listen(PORT) immediately on require and
    // exports the http.Server instance so we can manage its lifecycle.
    const srv = require(path.join(__dirname, 'server.js'));
    // Export resolution: if server.js exports the server, capture it.
    if (srv && srv.server) httpServer = srv.server;
    serverReady = true;
    console.log('[desktop] Internal server started.');
  } catch (e) {
    console.error('[desktop] Failed to start internal server:', e);
  }
}

function stopServer() {
  try {
    if (httpServer && httpServer.close) httpServer.close();
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Wait/retry loading window if server is slow                         */
/* ------------------------------------------------------------------ */
function loadApp() {
  const url = `http://localhost:${PORT}`;
  if (serverReady) {
    mainWin.loadURL(url);
  } else {
    // poll until server is ready
    const check = http.get(url, (res) => {
      res.resume();
      serverReady = true;
      mainWin.loadURL(url);
    });
    check.on('error', () => {
      setTimeout(loadApp, 500);
    });
    check.end();
  }
}

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */
let mainWin = null;
let tray = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0a14',
    title: 'IGNOSHASHI - Meme Coin Terminal',
    icon: path.join(__dirname, 'Unknown.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

mainWin.setMenuBarVisibility(false);
  loadApp(); // retry until internal server is ready

  mainWin.webContents.on('did-fail-load', (e, code, desc) => {
    // Retry if the server wasn't ready yet
    if (code === -102 || code === -106) {
      setTimeout(loadApp, 800);
    }
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    // Bridge page -> open in Google Chrome (for extension wallets)
    if (url.includes('bridge.html')) {
      openInChrome(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

/* ------------------------------------------------------------------ */
/* Tray (keep server alive when window closed)                         */
/* ------------------------------------------------------------------ */
function createTray() {
  // Build a simple 16x16 icon from a nativeImage buffer
  const iconSize = 16;
  const buf = Buffer.from(
    `#define image_width ${iconSize}
     #define image_height ${iconSize}
     static unsigned char image_bits[] = {0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00};`,
    'utf8'
  );
  let icon = nativeImage.createFromBuffer(Buffer.alloc(0)); // placeholder
  try { icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='); } catch (e) {}
  tray = new Tray(icon);
  tray.setToolTip('IGNOSHASHI - running locally');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open IGNOSHASHI', click: () => { if (!mainWin) createWindow(); else mainWin.show(); } },
    { label: 'Server: localhost:' + PORT, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => { stopServer(); app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (!mainWin) createWindow(); else mainWin.show(); });
}

/* ------------------------------------------------------------------ */
/* App lifecycle                                                       */
/* ------------------------------------------------------------------ */
app.whenReady().then(() => {
  // IPC: open the wallet bridge page in Google Chrome
  ipcMain.on('open-bridge', (event, url) => {
    if (url) openInChrome(url);
  });
  // IPC: open any URL in the default browser
  ipcMain.on('open-external', (event, url) => {
    if (url) shell.openExternal(url);
  });
  // IPC: report the internal server port to the renderer
  ipcMain.on('get-port', (event) => {
    event.returnValue = String(PORT);
  });

  startServer();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', (e) => {
  // Keep server alive in tray; do NOT quit on macOS. On other platforms,
  // keep running too so the server stays online in the tray.
  e.preventDefault();
});

app.on('before-quit', () => {
  stopServer();
});

process.on('exit', () => {
  stopServer();
});
