const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Load Bible data in the preload (has Node access)
const fs = require('fs');
const bibleJsonStr = fs.readFileSync(
  path.join(__dirname, '..', 'data', 'bible.json'),
  'utf-8'
);
const bibleBin = fs.readFileSync(path.join(__dirname, '..', 'data', 'bible.bin'));

// Initialize WASM search engine with binary MessagePack data
const wasmSearch = require('../search-pkg/biblian_search.js');
wasmSearch.init(new Uint8Array(bibleBin.buffer, bibleBin.byteOffset, bibleBin.byteLength));

contextBridge.exposeInMainWorld('biblian', {
  // Bible data
  getBibleDataJson: () => bibleJsonStr,
  search: (query, limit) => {
    return wasmSearch.search(query, limit || 50);
  },

  // IPC to main process
  displayVerse: (data) => ipcRenderer.send('display-verse', data),
  clearDisplay: () => ipcRenderer.send('clear-display'),
  updateStyle: (style) => ipcRenderer.send('update-style', style),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  getScreens: () => ipcRenderer.invoke('get-screens'),
  moveDisplay: (displayId) => ipcRenderer.send('move-display', displayId),
  toggleDisplayText: () => ipcRenderer.send('toggle-display-text'),
  getDisplaySize: () => ipcRenderer.invoke('get-display-size'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  toggleDisplay: () => ipcRenderer.send('toggle-display-window'),
  getDisplayVisible: () => ipcRenderer.invoke('get-display-visible'),

  // IPC from main process (for display window)
  onShowVerse: (callback) =>
    ipcRenderer.on('show-verse', (_event, data) => callback(data)),
  onClear: (callback) => ipcRenderer.on('clear', () => callback()),
  onUpdateStyle: (callback) =>
    ipcRenderer.on('update-style', (_event, style) => callback(style)),
  onToggleDisplayText: (callback) =>
    ipcRenderer.on('toggle-display-text', () => callback()),
  onDisplayResize: (callback) =>
    ipcRenderer.on('display-resized', (_event, size) => callback(size)),
  onDisplayWindowState: (callback) =>
    ipcRenderer.on('display-window-state', (_event, visible) => callback(visible)),
});
