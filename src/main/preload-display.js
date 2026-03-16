const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('biblian', {
  onShowVerse:         (cb) => ipcRenderer.on('show-verse',          (_e, d) => cb(d)),
  onClear:             (cb) => ipcRenderer.on('clear',               () => cb()),
  onUpdateStyle:       (cb) => ipcRenderer.on('update-style',        (_e, s) => cb(s)),
  onToggleDisplayText: (cb) => ipcRenderer.on('toggle-display-text', () => cb()),
  onDisplayResize:     (cb) => ipcRenderer.on('display-resized',     (_e, s) => cb(s)),
});
