/**
 * IGNOSHASHI - Electron Preload
 *
 * Exposes a minimal, safe API to the renderer:
 *   __electron.openBridge(url)  -> open a URL in Google Chrome (for browser-extension wallets)
 *   __electron.openExternal(url)-> open a URL in the default browser
 *   __electron.getPort()        -> the internal server port
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__electron', {
  // Open the wallet bridge page specifically in Google Chrome
  openBridge: (url) => ipcRenderer.send('open-bridge', url),
  // Open any URL in the default browser
  openExternal: (url) => ipcRenderer.send('open-external', url),
  // Tell the renderer which port the internal server is on
  getPort: () => ipcRenderer.sendSync('get-port'),
});
